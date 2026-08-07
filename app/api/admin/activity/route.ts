import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllActivityEvents, getUserActivityEvents } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "200", 10);

  try {
    const events = userId
      ? await getUserActivityEvents(userId, limit)
      : await getAllActivityEvents(limit);

    return NextResponse.json({ events });
  } catch (err) {
    console.error("Admin activity log error:", err);
    return NextResponse.json({ error: "Gagal mengambil activity log" }, { status: 500 });
  }
}
