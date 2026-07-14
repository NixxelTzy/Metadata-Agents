/**
 * lib/config.ts
 * Semua credentials dibaca HANYA dari environment variables.
 * Set di Vercel Dashboard → Project → Settings → Environment Variables.
 * Untuk dev lokal: isi di .env.local (sudah di .gitignore)
 */

/** Groq API key (untuk fitur metadata/chat umum) */
export function getGroqApiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GROQ_API_KEY_${i}`];
    if (key?.trim()) keys.push(key.trim());
  }
  if (keys.length === 0) {
    const fallback = process.env.GROQ_API_KEY;
    if (fallback?.trim()) keys.push(fallback.trim());

    // Custom key alias (buat fitur riset)
    const risetKey = process.env.GROQ_API_KEY_RISET;
    if (risetKey?.trim()) keys.push(risetKey.trim());
  }
  if (keys.length === 0) {
    console.warn("[WARN] Tidak ada GROQ_API_KEY yang ditemukan. Set di environment variables.");
  }
  return keys;
}

/**
 * Groq API key KHUSUS untuk fitur Riset (RESEARCH_ENGINE & RESEARCH_ENGINE_DEEP).
 * Membaca GROQ_API_KEY_RISET secara prioritas.
 * Fallback ke key umum agar tidak error di environment yang belum diset.
 *
 * Di Vercel: Settings → Environment Variables → GROQ_API_KEY_RISET
 */
export function getGroqRisetApiKey(): string {
  // Prioritas 1: key khusus riset
  const risetKey = process.env.GROQ_API_KEY_RISET;
  if (risetKey?.trim()) return risetKey.trim();

  // Prioritas 2: fallback ke key umum pertama yang tersedia
  const generalKeys = getGroqApiKeys();
  if (generalKeys.length > 0) {
    console.warn(
      "[WARN] GROQ_API_KEY_RISET tidak ditemukan. " +
      "Fitur riset menggunakan key umum sebagai fallback. " +
      "Set GROQ_API_KEY_RISET di Vercel/env untuk isolasi key yang benar."
    );
    return generalKeys[0];
  }

  throw new Error(
    "Groq API key untuk fitur riset tidak tersedia. " +
    "Set GROQ_API_KEY_RISET di Vercel → Environment Variables."
  );
}

/** Konfigurasi Upstash Redis (instance utama) */
export function getRedisConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn("[WARN] UPSTASH_REDIS_REST_URL atau UPSTASH_REDIS_REST_TOKEN tidak ditemukan.");
  }
  return { url: url ?? "", token: token ?? "" };
}

/** Konfigurasi Upstash Redis #2 (Storage/File DB) */
export function getRedisConfig2(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL2;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN2;
  if (!url || !token) {
    console.warn("[WARN] UPSTASH_REDIS_REST_URL2 atau UPSTASH_REDIS_REST_TOKEN2 tidak ditemukan.");
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

/**
 * Groq API key KHUSUS untuk AI Firewall Controller.
 * Set GROQ_API_KEY_FIREWALL di Vercel/env untuk isolasi key dari fitur lain.
 * Fallback ke key umum jika belum diset.
 */
export function getFirewallAiKey(): string {
  const fwKey = process.env.GROQ_API_KEY_FIREWALL;
  if (fwKey?.trim()) return fwKey.trim();
  // Fallback ke general key
  const generalKeys = getGroqApiKeys();
  if (generalKeys.length > 0) return generalKeys[0]!;
  throw new Error("Tidak ada Groq API key untuk Firewall AI. Set GROQ_API_KEY_FIREWALL.");
}

/**
 * API key untuk operator endpoint firewall.
 * Caller harus mengirim header: X-Firewall-Key: <nilai dari env>
 * Set FIREWALL_OPERATOR_KEY di environment variables.
 */
export function getFirewallOperatorKey(): string {
  return process.env.FIREWALL_OPERATOR_KEY ?? "";
}
