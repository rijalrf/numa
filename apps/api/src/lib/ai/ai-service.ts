// AI service: generate JSON dengan retry Zod, streaming teks, dan observabilitas.
// Setiap panggilan WAJIB menyebut agentName dan projectId (boleh null hanya untuk panggilan
// yang memang tidak terikat project) agar token tercatat atas nama pemilik tagihan.
import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { assertAiBudget, resolveTenant } from '../ai-budget.js';
import { logger } from '../logger.js';
import { UsageAccumulator } from './usage.js';

export type ModelTier = 'reasoning' | 'cheap';

type CallIdentity = {
  /** Nama tahap/agent untuk pelaporan. Wajib, tanpa default. */
  agentName: string;
  /** Project pemilik tagihan. null hanya untuk panggilan tanpa project. */
  projectId: string | null;
  tier?: ModelTier;
  model?: string;
  /** Versi prompt yang dipakai, untuk membandingkan hasil sebelum dan sesudah optimasi. */
  promptVersion?: string;
};

export type GenerateJsonParams<T> = CallIdentity & {
  system: string;
  user: string;
  schema: z.ZodType<T, any, any>;
  maxRetries?: number;
};

export type StreamOptions = CallIdentity & {
  onChunk?: (delta: string) => void;
};

// ponytail: static set covers current system agents, add dynamic tier lookup when agents become plugins
const REASONING_AGENTS = new Set([
  'CanonicalPrdSpec',
  'CanonicalBrdSpec',
  'FeatureExecutionGraph',
  'UiSpecArchitect',
  'generateSurveyRound',
  'generateSurveySummary',
  'finalizeChatSession',
  'generateFlowFromPrd',
  'SecurityAuditor',
  'ChangeCycleAnalyzer',
]);

function resolveModel(opts: { tier?: ModelTier; agentName: string; modelOverride?: string }): string {
  if (opts.modelOverride) return opts.modelOverride;

  const defaultModel = process.env.OPENAI_MODEL ?? 'ai-builder';
  const reasoningModel = process.env.OPENAI_MODEL_REASONING ?? defaultModel;
  const cheapModel = process.env.OPENAI_MODEL_CHEAP ?? defaultModel;

  if (opts.tier === 'reasoning') return reasoningModel;
  if (opts.tier === 'cheap') return cheapModel;
  if (REASONING_AGENTS.has(opts.agentName)) return reasoningModel;

  return defaultModel;
}

/** Tier efektif untuk pelaporan: eksplisit, atau diturunkan dari model yang terpilih. */
function resolveTier(tier: ModelTier | undefined, agentName: string): ModelTier {
  if (tier) return tier;
  return REASONING_AGENTS.has(agentName) ? 'reasoning' : 'cheap';
}

/**
 * Tingkat reasoning per tier lewat env OPENAI_REASONING_EFFORT_CHEAP / _REASONING (low|medium|high dst).
 * Tanpa env, parameter tidak dikirim: tidak semua gateway menerimanya, dan gateway lokal
 * saat ini mengabaikannya (reasoning_tokens tetap tercatat di AiCallLog untuk dipantau).
 */
function reasoningEffortFor(tier: ModelTier): { reasoning_effort?: 'low' | 'medium' | 'high' } {
  const raw = (tier === 'cheap' ? process.env.OPENAI_REASONING_EFFORT_CHEAP : process.env.OPENAI_REASONING_EFFORT_REASONING)?.trim();
  return raw === 'low' || raw === 'medium' || raw === 'high' ? { reasoning_effort: raw } : {};
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? 'sk-local',
  baseURL: process.env.OPENAI_BASE_URL ?? 'http://localhost:20128/v1',
});

function cleanJsonText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  return text.trim();
}

type AiCallLogData = {
  projectId: string | null;
  agentName: string;
  model: string;
  tier: ModelTier;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  estimated?: boolean;
  latencyMs?: number;
  retryCount?: number;
  success?: boolean;
  failureReason?: string;
};

// Catat panggilan AI beserta pemilik tagihan untuk budget dan laporan.
async function logAiCall(data: AiCallLogData): Promise<void> {
  try {
    const tenant = await resolveTenant(data.projectId);
    await prisma.aiCallLog.create({
      data: { ...data, userId: tenant?.userId ?? null },
    });
  } catch (err) {
    logger.error('Gagal mencatat panggilan AI', { agentName: data.agentName, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function generateJson<T>({
  system,
  user,
  schema,
  maxRetries = 2,
  agentName,
  projectId,
  tier,
  model: modelOverride,
  promptVersion,
}: GenerateJsonParams<T>): Promise<T> {
  await assertAiBudget(projectId);
  const startTime = Date.now();
  const model = resolveModel({ tier, agentName, modelOverride });
  const effectiveTier = resolveTier(tier, agentName);
  const usage = new UsageAccumulator();
  let lastErr: unknown;
  const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        response_format: { type: 'json_object' },
        temperature: 0.4,
        ...reasoningEffortFor(effectiveTier),
      });
      // Token dihitung walau hasil nanti gagal validasi: retry tetap memakai kuota.
      usage.add(resp.usage);
      if (!resp.usage) {
        usage.addEstimate(
          conversationMessages.reduce((sum, m) => sum + m.content.length, 0),
          (resp.choices[0]?.message?.content ?? '').length,
        );
      }

      const rawText = resp.choices[0]?.message?.content ?? '';
      const validated = schema.parse(JSON.parse(cleanJsonText(rawText)));

      const latencyMs = Date.now() - startTime;
      logger.info('Panggilan AI selesai', { agentName, model, latencyMs, ...usage.snapshot(), retries: i });
      await logAiCall({
        projectId,
        agentName,
        model,
        tier: effectiveTier,
        promptVersion,
        ...usage.snapshot(),
        estimated: usage.estimated,
        latencyMs,
        retryCount: i,
        success: true,
      });
      return validated;
    } catch (err) {
      lastErr = err;
      if (i === maxRetries) break;

      const errorMsg = err instanceof Error ? err.message : String(err);
      conversationMessages.push({
        role: 'user',
        content: `Hasil JSON sebelumnya tidak valid: ${errorMsg}. Perbaiki format JSON sesuai instruksi skema dan kembalikan JSON yang valid saja.`,
      });
    }
  }

  const latencyMs = Date.now() - startTime;
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  logger.error('Panggilan AI gagal', { agentName, model, latencyMs, error: msg });
  await logAiCall({
    projectId,
    agentName,
    model,
    tier: effectiveTier,
    promptVersion,
    ...usage.snapshot(),
    estimated: usage.estimated,
    latencyMs,
    retryCount: maxRetries,
    success: false,
    failureReason: msg.slice(0, 1000),
  });

  throw new Error(`AI generate JSON gagal: ${msg}`);
}

export async function generateTextStream(system: string, user: string, opts: StreamOptions): Promise<string> {
  const startTime = Date.now();
  await assertAiBudget(opts.projectId);
  const { agentName, projectId, promptVersion } = opts;
  const model = resolveModel({ tier: opts.tier, agentName, modelOverride: opts.model });
  const effectiveTier = resolveTier(opts.tier, agentName);
  const usage = new UsageAccumulator();
  let fullText = '';

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.5,
    });

    let providerUsage: OpenAI.CompletionUsage | null | undefined;
    for await (const chunk of stream) {
      if (chunk.usage) providerUsage = chunk.usage;
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullText += delta;
        opts.onChunk?.(delta);
      }
    }

    // Taksiran hanya dipakai bila provider tidak mengirim usage di chunk akhir.
    if (providerUsage) usage.add(providerUsage);
    else usage.addEstimate(system.length + user.length, fullText.length);

    const latencyMs = Date.now() - startTime;
    logger.info('Panggilan AI stream selesai', { agentName, model, latencyMs, ...usage.snapshot(), estimated: usage.estimated });
    await logAiCall({
      projectId,
      agentName,
      model,
      tier: effectiveTier,
      promptVersion,
      ...usage.snapshot(),
      estimated: usage.estimated,
      latencyMs,
      retryCount: 0,
      success: true,
    });
    return fullText;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Panggilan AI stream gagal', { agentName, model, latencyMs, error: msg });
    // Stream yang putus di tengah tetap memakai token: taksir dari teks yang sudah diterima.
    if (fullText) usage.addEstimate(system.length + user.length, fullText.length);
    await logAiCall({
      projectId,
      agentName,
      model,
      tier: effectiveTier,
      promptVersion,
      ...usage.snapshot(),
      estimated: usage.estimated,
      latencyMs,
      retryCount: 0,
      success: false,
      failureReason: msg.slice(0, 1000),
    });
    throw new Error(`AI generate stream gagal: ${msg}`);
  }
}
