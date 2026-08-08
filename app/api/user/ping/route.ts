/**
 * /api/user/ping — Dedicated lightweight online presence ping.
 * Writes online:user:{id/email/username} keys to Redis with 20s TTL.
 * Called every 5s from client. Must be extremely fast — no heavy DB ops.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

// TTL for online presence keys: 20s
// If no ping for 20s (4 missed pings at 5s interval), user is marked offline automatically
const ONLINE_TTL = 20;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      email?: string;
      userId?: string;
      username?: string;
      path?: string;
      visibility?: string;
    };

    // Prefer verified token identity over body params (security)
    const cookieToken = request.cookies.get("auth_token")?.value;
    const tokenPayload = cookieToken ? verifyToken(cookieToken) : null;

    const userId   = (tokenPayload?.userId   || body.userId   || "").trim();
    const email    = (tokenPayload?.email    || body.email    || "").toLowerCase().trim();
    const username = (tokenPayload?.username || body.username || "").toLowerCase().trim();

    if (!userId && !email) {
      return NextResponse.json({ ok: false, error: "Missing identity" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const isVisible = body.visibility !== "hidden";

    const onlineData = {
      userId,
      email,
      username,
      feature: body.path || "/",
      lastSeen: now,
      isOnline: isVisible,
    };

    // Write all identity keys in parallel — TTL 20s
    const writes: Promise<unknown>[] = [];
    if (userId)   writes.push(redis.set(`online:user:${userId}`,   onlineData, { ex: ONLINE_TTL }));
    if (email)    writes.push(redis.set(`online:user:${email}`,    onlineData, { ex: ONLINE_TTL }));
    if (username) writes.push(redis.set(`online:user:${username}`, onlineData, { ex: ONLINE_TTL }));

    await Promise.all(writes.map(p => p.catch(() => null)));

    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET: quick online check for a user
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) return NextResponse.json({ online: false });

  const data = await redis.get(`online:user:${userId}`).catch(() => null);
  return NextResponse.json({ online: !!data });
}
