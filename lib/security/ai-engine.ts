/**
 * lib/security/ai-engine.ts — AI Firewall Engine
 *
 * Mesin analisis ancaman berbasis skor AI di Edge Runtime.
 *
 * PENTING: Dirancang untuk TIDAK memblokir pengguna biasa.
 * Hanya ancaman nyata (scanner, injeksi, dll) yang diblokir.
 * Pengguna normal dengan browser biasa SELALU lolos.
 *
 * Threshold blokir sengaja TINGGI (>=85) untuk menghindari false positive.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type AiDecision  = "allow" | "throttle" | "block" | "tarpit";

export interface AiSignal {
  name:   string;
  score:  number;
  reason: string;
}

export interface AiAnalysisResult {
  totalScore:  number;
  threatLevel: ThreatLevel;
  decision:    AiDecision;
  signals:     AiSignal[];
  blocked:     boolean;
  reason:      string;
  requestId:   string;
  latencyMs:   number;
}

// ─── Scanner UA patterns — ONLY confirmed attack tools ───────────────────────
// Tidak termasuk tools ambigu seperti curl, wget, python (bisa legitimate)
const SCANNER_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /nessus/i,
  /openvas/i,
  /w3af/i,
  /acunetix/i,
  /arachni/i,
  /burpsuite/i,
  /zaproxy/i,
  /metasploit/i,
  /dirbuster/i,
  /gobuster/i,
  /wfuzz/i,
  /nuclei/i,
  /ffuf/i,
  /feroxbuster/i,
  /netsparker/i,
];

// ─── Suspicious paths — hanya path yang benar-benar berbahaya ────────────────
const SUSPICIOUS_PATHS = [
  /\/(wp-admin|wp-login|xmlrpc\.php)/i,
  /\/(phpmyadmin|pma|adminer)/i,
  /\/\.git\//i,
  /\/\.env($|\/)/i,
  /\/(shell|cmd|c99|r57|webshell|backdoor)\.(php|asp|jsp)/i,
  /\/etc\/(passwd|shadow)/i,
  /\/proc\/self\//i,
];

// ─── Injection patterns — hanya pola yang sangat jelas berbahaya ──────────────
// TIDAK termasuk regex ambigu yang bisa false-positive
const INJECTION_PATTERNS_HIGH = [
  // SQL Injection yang sangat jelas
  /UNION\s+(ALL\s+)?SELECT\s+/i,
  /;\s*DROP\s+(TABLE|DATABASE)/i,
  /xp_cmdshell/i,
  /WAITFOR\s+DELAY\s*'\d/i,
  // Path Traversal yang encoded
  /%2e%2e[%2f%5c]/i,
  /\.\.%2f/i,
  /\.\.%5c/i,
  // Null byte
  /%00/,
  // Shell injection yang sangat jelas
  /[;&|]\s*(wget|curl)\s+http/i,
  // SSRF internal metadata
  /169\.254\.169\.254/,
  /metadata\.google\.internal/i,
  // XSS yang jelas
  /<script[\s>]/i,
  /javascript\s*:\s*alert\s*\(/i,
  // XXE
  /<!ENTITY\s+\w+\s+SYSTEM/i,
];

// ─── HTTP methods yang selalu diblokir ───────────────────────────────────────
const ALWAYS_BLOCK_METHODS = new Set(["TRACE", "CONNECT", "TRACK"]);

// ─── Benign bot allowlist ─────────────────────────────────────────────────────
const TRUSTED_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /yandexbot/i,
];

// ─── Request ID generator ─────────────────────────────────────────────────────
function makeRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Main AI Analysis Engine ──────────────────────────────────────────────────

export function analyzeRequest(params: {
  pathname:  string;
  search:    string;
  method:    string;
  userAgent: string;
  ip:        string;
  headers:   Headers;
  country?:  string;
  asn?:      string;
  bodySize?: number;
  referer?:  string;
}): AiAnalysisResult {
  const start = Date.now();
  const { pathname, search, method, userAgent, ip, headers, bodySize } = params;
  const fullUrl = pathname + (search ?? "");
  const ua      = userAgent.toLowerCase();
  const signals: AiSignal[] = [];

  const isTrustedBot = TRUSTED_BOT_PATTERNS.some(p => p.test(ua));

  // ── Signal 1: Confirmed attack scanner tools ──────────────────────────────
  if (!isTrustedBot) {
    const scannerHit = SCANNER_UA_PATTERNS.find(p => p.test(userAgent));
    if (scannerHit) {
      signals.push({ name: "scanner_ua", score: 100, reason: `Scanner tool: ${scannerHit}` });
    }
  }

  // ── Signal 2: Completely empty UA ────────────────────────────────────────
  // Hanya UA yang benar-benar kosong — UA pendek (curl, wget) masih ok
  if (!userAgent || userAgent.trim().length === 0) {
    signals.push({ name: "empty_ua", score: 75, reason: "User-Agent kosong" });
  }

  // ── Signal 3: Suspicious paths (attack-specific paths only) ──────────────
  const suspPath = SUSPICIOUS_PATHS.find(p => p.test(pathname));
  if (suspPath) {
    signals.push({ name: "suspicious_path", score: 90, reason: `Path serangan terdeteksi: ${pathname}` });
  }

  // ── Signal 4: High-confidence injection patterns in URL ───────────────────
  const injectionHits = INJECTION_PATTERNS_HIGH.filter(p => p.test(fullUrl));
  if (injectionHits.length > 0) {
    const score = Math.min(70 + injectionHits.length * 10, 100);
    signals.push({ name: "url_injection", score, reason: `Pola injeksi di URL (${injectionHits.length} hit)` });
  }

  // ── Signal 5: Null byte ───────────────────────────────────────────────────
  if (fullUrl.includes("%00") || fullUrl.includes("\u0000")) {
    signals.push({ name: "null_byte", score: 95, reason: "Null byte di URL" });
  }

  // ── Signal 6: Dangerous HTTP methods ─────────────────────────────────────
  if (ALWAYS_BLOCK_METHODS.has(method)) {
    signals.push({ name: "dangerous_method", score: 100, reason: `Method ${method} selalu diblokir` });
  }

  // ── Signal 7: HTTP Smuggling ──────────────────────────────────────────────
  const te  = headers.get("transfer-encoding") ?? "";
  const cl  = headers.get("content-length")    ?? "";
  if (te.toLowerCase().includes("chunked") && cl !== "") {
    signals.push({ name: "http_smuggling", score: 95, reason: "Potensi HTTP smuggling (TE+CL)" });
  }

  // ── Signal 8: Excessive header count ─────────────────────────────────────
  // Hanya flag jika SANGAT berlebihan (> 80), browser normal < 30
  const headerCount = Array.from(headers.keys()).length;
  if (headerCount > 80) {
    signals.push({ name: "header_stuffing", score: 65, reason: `Header stuffing: ${headerCount} headers` });
  }

  // ── Signal 9: Payload bomb (sangat besar) ─────────────────────────────────
  if (bodySize !== undefined && bodySize > 50 * 1024 * 1024) {
    signals.push({ name: "payload_bomb", score: 70, reason: `Payload sangat besar: ${(bodySize / 1e6).toFixed(0)}MB` });
  }

  // ── Signal 10: Cloudflare explicit threat score ───────────────────────────
  const cfThreat = parseInt(headers.get("cf-threat-score") ?? "0", 10);
  if (!isNaN(cfThreat) && cfThreat >= 50) {
    // Hanya react jika CF score sangat tinggi (>= 50, skala 0-100)
    signals.push({ name: "cf_threat_high", score: Math.min(cfThreat, 90), reason: `CF threat score tinggi: ${cfThreat}` });
  }

  // ── Signal 11: Loopback IP di production ─────────────────────────────────
  // (bukan false positive karena ini environment check)
  if (process.env.NODE_ENV === "production" &&
      (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0")) {
    signals.push({ name: "loopback_prod", score: 40, reason: `IP loopback di production` });
  }

  // ─── AI Score Aggregation ─────────────────────────────────────────────────
  // Weighted: sinyal tertinggi dominan, sisanya berkontribusi kecil
  let totalScore = 0;
  if (signals.length > 0) {
    const sorted   = [...signals].sort((a, b) => b.score - a.score);
    const maxScore = sorted[0]!.score;
    const additive = sorted.slice(1).reduce((sum, s) => sum + s.score * 0.15, 0);
    totalScore = Math.min(Math.round(maxScore + additive), 100);
  }

  // ─── AI Decision — threshold tinggi untuk hindari false positive ──────────
  //
  //  NORMAL USER:   score 0   → allow ✅
  //  LOW RISK:      score 1–39 → allow + log ✅
  //  MEDIUM:        score 40–69 → throttle ⚠️
  //  HIGH:          score 70–84 → block ❌
  //  CRITICAL:      score 85+   → tarpit 🚫
  //
  let threatLevel: ThreatLevel;
  let decision:    AiDecision;
  let reason = "Akses diizinkan";

  if (totalScore >= 85) {
    threatLevel = "critical"; decision = "tarpit"; reason = "Ancaman kritis";
  } else if (totalScore >= 70) {
    threatLevel = "high";     decision = "block";  reason = "Ancaman tinggi terdeteksi";
  } else if (totalScore >= 40) {
    threatLevel = "medium";   decision = "throttle"; reason = "Risiko menengah";
  } else if (totalScore >= 1) {
    threatLevel = "low";      decision = "allow";  reason = "Risiko rendah — dipantau";
  } else {
    threatLevel = "none";     decision = "allow";  reason = "Permintaan bersih";
  }

  // Force-block sinyal yang selalu berbahaya terlepas dari total score
  const alwaysBlockSig = signals.find(s =>
    s.name === "scanner_ua"       ||
    s.name === "dangerous_method" ||
    s.name === "null_byte"        ||
    s.name === "http_smuggling"   ||
    s.name === "suspicious_path"
  );
  if (alwaysBlockSig) {
    threatLevel = "critical";
    decision    = "block";
    reason      = alwaysBlockSig.reason;
  }

  return {
    totalScore,
    threatLevel,
    decision,
    signals,
    blocked:   decision === "block" || decision === "tarpit",
    reason,
    requestId: makeRequestId(),
    latencyMs: Date.now() - start,
  };
}

// ─── Security Headers ─────────────────────────────────────────────────────────

export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options":            "nosniff",
    "X-Frame-Options":                   "DENY",
    "X-XSS-Protection":                  "1; mode=block",
    "Strict-Transport-Security":         "max-age=63072000; includeSubDomains; preload",
    "Referrer-Policy":                   "strict-origin-when-cross-origin",
    "Permissions-Policy":                "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "Cross-Origin-Opener-Policy":        "same-origin",
    "Cross-Origin-Resource-Policy":      "same-origin",
  };
}
