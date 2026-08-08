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

    const userKeys = [
      `adminmsg:user:${payload.userId}`,
      `adminmsg:user:${payload.email.toLowerCase()}`,
    ];
    if (payload.username) {
      userKeys.push(`adminmsg:user:${payload.username.toLowerCase()}`);
    }

    const rawLists = await Promise.all([
      ...userKeys.map((k) => redis.lrange(k, 0, 19)),
      redis.lrange("adminmsg:broadcast", 0, 9),
    ]);

    // Read-receipt key — stores message IDs already seen/dismissed by this user
    const seenKey = `adminmsg:seen:${payload.userId}`;
    const seenRaw = await redis.smembers(seenKey);
    const seen = new Set(seenRaw as string[]);

    const msgMap = new Map<string, AdminMessage>();

    for (const list of rawLists) {
      for (const r of list) {
        try {
          const msg: AdminMessage = typeof r === "string" ? JSON.parse(r) : r;
          const isAiMessage =
            msg.id.startsWith("ai-") ||
            msg.id.startsWith("email-ai-") ||
            msg.sentByEmail?.includes("ai") ||
            msg.sentByEmail === "autonomous-ai@nixelstudio.com" ||
            msg.sentByEmail === "ai-assistant@nixelstudio.com";

          if (isAiMessage) continue;

          // Check if message is for ALL or specifically targeted to this user
          const isTargetedToMe =
            msg.targetUserId === "all" ||
            msg.targetEmail === "all" ||
            String(msg.targetUserId) === String(payload.userId) ||
            msg.targetEmail?.toLowerCase() === payload.email.toLowerCase() ||
            (payload.username && msg.targetUsername?.toLowerCase() === payload.username.toLowerCase());

          if (!isTargetedToMe) continue;

          // For standard messages, skip if dismissed by user.
          // For block and refresh messages, DO NOT skip even if in seen set.
          if (msg.type === "message" && seen.has(msg.id)) continue;

          msgMap.set(msg.id, msg);
        } catch { /* skip */ }
      }
    }

    const all = Array.from(msgMap.values());
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
