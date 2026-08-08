import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers } from "@/lib/db";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

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

/** Send a message to one user or all users */
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      type: "message" | "refresh" | "block";
      title: string;
      body: string;
      reason?: string;
      targetUserId: string | "all";
      targetEmail?: string | "all";
      targetUsername?: string | "all";
    };

    if (!body.type || !body.title || !body.body) {
      return NextResponse.json({ error: "Tipe, judul, dan isi pesan wajib diisi" }, { status: 400 });
    }

    // Determine if this is a broadcast
    const rawTargetId = String(body.targetUserId ?? "").trim();
    const isAll = rawTargetId === "all" || rawTargetId === "";

    const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isAll) {
      // ── BROADCAST: save to adminmsg:broadcast ─────────────────────────────
      const msg: AdminMessage = {
        id: msgId,
        type: body.type,
        title: body.title.trim(),
        body: body.body.trim(),
        reason: body.reason?.trim(),
        targetUserId: "all",
        targetEmail: "all",
        targetUsername: "all",
        sentAt: new Date().toISOString(),
        sentByEmail: payload.email,
        read: false,
      };

      await redis.lpush("adminmsg:broadcast", JSON.stringify(msg));
      await redis.ltrim("adminmsg:broadcast", 0, 199);
      await redis.expire("adminmsg:broadcast", 86400 * 7);

      // Store in sent log for admin view
      await redis.lpush("adminmsg:sentlog", JSON.stringify(msg));
      await redis.ltrim("adminmsg:sentlog", 0, 499);
      await redis.expire("adminmsg:sentlog", 86400 * 30);

      return NextResponse.json({ ok: true, messageId: msg.id, mode: "broadcast" });
    }

    // ── TARGETED: Resolve target user from DB ─────────────────────────────
    const allUsers = await getAllUsers();
    const cleanRawTarget = rawTargetId.trim();

    const targetUser = allUsers.find((u) =>
      u.id === cleanRawTarget ||
      u.email.toLowerCase() === cleanRawTarget.toLowerCase() ||
      u.username.toLowerCase() === cleanRawTarget.toLowerCase() ||
      (u.recipientId && u.recipientId.toUpperCase() === cleanRawTarget.toUpperCase())
    );

    const finalUserId = targetUser?.id || (body.targetUserId && body.targetUserId !== "all" ? body.targetUserId : cleanRawTarget);
    const finalEmail = targetUser?.email.toLowerCase() || (body.targetEmail && body.targetEmail !== "all" ? body.targetEmail.toLowerCase().trim() : (cleanRawTarget.includes("@") ? cleanRawTarget.toLowerCase() : cleanRawTarget));
    const finalUsername = targetUser?.username.toLowerCase() || (body.targetUsername && body.targetUsername !== "all" ? body.targetUsername.toLowerCase().trim() : finalEmail);
    const finalRecId = targetUser?.recipientId?.toUpperCase() || (cleanRawTarget.startsWith("REC-") ? cleanRawTarget.toUpperCase() : undefined);

    const msg: AdminMessage = {
      id: msgId,
      type: body.type,
      title: body.title.trim(),
      body: body.body.trim(),
      reason: body.reason?.trim(),
      targetUserId: finalUserId,
      targetEmail: finalEmail,
      targetUsername: finalUsername,
      sentAt: new Date().toISOString(),
      sentByEmail: payload.email,
      read: false,
    };

    // Write to all target keys so inbox polling finds it regardless of identity key used
    const keysSet = new Set<string>();
    if (finalUserId && finalUserId !== "all") keysSet.add(`adminmsg:user:${finalUserId}`);
    if (finalEmail && finalEmail !== "all") keysSet.add(`adminmsg:user:${finalEmail}`);
    if (finalUsername && finalUsername !== "all") keysSet.add(`adminmsg:user:${finalUsername}`);
    if (finalRecId) keysSet.add(`adminmsg:user:${finalRecId}`);
    if (cleanRawTarget && cleanRawTarget !== "all") keysSet.add(`adminmsg:user:${cleanRawTarget}`);

    for (const k of Array.from(keysSet)) {
      await redis.lpush(k, JSON.stringify(msg));
      await redis.ltrim(k, 0, 49);
      await redis.expire(k, 86400 * 7);
    }

    // Store in sent log for admin view
    await redis.lpush("adminmsg:sentlog", JSON.stringify(msg));
    await redis.ltrim("adminmsg:sentlog", 0, 499);
    await redis.expire("adminmsg:sentlog", 86400 * 30);

    return NextResponse.json({
      ok: true,
      messageId: msg.id,
      mode: "targeted",
      sentTo: { id: finalUserId, email: finalEmail, username: finalUsername },
    });
  } catch (err) {
    console.error("Admin send message error:", err);
    return NextResponse.json({ error: "Gagal mengirim pesan" }, { status: 500 });
  }
}

/** Get sent log (admin only) */
export async function GET(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = await redis.lrange("adminmsg:sentlog", 0, 199);
    const messages = raw.map((r) =>
      typeof r === "string" ? JSON.parse(r) : r
    ) as AdminMessage[];
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Admin get messages error:", err);
    return NextResponse.json({ error: "Gagal mengambil pesan" }, { status: 500 });
  }
}
