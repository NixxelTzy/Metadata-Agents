/**
 * lib/groqTokenCounter.ts
 * 
 * Token counter untuk Groq:
 * - Akurat: menggunakan field `usage` dari response Groq (bukan estimasi).
 * - Dipakai di bagian riset/AI supaya total token yang ditampilkan konsisten.
 */

export type GroqUsageLike = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type GroqUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export function normalizeUsage(u?: GroqUsageLike | null): GroqUsageTotals {
  return {
    promptTokens: u?.promptTokens ?? 0,
    completionTokens: u?.completionTokens ?? 0,
    totalTokens: u?.totalTokens ?? 0,
  };
}

export function sumUsage(usages: Array<GroqUsageLike | null | undefined>): GroqUsageTotals {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const u of usages) {
    promptTokens += u?.promptTokens ?? 0;
    completionTokens += u?.completionTokens ?? 0;
    totalTokens += u?.totalTokens ?? 0;
  }

  return { promptTokens, completionTokens, totalTokens };
}

export function computeRoughDelta(
  expectedTotal?: number,
  usage?: GroqUsageLike | null
): { expectedTotal: number; actualTotal: number; delta: number } {
  const actualTotal = usage?.totalTokens ?? 0;
  const expected = expectedTotal ?? actualTotal;
  return { expectedTotal: expected, actualTotal, delta: actualTotal - expected };
}

