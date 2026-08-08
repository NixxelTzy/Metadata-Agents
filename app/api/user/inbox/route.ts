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
  try {
    // 0. Trigger Autonomous Background Email AI Worker (non-blocking)
    const { triggerAutonomousEmailPoller } = await import("@/lib/gmail-poller");
    void triggerAutonomousEmailPoller();

    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    const { searchParams } = new URL(request.url);
    const qEmail = (searchParams.get("email") ?? "").toLowerCase();
    const qUserId = searchParams.get("userId") ?? "";
    const qUsername = (searchParams.get("username") ?? "").toLowerCase();

    const userEmail = (payload?.email ?? qEmail).toLowerCase();
    const userId = payload?.userId ?? qUserId;
    const userUsername = (payload?.username ?? qUsername).toLowerCase();

    const userKeys: string[] = ["adminmsg:broadcast", "adminmsg:sentlog"];

    if (userId) userKeys.push(`adminmsg:user:${userId}`);
    if (userEmail) userKeys.push(`adminmsg:user:${userEmail}`);
    if (userUsername) userKeys.push(`adminmsg:user:${userUsername}`);

    const rawLists = await Promise.all(
      userKeys.map((k) => redis.lrange(k, 0, 49).catch(() => []))
    );

    const msgMap = new Map<string, AdminMessage>();

    for (const list of rawLists) {
      for (const r of list) {
        try {
          const msg: AdminMessage = typeof r === "string" ? JSON.parse(r) : r;
          if (!msg || !msg.id || !msg.type || !msg.title) continue;

          const isAiMessage =
            msg.id.startsWith("ai-") ||
            msg.id.startsWith("email-ai-") ||
            msg.sentByEmail?.includes("ai") ||
            msg.sentByEmail === "autonomous-ai@nixelstudio.com" ||
            msg.sentByEmail === "ai-assistant@nixelstudio.com";

          if (isAiMessage) continue;

          // Target check: Broadcast to everyone or specifically targeted to this user
          const isBroadcast =
            msg.targetUserId === "all" ||
            msg.targetEmail === "all" ||
            msg.targetUsername === "all" ||
            String(msg.targetUserId).toLowerCase() === "all" ||
            String(msg.targetEmail).toLowerCase() === "all" ||
            String(msg.targetUsername).toLowerCase() === "all";

          const isForMe =
            (userId && String(msg.targetUserId).toLowerCase() === String(userId).toLowerCase()) ||
            (userEmail && msg.targetEmail && msg.targetEmail.toLowerCase() === userEmail.toLowerCase()) ||
            (userUsername && msg.targetUsername && msg.targetUsername.toLowerCase() === userUsername.toLowerCase());

          if (!isBroadcast && !isForMe) continue;

          // Deliver all matching messages (broadcast + targeted) to client
          msgMap.set(msg.id, msg);
        } catch { /* skip corrupted item */ }
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
