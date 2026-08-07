import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { processInboundEmailWithAi, getEmailAiLogs, type InboundEmailPayload } from "@/lib/email-ai-worker";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

/** GET: Fetch Autonomous Email AI Worker status & logs */
export async function GET(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
    const logs = await getEmailAiLogs(limit);

    const stats = {
      totalProcessed: logs.length,
      unblockRequests: logs.filter((l) => l.intent === "UNBLOCK_REQUEST").length,
      tokenResets: logs.filter((l) => l.intent === "TOKEN_RESET_REQUEST").length,
      bugReports: logs.filter((l) => l.intent === "BUG_REPORT").length,
      emailsSent: logs.filter((l) => l.emailSent).length,
      workerStatus: "ACTIVE_24_7",
    };

    return NextResponse.json({ ok: true, stats, logs });
  } catch (err) {
    console.error("Admin Email AI Worker GET error:", err);
    return NextResponse.json({ error: "Gagal mengambil data AI Worker" }, { status: 500 });
  }
}

/** POST: Process / Simulate incoming email via Autonomous AI Worker */
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as InboundEmailPayload;
    if (!body.fromEmail || !body.subject || !body.body) {
      return NextResponse.json({ error: "Field fromEmail, subject, dan body wajib diisi" }, { status: 400 });
    }

    const result = await processInboundEmailWithAi(body);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("Admin Email AI Worker POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memproses email AI" }, { status: 500 });
  }
}

/** DELETE: Clear logs */
export async function DELETE(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await redis.del("emailai:logs");
    return NextResponse.json({ ok: true, message: "Log Email AI berhasil dibersihkan" });
  } catch (err) {
    return NextResponse.json({ error: "Gagal menghapus log" }, { status: 500 });
  }
}
