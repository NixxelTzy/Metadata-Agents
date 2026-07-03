/**
 * /api/security/events — Security event log endpoint
 * Requires admin auth. Returns real events from Redis.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSecurityEvents, getSecurityStats, inspect, getClientIp } from "@/lib/security/core";

export const runtime = "nodejs"; // Explicitly Node.js runtime — required for Redis

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  // Auth check
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

  const [events, stats] = await Promise.all([
    getSecurityEvents(limit),
    getSecurityStats(),
  ]);

  return NextResponse.json({ events, stats, timestamp: Date.now() });
}

// Also allow POST to manually test detection (admin only)
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });

  // Run a test inspection to verify Redis connection
  const result = await inspect({
    ip: getClientIp(headersObj),
    endpoint: "/api/security/events",
    method: "POST",
    userAgent: headersObj["user-agent"] ?? "test",
    headers: headersObj,
    body: { test: true },
  });

  return NextResponse.json({ result, redisConnected: true });
}
