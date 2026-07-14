import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { createReport, getReportsByUserId } from "@/lib/db";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  try {
    const reports = await getReportsByUserId(payload.userId);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Failed to get feedback:", error);
    return NextResponse.json({ error: "Gagal mengambil data laporan" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  try {
    const body = await request.json() as { type: "bug" | "feature" | "other"; message: string };
    const { type, message } = body;

    if (!type || !message) {
      return NextResponse.json({ error: "Tipe dan pesan wajib diisi" }, { status: 400 });
    }

    if (!["bug", "feature", "other"].includes(type)) {
      return NextResponse.json({ error: "Tipe laporan tidak valid" }, { status: 400 });
    }

    if (message.trim().length < 5) {
      return NextResponse.json({ error: "Pesan terlalu pendek (minimal 5 karakter)" }, { status: 400 });
    }

    const report = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      type,
      message: message.trim(),
      createdAt: new Date().toISOString(),
    };

    await createReport(report);

    return NextResponse.json({ message: "Laporan berhasil dikirim", report });
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return NextResponse.json({ error: "Gagal mengirim laporan" }, { status: 500 });
  }
}
