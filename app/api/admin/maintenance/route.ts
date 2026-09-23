import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string;
  allowedEmails: string[];
  updatedAt: string;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: false,
  title: "🔧 Pemeliharaan Sistem",
  message: "Sistem sedang dalam pemeliharaan. Mohon coba beberapa saat lagi.",
  estimatedEnd: undefined,
  allowedEmails: [ADMIN_EMAIL],
  updatedAt: new Date().toISOString(),
};

const REDIS_KEY = "system:maintenance_config";

/**
 * GET /api/admin/maintenance
 * Get current maintenance mode config. Public (for client to check).
 */
export async function GET() {
  try {
    const raw = await redis.get<MaintenanceConfig>(REDIS_KEY);
    return NextResponse.json(raw ?? DEFAULT_CONFIG);
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

/**
 * POST /api/admin/maintenance
 * Enable/disable maintenance mode. Admin only.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as Partial<MaintenanceConfig>;

    const current = await redis.get<MaintenanceConfig>(REDIS_KEY) ?? DEFAULT_CONFIG;
    const updated: MaintenanceConfig = {
      ...current,
      ...body,
      allowedEmails: Array.isArray(body.allowedEmails)
        ? [ADMIN_EMAIL, ...body.allowedEmails.filter((e) => e !== ADMIN_EMAIL)]
        : current.allowedEmails,
      updatedAt: new Date().toISOString(),
    };

    await redis.set(REDIS_KEY, updated, { ex: 86400 * 30 });
    return NextResponse.json({ ok: true, config: updated });
  } catch (err) {
    console.error("Maintenance config error:", err);
    return NextResponse.json({ error: "Gagal mengupdate konfigurasi" }, { status: 500 });
  }
}
