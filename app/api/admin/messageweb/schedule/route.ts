import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface ScheduledMessage {
  id: string;
  type: "message" | "refresh" | "block";
  priority: "normal" | "important" | "emergency";
  title: string;
  body: string;
  reason?: string;
  targetUserId: string;
  targetEmail: string;
  targetUsername: string;
  scheduledAt: string;
  expiresAt?: string;
  sentAt?: string;
  status: "pending" | "sent" | "expired";
  createdAt: string;
}

/**
 * GET /api/admin/messageweb/schedule
 * List all scheduled and maintenance messages.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const raw = await redis.lrange("adminmsg:scheduled", 0, 49).catch(() => []);
    const items: ScheduledMessage[] = raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
    return NextResponse.json({ scheduled: items });
  } catch {
    return NextResponse.json({ scheduled: [] });
  }
}

/**
 * POST /api/admin/messageweb/schedule
 * Schedule a new message for future automated dispatch.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      type: "message" | "refresh" | "block";
      priority?: "normal" | "important" | "emergency";
      title: string;
      body: string;
      reason?: string;
      targetUserId: string;
      targetEmail: string;
      targetUsername: string;
      delayMinutes?: number;
      expiresHours?: number;
    };

    if (!body.title || !body.body) {
      return NextResponse.json({ error: "Judul dan isi pesan wajib diisi" }, { status: 400 });
    }

    const delayMs = (body.delayMinutes ?? 0) * 60 * 1000;
    const scheduledTime = new Date(Date.now() + delayMs).toISOString();

    const expireMs = body.expiresHours ? body.expiresHours * 3600 * 1000 : 0;
    const expiresTime = expireMs > 0 ? new Date(Date.now() + delayMs + expireMs).toISOString() : undefined;

    const item: ScheduledMessage = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: body.type,
      priority: body.priority ?? "normal",
      title: body.title.trim(),
      body: body.body.trim(),
      reason: body.reason?.trim(),
      targetUserId: body.targetUserId,
      targetEmail: body.targetEmail,
      targetUsername: body.targetUsername,
      scheduledAt: scheduledTime,
      expiresAt: expiresTime,
      status: delayMs > 0 ? "pending" : "sent",
      createdAt: new Date().toISOString(),
    };

    await redis.lpush("adminmsg:scheduled", JSON.stringify(item));
    await redis.ltrim("adminmsg:scheduled", 0, 99);

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Schedule message error:", err);
    return NextResponse.json({ error: "Gagal menjadwalkan pesan" }, { status: 500 });
  }
}
