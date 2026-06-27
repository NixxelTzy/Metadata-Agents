/**
 * lib/tokenStore.ts
 * Token usage tracker — disimpan di localStorage, reset tiap hari.
 * Groq free tier limit: ~14,400 req/day, token limit per model bervariasi.
 * Kita pakai 100,000 token/hari sebagai referensi batas harian.
 */

const STORAGE_KEY = "groq_token_usage";
const DAILY_LIMIT = 100_000; // token per hari (referensi)

export interface DailyUsage {
  date: string;         // "YYYY-MM-DD"
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getUsage(): DailyUsage {
  if (typeof window === "undefined") {
    return { date: today(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const parsed = JSON.parse(raw) as DailyUsage;
    // Reset jika hari berbeda
    if (parsed.date !== today()) {
      return { date: today(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    return parsed;
  } catch {
    return { date: today(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
}

export function addUsage(promptTokens: number, completionTokens: number): DailyUsage {
  if (typeof window === "undefined") {
    return { date: today(), promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }
  const current = getUsage();
  const updated: DailyUsage = {
    date: today(),
    promptTokens: current.promptTokens + promptTokens,
    completionTokens: current.completionTokens + completionTokens,
    totalTokens: current.totalTokens + promptTokens + completionTokens,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
  return updated;
}

export function resetUsage(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getUsagePercent(): number {
  const usage = getUsage();
  return Math.min(Math.round((usage.totalTokens / DAILY_LIMIT) * 100), 100);
}

export function getDailyLimit(): number {
  return DAILY_LIMIT;
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
