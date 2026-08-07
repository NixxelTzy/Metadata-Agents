import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { processAutonomousAiSupport } from "@/lib/ai-agent";

export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const body = await request.json() as { appealMessage: string };
    const { appealMessage } = body;

    if (!appealMessage || appealMessage.trim().length < 5) {
      return NextResponse.json({ error: "Pesan banding minimal 5 karakter" }, { status: 400 });
    }

    const result = await processAutonomousAiSupport({
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      category: "appeal",
      userMessage: appealMessage.trim(),
    });

    return NextResponse.json({
      ok: true,
      message: "Banding berhasil diproses secara otomatis oleh AI!",
      aiReplyText: result.aiReplyText,
      unblocked: result.unblocked,
      emailSent: result.emailSent,
    });
  } catch (err) {
    console.error("Unblock appeal API error:", err);
    return NextResponse.json({ error: "Gagal memproses banding" }, { status: 500 });
  }
}
