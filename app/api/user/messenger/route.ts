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
 * ═════════════════════════════════════════════════════════════════════════════
 * MASTER USER MESSENGER & PRESENCE ENGINE
 * Rute Utama Terpadu untuk Inbox, Ping Heartbeat, & Unblock Appeal Pengguna.
 * Handles: Inbox Fetching, Mark Read, Autonomous AI Appeal, & Online Ping
 * ═════════════════════════════════════════════════════════════════════════════
 */

// ── GET: Fetch Inbox Messages ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    const { searchParams } = new URL(request.url);
    const qEmail = (searchParams.get("email") ?? "").toLowerCase().trim();
    const qUserId = (searchParams.get("userId") ?? "").trim();
    const qUsername = (searchParams.get("username") ?? "").toLowerCase().trim();
    const qRecipientId = (searchParams.get("recipientId") ?? "").toUpperCase().trim();

    const myUserId = (payload?.userId ?? qUserId).trim();
    const myEmail = (payload?.email ?? qEmail).toLowerCase().trim();
    const myUsername = (payload?.username ?? qUsername).toLowerCase().trim();
    const myRecipientId = qRecipientId;

    // Update online status in background (non-blocking)
    if (myUserId || myEmail) {
      const { updateUserActivity } = await import("@/lib/db");
      void updateUserActivity(myUserId || myEmail, myEmail, myUsername, "inbox_active");
    }

    const keysToCheck: string[] = ["adminmsg:broadcast"];
    if (myUserId) keysToCheck.push(`adminmsg:user:${myUserId}`);
    if (myEmail) keysToCheck.push(`adminmsg:user:${myEmail}`);
    if (myUsername) keysToCheck.push(`adminmsg:user:${myUsername}`);
    if (myRecipientId) keysToCheck.push(`adminmsg:user:${myRecipientId}`);

    const rawLists = await Promise.all(
      keysToCheck.map((k) => redis.lrange(k, 0, 99).catch(() => []))
    );

    const msgMap = new Map<string, AdminMessage>();

    for (const list of rawLists) {
      for (const r of list) {
        try {
          const msg: AdminMessage = typeof r === "string" ? JSON.parse(r) : r;
          if (!msg?.id || !msg?.type || !msg?.title) continue;

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
    console.error("Master User Messenger GET error:", err);
    return NextResponse.json({ messages: [] });
  }
}

// ── POST: Mark Read, Submit Appeal, or Ping Heartbeat ────────────────────────
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const actionParam = searchParams.get("action");

  try {
    const body = await request.json().catch(() => ({})) as {
      action?: "read" | "appeal" | "ping";
      ids?: string[];
      appealMessage?: string;
      email?: string;
      userId?: string;
      username?: string;
      path?: string;
      visibility?: string;
    };

    const action = body.action || actionParam || (body.appealMessage ? "appeal" : body.path ? "ping" : "read");

    // ── ACTION: PING ONLINE HEARTBEAT ────────────────────────────────────────
    if (action === "ping") {
      const qEmail = (searchParams.get("email") ?? "").toLowerCase().trim();
      const qUserId = (searchParams.get("userId") ?? "").trim();
      const qUsername = (searchParams.get("username") ?? "").toLowerCase().trim();

      const userEmail = (body.email || qEmail).toLowerCase().trim();
      const userId = (body.userId || qUserId).trim();
      const userUsername = (body.username || qUsername).toLowerCase().trim();

      if (userId || userEmail) {
        const pingPayload = {
          isOnline: body.visibility !== "hidden",
          lastPing: new Date().toISOString(),
          path: body.path || "/",
          visibility: body.visibility || "visible",
          email: userEmail,
          userId: userId,
          username: userUsername,
        };

        const keys: string[] = [];
        if (userId) keys.push(`online:user:${userId}`);
        if (userEmail) keys.push(`online:user:${userEmail}`);
        if (userUsername) keys.push(`online:user:${userUsername}`);

        for (const k of keys) {
          await redis.set(k, pingPayload, { ex: 12 }).catch(() => {});
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Require Auth for Appeal & Mark Read
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── ACTION: APPEAL UNBLOCK ───────────────────────────────────────────────
    if (action === "appeal") {
      const appealText = (body.appealMessage ?? "").trim();
      if (!appealText || appealText.length < 5) {
        return NextResponse.json({ error: "Pesan banding minimal 5 karakter" }, { status: 400 });
      }

      const { processAutonomousAiSupport } = await import("@/lib/ai-agent");
      const result = await processAutonomousAiSupport({
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        category: "appeal",
        userMessage: appealText,
      });

      return NextResponse.json({
        ok: true,
        message: "Banding berhasil diproses secara otomatis oleh AI!",
        aiReplyText: result.aiReplyText,
        unblocked: result.unblocked,
        emailSent: result.emailSent,
      });
    }

    // ── ACTION: MARK READ ────────────────────────────────────────────────────
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length > 0) {
      const seenKey = `adminmsg:seen:${payload.userId}`;
      for (const id of ids) {
        await redis.sadd(seenKey, id);
      }
      await redis.expire(seenKey, 86400 * 14);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Master User Messenger POST error:", err);
    return NextResponse.json({ error: "Gagal memproses permintaan pengguna" }, { status: 500 });
  }
}
