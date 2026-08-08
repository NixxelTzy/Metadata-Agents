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
 * Returns active admin messages for this user.
 *
 * Logic:
 * 1. Read "adminmsg:broadcast" — shown to ALL users
 * 2. Read "adminmsg:user:{userId}" — targeted by UUID
 * 3. Read "adminmsg:user:{email}" — targeted by email
 * 4. Read "adminmsg:user:{username}" — targeted by username
 * 5. Read "adminmsg:user:{recipientId}" — targeted by REC-XXXXXX
 * 
 * The sentlog is NOT included here — it's only for admin view.
 * Each message is deduplicated by ID.
 */
export async function GET(request: NextRequest) {
  try {
    // Identify who is making the request
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    const { searchParams } = new URL(request.url);
    const qEmail = (searchParams.get("email") ?? "").toLowerCase().trim();
    const qUserId = (searchParams.get("userId") ?? "").trim();
    const qUsername = (searchParams.get("username") ?? "").toLowerCase().trim();
    const qRecipientId = (searchParams.get("recipientId") ?? "").toUpperCase().trim();

    // Prefer cookie-auth identity, fall back to query params
    const myUserId = (payload?.userId ?? qUserId).trim();
    const myEmail = (payload?.email ?? qEmail).toLowerCase().trim();
    const myUsername = (payload?.username ?? qUsername).toLowerCase().trim();
    const myRecipientId = qRecipientId;

    // Update online status in background (non-blocking)
    if (myUserId || myEmail) {
      const { updateUserActivity } = await import("@/lib/db");
      void updateUserActivity(myUserId || myEmail, myEmail, myUsername, "inbox_active");
    }

    // Build list of Redis keys to check
    // Always include broadcast, then all personal keys
    const keysToCheck: string[] = ["adminmsg:broadcast"];
    if (myUserId) keysToCheck.push(`adminmsg:user:${myUserId}`);
    if (myEmail) keysToCheck.push(`adminmsg:user:${myEmail}`);
    if (myUsername) keysToCheck.push(`adminmsg:user:${myUsername}`);
    if (myRecipientId) keysToCheck.push(`adminmsg:user:${myRecipientId}`);

    // Fetch all keys in parallel
    const rawLists = await Promise.all(
      keysToCheck.map((k) => redis.lrange(k, 0, 99).catch(() => []))
    );

    // Deduplicate by message ID
    const msgMap = new Map<string, AdminMessage>();

    for (const list of rawLists) {
      for (const r of list) {
        try {
          const msg: AdminMessage = typeof r === "string" ? JSON.parse(r) : r;
          if (!msg?.id || !msg?.type || !msg?.title) continue;

          // Skip AI-generated messages
          if (
            msg.id.startsWith("ai-") ||
            msg.id.startsWith("email-ai-") ||
            msg.sentByEmail === "autonomous-ai@nixelstudio.com" ||
            msg.sentByEmail === "ai-assistant@nixelstudio.com"
          ) continue;

          msgMap.set(msg.id, msg);
        } catch { /* skip corrupted */ }
      }
    }

    const messages = Array.from(msgMap.values());
    messages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    return NextResponse.json({ messages: messages.slice(0, 20) });
  } catch (err) {
    console.error("User inbox GET error:", err);
    return NextResponse.json({ messages: [] });
  }
}

/**
 * POST /api/user/inbox
 * Mark messages as read by IDs array.
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
    console.error("User inbox POST mark-read error:", err);
    return NextResponse.json({ ok: false });
  }
}
