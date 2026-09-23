import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers } from "@/lib/db";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface SmartMessage {
  id: string;
  title: string;
  body: string;
  audience: "all" | "new_users" | "guests";
  sentAt: string;
  sentByEmail: string;
  expiresAt: string; // ISO — message hides after this date
}

const SMART_MSG_KEY = "smartmsg:active";
const SMART_MSG_LOG_KEY = "smartmsg:log";

// ── GET: Fetch active smart messages (for users) or log (for admin) ─────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  // Admin log view
  if (view === "log") {
    const t = request.cookies.get("auth_token")?.value;
    const payload = t ? verifyToken(t) : null;
    if (!payload || payload.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const raw = await redis.lrange(SMART_MSG_LOG_KEY, 0, 99).catch(() => []);
    const messages = raw.map((r) => typeof r === "string" ? JSON.parse(r) : r) as SmartMessage[];
    return NextResponse.json({ messages });
  }

  // Public fetch for users — return active messages based on audience
  try {
    const raw = await redis.lrange(SMART_MSG_KEY, 0, 49).catch(() => []);
    const now = Date.now();
    const allMsgs = raw
      .map((r) => {
        try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return null; }
      })
      .filter((m): m is SmartMessage => m !== null && new Date(m.expiresAt).getTime() > now);

    // Determine user context
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
    console.error("[smart-message GET]", err);
    return NextResponse.json({ messages: [] });
  }
}

// ── POST: Admin send or delete smart message ──────────────────────────────────
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Admin Access Required" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action?: "send" | "delete";
      id?: string;
      title?: string;
      body?: string;
      audience?: "all" | "new_users" | "guests";
      ttlHours?: number; // how long the message lives (default 72h)
    };

    const action = body.action ?? "send";

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

      // Remove from active list
      const activeRaw = await redis.lrange(SMART_MSG_KEY, 0, 99).catch(() => []);
      const filtered = activeRaw.filter((r) => {
        try {
          const m = typeof r === "string" ? JSON.parse(r) : r;
          return m.id !== body.id;
        } catch { return true; }
      });
      await redis.del(SMART_MSG_KEY);
      if (filtered.length > 0) {
        for (const m of filtered.reverse()) {
          await redis.rpush(SMART_MSG_KEY, typeof m === "string" ? m : JSON.stringify(m));
        }
        await redis.expire(SMART_MSG_KEY, 86400 * 30);
      }

      return NextResponse.json({ ok: true, message: "✅ Smart Message dihapus!" });
    }

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (!body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json({ error: "Judul dan isi pesan wajib diisi" }, { status: 400 });
    }

    const ttlHours = Math.min(Math.max(body.ttlHours ?? 72, 1), 720); // 1h – 30d
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const msg: SmartMessage = {
      id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: body.title.trim(),
      body: body.body.trim(),
      audience: body.audience ?? "all",
      sentAt: new Date().toISOString(),
      sentByEmail: payload.email,
      expiresAt,
    };

    // Push to active list (users see this)
    await redis.lpush(SMART_MSG_KEY, JSON.stringify(msg));
    await redis.ltrim(SMART_MSG_KEY, 0, 49);
    await redis.expire(SMART_MSG_KEY, 86400 * 30);

    // Push to log (admin view history)
    await redis.lpush(SMART_MSG_LOG_KEY, JSON.stringify(msg));
    await redis.ltrim(SMART_MSG_LOG_KEY, 0, 199);
    await redis.expire(SMART_MSG_LOG_KEY, 86400 * 60);

    return NextResponse.json({ ok: true, message: `✅ Smart Message terkirim ke: ${body.audience ?? "all"}`, id: msg.id });
  } catch (err) {
    console.error("[smart-message POST]", err);
    return NextResponse.json({ error: "Gagal memproses permintaan" }, { status: 500 });
  }
}
