import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

import { generateRecipientId, getUserByEmail } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  const userDb = await getUserByEmail(payload.email);
  const recId = userDb?.recipientId ?? generateRecipientId(payload.userId || payload.email);

  return NextResponse.json({
    user: {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      recipientId: recId,
      role: payload.email === "nixxeltzy@gmail.com" ? "admin" : (payload.role ?? "user"),
    },
  });
}

