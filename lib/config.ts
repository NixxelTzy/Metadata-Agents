/**
 * lib/config.ts
 * Semua credentials dibaca HANYA dari environment variables.
 * Set di Vercel Dashboard → Project → Settings → Environment Variables.
 * Untuk dev lokal: isi di .env.local (sudah di .gitignore)
 */

/** Groq API key untuk fitur metadata & AI */
export function getGroqApiKeys(): string[] {
  const keys: string[] = [];
  const addKey = (k?: string) => {
    const trimmed = k?.trim();
    if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
  };

  for (let i = 1; i <= 10; i++) {
    addKey(process.env[`GROQ_API_KEY_${i}`]);
  }
  addKey(process.env.GROQ_API_KEY);
  addKey(process.env.GROQ_API_KEY_RISET);
  addKey(process.env.GROQ_API_KEY_MOTION);

  if (keys.length === 0) {
    console.warn("[WARN] Tidak ada GROQ_API_KEY yang ditemukan. Set di environment variables.");
  }
  return keys;
}

/** @deprecated Fitur riset sudah dihapus. Stub ini hanya untuk kompatibilitas build. */
export function getGroqRisetApiKey(): string {
  const keys = getGroqApiKeys();
  if (keys.length > 0) return keys[0]!;
  throw new Error("Tidak ada Groq API key tersedia.");
}

/** @deprecated Fitur Motion Studio sudah dihapus. Stub ini hanya untuk kompatibilitas build. */
export function getGroqMotionApiKey(): string {
  const keys = getGroqApiKeys();
  if (keys.length > 0) return keys[0]!;
  throw new Error("Tidak ada Groq API key tersedia.");
}

/** Konfigurasi Upstash Redis (instance utama) */
export function getRedisConfig(): { url: string; token: string } {
  // Prioritaskan REDIS_OVERRIDE jika ada (manual override untuk saat kuota Redis1 habis)
  const overrideUrl = process.env.UPSTASH_REDIS_OVERRIDE_URL;
  const overrideToken = process.env.UPSTASH_REDIS_OVERRIDE_TOKEN;
  if (overrideUrl && overrideToken) {
    return { url: overrideUrl, token: overrideToken };
  }

  // Gunakan Redis #2 (settling-amoeba) sebagai fallback otomatis jika env utama tidak ada
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return { url, token };
  }

  // Fallback ke Redis2 (storages_KV)
  const url2   = process.env.storages_KV_REST_API_URL;
  const token2 = process.env.storages_KV_REST_API_TOKEN;
  if (url2 && token2) {
    console.warn("[WARN] Redis1 tidak tersedia. Menggunakan Redis2 (settling-amoeba) sebagai fallback.");
    return { url: url2, token: token2 };
  }

  console.warn("[WARN] UPSTASH_REDIS_REST_URL atau UPSTASH_REDIS_REST_TOKEN tidak ditemukan.");
  return { url: "", token: "" };
}

/**
 * Konfigurasi Upstash Redis #2 (Storage DB — Vercel KV Integration).
 * Menggunakan env vars yang di-generate otomatis oleh Vercel Upstash integration.
 */
export function getRedisConfig2(): { url: string; token: string } {
  const url   = process.env.storages_KV_REST_API_URL;
  const token = process.env.storages_KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn("[WARN] storages_KV_REST_API_URL atau storages_KV_REST_API_TOKEN tidak ditemukan.");
    return { url: "", token: "" };
  }
  return { url, token };
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

