import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

export interface ActivityEvent {
  id: string;
  userId: string;
  email: string;
  username: string;
  action: "login" | "logout" | "page_view" | "upload" | "generate" | "error" | "block_attempt";
  path?: string;
  detail?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * POST /api/user/activity
 * Log a client-side activity event (login, page_view, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    const payload = token ? verifyToken(token) : null;

    const body = await request.json() as Partial<ActivityEvent>;
    if (!body.action) return NextResponse.json({ ok: false });

    const event: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: payload?.userId ?? body.userId ?? "guest",
      email: payload?.email ?? body.email ?? "guest",
      username: payload?.username ?? body.username ?? "guest",
      action: body.action,
      path: body.path ?? request.headers.get("referer") ?? "",
      detail: body.detail,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
      timestamp: new Date().toISOString(),
    };

    // Write to per-user activity stream
    await redis.lpush(`activity:user:${event.userId}`, JSON.stringify(event));
    await redis.ltrim(`activity:user:${event.userId}`, 0, 99);
    await redis.expire(`activity:user:${event.userId}`, 86400 * 14);

    // Also write to global activity stream
    await redis.lpush("activity:global", JSON.stringify(event));
    await redis.ltrim("activity:global", 0, 499);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

/**
 * GET /api/user/activity?userId=...
 * Admin: get activity for a specific user or global feed.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== "nixxeltzy@gmail.com") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  try {
    const key = userId ? `activity:user:${userId}` : "activity:global";
    const raw = await redis.lrange(key, 0, 99);
    const events: ActivityEvent[] = raw.map((r) =>
      typeof r === "string" ? JSON.parse(r) : r
    );
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
