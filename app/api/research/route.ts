import { NextRequest, NextResponse } from "next/server";
import { inspect } from "@/lib/security/core";

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });

  let body: unknown = null;
  if (request.method !== "GET") {
    try { body = await request.json(); } catch { body = null; }
  }

  if (!token) {
    const sec = await inspect({
      ip,
      endpoint: "/api/research",
      method: request.method,
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body,
    });
    if (sec.blocked) {
      return NextResponse.json(
        { error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({ message: "Research API active" });
}
