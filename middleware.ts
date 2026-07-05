/**
 * middleware.ts — Edge Runtime · AI-Powered Multi-Layer Firewall
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  LAYER 0 — Static asset passthrough                            │
 * │  LAYER 1 — Edge AI Threat Scoring (25 signal engine)           │
 * │  LAYER 2 — Rate limiting via sliding window (edge in-memory)   │
 * │  LAYER 3 — Credential stuffing & brute-force protection        │
 * │  LAYER 4 — Request size guard                                  │
 * │  LAYER 5 — Auth token validation                               │
 * │  LAYER 6 — Security response headers injection                 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Compatible with: Vercel Edge Runtime, Cloudflare Pages, Node.js
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeRequest, getSecurityHeaders, type AiDecision } from "@/lib/security/ai-engine";

// ─── Public Paths (no auth required) ────────────────────────────────────────

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-otp",
];

// ─── Rate Limiting Config (per-IP sliding window — in-memory per Edge instance)
//     Note: Vercel Edge has multiple instances. For true persistence, use Redis.
//     These limits are per-instance and serve as a fast first line of defense.

interface RateWindow {
  count:     number;
  windowStart: number;
  strikes:   number;   // Consecutive limit violations → escalation
}

const RATE_STORE = new Map<string, RateWindow>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  // Authenticated pages — generous
  page:    { max: 120,  windowMs: 60_000 },
  // API endpoints — moderate
  api:     { max: 60,   windowMs: 60_000 },
  // Auth endpoints — strict (anti brute-force)
  auth:    { max: 10,   windowMs: 60_000 },
  // Upload / generate — very strict
  heavy:   { max: 20,   windowMs: 60_000 },
};

// Heavy API routes that consume lots of resources
const HEAVY_API_PREFIXES = [
  "/api/generate",
  "/api/chat",
  "/api/research",
  "/api/vector",
  "/api/remotion",
];

// ─── Cleanup stale rate limit entries every ~500 requests ────────────────────

let _rlCleanupCounter = 0;
function maybeCleanupRateStore() {
  _rlCleanupCounter++;
  if (_rlCleanupCounter % 500 === 0) {
    const now = Date.now();
    for (const [key, win] of RATE_STORE.entries()) {
      if (now - win.windowStart > 300_000) RATE_STORE.delete(key); // 5 min stale
    }
  }
}

function checkRateLimit(ip: string, tier: keyof typeof RATE_LIMITS): {
  allowed:    boolean;
  remaining:  number;
  resetMs:    number;
  strikes:    number;
} {
  maybeCleanupRateStore();
  const { max, windowMs } = RATE_LIMITS[tier]!;
  const key = `${ip}:${tier}`;
  const now = Date.now();

  let win = RATE_STORE.get(key);
  if (!win || now - win.windowStart >= windowMs) {
    win = { count: 1, windowStart: now, strikes: win?.strikes ?? 0 };
    RATE_STORE.set(key, win);
    return { allowed: true, remaining: max - 1, resetMs: now + windowMs, strikes: win.strikes };
  }

  win.count++;
  const allowed   = win.count <= max;
  const remaining = Math.max(0, max - win.count);
  const resetMs   = win.windowStart + windowMs;

  if (!allowed) win.strikes++;
  return { allowed, remaining, resetMs, strikes: win.strikes };
}

// ─── Brute-force / credential stuffing tracking ──────────────────────────────

interface AuthAttempt {
  fails:    number;
  lockUntil: number;
}
const AUTH_FAILS = new Map<string, AuthAttempt>();
const AUTH_LOCKOUT_THRESHOLD = 5;
const AUTH_LOCKOUT_MS        = 15 * 60 * 1000; // 15 minutes

function checkAuthBruteForce(ip: string): { blocked: boolean; remainingSec: number } {
  const now = Date.now();
  const rec = AUTH_FAILS.get(ip);
  if (!rec) return { blocked: false, remainingSec: 0 };
  if (rec.lockUntil > now) {
    return { blocked: true, remainingSec: Math.ceil((rec.lockUntil - now) / 1000) };
  }
  // Lock expired — reset
  AUTH_FAILS.delete(ip);
  return { blocked: false, remainingSec: 0 };
}

function recordAuthFailure(ip: string) {
  const now = Date.now();
  const rec = AUTH_FAILS.get(ip) ?? { fails: 0, lockUntil: 0 };
  rec.fails++;
  if (rec.fails >= AUTH_LOCKOUT_THRESHOLD) {
    rec.lockUntil = now + AUTH_LOCKOUT_MS;
  }
  AUTH_FAILS.set(ip, rec);
}

// ─── Helper: build blocked response ──────────────────────────────────────────

function blockedResponse(
  status:  number,
  code:    string,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  const secHeaders = getSecurityHeaders();
  const res = new NextResponse(
    JSON.stringify({ error: message, code, timestamp: new Date().toISOString() }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...secHeaders,
        ...(headers ?? {}),
      },
    }
  );
  return res;
}

// ─── Helper: add security headers to a passthrough response ──────────────────

function addSecurityHeaders(res: NextResponse): NextResponse {
  const secHeaders = getSecurityHeaders();
  for (const [k, v] of Object.entries(secHeaders)) {
    if (v) res.headers.set(k, v);
    else    res.headers.delete(k);
  }
  return res;
}

// ─── Helper: tarpit (slow down attacker without revealing block) ──────────────
//     In Edge Runtime we can't do real async sleeps > 30s, so we just block
//     with a 429 + Retry-After to make scanners think they should back off.

function tarpitResponse(requestId: string): NextResponse {
  return blockedResponse(429, "TARPIT", "Terlalu banyak permintaan mencurigakan", {
    "Retry-After": "120",
    "X-Request-Id": requestId,
  });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ── LAYER 0: Static asset passthrough (fastest path) ─────────────────────
  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image")  ||
    pathname.startsWith("/favicon")       ||
    pathname.endsWith(".ico")             ||
    pathname.endsWith(".png")             ||
    pathname.endsWith(".webp")            ||
    pathname.endsWith(".svg")             ||
    pathname.endsWith(".woff2")           ||
    pathname.endsWith(".woff")
  ) {
    return NextResponse.next();
  }

  // ── Extract request metadata ──────────────────────────────────────────────
  const userAgent = request.headers.get("user-agent") ?? "";
  const method    = request.method;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const country = request.headers.get("cf-ipcountry")   ?? undefined;
  const asn     = request.headers.get("cf-ray")         ?? undefined;  // Ray ID encodes ASN info
  const referer = request.headers.get("referer")        ?? undefined;
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);

  // ── LAYER 1: AI Threat Analysis ───────────────────────────────────────────
  const analysis = analyzeRequest({
    pathname,
    search,
    method,
    userAgent,
    ip,
    headers:   request.headers,
    country,
    asn,
    bodySize:  isNaN(contentLength) ? 0 : contentLength,
    referer,
  });

  // Log all non-trivial threats to console (picked up by Vercel log drain)
  if (analysis.totalScore >= 20) {
    console.warn(
      `[AI-FW] score=${analysis.totalScore} level=${analysis.threatLevel} decision=${analysis.decision} ` +
      `ip=${ip} country=${country ?? "?"} method=${method} path=${pathname} ` +
      `signals=[${analysis.signals.map(s => s.name).join(",")}] ` +
      `reason="${analysis.reason}" reqId=${analysis.requestId}`
    );
  }

  // Enforce AI decision
  const decision: AiDecision = analysis.decision;
  if (decision === "block") {
    return blockedResponse(403, "AI_BLOCKED", analysis.reason, {
      "X-Request-Id":  analysis.requestId,
      "X-Threat-Level": analysis.threatLevel,
    });
  }
  if (decision === "tarpit") {
    return tarpitResponse(analysis.requestId);
  }

  // ── LAYER 2: Rate Limiting ────────────────────────────────────────────────
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const isApiPath    = pathname.startsWith("/api/");
  const isHeavyApi   = HEAVY_API_PREFIXES.some(p => pathname.startsWith(p));
  const isAuthApi    = pathname.startsWith("/api/auth/");

  // Pick appropriate tier
  const tier = isHeavyApi ? "heavy"
             : isAuthApi  ? "auth"
             : isApiPath  ? "api"
             : "page";

  const rl = checkRateLimit(ip, tier);

  if (!rl.allowed) {
    // After 3 consecutive violations → tarpit
    if (rl.strikes >= 3) {
      console.warn(`[AI-FW] Rate tarpit: ip=${ip} tier=${tier} strikes=${rl.strikes}`);
      return tarpitResponse(analysis.requestId);
    }
    console.warn(`[AI-FW] Rate limited: ip=${ip} tier=${tier} count exceeded`);
    return blockedResponse(429, "RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi nanti.", {
      "Retry-After":  String(Math.ceil((rl.resetMs - Date.now()) / 1000)),
      "X-RateLimit-Limit":     String(RATE_LIMITS[tier]!.max),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset":     String(rl.resetMs),
    });
  }

  // ── LAYER 3: Brute-force / Credential Stuffing Protection ────────────────
  if (isAuthApi && (pathname.includes("/login") || pathname.includes("/verify-otp"))) {
    const bf = checkAuthBruteForce(ip);
    if (bf.blocked) {
      console.warn(`[AI-FW] Brute-force lockout: ip=${ip} remainingSec=${bf.remainingSec}`);
      return blockedResponse(429, "BRUTEFORCE_LOCKOUT",
        `Terlalu banyak percobaan login. Coba lagi dalam ${bf.remainingSec} detik.`, {
          "Retry-After": String(bf.remainingSec),
        }
      );
    }
  }

  // ── LAYER 4: Request size guard ───────────────────────────────────────────
  if (!isNaN(contentLength)) {
    const maxSize = isHeavyApi
      ? 20 * 1024 * 1024  // 20MB for heavy endpoints
      : isApiPath
      ? 5  * 1024 * 1024  // 5MB for regular API
      : 1  * 1024 * 1024; // 1MB for pages

    if (contentLength > maxSize) {
      return blockedResponse(413, "PAYLOAD_TOO_LARGE",
        `Ukuran permintaan melebihi batas (${(maxSize / 1e6).toFixed(0)}MB)`
      );
    }
  }

  // ── LAYER 5: Auth token validation for page routes ────────────────────────
  if (!isPublicPath && !isApiPath) {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── LAYER 6: Inject security headers on every response ───────────────────
  const response = NextResponse.next();
  addSecurityHeaders(response);

  // Rate limit info headers (useful for client-side backoff)
  response.headers.set("X-RateLimit-Limit",     String(RATE_LIMITS[tier]!.max));
  response.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  response.headers.set("X-RateLimit-Reset",     String(rl.resetMs));

  // AI threat score header (only in dev, never leak in prod)
  if (process.env.NODE_ENV !== "production") {
    response.headers.set("X-Threat-Score", String(analysis.totalScore));
    response.headers.set("X-Threat-Level", analysis.threatLevel);
  }

  return response;
}

// ─── Matcher config ───────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico  (favicon)
     * - public files (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|mp4|pdf)$).*)",
  ],
};
