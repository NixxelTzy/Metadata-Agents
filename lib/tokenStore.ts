/**
 * lib/tokenStore.ts
 * Token usage tracker — disimpan di localStorage, reset tiap hari.
 * Batas token:
 * - User biasa: 100,000 (100k) token/hari.
 * - Admin (nixxeltzy@gmail.com / role admin) & Premium: Unlimited token.
 *
 * Mendukung tracking per-platform: metadata, chat, vector, motion.
 */

const STORAGE_KEY = "groq_token_usage";
export const USER_DAILY_LIMIT = 100_000; // 100k token untuk user biasa
export const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export type Platform = "metadata" | "chat" | "vector" | "motion";

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
      motion: emptyPlatform(),
    },
  };
}

export function isUserAdminOrPremium(role?: string, email?: string): boolean {
  if (email === ADMIN_EMAIL) return true;
  if (role === "admin" || role === "premium") return true;
  return false;
}

export function getEffectiveLimit(role?: string, email?: string): number {
  if (isUserAdminOrPremium(role, email)) {
    return Infinity;
  }
  return USER_DAILY_LIMIT;
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
          motion: emptyPlatform(),
        },
      };
    }
    // Ensure all platform keys exist
    const platforms: Platform[] = ["metadata", "chat", "vector", "motion"];
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
    return { date: today(), promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, byPlatform: { metadata: emptyPlatform(), chat: emptyPlatform(), vector: emptyPlatform(), motion: emptyPlatform() } };
  }
  const current = getUsage();
  const prev = current.byPlatform[platform] || emptyPlatform();
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
    window.dispatchEvent(new CustomEvent("token_usage_updated", { detail: updated }));
  } catch { /* ignore */ }
  return updated;
}

export function resetUsage(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("token_usage_updated"));
  }
}

export function isTokenLimitReached(role?: string, email?: string): boolean {
  if (isUserAdminOrPremium(role, email)) return false;
  const usage = getUsage();
  return usage.totalTokens >= USER_DAILY_LIMIT;
}

export function getUsagePercent(role?: string, email?: string): number {
  if (isUserAdminOrPremium(role, email)) return 0;
  const usage = getUsage();
  return Math.min(Math.round((usage.totalTokens / USER_DAILY_LIMIT) * 100), 100);
}

export function getDailyLimit(role?: string, email?: string): number {
  return getEffectiveLimit(role, email);
}

export function formatTokens(n: number): string {
  if (n === Infinity) return "Unlimited";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Cost estimate in USD (Groq pricing approximation) */
export function estimateCost(promptTokens: number, completionTokens: number): string {
  const inputCost = (promptTokens / 1_000_000) * 0.59;
  const outputCost = (completionTokens / 1_000_000) * 0.79;
  const total = inputCost + outputCost;
  if (total < 0.000001) return "$0.00";
  if (total < 0.001) return `$${(total * 1000).toFixed(3)}m`;
  return `$${total.toFixed(4)}`;
}

export function openPremiumModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"));
  }
}

export function getPlatformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    metadata: "Metadata",
    chat: "AI Chat",
    vector: "Vector",
    motion: "Motion",
  };
  return labels[platform] || platform;
}
