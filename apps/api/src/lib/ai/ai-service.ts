// AI service: pilih provider via env, generate JSON dengan retry Zod.
// Mendukung observabilitas token, latensi, retry (Bab 39), dan model routing (Bab 25).
import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../prisma.js';

export type ModelTier = 'reasoning' | 'cheap';

export type GenerateJsonParams<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T, any, any>;
  maxRetries?: number;
  agentName?: string;
  projectId?: string;
  tier?: ModelTier;
  model?: string;
};

// ponytail: static set covers current system agents, add dynamic tier lookup when agents become plugins
const REASONING_AGENTS = new Set([
  'CanonicalPrdSpec',
  'CanonicalBrdSpec',
  'FeatureExecutionGraph',
  'UiSpecArchitect',
  'TechStackArchitect',
  'replyChat',
  'finalizeChatSession',
  'generateTreeFromPrd',
  'generateTreeFromBrd',
  'SecurityAuditor',
]);

export function resolveModel(opts?: { tier?: ModelTier; agentName?: string; modelOverride?: string }): string {
  if (opts?.modelOverride) return opts.modelOverride;

  const defaultModel = process.env.OPENAI_MODEL ?? 'ai-builder';
  const reasoningModel = process.env.OPENAI_MODEL_REASONING ?? defaultModel;
  const cheapModel = process.env.OPENAI_MODEL_CHEAP ?? defaultModel;

  if (opts?.tier === 'reasoning') return reasoningModel;
  if (opts?.tier === 'cheap') return cheapModel;
  if (opts?.agentName && REASONING_AGENTS.has(opts.agentName)) return reasoningModel;

  return defaultModel;
}

const provider = process.env.AI_PROVIDER ?? 'openai';

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

export async function generateJson<T>({
  system,
  user,
  schema,
  maxRetries = 2,
  agentName = 'ai-agent',
  projectId,
  tier,
  model: modelOverride,
}: GenerateJsonParams<T>): Promise<T> {
  const startTime = Date.now();
  const model = resolveModel({ tier, agentName, modelOverride });
  let lastErr: unknown;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      });

      const rawText = resp.choices[0]?.message?.content ?? '';
      const text = cleanJsonText(rawText);
      const parsed = JSON.parse(text);
      const validated = schema.parse(parsed);

      const latencyMs = Date.now() - startTime;
      const usage = resp.usage;
      const inputTokens = usage?.prompt_tokens ?? 0;
      const outputTokens = usage?.completion_tokens ?? 0;
      const totalTokens = usage?.total_tokens ?? (inputTokens + outputTokens);

      console.log(
        `[ai-call] agent=${agentName} model=${model} latency=${latencyMs}ms tokens=${totalTokens} (in=${inputTokens}, out=${outputTokens}) retries=${i}`
      );

      // Async pencatatan observabilitas ke database (non-blocking)
      prisma.aiCallLog
        .create({
          data: {
            projectId: projectId ?? null,
            agentName,
            model,
            inputTokens,
            outputTokens,
            totalTokens,
            latencyMs,
            retryCount: i,
            success: true,
          },
        })
        .catch((err) => console.error('[ai-log-error]', err.message));

      return validated;
    } catch (err) {
      lastErr = err;
      if (i === maxRetries) break;
    }
  }

  const latencyMs = Date.now() - startTime;
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.error(`[ai-call-failed] agent=${agentName} model=${model} latency=${latencyMs}ms error=${msg}`);

  // Catat kegagalan ke observabilitas
  prisma.aiCallLog
    .create({
      data: {
        projectId: projectId ?? null,
        agentName,
        model,
        latencyMs,
        retryCount: maxRetries,
        success: false,
        failureReason: msg,
      },
    })
    .catch((err) => console.error('[ai-log-error]', err.message));

  throw new Error(`AI generate JSON gagal: ${msg}`);
}

export async function generateText(
  system: string,
  user: string,
  opts?: { agentName?: string; projectId?: string; tier?: ModelTier; model?: string }
): Promise<string> {
  const startTime = Date.now();
  const agentName = opts?.agentName ?? 'text-agent';
  const model = resolveModel({ tier: opts?.tier, agentName, modelOverride: opts?.model });

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.5,
    });

    const content = resp.choices[0]?.message?.content ?? '';
    const latencyMs = Date.now() - startTime;
    const usage = resp.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? (inputTokens + outputTokens);

    console.log(
      `[ai-call] agent=${agentName} model=${model} latency=${latencyMs}ms tokens=${totalTokens} (in=${inputTokens}, out=${outputTokens})`
    );

    prisma.aiCallLog
      .create({
        data: {
          projectId: opts?.projectId ?? null,
          agentName,
          model,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs,
          retryCount: 0,
          success: true,
        },
      })
      .catch((err) => console.error('[ai-log-error]', err.message));

    return content;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-call-failed] agent=${agentName} model=${model} latency=${latencyMs}ms error=${msg}`);

    prisma.aiCallLog
      .create({
        data: {
          projectId: opts?.projectId ?? null,
          agentName,
          model,
          latencyMs,
          retryCount: 0,
          success: false,
          failureReason: msg,
        },
      })
      .catch((logErr) => console.error('[ai-log-error]', logErr.message));

    throw err;
  }
}
