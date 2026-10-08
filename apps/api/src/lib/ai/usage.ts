// Akumulasi pemakaian token lintas percobaan (retry) dalam satu panggilan AI.
export type UsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Bagian dari outputTokens yang dipakai reasoning (biaya tersembunyi); 0 bila provider tidak melaporkan. */
  reasoningTokens: number;
};

export type ProviderUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
} | null | undefined;

export class UsageAccumulator {
  inputTokens = 0;
  outputTokens = 0;
  totalTokens = 0;
  reasoningTokens = 0;
  /** True bila ada bagian yang ditaksir karena provider tidak mengirim usage. */
  estimated = false;

  add(usage: ProviderUsage): void {
    if (!usage) return;
    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    this.inputTokens += input;
    this.outputTokens += output;
    this.totalTokens += usage.total_tokens ?? input + output;
    this.reasoningTokens += usage.completion_tokens_details?.reasoning_tokens ?? 0;
  }

  /** Dipakai bila provider tidak mengirim usage sama sekali. */
  addEstimate(inputChars: number, outputChars: number): void {
    const input = estimateTokens(inputChars);
    const output = estimateTokens(outputChars);
    this.inputTokens += input;
    this.outputTokens += output;
    this.totalTokens += input + output;
    this.estimated = true;
  }

  snapshot(): UsageSnapshot {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens,
      reasoningTokens: this.reasoningTokens,
    };
  }
}

/** Taksiran kasar: sekitar 4 karakter per token. */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}
