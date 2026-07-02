/**
 * lib/security/core.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UNIFIED Security Core — satu file, semua proteksi nyambung ke server.
 *
 * Fitur:
 * 1. Rate limiting (sliding window, multi-tier)
 * 2. IP threat scoring + blocklist
 * 3. Real-time attack detection: DDoS, DoS, XSS, SQLi, CMDi, Path Traversal,
 *    SSRF, XXE, Prototype Pollution, Null Byte, Slowloris, HTTP Flood, Scanner
 * 4. Threat score 0–100 dengan severity: Low / Medium / High / Critical
 * 5. In-memory event log (circular buffer 2000 events) — terhubung ke monitor
 * 6. Singleton exports untuk dipakai middleware & semua API route
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AttackType =
  | "dos_flood" | "ddos_flood" | "http_flood" | "slowloris"
  | "xss_attempt" | "sql_injection" | "command_injection"
  | "path_traversal" | "ssrf_attempt" | "xxe_attempt"
  | "prototype_pollution" | "null_byte" | "unicode_abuse"
  | "header_injection" | "payload_bomb" | "scanner"
  | "credential_stuffing" | "rate_limit" | "blocked_ip"
  | "anomaly" | "bot_detected" | "auth_failure"
  | "open_redirect" | "suspicious_request";

export type Severity = "low" | "medium" | "high" | "critical";
export type MitigationAction = "allow" | "throttle" | "block" | "tarpit";

export interface AttackSignal {
  type: AttackType;
  severity: Severity;
  confidence: number; // 0.0–1.0
  detail: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  signals: AttackSignal[];
  threatScore: number;
  action: MitigationAction;
  blocked: boolean;
  userAgent: string;
}

export interface InspectRequest {
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  userAgent: string;
  headers: Record<string, string>;
  body?: unknown;
  requestDurationMs?: number;
}

export interface InspectResult {
  action: MitigationAction;
  threatScore: number;
  severity: Severity;
  signals: AttackSignal[];
  blocked: boolean;
  reason?: string;
  tarpitMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACK PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const XSS: RegExp[] = [
  /<script[\s>]/i, /<\/script>/i, /javascript\s*:/i, /vbscript\s*:/i,
  /on\w+\s*=\s*["']?[^"']*["']?/i, /<iframe/i, /<object/i, /<embed/i,
  /data\s*:\s*text\/html/i, /expression\s*\(/i, /document\.cookie/i,
  /document\.write/i, /eval\s*\(/i, /String\.fromCharCode/i, /&#x[0-9a-f]+;/i,
];

const SQLI: RegExp[] = [
  /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
  /(\bUNION\b\s+\bSELECT\b)/i, /(--|#|\/\*|\*\/)/, /WAITFOR\s+DELAY/i,
  /BENCHMARK\s*\(/i, /SLEEP\s*\(/i, /xp_cmdshell/i, /INTO\s+(OUTFILE|DUMPFILE)/i,
  /'\s*OR\s*'1'\s*=\s*'1/i, /(\bOR\b\s+[\w'"]+\s*=\s*[\w'"]+)/i,
  /;\s*(DROP|DELETE|INSERT|UPDATE|EXEC)/i,
];

const CMDI: RegExp[] = [
  /[;&|`]/, /\$\(/, /\|\|/, /&&(?!\w)/,
  /\b(ncat|netcat|wget|curl|bash|sh|zsh|cmd\.exe|powershell|perl|python|ruby|php)\b/i,
  /%0a|%0d|%00/i, /\/bin\/(ba)?sh/i,
];

const PATH_TRAV: RegExp[] = [
  /\.\.\//, /\.\.\\/, /\.\.%2[Ff]/, /\.\.%5[Cc]/, /%252E/i,
  /\/etc\/passwd/i, /\/etc\/shadow/i, /c:\\windows/i, /\/windows\/system32/i,
];

const SSRF: RegExp[] = [
  /https?:\/\/(localhost|127\.|0\.0\.0\.0|::1|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i,
  /file:\/\//i, /gopher:\/\//i, /dict:\/\//i, /169\.254\.169\.254/,
];

const XXE: RegExp[] = [/<!ENTITY/i, /<!DOCTYPE[^>]*\[/i, /SYSTEM\s+"file:/i];

const PROTO_POLL: RegExp[] = [/__proto__/i, /constructor\s*\[/, /"__proto__"\s*:/];

const SCANNERS = [
  "sqlmap","nikto","nmap","masscan","nessus","openvas","w3af","acunetix",
  "arachni","burpsuite","zaproxy","metasploit","dirbuster","gobuster","wfuzz",
  "hydra","medusa","nuclei","zgrab","zmap","httpx","ffuf","feroxbuster",
  "netsparker","webinspect","skipfish","grabber","havij","pangolin",
];

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER (sliding window, in-memory)
// ═══════════════════════════════════════════════════════════════════════════════

interface RateWindow { timestamps: number[]; blockedUntil: number; }

const RATE_STORE = new Map<string, RateWindow>();

const TIERS = {
  AUTH:   { windowMs: 15 * 60_000, max: 10,  blockMs: 15 * 60_000 },
  API:    { windowMs: 60_000,       max: 120, blockMs: 60_000       },
  UPLOAD: { windowMs: 60_000,       max: 20,  blockMs: 5 * 60_000  },
  STRICT: { windowMs: 60 * 60_000,  max: 5,   blockMs: 60 * 60_000 },
} as const;
type TierName = keyof typeof TIERS;

function checkRate(key: string, tier: TierName): { allowed: boolean; retryAfter: number } {
  const t = TIERS[tier];
  const now = Date.now();
  let w = RATE_STORE.get(key);
  if (!w) { w = { timestamps: [], blockedUntil: 0 }; RATE_STORE.set(key, w); }

  if (w.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((w.blockedUntil - now) / 1000) };
  }

  w.timestamps = w.timestamps.filter(ts => ts > now - t.windowMs);
  if (w.timestamps.length >= t.max) {
    w.blockedUntil = now + t.blockMs;
    return { allowed: false, retryAfter: Math.ceil(t.blockMs / 1000) };
  }
  w.timestamps.push(now);
  return { allowed: true, retryAfter: 0 };
}

// Cleanup rate store every 5 min
const _rateCleaner = setInterval(() => {
  const now = Date.now();
  for (const [k, w] of RATE_STORE) {
    if (w.blockedUntil < now && w.timestamps.every(t => t < now - 3_600_000))
      RATE_STORE.delete(k);
  }
}, 5 * 60_000);
if (_rateCleaner.unref) _rateCleaner.unref();

// ═══════════════════════════════════════════════════════════════════════════════
// IP TRACKER (velocity + error scoring)
// ═══════════════════════════════════════════════════════════════════════════════

interface IpRecord {
  reqTs: number[];      // request timestamps
  errTs: number[];      // error timestamps
  paths: Set<string>;   // unique paths (L7 flood)
  slowTs: number[];     // slow request timestamps (Slowloris)
  blockedUntil: number;
  blockReason: string;
  lastSeen: number;
}

const IP_STORE = new Map<string, IpRecord>();

function getIpRecord(ip: string): IpRecord {
  let r = IP_STORE.get(ip);
  if (!r) {
    r = { reqTs: [], errTs: [], paths: new Set(), slowTs: [], blockedUntil: 0, blockReason: "", lastSeen: Date.now() };
    IP_STORE.set(ip, r);
  }
  return r;
}

function isIpBlocked(ip: string): { blocked: boolean; reason: string } {
  const r = IP_STORE.get(ip);
  if (!r) return { blocked: false, reason: "" };
  if (r.blockedUntil > Date.now()) return { blocked: true, reason: r.blockReason };
  return { blocked: false, reason: "" };
}

function blockIp(ip: string, reason: string, durationMs: number): void {
  const r = getIpRecord(ip);
  r.blockedUntil = Date.now() + durationMs;
  r.blockReason = reason;
}

function trackIpRequest(ip: string, path: string, isError: boolean, slowMs?: number): void {
  const r = getIpRecord(ip);
  const now = Date.now();
  r.reqTs.push(now);
  r.paths.add(path);
  r.lastSeen = now;
  if (isError) r.errTs.push(now);
  if (slowMs && slowMs > 30_000) r.slowTs.push(now);
  // Trim to 1 hour
  const cut = now - 3_600_000;
  r.reqTs = r.reqTs.filter(t => t > cut);
  r.errTs = r.errTs.filter(t => t > cut);
  r.slowTs = r.slowTs.filter(t => t > cut);
}

// Cleanup IP store every 10 min
const _ipCleaner = setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [ip, r] of IP_STORE) {
    if (r.lastSeen < cutoff && r.blockedUntil < Date.now()) IP_STORE.delete(ip);
  }
}, 10 * 60_000);
if (_ipCleaner.unref) _ipCleaner.unref();

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LOG (circular buffer, 2000 events — real data, no dummy)
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_SIZE = 2000;
const _logBuffer: (SecurityEvent | undefined)[] = new Array(LOG_SIZE);
let _logHead = 0;
let _logCount = 0;
let _eventCounter = 0;

function logEvent(evt: Omit<SecurityEvent, "id">): void {
  _eventCounter++;
  const full: SecurityEvent = {
    ...evt,
    id: `sec_${evt.timestamp}_${_eventCounter}_${crypto.randomBytes(3).toString("hex")}`,
  };
  _logBuffer[_logHead] = full;
  _logHead = (_logHead + 1) % LOG_SIZE;
  if (_logCount < LOG_SIZE) _logCount++;

  // Real console output
  const fn = evt.blocked ? console.error : evt.threatScore >= 50 ? console.warn : console.log;
  fn(`[SECURITY] ${evt.action.toUpperCase()} | score=${evt.threatScore} | ${evt.ip} | ${evt.endpoint} | ${evt.signals.map(s => s.type).join(",") || "clean"}`);
}

export function getSecurityEvents(limit = 100): SecurityEvent[] {
  const result: SecurityEvent[] = [];
  if (_logCount === 0) return result;
  const start = _logCount < LOG_SIZE ? 0 : _logHead;
  for (let i = 0; i < Math.min(_logCount, LOG_SIZE); i++) {
    const e = _logBuffer[(start + i) % LOG_SIZE];
    if (e) result.push(e);
  }
  return result.reverse().slice(0, limit);
}

export function getSecurityStats() {
  const events = getSecurityEvents(LOG_SIZE);
  const now = Date.now();
  const last24h = events.filter(e => e.timestamp > now - 86_400_000).length;
  const lastHour = events.filter(e => e.timestamp > now - 3_600_000).length;
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byType: Record<string, number> = {};
  const byIp: Record<string, number> = {};
  let blocked = 0;

  for (const e of events) {
    const topSev = e.signals.reduce<Severity>((acc, s) => {
      const order: Severity[] = ["low","medium","high","critical"];
      return order.indexOf(s.severity) > order.indexOf(acc) ? s.severity : acc;
    }, "low");
    bySeverity[topSev] = (bySeverity[topSev] ?? 0) + 1;
    for (const s of e.signals) { byType[s.type] = (byType[s.type] ?? 0) + 1; }
    byIp[e.ip] = (byIp[e.ip] ?? 0) + 1;
    if (e.blocked) blocked++;
  }

  const topIps = Object.entries(byIp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  return { total: events.length, last24h, lastHour, blocked, bySeverity, byType, topIps };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function flatten(v: unknown, d = 0): string {
  if (d > 6) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(x => flatten(x, d + 1)).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(x => flatten(x, d + 1)).join(" ");
  return String(v ?? "");
}

function scan(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function detectVolumetric(ip: string): AttackSignal[] {
  const r = getIpRecord(ip);
  const now = Date.now();
  const per1s  = r.reqTs.filter(t => t > now - 1_000).length;
  const per10s = r.reqTs.filter(t => t > now - 10_000).length;
  const per1m  = r.reqTs.filter(t => t > now - 60_000).length;
  const per10m = r.reqTs.filter(t => t > now - 600_000).length;
  const signals: AttackSignal[] = [];

  if (per1s > 50) signals.push({ type: "ddos_flood", severity: "critical", confidence: Math.min(0.99, per1s / 100), detail: `${per1s} req/s (threshold 50)` });
  else if (per1s > 20) signals.push({ type: "dos_flood", severity: "high", confidence: per1s / 50, detail: `${per1s} req/s (threshold 20)` });

  if (per10s > 80) signals.push({ type: "dos_flood", severity: "high", confidence: Math.min(0.9, per10s / 160), detail: `${per10s} req/10s burst` });
  if (per1m > 300) signals.push({ type: "http_flood", severity: "critical", confidence: Math.min(0.98, per1m / 600), detail: `${per1m} req/min (threshold 300)` });
  if (per10m > 1000) signals.push({ type: "ddos_flood", severity: "critical", confidence: 0.99, detail: `${per10m} req/10min sustained flood` });

  // Error rate → credential stuffing
  const recentReq = r.reqTs.filter(t => t > now - 600_000).length;
  const recentErr = r.errTs.filter(t => t > now - 600_000).length;
  if (recentReq >= 15 && recentErr / recentReq > 0.6) {
    signals.push({ type: "credential_stuffing", severity: "high", confidence: Math.min(0.95, recentErr / recentReq), detail: `${recentErr}/${recentReq} errors (${Math.round(recentErr/recentReq*100)}% error rate)` });
  }

  // L7 path scanning
  const paths = r.paths.size;
  if (paths > 50) signals.push({ type: "http_flood", severity: "high", confidence: Math.min(0.9, paths / 100), detail: `${paths} unique paths scanned` });

  // Slowloris
  const slowRecent = r.slowTs.filter(t => t > now - 60_000).length;
  if (slowRecent >= 4) signals.push({ type: "slowloris", severity: "high", confidence: Math.min(0.9, slowRecent / 8), detail: `${slowRecent} slow/partial requests in 60s` });

  return signals;
}

function detectPayload(body: unknown, headers: Record<string, string>): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const flat = flatten(body);
  const hflat = Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join(" ");
  const all = flat + " " + hflat;

  if (flat.length > 10_000_000) signals.push({ type: "payload_bomb", severity: "critical", confidence: 0.99, detail: `Payload ${flat.length} bytes (limit 10MB)` });

  if (scan(all, XSS))       signals.push({ type: "xss_attempt",         severity: "high",     confidence: 0.93, detail: "XSS pattern in body/headers" });
  if (scan(flat, SQLI))     signals.push({ type: "sql_injection",        severity: "critical", confidence: 0.91, detail: "SQL injection pattern detected" });
  if (scan(flat, CMDI))     signals.push({ type: "command_injection",    severity: "critical", confidence: 0.89, detail: "Command injection pattern detected" });
  if (scan(all, PATH_TRAV)) signals.push({ type: "path_traversal",       severity: "high",     confidence: 0.91, detail: "Path traversal sequence detected" });
  if (scan(flat, SSRF))     signals.push({ type: "ssrf_attempt",         severity: "critical", confidence: 0.94, detail: "SSRF target in request body" });
  if (scan(flat, PROTO_POLL)) signals.push({ type: "prototype_pollution", severity: "high",    confidence: 0.87, detail: "Prototype pollution pattern detected" });
  if (scan(flat, XXE))      signals.push({ type: "xxe_attempt",          severity: "critical", confidence: 0.92, detail: "XXE entity pattern detected" });
  if (/\x00|%00/i.test(all)) signals.push({ type: "null_byte",           severity: "high",     confidence: 0.96, detail: "Null byte injection detected" });
  if (/%c0%ae|%c0%af|%e0%80%ae/i.test(flat)) signals.push({ type: "unicode_abuse", severity: "high", confidence: 0.89, detail: "Overlong Unicode encoding (bypass)" });
  if (/[\r\n]/.test(hflat)) signals.push({ type: "header_injection",     severity: "high",     confidence: 0.97, detail: "CRLF in headers" });

  return signals;
}

function detectUA(userAgent: string): AttackSignal[] {
  const signals: AttackSignal[] = [];
  if (!userAgent || userAgent.trim().length < 5) {
    signals.push({ type: "scanner", severity: "medium", confidence: 0.7, detail: "Missing/minimal User-Agent" });
    return signals;
  }
  const ua = userAgent.toLowerCase();
  const match = SCANNERS.find(s => ua.includes(s));
  if (match) signals.push({ type: "scanner", severity: "critical", confidence: 1.0, detail: `Known security scanner: ${match}` });
  return signals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE + ACTION
// ═══════════════════════════════════════════════════════════════════════════════

const SEV_WEIGHT: Record<Severity, number> = { low: 10, medium: 25, high: 45, critical: 72 };

function calcScore(signals: AttackSignal[]): number {
  if (signals.length === 0) return 0;
  let score = 0;
  for (const s of signals) score += SEV_WEIGHT[s.severity] * s.confidence;
  return Math.min(Math.round(score), 100);
}

function scoreToSeverity(score: number): Severity {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function calcAction(score: number, signals: AttackSignal[]): MitigationAction {
  const hasCriticalScanner = signals.some(s => s.type === "scanner" && s.confidence >= 0.9);
  if (hasCriticalScanner) return "block";
  const hasCriticalInject = signals.some(s =>
    ["sql_injection","command_injection","ssrf_attempt","xxe_attempt","payload_bomb"].includes(s.type) && s.severity === "critical"
  );
  if (hasCriticalInject) return "block";
  if (score >= 70) return "block";
  if (score >= 40) return "tarpit";
  if (score >= 20) return "throttle";
  return "allow";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN inspect() — call this from middleware AND every API route
// ═══════════════════════════════════════════════════════════════════════════════

export async function inspect(req: InspectRequest): Promise<InspectResult> {
  const { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs } = req;

  const signals: AttackSignal[] = [];

  // 1. IP blocklist check (fast path)
  const ipStatus = isIpBlocked(ip);
  if (ipStatus.blocked) {
    const result: InspectResult = {
      action: "block", threatScore: 100, severity: "critical",
      signals: [{ type: "blocked_ip", severity: "critical", confidence: 1.0, detail: ipStatus.reason }],
      blocked: true, reason: `Blocked IP: ${ipStatus.reason}`,
    };
    logEvent({ timestamp: Date.now(), ip, userId, endpoint, method, userAgent, ...result });
    return result;
  }

  // 2. Rate limit check
  const tierKey = endpoint.startsWith("/api/auth") ? "AUTH"
    : endpoint.includes("/generate") || endpoint.includes("/vector") ? "UPLOAD"
    : "API";
  const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
  const rateResult = checkRate(rateKey, tierKey as TierName);
  if (!rateResult.allowed) {
    signals.push({ type: "rate_limit", severity: "high", confidence: 1.0,
      detail: `Rate limited (${tierKey}), retry in ${rateResult.retryAfter}s` });
  }

  // 3. Track IP (updates velocity counters BEFORE detection)
  trackIpRequest(ip, endpoint, false, requestDurationMs);

  // 4. Volumetric / behavioral detection
  signals.push(...detectVolumetric(ip));

  // 5. Payload attack detection
  signals.push(...detectPayload(body, headers));

  // 6. User-Agent / scanner detection
  signals.push(...detectUA(userAgent));

  // 7. Score + action
  const threatScore = calcScore(signals);
  const severity = scoreToSeverity(threatScore);
  const action = calcAction(threatScore, signals);
  const blocked = action === "block";

  // 8. Auto-block IPs with critical score
  if (threatScore >= 85) {
    blockIp(ip, `Auto-blocked: score ${threatScore}, signals: ${signals.map(s => s.type).join(",")}`, 30 * 60_000);
  }

  const tarpitMs = action === "tarpit"
    ? Math.round(8000 + ((threatScore - 40) / 60) * 30000)
    : undefined;

  const topSignal = signals.sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])[0];
  const reason = topSignal
    ? `${topSignal.type}: ${topSignal.detail}`
    : blocked ? "Security policy violation" : undefined;

  const result: InspectResult = { action, threatScore, severity, signals, blocked, reason, tarpitMs };

  // 9. Log ALL events (not just blocked)
  if (signals.length > 0 || threatScore > 0) {
    logEvent({ timestamp: Date.now(), ip, userId, endpoint, method, userAgent, ...result });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS — exported for middleware & routes
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract real client IP from request headers (Vercel/Cloudflare aware) */
export function getClientIp(headers: Record<string, string | undefined>): string {
  const cfIp = headers["cf-connecting-ip"];
  if (cfIp?.trim()) return cfIp.trim();
  const realIp = headers["x-real-ip"];
  if (realIp?.trim()) return realIp.trim();
  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return "127.0.0.1";
}

/** Record an error for an IP (feeds into credential stuffing detection) */
export function recordIpError(ip: string): void {
  const r = getIpRecord(ip);
  r.errTs.push(Date.now());
}

/** Manually block an IP (from admin action) */
export function manualBlockIp(ip: string, reason: string, durationMs = 24 * 60 * 60_000): void {
  blockIp(ip, reason, durationMs);
}

/** Get current IP record info (for debugging/monitor) */
export function getIpInfo(ip: string) {
  const r = IP_STORE.get(ip);
  if (!r) return null;
  const now = Date.now();
  return {
    ip,
    requestsLastMinute: r.reqTs.filter(t => t > now - 60_000).length,
    requestsLastHour: r.reqTs.filter(t => t > now - 3_600_000).length,
    errorsLastHour: r.errTs.filter(t => t > now - 3_600_000).length,
    uniquePaths: r.paths.size,
    blocked: r.blockedUntil > now,
    blockedUntil: r.blockedUntil > now ? r.blockedUntil : null,
    blockReason: r.blockReason || null,
  };
}

/** Sanitize string input — remove null bytes, control chars, truncate */
export function sanitizeString(input: string, maxLen = 10_000): string {
  if (typeof input !== "string") return "";
  return input.replace(/\0/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").normalize("NFC").trim().slice(0, maxLen);
}

/** Validate email format */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const n = email.trim().toLowerCase();
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(n) && n.length <= 254 ? n : null;
}

/** Check password strength */
export function validatePassword(pw: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!pw || pw.length < 8) issues.push("Minimal 8 karakter");
  if (pw.length > 128) issues.push("Maksimal 128 karakter");
  if (!/[A-Z]/.test(pw)) issues.push("Butuh minimal 1 huruf kapital");
  if (!/[0-9]/.test(pw)) issues.push("Butuh minimal 1 angka");
  return { valid: issues.length === 0, issues };
}
