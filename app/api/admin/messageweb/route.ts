import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface AdminMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;          // for block type
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
      targetEmail: string | "all";
      targetUsername: string | "all";
    };

    if (!body.type || !body.title || !body.body) {
      return NextResponse.json({ error: "Tipe, judul, dan isi pesan wajib diisi" }, { status: 400 });
    }

    const msg: AdminMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: body.type,
      title: body.title.trim(),
      body: body.body.trim(),
      reason: body.reason?.trim(),
      targetUserId: body.targetUserId,
      targetEmail: body.targetEmail,
      targetUsername: body.targetUsername,
      sentAt: new Date().toISOString(),
      sentByEmail: payload.email,
      read: false,
    };

    if (body.targetUserId === "all") {
      // Broadcast to all — store in broadcast list
      await redis.lpush("adminmsg:broadcast", JSON.stringify(msg));
      await redis.ltrim("adminmsg:broadcast", 0, 199);
      await redis.expire("adminmsg:broadcast", 86400 * 7);
    } else {
      // Targeted message
      const key = `adminmsg:user:${body.targetUserId}`;
      await redis.lpush(key, JSON.stringify(msg));
      await redis.ltrim(key, 0, 49);
      await redis.expire(key, 86400 * 7);
    }

    // Also store in admin sent log
    await redis.lpush("adminmsg:sentlog", JSON.stringify(msg));
    await redis.ltrim("adminmsg:sentlog", 0, 499);
    await redis.expire("adminmsg:sentlog", 86400 * 30);

    return NextResponse.json({ ok: true, messageId: msg.id });
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
