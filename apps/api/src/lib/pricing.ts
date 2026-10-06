// Estimasi biaya AI dalam rupiah dari harga per 1 juta token yang diatur lewat env.
// Fungsi murni agar mudah diuji. Bila harga sebuah tier belum diisi, biaya tier itu null (bukan nol).
export type Tier = 'reasoning' | 'cheap';

export type TierPrice = { inputPerMTok: number; outputPerMTok: number };
export type AiPricing = Record<Tier, TierPrice | null>;

function readPrice(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function readTier(env: NodeJS.ProcessEnv, suffix: 'REASONING' | 'CHEAP'): TierPrice | null {
  const input = readPrice(env[`AI_PRICE_INPUT_PER_MTOK_${suffix}`]);
  const output = readPrice(env[`AI_PRICE_OUTPUT_PER_MTOK_${suffix}`]);
  if (input === null || output === null) return null;
  return { inputPerMTok: input, outputPerMTok: output };
}

export function getAiPricing(env: NodeJS.ProcessEnv = process.env): AiPricing {
  return { reasoning: readTier(env, 'REASONING'), cheap: readTier(env, 'CHEAP') };
}

/** Log lama tanpa kolom tier dianggap reasoning (asumsi konservatif: tarif lebih tinggi). */
export function normalizeTier(tier: string | null | undefined): Tier {
  return tier === 'cheap' ? 'cheap' : 'reasoning';
}

export type TokenUsage = { tier: string | null | undefined; inputTokens: number; outputTokens: number };

/** Total biaya rupiah. Null bila ada usage pada tier yang harganya belum diatur. */
export function estimateCost(usages: TokenUsage[], pricing: AiPricing): number | null {
  let total = 0;
  for (const u of usages) {
    if (u.inputTokens === 0 && u.outputTokens === 0) continue;
    const price = pricing[normalizeTier(u.tier)];
    if (!price) return null;
    total += (u.inputTokens / 1_000_000) * price.inputPerMTok + (u.outputTokens / 1_000_000) * price.outputPerMTok;
  }
  return Math.round(total);
}

/** Persentil dengan interpolasi linear. Array kosong menghasilkan 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}
