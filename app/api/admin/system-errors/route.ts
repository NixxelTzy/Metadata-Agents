import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSystemErrorLogs, clearSystemErrorLogs, reportSystemError } from "@/lib/error-sentinel";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

/**
 * GET /api/admin/system-errors
 * Get system error logs for admin.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const logs = await getSystemErrorLogs();
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: "Gagal mengambil log error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/system-errors
 * Report a client-side crash/error OR clear logs / trigger test.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action?: "clear" | "test";
      category?: "DATABASE" | "AUTH" | "VISION_AI" | "FIREWALL" | "MESSAGING" | "CLIENT_RUNTIME" | "SYSTEM";
      message?: string;
      stack?: string;
      endpoint?: string;
    };

    if (body.action === "clear") {
      const token = request.cookies.get("auth_token")?.value;
      const payload = token ? verifyToken(token) : null;
      if (!payload || payload.email !== ADMIN_EMAIL) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await clearSystemErrorLogs();
      return NextResponse.json({ ok: true, message: "Log error berhasil dibersihkan" });
    }

    if (body.action === "test") {
      await reportSystemError({
        category: "SYSTEM",
        message: "⚡ Uji Coba Sentinel Anti-Error System Works 100%",
        endpoint: "/api/admin/system-errors (Test Trigger)",
        userEmail: ADMIN_EMAIL,
      });
      return NextResponse.json({ ok: true, message: "Notifikasi error tes berhasil dikirim ke Admin Inbox" });
    }

    // Client-side crash report
    if (body.message) {
      await reportSystemError({
        category: body.category ?? "CLIENT_RUNTIME",
        message: body.message,
        error: body.stack,
        endpoint: body.endpoint ?? "Browser Client",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Gagal memproses log error" }, { status: 500 });
  }
}
