/**
 * middleware.ts — Edge Runtime compatible
 *
 * Layer 1 (Edge): Fast UA/path blocking tanpa Redis
 * Layer 2 (Node.js API): firewall.ts + core.ts full analysis
 * Layer 3 (Client): FirewallGate challenge page
 */

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-otp",
  "/api/firewall/verify", // Firewall verify endpoint must be accessible
];

// Scanner User-Agents yang bisa dideteksi di Edge tanpa Redis
const SCANNER_UA_EDGE = [
  "sqlmap", "nikto", "nmap", "masscan", "nessus", "openvas", "w3af",
  "acunetix", "arachni", "burpsuite", "zaproxy", "metasploit",
  "dirbuster", "gobuster", "wfuzz", "hydra", "nuclei", "ffuf",
  "feroxbuster", "netsparker", "zgrab", "zmap", "masscan",
  "libwww-perl", "python-requests/2", "go-http-client/1",
];

// Suspicious paths detectable at edge
const SUSPICIOUS_PATHS_EDGE = [
  /\/(wp-admin|wp-login|phpmyadmin|pma|cpanel|manager\/html)/i,
  /\/(\.git|\.env|\.aws|\.ssh)\//i,
  /\/(xmlrpc\.php|shell\.php|cmd\.php|eval\.php)/i,
  /\/etc\/(passwd|shadow)/i,
  /\/(proc\/self|proc\/version)/i,
  /\.(php|asp|aspx|jsp|cgi)\?/i,
];

// Critical injection patterns checkable at edge (no Redis)
const EDGE_INJECTION_PATTERNS = [
  /UNION\s+ALL\s+SELECT/i,
  /WAITFOR\s+DELAY/i,
  /;\s*DROP\s+TABLE/i,
  /xp_cmdshell/i,
  /<script[\s>]/i,
  /javascript\s*:\s*eval/i,
  /\/bin\/(ba)?sh/i,
  /\$\(.*\)/,        // command substitution
  /`[^`]{1,50}`/,    // backtick execution
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fullUrl = pathname + search;

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    (pathname.includes(".") && !pathname.startsWith("/api"))
  ) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const ua = userAgent.toLowerCase();
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";

  // ── EDGE LAYER 1: Block known security scanners
  const scannerMatch = SCANNER_UA_EDGE.find(s => ua.includes(s));
  if (scannerMatch) {
    console.log(`[EDGE-FW] Scanner blocked: ${scannerMatch} from ${ip}`);
    return new NextResponse(
      JSON.stringify({ error: "Forbidden", code: "SCANNER_BLOCKED" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── EDGE LAYER 2: Block suspicious paths
  const suspiciousPath = SUSPICIOUS_PATHS_EDGE.find(p => p.test(pathname));
  if (suspiciousPath) {
    console.log(`[EDGE-FW] Suspicious path blocked: ${pathname} from ${ip}`);
    return new NextResponse(
      JSON.stringify({ error: "Not Found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── EDGE LAYER 3: Critical injection patterns in URL
  const urlInjection = EDGE_INJECTION_PATTERNS.find(p => p.test(fullUrl));
  if (urlInjection) {
    console.log(`[EDGE-FW] URL injection blocked: ${pathname} from ${ip}`);
    return new NextResponse(
      JSON.stringify({ error: "Bad Request", code: "INJECTION_DETECTED" }),
      { status: 400, headers: { "Content-Type": "application/json", "X-FW-Block": "injection" } }
    );
  }

  // ── EDGE LAYER 4: Empty UA on API routes
  if (pathname.startsWith("/api/") && !userAgent.trim()) {
    return new NextResponse(
      JSON.stringify({ error: "Bad Request", code: "MISSING_UA" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── EDGE LAYER 5: Excessive header count
  const headerCount = Array.from(request.headers.keys()).length;
  if (headerCount > 50) {
    console.log(`[EDGE-FW] Header stuffing blocked: ${headerCount} headers from ${ip}`);
    return new NextResponse(
      JSON.stringify({ error: "Bad Request", code: "HEADER_STUFFING" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Auth check — skip public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // API routes handle their own auth + firewall.ts evaluation
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Page routes need auth cookie
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
