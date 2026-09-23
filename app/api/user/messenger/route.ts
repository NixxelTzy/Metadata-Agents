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
 * ═══════════════════════════════════════════════════════════════════════════
 * MASTER USER MESSENGER — Full Real-Time Background System
 *
 * Features:
 * - Background inbox polling (client polls this every 5s)
 * - Instant unblock detection via Redis signal key
 * - Targeted + broadcast message delivery
 * - Block state detection with immediate unblock support
 * - Online heartbeat ping
 * - Appeal processing via AI agent
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── GET: Fetch Inbox — called every 5s by client in background ───────────────
export async function GET(request: NextRequest) {
  try {
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;

    const { searchParams } = new URL(request.url);
    const qEmail      = (searchParams.get("email")       ?? "").toLowerCase().trim();
    const qUserId     = (searchParams.get("userId")      ?? "").trim();
    const qUsername   = (searchParams.get("username")    ?? "").toLowerCase().trim();
    const qRecipientId = (searchParams.get("recipientId") ?? "").toUpperCase().trim();

    const myUserId     = (payload?.userId  ?? qUserId).trim();
    const myEmail      = (payload?.email   ?? qEmail).toLowerCase().trim();
    const myUsername   = (payload?.username ?? qUsername).toLowerCase().trim();
    const myRecipientId = qRecipientId;

    // Background: update online status — throttled to max once per 10s per user
    // Inbox is polled every 800ms, so without throttle this writes Redis 75x per minute
    if ((myUserId || myEmail) && payload) {
      const throttleKey = `online:throttle:${myUserId || myEmail}`;
      void redis.set(throttleKey, "1", { ex: 10, nx: true })
        .then((didSet) => {
          if (didSet) {
            // Only update activity if throttle key was newly set (first call in 10s window)
            return import("@/lib/db").then(({ updateUserActivity }) =>
              updateUserActivity(myUserId || myEmail, myEmail, myUsername, "inbox_active")
            );
          }
        })
        .catch(() => {});
    }

    // ── Check realtime unblock signal ───────────────────────────────────────
    // Admin sets this key when unblocking. We check it so unblock is instant.
    const unblockKeys = [
      myUserId     ? `adminmsg:unblocked:${myUserId}`   : null,
      myEmail      ? `adminmsg:unblocked:${myEmail}`    : null,
      myUsername   ? `adminmsg:unblocked:${myUsername}` : null,
    ].filter(Boolean) as string[];

    let justUnblocked = false;
    if (unblockKeys.length > 0) {
      const unblockChecks = await Promise.all(unblockKeys.map(k => redis.get(k).catch(() => null)));
      justUnblocked = unblockChecks.some(v => v !== null);
      // Clear the signal after detecting it
      if (justUnblocked) {
        await Promise.all(unblockKeys.map(k => redis.del(k).catch(() => null)));
      }
    }

    // ── Fetch all message keys for this user ─────────────────────────────────
    // STRICT: Use only userId key as primary (most reliable, no collision risk)
    // Email/username keys are kept as fallback for backward compat with old messages
    const keysToCheck: string[] = ["adminmsg:broadcast"];
    if (myUserId) keysToCheck.push(`adminmsg:user:${myUserId}`);
    // Fallback to email key only if no userId (unauthenticated/guest edge case)
    else if (myEmail) keysToCheck.push(`adminmsg:user:${myEmail}`);

    const rawLists = await Promise.all(
      keysToCheck.map(k => redis.lrange(k, 0, 99).catch(() => []))
    );

    const msgMap = new Map<string, AdminMessage>();

    for (let listIdx = 0; listIdx < rawLists.length; listIdx++) {
      const list = rawLists[listIdx];
      const isBroadcastList = keysToCheck[listIdx] === "adminmsg:broadcast";

      for (const r of list) {
        try {
          const msg = (typeof r === "string" ? JSON.parse(r) : r) as AdminMessage;
          if (!msg?.id || !msg?.type || !msg?.title) continue;

          // Skip AI-generated internal messages
          if (
            msg.id.startsWith("ai-") ||
            msg.id.startsWith("email-ai-") ||
            msg.sentByEmail === "autonomous-ai@nixelstudio.com" ||
            msg.sentByEmail === "ai-assistant@nixelstudio.com"
          ) continue;

          // ── CRITICAL FIX: Filter broadcast messages ──────────────────────
          // Only include broadcast messages that are truly "all" recipients.
          // If a message in the broadcast key has a specific targetUserId/targetEmail
          // that does NOT match this user, skip it — it was incorrectly stored there.
          if (isBroadcastList) {
            const tId    = msg.targetUserId;
            const tEmail = msg.targetEmail;
            const tUser  = msg.targetUsername;

            const isAllTarget = tId === "all" || tEmail === "all" || tUser === "all";
            if (!isAllTarget) {
              // This is a targeted message that leaked into broadcast — skip it for other users
              const matchesMe =
                (myUserId && (tId === myUserId)) ||
                (myEmail  && (tEmail?.toLowerCase() === myEmail)) ||
                (myUsername && (tUser?.toLowerCase() === myUsername));
              if (!matchesMe) continue;
            }
          }

          msgMap.set(msg.id, msg);
        } catch { /* skip corrupted */ }
      }
    }

    const allMessages = Array.from(msgMap.values());
    allMessages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    // ── Get seen set ─────────────────────────────────────────────────────────
    let seenIds = new Set<string>();
    if (myUserId) {
      const seenRaw = await redis.smembers(`adminmsg:seen:${myUserId}`).catch(() => []);
      seenIds = new Set(seenRaw as string[]);
    }

    // ── Filter: exclude already-seen non-block messages ──────────────────────
    // Block messages always show regardless of seen status (safety requirement)
    // Message/refresh types are hidden once user has dismissed/read them
    const messages = (justUnblocked
      ? allMessages.filter(m => m.type !== "block")
      : allMessages
    )
      .filter(m => m.type === "block" || !seenIds.has(m.id))
      .slice(0, 20);

    const isBlocked = !justUnblocked && messages.some(m => m.type === "block");
    const unreadCount = messages.filter(m => !seenIds.has(m.id)).length;

    return NextResponse.json({
      messages,
      isBlocked,
      justUnblocked,
      unreadCount,
      fetchedAt: Date.now(),
    });

  } catch (err) {
    console.error("[user/messenger GET]", err);
    return NextResponse.json({ messages: [], isBlocked: false, justUnblocked: false, unreadCount: 0, fetchedAt: Date.now() });
  }
}

// ── POST: Mark Read, Submit Appeal, Ping Heartbeat ───────────────────────────
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

    const action = body.action || actionParam
      || (body.appealMessage ? "appeal" : body.path ? "ping" : "read");

    // ── PING ─────────────────────────────────────────────────────────────────
    if (action === "ping") {
      const userEmail    = (body.email    || searchParams.get("email")    || "").toLowerCase().trim();
      const userId       = (body.userId   || searchParams.get("userId")   || "").trim();
      const userUsername = (body.username || searchParams.get("username") || "").toLowerCase().trim();

      if (userId || userEmail) {
        const pingPayload = {
          isOnline:   body.visibility !== "hidden",
          lastPing:   new Date().toISOString(),
          path:       body.path || "/",
          visibility: body.visibility || "visible",
          email:      userEmail,
          userId,
          username:   userUsername,
        };
        const keys: string[] = [];
        if (userId)       keys.push(`online:user:${userId}`);
        if (userEmail)    keys.push(`online:user:${userEmail}`);
        if (userUsername) keys.push(`online:user:${userUsername}`);
        await Promise.all(keys.map(k => redis.set(k, pingPayload, { ex: 12 }).catch(() => {})));
      }
      return NextResponse.json({ ok: true });
    }

    // Require auth for appeal & mark-read
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── APPEAL ───────────────────────────────────────────────────────────────
    if (action === "appeal") {
      const appealText = (body.appealMessage ?? "").trim();
      if (!appealText || appealText.length < 5) {
        return NextResponse.json({ error: "Pesan banding minimal 5 karakter" }, { status: 400 });
      }
      const { processAutonomousAiSupport } = await import("@/lib/ai-agent");
      const result = await processAutonomousAiSupport({
        userId:   payload.userId,
        username: payload.username,
        email:    payload.email,
        category: "appeal",
        userMessage: appealText,
      });
      return NextResponse.json({
        ok: true,
        message: "Banding berhasil diproses oleh AI!",
        aiReplyText: result.aiReplyText,
        unblocked:   result.unblocked,
        emailSent:   result.emailSent,
      });
    }

    // ── MARK READ ────────────────────────────────────────────────────────────
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length > 0 && payload.userId) {
      const seenKey = `adminmsg:seen:${payload.userId}`;
      // Add to seen set (persistent across sessions)
      await Promise.all(ids.map(id => redis.sadd(seenKey, id).catch(() => {})));
      await redis.expire(seenKey, 86400 * 30).catch(() => {});
    }
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[user/messenger POST]", err);
    return NextResponse.json({ error: "Gagal memproses permintaan" }, { status: 500 });
  }
}
