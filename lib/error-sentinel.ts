/**
 * lib/error-sentinel.ts
 * Autonomous System Anti-Error & Bug Sentinel.
 * Captures, sanitizes, and dispatches real-time error reports directly to Admin Inbox & Redis.
 */
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface SystemErrorLog {
  id: string;
  category: "DATABASE" | "AUTH" | "VISION_AI" | "FIREWALL" | "MESSAGING" | "CLIENT_RUNTIME" | "SYSTEM";
  message: string;
  stack?: string;
  endpoint?: string;
  userEmail?: string;
  ip?: string;
  timestamp: string;
}

/**
 * Report any error to Admin automatically.
 * Writes to admin error log AND dispatches an admin inbox alert.
 */
export async function reportSystemError(params: {
  category: SystemErrorLog["category"];
  message: string;
  error?: unknown;
  endpoint?: string;
  userEmail?: string;
  ip?: string;
}): Promise<void> {
  try {
    const stack = params.error instanceof Error ? params.error.stack : String(params.error ?? "");
    const errorId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const logItem: SystemErrorLog = {
      id: errorId,
      category: params.category,
      message: params.message,
      stack: stack || undefined,
      endpoint: params.endpoint,
      userEmail: params.userEmail,
      ip: params.ip,
      timestamp: nowIso,
    };

    // 1. Store in admin system error log
    await redis.lpush("adminmsg:system_errors", JSON.stringify(logItem)).catch(() => {});
    await redis.ltrim("adminmsg:system_errors", 0, 199).catch(() => {});

    // 2. Dispatch high-priority message directly to Admin Inbox (nixxeltzy@gmail.com)
    const adminInboxMsg = {
      id: `error-notice-${Date.now()}`,
      type: "message",
      priority: "emergency",
      title: `🚨 System Error Detected [${params.category}]`,
      body: `Pemberitahuan Otomatis Anti-Error Sentinel:\n\n• Pesan Error: ${params.message}\n• Endpoint: ${params.endpoint ?? "System"}\n• Pengguna/IP: ${params.userEmail ?? params.ip ?? "Unknown"}\n• Waktu: ${new Date(nowIso).toLocaleString("id-ID")}\n\nStack Trace:\n${(stack || "Tidak ada stack trace").slice(0, 300)}...`,
      targetUserId: "admin",
      targetEmail: ADMIN_EMAIL,
      targetUsername: "admin",
      sentAt: nowIso,
      sentByEmail: "anti-error-sentinel@nixelstudio.com",
      read: false,
    };

    await redis.lpush(`adminmsg:user:${ADMIN_EMAIL}`, JSON.stringify(adminInboxMsg)).catch(() => {});
    await redis.lpush("adminmsg:sentlog", JSON.stringify(adminInboxMsg)).catch(() => {});
  } catch (e) {
    console.error("Critical error inside error sentinel:", e);
  }
}

/**
 * Retrieve recent system error logs for admin inspection.
 */
export async function getSystemErrorLogs(): Promise<SystemErrorLog[]> {
  try {
    const raw = await redis.lrange("adminmsg:system_errors", 0, 99);
    return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
  } catch {
    return [];
  }
}

/**
 * Clear system error logs.
 */
export async function clearSystemErrorLogs(): Promise<void> {
  try {
    await redis.del("adminmsg:system_errors");
  } catch {}
}
