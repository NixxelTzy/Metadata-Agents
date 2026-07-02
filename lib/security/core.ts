/**
 * lib/security/core.ts — Unified Security Core
 *
 * CRITICAL FIX: Vercel serverless = setiap request di instance berbeda.
 * In-memory stores TIDAK persisten antar instances.
 * Solusi: Upstash Redis sebagai shared persistent store untuk semua data
 * security (event log, IP blocklist, rate limiting, request tracking).
 *
 * Fitur:
 * 1. Rate limiting — Redis sliding window per IP/user per tier
 * 2. IP blocklist — Redis dengan TTL otomatis
 * 3. Attack detection — XSS, SQLi, CMDi, Path Traversal, SSRF, XXE,
 *    Prototype Pollution, Null Byte, Scanner, Volumetric (per-instance)
 * 4. Request normalcy scoring — setiap request dinilai wajar/tidak wajar
 * 5. Storage protection — log size cap, auto-evict events lama
 * 6. Graceful disconnect handling — timeout protection
 * 7. Event log persistent di Redis — real detection, bukan dummy
 */

import crypto from "crypto";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS CLIENT (singleton — lazy init)
// ═══════════════════════════════════════════════════════════════════════════════

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const { url, token } = getRedisConfig();
  if (!url || !token) throw new Error("Upstash Redis tidak dikonfigurasi");
  _redis = new Redis({ url, token });
  return _redis;
}

// Safe Redis wrapper — never throws, returns null on failure
async function rget<T>(key: string): Promise<T | null> {
  try { return await getRedis().get<T>(key); } catch { return null; }
}
async function rset(key: string, val: unknown, exSeconds?: number): Promise<void> {
  try {
    if (exSeconds) await getRedis().set(key, val, { ex: exSeconds });
    else await getRedis().set(key, val);
  } catch { /* silent */ }
}
async function rpush(key: string, val: string, maxLen: number, exSeconds: number): Promise<void> {
  try {
    const r = getRedis();
    await r.lpush(key, val);
    await r.ltrim(key, 0, maxLen - 1); // storage protection — cap list size
    await r.expire(key, exSeconds);
  } catch { /* silent */ }
}
async function rlrange<T>(key: string, start: number, stop: number): Promise<T[]> {
  try { return (await getRedis().lrange<T>(key, start, stop)) ?? []; } catch { return []; }
}
async function rincr(key: string, exSeconds: number): Promise<number> {
  try {
    const r = getRedis();
    const v = await r.incr(key);
    await r.expire(key, exSeconds);
    return v;
  } catch { return 0; }
}

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
  | "open_redirect" | "suspicious_request" | "normal_request";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type MitigationAction = "allow" | "throttle" | "block" | "tarpit";

export interface AttackSignal {
  type: AttackType;
  severity: Severity;
  confidence: number;
  detail: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  userAgent: string;
  signals: AttackSignal[];
  threatScore: number;
  normalityScore: number; // 0–100, 100 = completely normal
  action: MitigationAction;
  blocked: boolean;
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
  normalityScore: number;
  severity: Severity;
  signals: AttackSignal[];
  blocked: boolean;
  reason?: string;
  tarpitMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS KEY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const K = {
  rateWindow: (key: string, tier: string) => `sec:rate:${tier}:${key}`,
  rateBlock:  (key: string, tier: string) => `sec:rblk:${tier}:${key}`,
  ipBlocked:  (ip: string)  => `sec:ipblk:${ip}`,
  ipReqCount: (ip: string, window: string) => `sec:ipreq:${window}:${ip}`,
  ipErrCount: (ip: string)  => `sec:iperr:${ip}`,
  ipPathSet:  (ip: string)  => `sec:paths:${ip}`,
  eventLog:   ()            => `sec:events`,
  eventCount: ()            => `sec:evtcnt`,
  storageGuard: ()          => `sec:storage`,
};

// Storage protection constants
const MAX_EVENTS_IN_REDIS = 500;   // max events stored — prevents Redis storage bloat
const EVENT_TTL_SECONDS   = 86400; // 24h TTL on event log

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACK PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const XSS: RegExp[] = [
  /<script[\s>]/i, /<\/script>/i, /javascript\s*:/i, /vbscript\s*:/i,
  /on\w+\s*=\s*["']?[^"']*["']?/i, /<iframe/i, /<object/i, /<embed/i,
  /data\s*:\s*text\/html/i, /expression\s*\(/i, /document\.cookie/i,
  /document\.write/i, /eval\s*\(/i, /String\.fromCharCode/i,
  /&#x[0-9a-f]+;/i, /<svg.*onload/i, /alert\s*\(/i,
];

const SQLI: RegExp[] = [
  /(\bSELECT\b.*\bFROM\b|\bINSERT\b.*\bINTO\b|\bDELETE\b.*\bFROM\b)/i,
  /(\bUNION\b\s+(ALL\s+)?\bSELECT\b)/i,
  /(--|#)\s*$/, /\/\*[\s\S]*?\*\//,
  /WAITFOR\s+DELAY/i, /BENCHMARK\s*\(/i, /SLEEP\s*\(/i,
  /xp_cmdshell/i, /INTO\s+(OUTFILE|DUMPFILE)/i,
  /'\s*OR\s*'1'\s*=\s*'1/i, /1\s*=\s*1\s*--/i,
  /;\s*(DROP|DELETE|INSERT|UPDATE|EXEC)\s/i,
  /CHAR\s*\(\s*\d+\s*\)/i, /CONCAT\s*\(/i,
];

const CMDI: RegExp[] = [
  /;\s*(ls|cat|id|whoami|uname|ps|kill|rm|chmod|wget|curl)\b/i,
  /\|\s*(ls|cat|id|whoami|bash|sh|nc|ncat)\b/i,
  /`[^`]{1,100}`/,
  /\$\([^)]{1,100}\)/,
  /\b(ncat|netcat|wget|curl|bash|sh|zsh|cmd\.exe|powershell|perl|python3?|ruby|php)\s+-/i,
  /%0a|%0d|%00/i, /\/bin\/(ba)?sh/i, /\bnslookup\b/i,
];

const PATH_TRAV: RegExp[] = [
  /\.\.[/\\]/, /\.\.%2[Ff]/i, /\.\.%5[Cc]/i, /%252[Ff]/i, /%252[Ee]/i,
  /\/etc\/passwd/i, /\/etc\/shadow/i, /\/proc\/self/i,
  /c:[/\\]windows/i, /\/windows\/system32/i, /\/\.\.\/\.\.\/\.\.\//,
];

const SSRF: RegExp[] = [
  /https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)/i,
  /https?:\/\/169\.254\.\d+\.\d+/i,
  /https?:\/\/10\.\d+\.\d+\.\d+/i,
  /https?:\/\/192\.168\.\d+\.\d+/i,
  /https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /file:\/\//i, /gopher:\/\//i, /dict:\/\//i,
  /metadata\.google\.internal/i, /169\.254\.169\.254/,
];

const XXE: RegExp[] = [
  /<!ENTITY\s+\w+\s+SYSTEM/i, /<!DOCTYPE[^>]*\[/i,
  /SYSTEM\s+["']file:/i, /SYSTEM\s+["']http:/i,
];

const PROTO_POLL: RegExp[] = [
  /__proto__\s*[[:]/i, /\["__proto__"\]/, /"__proto__"\s*:/,
  /constructor\.prototype/i, /\["constructor"\]/,
];

const SCANNER_UA = [
  "sqlmap","nikto","nmap","masscan","nessus","openvas","w3af","acunetix",
  "arachni","burpsuite","zaproxy","metasploit","dirbuster","gobuster","wfuzz",
  "hydra","medusa","nuclei","zgrab","zmap","httpx","ffuf","feroxbuster",
  "netsparker","webinspect","skipfish","grabber","havij","pangolin",
  "python-requests/2","go-http-client","java/","libwww-perl","curl/7",
  "wget/","scrapy","mechanize","httpclient","okhttp",
];

// Suspicious path patterns that indicate scanning
const SUSPICIOUS_PATHS = [
  /\.(php|asp|aspx|jsp|cgi|pl|py|rb|sh|bash|env|git|svn|htaccess|htpasswd|config|bak|sql|dump)$/i,
  /\/(admin|administrator|wp-admin|wp-login|phpmyadmin|pma|cpanel|webmail|jenkins|console|manager)/i,
  /\/(\.git|\.env|\.aws|\.ssh|\.bash_history|\.htaccess)/i,
  /\/(xmlrpc|xmlrpc\.php|api\/v\d+\/admin)/i,
  /\/(etc\/passwd|etc\/shadow|proc\/self)/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER — Redis sliding window
// ═══════════════════════════════════════════════════════════════════════════════

const TIERS = {
  AUTH:   { windowSec: 900,  max: 10,  blockSec: 900  },  // 15min window, 10 req
  API:    { windowSec: 60,   max: 100, blockSec: 60   },  // 1min, 100 req
  UPLOAD: { windowSec: 60,   max: 15,  blockSec: 300  },  // 1min, 15 req
  STRICT: { windowSec: 3600, max: 5,   blockSec: 3600 },  // 1hr, 5 req
} as const;
type TierName = keyof typeof TIERS;

async function checkRate(key: string, tier: TierName): Promise<{ allowed: boolean; retryAfter: number }> {
  const t = TIERS[tier];
  const rk = K.rateWindow(key, tier);
  const bk = K.rateBlock(key, tier);

  // Check if blocked
  const blocked = await rget<number>(bk);
  if (blocked) {
    const ttl = await (async () => { try { return await getRedis().ttl(bk); } catch { return t.blockSec; } })();
    return { allowed: false, retryAfter: ttl > 0 ? ttl : t.blockSec };
  }

  // Increment counter
  const count = await rincr(rk, t.windowSec);
  if (count > t.max) {
    await rset(bk, 1, t.blockSec);
    return { allowed: false, retryAfter: t.blockSec };
  }
  return { allowed: true, retryAfter: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IP TRACKING — Redis counters
// ═══════════════════════════════════════════════════════════════════════════════

async function isIpBlockedRedis(ip: string): Promise<{ blocked: boolean; reason: string }> {
  const val = await rget<string>(K.ipBlocked(ip));
  if (val) return { blocked: true, reason: val };
  return { blocked: false, reason: "" };
}

async function blockIpRedis(ip: string, reason: string, durationSec: number): Promise<void> {
  await rset(K.ipBlocked(ip), reason, durationSec);
}

async function getIpRequestCount(ip: string, windowLabel: string, windowSec: number): Promise<number> {
  const key = K.ipReqCount(ip, windowLabel);
  const count = await rincr(key, windowSec);
  return count;
}

async function getIpErrorCount(ip: string): Promise<number> {
  return (await rincr(K.ipErrCount(ip), 600)) ; // 10min window
}

async function trackIpPath(ip: string, path: string): Promise<number> {
  try {
    const r = getRedis();
    const key = K.ipPathSet(ip);
    await r.sadd(key, path);
    await r.expire(key, 60); // 1min window for path scanning detection
    return await r.scard(key);
  } catch { return 0; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LOG — Redis list with storage cap
// ═══════════════════════════════════════════════════════════════════════════════

let _evtCounter = 0;

async function logEventRedis(evt: Omit<SecurityEvent, "id">): Promise<void> {
  _evtCounter++;
  const full: SecurityEvent = {
    ...evt,
    id: `sec_${evt.timestamp}_${_evtCounter}_${crypto.randomBytes(3).toString("hex")}`,
  };

  // Console output (visible in Vercel logs)
  const prefix = full.blocked ? "[BLOCKED]" : full.threatScore >= 50 ? "[THREAT]" : "[REQUEST]";
  console.log(`${prefix} score=${full.threatScore} norm=${full.normalityScore} | ${full.ip} | ${full.method} ${full.endpoint} | ${full.signals.map(s => s.type).join(",") || "clean"}`);

  // Persist to Redis (storage protected — max 500 events, 24h TTL)
  await rpush(K.eventLog(), JSON.stringify(full), MAX_EVENTS_IN_REDIS, EVENT_TTL_SECONDS);
}

export async function getSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
  const raw = await rlrange<string>(K.eventLog(), 0, limit - 1);
  const events: SecurityEvent[] = [];
  for (const r of raw) {
    try {
      if (typeof r === "string") events.push(JSON.parse(r) as SecurityEvent);
      else if (typeof r === "object" && r !== null) events.push(r as unknown as SecurityEvent);
    } catch { /* skip malformed */ }
  }
  return events;
}

export async function getSecurityStats() {
  const events = await getSecurityEvents(MAX_EVENTS_IN_REDIS);
  const now = Date.now();
  const last24h = events.filter(e => e.timestamp > now - 86_400_000).length;
  const lastHour = events.filter(e => e.timestamp > now - 3_600_000).length;
  const last10min = events.filter(e => e.timestamp > now - 600_000).length;
  const bySeverity: Record<string, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const byType: Record<string, number> = {};
  const byIp: Record<string, number> = {};
  let blocked = 0;
  let totalNormality = 0;
  let normalRequests = 0;
  let abnormalRequests = 0;

  for (const e of events) {
    const topSev = e.signals.reduce<Severity>((acc, s) => {
      const order: Severity[] = ["info","low","medium","high","critical"];
      return order.indexOf(s.severity) > order.indexOf(acc) ? s.severity : acc;
    }, "info");
    bySeverity[topSev] = (bySeverity[topSev] ?? 0) + 1;
    for (const s of e.signals) { byType[s.type] = (byType[s.type] ?? 0) + 1; }
    byIp[e.ip] = (byIp[e.ip] ?? 0) + 1;
    if (e.blocked) blocked++;
    totalNormality += e.normalityScore ?? 100;
    if ((e.normalityScore ?? 100) >= 70) normalRequests++;
    else abnormalRequests++;
  }

  const avgNormality = events.length > 0 ? Math.round(totalNormality / events.length) : 100;
  const topIps = Object.entries(byIp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count }));

  return {
    total: events.length,
    last24h, lastHour, last10min,
    blocked, normalRequests, abnormalRequests,
    avgNormality,
    bySeverity, byType, topIps,
    storageUsed: events.length,
    storageMax: MAX_EVENTS_IN_REDIS,
    storagePercent: Math.round((events.length / MAX_EVENTS_IN_REDIS) * 100),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function flatten(v: unknown, d = 0): string {
  if (d > 5) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(x => flatten(x, d + 1)).join(" ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(x => flatten(x, d + 1)).join(" ");
  return String(v ?? "");
}

function scanPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function detectPayloadSignals(body: unknown, headers: Record<string, string>): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const flat = flatten(body);
  const hflat = Object.entries(headers)
    .filter(([k]) => !["authorization","cookie","x-api-key"].includes(k.toLowerCase()))
    .map(([k,v]) => `${k}: ${v}`).join(" ");
  const all = flat + " " + hflat;

  if (flat.length > 10_000_000) signals.push({ type: "payload_bomb", severity: "critical", confidence: 0.99, detail: `Payload ${flat.length} bytes exceeds 10MB` });
  if (scanPatterns(all, XSS))       signals.push({ type: "xss_attempt",         severity: "high",     confidence: 0.92, detail: "XSS pattern detected in body/headers" });
  if (scanPatterns(flat, SQLI))     signals.push({ type: "sql_injection",        severity: "critical", confidence: 0.90, detail: "SQL injection pattern detected" });
  if (scanPatterns(flat, CMDI))     signals.push({ type: "command_injection",    severity: "critical", confidence: 0.88, detail: "Command injection pattern detected" });
  if (scanPatterns(all, PATH_TRAV)) signals.push({ type: "path_traversal",       severity: "high",     confidence: 0.91, detail: "Path traversal sequence detected" });
  if (scanPatterns(flat, SSRF))     signals.push({ type: "ssrf_attempt",         severity: "critical", confidence: 0.93, detail: "SSRF internal target detected" });
  if (scanPatterns(flat, PROTO_POLL)) signals.push({ type: "prototype_pollution", severity: "high",    confidence: 0.87, detail: "Prototype pollution pattern detected" });
  if (scanPatterns(flat, XXE))      signals.push({ type: "xxe_attempt",          severity: "critical", confidence: 0.91, detail: "XXE entity pattern detected" });
  if (/\x00|%00/i.test(all))        signals.push({ type: "null_byte",            severity: "high",     confidence: 0.96, detail: "Null byte injection detected" });
  if (/%c0%ae|%c0%af|%e0%80%ae/i.test(flat)) signals.push({ type: "unicode_abuse", severity: "high", confidence: 0.88, detail: "Overlong Unicode encoding (bypass attempt)" });
  if (/[\r\n]/.test(hflat))         signals.push({ type: "header_injection",     severity: "high",     confidence: 0.97, detail: "CRLF sequence in headers" });

  return signals;
}

function detectUASignals(userAgent: string): AttackSignal[] {
  const signals: AttackSignal[] = [];
  if (!userAgent || userAgent.trim().length < 5) {
    signals.push({ type: "scanner", severity: "medium", confidence: 0.75, detail: "Missing or minimal User-Agent" });
    return signals;
  }
  const ua = userAgent.toLowerCase();
  const match = SCANNER_UA.find(s => ua.includes(s));
  if (match) signals.push({ type: "scanner", severity: "critical", confidence: 1.0, detail: `Known attack tool User-Agent: ${match}` });
  return signals;
}

function detectPathSignals(path: string): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const match = SUSPICIOUS_PATHS.find(p => p.test(path));
  if (match) signals.push({ type: "suspicious_request", severity: "medium", confidence: 0.80, detail: `Suspicious path pattern: ${path}` });
  return signals;
}

// ── Normality score: rates how "normal" a request looks (100 = fully normal)
function calcNormalityScore(req: InspectRequest, signals: AttackSignal[]): number {
  let score = 100;

  // Deduct for attack signals
  for (const s of signals) {
    if (s.severity === "critical") score -= 40;
    else if (s.severity === "high") score -= 25;
    else if (s.severity === "medium") score -= 15;
    else if (s.severity === "low") score -= 8;
    else if (s.severity === "info") score -= 2;
  }

  // Deduct for suspicious UA
  const ua = req.userAgent.toLowerCase();
  if (!req.userAgent || req.userAgent.length < 5) score -= 20;
  if (/bot|crawler|spider|scan|test|probe|monitor/i.test(ua) && !/(googlebot|bingbot|slurp|duckduckbot)/i.test(ua)) score -= 10;

  // Deduct for unusual methods
  if (!["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"].includes(req.method.toUpperCase())) score -= 15;

  // Deduct for missing common headers
  if (!req.headers["user-agent"]) score -= 10;
  if (req.method !== "GET" && !req.headers["content-type"]) score -= 5;

  // Deduct for suspicious headers
  if (req.headers["x-forwarded-for"]?.split(",").length > 3) score -= 10; // too many proxy hops
  if (req.headers["origin"] && !req.headers["origin"].includes(req.headers["host"] ?? "")) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE + ACTION
// ═══════════════════════════════════════════════════════════════════════════════

const SEV_WEIGHT: Record<Severity, number> = { info: 2, low: 10, medium: 25, high: 45, critical: 72 };

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
  if (score > 0)   return "low";
  return "info";
}

function calcAction(score: number, signals: AttackSignal[]): MitigationAction {
  if (signals.some(s => s.type === "scanner" && s.confidence >= 0.9)) return "block";
  if (signals.some(s => ["sql_injection","command_injection","ssrf_attempt","xxe_attempt","payload_bomb"].includes(s.type) && s.severity === "critical")) return "block";
  if (score >= 70) return "block";
  if (score >= 40) return "tarpit";
  if (score >= 20) return "throttle";
  return "allow";
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRACEFUL DISCONNECT PROTECTION
// ═══════════════════════════════════════════════════════════════════════════════

// Wraps any async operation with a timeout to handle forced disconnects
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN inspect() — persistent Redis-backed, works across Vercel instances
// ═══════════════════════════════════════════════════════════════════════════════

export async function inspect(req: InspectRequest): Promise<InspectResult> {
  const { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs } = req;
  const now = Date.now();

  // Graceful disconnect: entire inspection has 4s timeout
  return withTimeout(async () => {
    const signals: AttackSignal[] = [];

    // 1. IP blocklist (Redis — shared across all instances)
    const ipStatus = await isIpBlockedRedis(ip);
    if (ipStatus.blocked) {
      const result: InspectResult = {
        action: "block", threatScore: 100, normalityScore: 0, severity: "critical",
        signals: [{ type: "blocked_ip", severity: "critical", confidence: 1.0, detail: ipStatus.reason }],
        blocked: true, reason: `Blocked IP: ${ipStatus.reason}`,
      };
      await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });
      return result;
    }

    // 2. Rate limiting (Redis — consistent across instances)
    const tierKey: TierName = endpoint.startsWith("/api/auth") ? "AUTH"
      : (endpoint.includes("/generate") || endpoint.includes("/vector")) ? "UPLOAD"
      : "API";
    const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
    const rateOk = await checkRate(rateKey, tierKey);
    if (!rateOk.allowed) {
      signals.push({ type: "rate_limit", severity: "high", confidence: 1.0,
        detail: `Rate limit exceeded (${tierKey} tier), retry in ${rateOk.retryAfter}s` });
    }

    // 3. Volumetric detection via Redis counters (shared across instances)
    const [req1s, req10s, req1m] = await Promise.all([
      getIpRequestCount(ip, "1s",  1),
      getIpRequestCount(ip, "10s", 10),
      getIpRequestCount(ip, "1m",  60),
    ]);

    if (req1s > 30)  signals.push({ type: "ddos_flood",  severity: "critical", confidence: Math.min(0.99, req1s / 60),   detail: `${req1s} req/s from ${ip} (limit 30)` });
    else if (req1s > 10) signals.push({ type: "dos_flood", severity: "high",   confidence: req1s / 30, detail: `${req1s} req/s from ${ip} (limit 10)` });
    if (req10s > 60) signals.push({ type: "dos_flood",   severity: "high",     confidence: Math.min(0.9, req10s / 120),  detail: `${req10s} req/10s burst` });
    if (req1m > 200) signals.push({ type: "http_flood",  severity: "critical", confidence: Math.min(0.98, req1m / 400),  detail: `${req1m} req/min from ${ip} (limit 200)` });

    // 4. L7 path scanning (Redis set per IP — shared)
    const pathCount = await trackIpPath(ip, endpoint);
    if (pathCount > 30) signals.push({ type: "http_flood", severity: "high", confidence: Math.min(0.9, pathCount / 60), detail: `${pathCount} unique paths scanned in 1min` });

    // 5. Error rate / credential stuffing (Redis)
    const errCount = await getIpErrorCount(ip);
    if (errCount >= 8) {
      signals.push({ type: "credential_stuffing", severity: "high", confidence: Math.min(0.95, errCount / 20),
        detail: `${errCount} errors in 10min — credential stuffing pattern` });
    }

    // 6. Payload attack detection (per-instance, no Redis needed)
    signals.push(...detectPayloadSignals(body, headers));

    // 7. User-Agent detection
    signals.push(...detectUASignals(userAgent));

    // 8. Path pattern detection
    signals.push(...detectPathSignals(endpoint));

    // 9. Score + action
    const threatScore  = calcScore(signals);
    const severity     = scoreToSeverity(threatScore);
    const action       = calcAction(threatScore, signals);
    const blocked      = action === "block";
    const normalityScore = calcNormalityScore(req, signals);

    // 10. Auto-block IPs with critical score (30min block in Redis)
    if (threatScore >= 80) {
      await blockIpRedis(ip, `Auto-blocked: score ${threatScore}, ${signals.map(s => s.type).join(",")}`, 1800);
    }

    const tarpitMs = action === "tarpit"
      ? Math.round(5000 + ((threatScore - 40) / 60) * 25000)
      : undefined;

    const topSignal = [...signals].sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])[0];
    const reason = topSignal ? `${topSignal.type}: ${topSignal.detail}` : undefined;

    const result: InspectResult = { action, threatScore, normalityScore, severity, signals, blocked, reason, tarpitMs };

    // 11. Log ALL requests to Redis (normal + attacks, for real-time monitoring)
    await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });

    return result;
  }, 4000, {
    // Fallback if Redis times out — allow request but log nothing
    action: "allow", threatScore: 0, normalityScore: 100, severity: "info",
    signals: [], blocked: false, reason: "Security check timed out (graceful fallback)",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getClientIp(headers: Record<string, string | undefined>): string {
  return (
    headers["cf-connecting-ip"]?.trim() ||
    headers["x-real-ip"]?.trim() ||
    headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

export async function recordIpError(ip: string): Promise<void> {
  try {
    await rincr(K.ipErrCount(ip), 600);
  } catch { /* silent */ }
}

export async function manualBlockIp(ip: string, reason: string, durationSec = 86400): Promise<void> {
  await blockIpRedis(ip, reason, durationSec);
}

export function sanitizeString(input: string, maxLen = 10_000): string {
  if (typeof input !== "string") return "";
  return input.replace(/\0/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").normalize("NFC").trim().slice(0, maxLen);
}

export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const n = email.trim().toLowerCase();
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(n) && n.length <= 254 ? n : null;
}

export function validatePassword(pw: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!pw || pw.length < 8) issues.push("Minimal 8 karakter");
  if (pw.length > 128) issues.push("Maksimal 128 karakter");
  if (!/[A-Z]/.test(pw)) issues.push("Butuh minimal 1 huruf kapital");
  if (!/[0-9]/.test(pw)) issues.push("Butuh minimal 1 angka");
  return { valid: issues.length === 0, issues };
}
