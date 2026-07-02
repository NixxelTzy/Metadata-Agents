import { NextRequest, NextResponse } from "next/server";
import { inspect, getClientIp } from "@/lib/security/core";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-otp",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });

  const ip = getClientIp(headersObj) || "127.0.0.1";
  const token = request.cookies.get("auth_token")?.value;
  const userAgent = headersObj["user-agent"] || "";

  // Run security inspection on every request
  try {
    const result = await inspect({
      ip,
      userId: token ? `tok_${token.slice(0, 16)}` : undefined,
      endpoint: pathname,
      method: request.method,
      userAgent,
      headers: headersObj,
      // Body is not available in middleware Edge runtime — payload detection runs in API routes
    });

    if (result.blocked) {
      const status = result.signals.some(s => s.type === "rate_limit") ? 429 : 403;
      return new NextResponse(
        JSON.stringify({
          error: "Akses ditolak oleh sistem keamanan",
          reason: result.reason,
          threatScore: result.threatScore,
          severity: result.severity,
        }),
        { status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Tarpit: delay response without blocking
    if (result.action === "tarpit" && result.tarpitMs) {
      await new Promise(r => setTimeout(r, Math.min(result.tarpitMs!, 5000)));
    }
  } catch (e) {
    console.error("[Middleware] Security check error:", e);
  }

  // Auth check
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
