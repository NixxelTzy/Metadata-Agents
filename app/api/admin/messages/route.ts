import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllReports } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin" }, { status: 403 });
  }

  try {
    const reports = await getAllReports();
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Failed to get all reports:", error);
    return NextResponse.json({ error: "Gagal mengambil data seluruh laporan" }, { status: 500 });
  }
}
