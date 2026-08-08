import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

export interface DetailedPresence {
  userId: string;
  email: string;
  username: string;
  path: string;
  visibility: "visible" | "hidden";
  lastPingTime: number; // Unix timestamp ms
  lastSeenIso: string;
  ip: string;
}

/**
 * POST /api/user/ping
 * Precision Heartbeat Ping Engine (12s TTL).
 * Updates Redis presence keys for userId, email, and username.
 */
export async function POST(request: NextRequest) {
  try {
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    const body = await request.json().catch(() => ({})) as {
      email?: string;
      userId?: string;
      username?: string;
      path?: string;
      visibility?: "visible" | "hidden";
    };

    const { searchParams } = new URL(request.url);
    const qEmail = (searchParams.get("email") ?? body.email ?? "").toLowerCase().trim();
    const qUserId = (searchParams.get("userId") ?? body.userId ?? "").trim();
    const qUsername = (searchParams.get("username") ?? body.username ?? "").toLowerCase().trim();

    const userEmail = (payload?.email ?? qEmail).toLowerCase().trim();
    const userId = payload?.userId ?? qUserId;
    const userUsername = (payload?.username ?? qUsername).toLowerCase().trim();

    if (!userEmail && !userId && !userUsername) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

    const presence: DetailedPresence = {
      userId: userId || userEmail,
      email: userEmail,
      username: userUsername,
      path: body.path ?? "/",
      visibility: body.visibility ?? "visible",
      lastPingTime: nowMs,
      lastSeenIso: nowIso,
      ip,
    };

    // TTL 12 seconds for 100% pinpoint online tracking
    const TTL = 12;
    const jsonStr = JSON.stringify(presence);

    const pipe = redis.pipeline();
    if (userId) pipe.set(`online:user:${userId}`, jsonStr, { ex: TTL });
    if (userEmail) pipe.set(`online:user:${userEmail}`, jsonStr, { ex: TTL });
    if (userUsername) pipe.set(`online:user:${userUsername}`, jsonStr, { ex: TTL });
    if (userId) pipe.set(`activity:user:${userId}`, jsonStr, { ex: 86400 * 30 });
    if (userEmail) pipe.set(`activity:user:${userEmail}`, jsonStr, { ex: 86400 * 30 });
    await pipe.exec();

    return NextResponse.json({ ok: true, presence });
  } catch (err) {
    console.error("Presence ping error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
