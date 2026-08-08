import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

export interface AdminMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  targetUserId: string | "all";
  targetEmail: string | "all";
  targetUsername: string | "all";
  sentAt: string;
  sentByEmail: string;
  read: boolean;
}

/**
 * GET /api/user/inbox
 * Returns pending messages for the logged-in user (targeted + broadcast).
 * Called every 10s by the client-side polling hook.
 */
export async function GET(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ messages: [] });

  const payload = verifyToken(t);
  if (!payload) return NextResponse.json({ messages: [] });

  try {
    // 0. Trigger Autonomous Background Email AI Worker (non-blocking)
    const { triggerAutonomousEmailPoller } = await import("@/lib/gmail-poller");
    void triggerAutonomousEmailPoller();

    // 1. Targeted messages
    const userRaw = await redis.lrange(`adminmsg:user:${payload.userId}`, 0, 19);
    // 2. Broadcast messages (last 10)
    const broadRaw = await redis.lrange("adminmsg:broadcast", 0, 9);

    // Read-receipt key — stores message IDs already seen by this user
    const seenKey = `adminmsg:seen:${payload.userId}`;
    const seenRaw = await redis.smembers(seenKey);
    const seen = new Set(seenRaw as string[]);

    const all: AdminMessage[] = [];
    for (const r of [...userRaw, ...broadRaw]) {
      try {
        const msg: AdminMessage = typeof r === "string" ? JSON.parse(r) : r;
        // User requested: ONLY show messages sent directly by human admin, NOT AI replies
        const isAiMessage =
          msg.id.startsWith("ai-") ||
          msg.id.startsWith("email-ai-") ||
          msg.sentByEmail?.includes("ai") ||
          msg.sentByEmail === "autonomous-ai@nixelstudio.com" ||
          msg.sentByEmail === "ai-assistant@nixelstudio.com";

        if (!seen.has(msg.id) && !isAiMessage) {
          all.push(msg);
        }
      } catch { /* skip */ }
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    return NextResponse.json({ messages: all.slice(0, 10) });
  } catch (err) {
    console.error("User inbox error:", err);
    return NextResponse.json({ messages: [] });
  }
}

/**
 * POST /api/user/inbox
 * Mark messages as read (by IDs array).
 */
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ ok: false });

  const payload = verifyToken(t);
  if (!payload) return NextResponse.json({ ok: false });

  try {
    const body = await request.json() as { ids: string[] };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const seenKey = `adminmsg:seen:${payload.userId}`;
    for (const id of body.ids) {
      await redis.sadd(seenKey, id);
    }
    await redis.expire(seenKey, 86400 * 14);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("User inbox mark-read error:", err);
    return NextResponse.json({ ok: false });
  }
}
