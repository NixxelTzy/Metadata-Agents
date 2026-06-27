import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      role: payload.role ?? "user",
    },
  });
}
