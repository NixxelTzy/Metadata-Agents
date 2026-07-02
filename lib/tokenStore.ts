/**
 * lib/tokenStore.ts
 * Token usage tracker — disimpan di localStorage, reset tiap hari.
 * Groq free tier limit: ~14,400 req/day, token limit per model bervariasi.
 * Kita pakai 100,000 token/hari sebagai referensi batas harian.
 *
 * Mendukung tracking per-platform: metadata, chat, vector.
 */

const STORAGE_KEY = "groq_token_usage";
const DAILY_LIMIT = 100_000; // token per hari (referensi)

export type Platform = "metadata" | "chat" | "vector";

export interface PlatformUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface DailyUsage {
  date: string;         // "YYYY-MM-DD"
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Per-platform breakdown
  byPlatform: Record<Platform, PlatformUsage>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyPlatform(): PlatformUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
}

function emptyUsage(): DailyUsage {
  return {
    date: today(),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    byPlatform: {
      metadata: emptyPlatform(),
      chat: emptyPlatform(),
      vector: emptyPlatform(),
    },
  };
}

export function getUsage(): DailyUsage {
  if (typeof window === "undefined") return emptyUsage();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyUsage();
    const parsed = JSON.parse(raw) as DailyUsage;
    // Reset jika hari berbeda
    if (parsed.date !== today()) return emptyUsage();
    // Ensure byPlatform exists (migration from old format)
    if (!parsed.byPlatform) {
      return {
        ...parsed,
        byPlatform: {
          metadata: emptyPlatform(),
          chat: emptyPlatform(),
          vector: emptyPlatform(),
        },
      };
    }
    // Ensure all platform keys exist
    const platforms: Platform[] = ["metadata", "chat", "vector"];
    for (const p of platforms) {
      if (!parsed.byPlatform[p]) parsed.byPlatform[p] = emptyPlatform();
    }
    return parsed;
  } catch {
    return emptyUsage();
  }
}

export function addUsage(
  promptTokens: number,
  completionTokens: number,
  platform: Platform = "metadata"
): DailyUsage {
  if (typeof window === "undefined") {
    return { date: today(), promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, byPlatform: { metadata: emptyPlatform(), chat: emptyPlatform(), vector: emptyPlatform() } };
  }
  const current = getUsage();
  const prev = current.byPlatform[platform];
  const updated: DailyUsage = {
    date: today(),
    promptTokens: current.promptTokens + promptTokens,
    completionTokens: current.completionTokens + completionTokens,
    totalTokens: current.totalTokens + promptTokens + completionTokens,
    byPlatform: {
      ...current.byPlatform,
      [platform]: {
        promptTokens: prev.promptTokens + promptTokens,
        completionTokens: prev.completionTokens + completionTokens,
        totalTokens: prev.totalTokens + promptTokens + completionTokens,
        requestCount: prev.requestCount + 1,
      },
    },
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Cost estimate in USD (Groq free tier pricing approximation) */
export function estimateCost(promptTokens: number, completionTokens: number): string {
  // Groq pricing (approximate): ~$0.05/1M input, ~$0.08/1M output for Llama 3.3 70B
  const inputCost = (promptTokens / 1_000_000) * 0.59;
  const outputCost = (completionTokens / 1_000_000) * 0.79;
  const total = inputCost + outputCost;
  if (total < 0.000001) return "$0.00";
  if (total < 0.001) return `$${(total * 1000).toFixed(3)}m`; // millicents
  return `$${total.toFixed(4)}`;
}

export function getPlatformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    metadata: "🏷️ Metadata",
    chat: "🤖 AI Chat",
    vector: "🎨 Vector",
  };
  return labels[platform];
}

