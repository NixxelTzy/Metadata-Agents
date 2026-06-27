import { NextRequest, NextResponse } from "next/server";
import { runSecurityChecks, getClientIp, SecurityContext } from "@/lib/security";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-otp",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow Next.js internals and static files early
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  // 2. Prepare Security Context
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });

  const ctx: SecurityContext = {
    ip: getClientIp(headersObj) || "127.0.0.1",
    // Gunakan sebagian token sebagai userId sbg identifikasi sesi karena middleware Edge tidak bisa verify jsonwebtoken
    userId: token ? `token_${token.substring(0, 16)}` : undefined,
    endpoint: pathname,
    method: request.method,
    userAgent: headersObj["user-agent"] || "unknown",
    contentType: headersObj["content-type"],
  };

  // 3. Eksekusi Security Checks
  try {
    const secResult = await runSecurityChecks(ctx);

    if (!secResult.passed) {
      const status = secResult.reason?.includes("Rate limit") ? 429 : 403;
      return new NextResponse(
        JSON.stringify({
          error: "Akses Ditolak oleh Sistem Keamanan Agresif",
          reason: secResult.reason,
          threatScore: secResult.threatScore,
          actions: secResult.actions
        }),
        { status, headers: { "content-type": "application/json" } }
      );
    }
  } catch (e) {
    // Fallback jika pengecekan gagal karena Redis error, dll
    console.error("Security Check Error:", e);
  }

  // 4. Verifikasi Publik & Autentikasi
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
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
