import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getRedisConfig, getRedisConfig2 } from "@/lib/config";
import { cookies } from "next/headers";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse Redis INFO string into a flat key-value map */
function parseInfo(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** Execute a Redis REST command and return the result */
async function redisCmd(url: string, token: string, ...args: string[]): Promise<unknown> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[...args]]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis fetch failed: ${res.status}`);
  const json = await res.json() as Array<{ result: unknown; error?: string }>;
  if (json[0]?.error) throw new Error(json[0].error);
  return json[0]?.result;
}

/** Get all keys matching a pattern */
async function redisKeys(url: string, token: string, pattern: string): Promise<string[]> {
  const result = await redisCmd(url, token, "KEYS", pattern);
  return Array.isArray(result) ? result as string[] : [];
}

/** Single Redis INFO command */
async function redisInfo(url: string, token: string): Promise<string> {
  const result = await redisCmd(url, token, "INFO", "all");
  return typeof result === "string" ? result : "";
}

/** Single Redis DBSIZE command */
async function redisDbSize(url: string, token: string): Promise<number> {
  const result = await redisCmd(url, token, "DBSIZE");
  return typeof result === "number" ? result : 0;
}

// ── Key-prefix analyzer ───────────────────────────────────────────────────────
const KEY_PREFIXES: { prefix: string; label: string; emoji: string }[] = [
  { prefix: "user:",       label: "Pengguna",         emoji: "👤" },
  { prefix: "report:",     label: "Laporan Feedback",  emoji: "💬" },
  { prefix: "otp:",        label: "OTP / Verifikasi",  emoji: "🔑" },
  { prefix: "download:",   label: "Download Links",    emoji: "📦" },
  { prefix: "usage:",      label: "Token Usage",       emoji: "📊" },
  { prefix: "firewall:",   label: "Firewall / Rate",   emoji: "🛡️" },
  { prefix: "session:",    label: "Sessions",          emoji: "🔐" },
];

function categorizeKeys(keys: string[]): { prefix: string; label: string; emoji: string; count: number }[] {
  const categories = KEY_PREFIXES.map((p) => ({
    ...p,
    count: keys.filter((k) => k.startsWith(p.prefix)).length,
  }));
  const known = keys.filter((k) => KEY_PREFIXES.some((p) => k.startsWith(p.prefix))).length;
  const other = keys.length - known;
  if (other > 0) {
    categories.push({ prefix: "other", label: "Lainnya", emoji: "📁", count: other });
  }
  return categories.filter((c) => c.count > 0);
}

// ── Stats fetcher ─────────────────────────────────────────────────────────────
async function fetchDbStats(url: string, token: string, name: string) {
  try {
    const [infoRaw, dbSize, allKeys] = await Promise.all([
      redisInfo(url, token),
      redisDbSize(url, token),
      redisKeys(url, token, "*"),
    ]);

    const info = parseInfo(infoRaw);

    const usedMemoryBytes  = parseInt(info["used_memory"] ?? "0", 10);
    const maxMemoryBytes   = parseInt(info["maxmemory"] ?? "0", 10);
    const usedMemoryHuman  = info["used_memory_human"] ?? "—";
    const maxMemoryHuman   = info["maxmemory_human"] ?? "—";
    const peakMemoryHuman  = info["used_memory_peak_human"] ?? "—";
    const hitRate          = (() => {
      const hits   = parseInt(info["keyspace_hits"] ?? "0", 10);
      const misses = parseInt(info["keyspace_misses"] ?? "0", 10);
      const total  = hits + misses;
      return total > 0 ? Math.round((hits / total) * 100) : null;
    })();
    const connectedClients = parseInt(info["connected_clients"] ?? "0", 10);
    const totalCommands    = parseInt(info["total_commands_processed"] ?? "0", 10);
    const uptimeSeconds    = parseInt(info["uptime_in_seconds"] ?? "0", 10);
    const redisVersion     = info["redis_version"] ?? "—";

    const usedPercent = maxMemoryBytes > 0
      ? Math.round((usedMemoryBytes / maxMemoryBytes) * 100)
      : null;

    const keyBreakdown = categorizeKeys(allKeys);

    return {
      name,
      online: true,
      dbSize,
      usedMemoryBytes,
      usedMemoryHuman,
      maxMemoryBytes,
      maxMemoryHuman,
      peakMemoryHuman,
      usedPercent,
      hitRate,
      connectedClients,
      totalCommands,
      uptimeSeconds,
      redisVersion,
      keyBreakdown,
      totalKeys: allKeys.length,
    };
  } catch (err) {
    return {
      name,
      online: false,
      error: err instanceof Error ? err.message : "Unknown error",
      dbSize: 0,
      usedMemoryBytes: 0,
      usedMemoryHuman: "—",
      maxMemoryBytes: 0,
      maxMemoryHuman: "—",
      peakMemoryHuman: "—",
      usedPercent: null,
      hitRate: null,
      connectedClients: 0,
      totalCommands: 0,
      uptimeSeconds: 0,
      redisVersion: "—",
      keyBreakdown: [],
      totalKeys: 0,
    };
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cfg1 = getRedisConfig();
    const cfg2 = getRedisConfig2();

    const [db1, db2] = await Promise.all([
      fetchDbStats(cfg1.url, cfg1.token, "Redis #1 — Main DB"),
      fetchDbStats(cfg2.url, cfg2.token, "Redis #2 — Storage DB"),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      databases: [db1, db2],
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error", detail: String(err) }, { status: 500 });
  }
}
