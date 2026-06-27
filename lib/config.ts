/**
 * lib/config.ts
 * Semua credentials dibaca HANYA dari environment variables.
 * Set di Vercel Dashboard → Project → Settings → Environment Variables.
 * Untuk dev lokal: isi di .env.local (sudah di .gitignore)
 */

/** Groq API key */
export function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key?.trim()) {
    console.warn("[WARN] GROQ_API_KEY tidak ditemukan. Set di environment variables.");
  }
  return key?.trim() ?? "";
}

/** Konfigurasi Upstash Redis */
export function getRedisConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn("[WARN] UPSTASH_REDIS_REST_URL atau UPSTASH_REDIS_REST_TOKEN tidak ditemukan.");
  }
  return { url: url ?? "", token: token ?? "" };
}

/** Konfigurasi Vercel API (untuk Server Monitor) */
export function getVercelConfig(): { token: string; projectId: string; teamId: string } {
  return {
    token: process.env.VERCEL_API_TOKEN ?? "",
    projectId: process.env.VERCEL_PROJECT_ID ?? "",
    teamId: process.env.VERCEL_TEAM_ID ?? "",
  };
}

/** JWT secret */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn("[WARN] JWT_SECRET tidak ditemukan. Menggunakan fallback (tidak aman untuk production).");
  }
  return secret ?? "fallback_dev_secret_change_me";
}

/** Konfigurasi Gmail (untuk OTP email) */
export function getGmailConfig(): { user: string; appPassword: string } {
  return {
    user: process.env.GMAIL_USER ?? "",
    appPassword: process.env.GMAIL_APP_PASSWORD ?? "",
  };
}
