import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers } from "@/lib/db";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    const { url, token: redisToken } = getRedisConfig();
    _redis = new Redis({ url: url || "https://placeholder.upstash.io", token: redisToken || "placeholder" });
  }
  return _redis;
}
const redis = new Proxy({} as Redis, { get: (_, p) => (getRedis() as any)[p] });

export interface SmartMessage {
  id: string;
  title: string;
  body: string;
  audience: "all" | "new_users" | "guests";
  sentAt: string;
  sentByEmail: string;
  expiresAt: string;
}

const SMART_MSG_KEY = "smartmsg:active";

// ── GET: Public endpoint for all users (guests, new users, registered users) ────
export async function GET(request: NextRequest) {
  try {
    const raw = await redis.lrange(SMART_MSG_KEY, 0, 49).catch(() => []);
    const now = Date.now();
    const allMsgs = raw
      .map((r) => {
        try {
          return typeof r === "string" ? JSON.parse(r) : r;
        } catch {
          return null;
        }
      })
      .filter((m): m is SmartMessage => m !== null && new Date(m.expiresAt).getTime() > now);

    // Determine user context (guest, new user, or regular user)
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    let registeredDaysAgo: number | null = null;
    if (payload?.userId) {
      const users = await getAllUsers();
      const me = users.find((u) => u.id === payload.userId);
      if (me?.createdAt) {
        registeredDaysAgo = Math.floor((Date.now() - new Date(me.createdAt).getTime()) / 86400000);
      }
    }

    const isGuest = !payload;
    const isNew = registeredDaysAgo !== null && registeredDaysAgo <= 7;

    const filtered = allMsgs.filter((m) => {
      if (m.audience === "all") return true;
      if (m.audience === "guests" && isGuest) return true;
      if (m.audience === "new_users" && isNew) return true;
      return false;
    });

    return NextResponse.json({ messages: filtered });
  } catch (err) {
    console.error("[smart-message public GET]", err);
    return NextResponse.json({ messages: [] });
  }
}
