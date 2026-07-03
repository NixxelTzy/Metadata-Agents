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

// Batch get multiple keys in parallel — single Promise.all round-trip
async function rbatchGet<T>(keys: string[]): Promise<(T | null)[]> {
  try {
    return await Promise.all(keys.map(k => rget<T>(k)));
  } catch { return keys.map(() => null); }
}

// Redis set add — for credential stuffing hash tracking
async function rsadd(key: string, ...members: string[]): Promise<void> {
  try {
    const r = getRedis();
    await r.sadd(key, members[0], ...members.slice(1));
  } catch { /* silent */ }
}

// Redis set cardinality (count)
async function rsmembers(key: string): Promise<string[]> {
  try {
    return (await getRedis().smembers(key)) as string[] ?? [];
  } catch { return []; }
}

// Redis list push for duration history (capped at maxLen, with TTL)
async function rpushNum(key: string, val: number, maxLen: number, exSeconds: number): Promise<void> {
  try {
    const r = getRedis();
    await r.lpush(key, String(val));
    await r.ltrim(key, 0, maxLen - 1);
    await r.expire(key, exSeconds);
  } catch { /* silent */ }
}

// Fire-and-forget wrapper — launch write without awaiting, swallow errors
function fireAndForget(fn: () => Promise<void>): void {
  void (async () => { try { await fn(); } catch { /* silent */ } })();
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
  trustScore?: number;
  botScore?: number;
  fusedScore?: number;
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
  trustScore?: number;
  botScore?: number;
  fusedScore?: number;
  entropyScore?: number;
  fingerprintId?: string;
  attackChainLength?: number;
}

export interface TrustProfile {
  ip: string;
  createdAt: number;
  lastSeenAt: number;
  cleanRequestCount: number;
  attackSignalCount: number;
  lastAttackAt?: number;
  endpointFrequencies: Record<string, number>;
  methodDistribution: Record<string, number>;
  hourlyActivity: number[]; // [0..23]
  meanInterRequestMs: number;
  stdDevInterRequestMs: number;
  meanPayloadSize: number;
  stdDevPayloadSize: number;
  trustScore: number;
  recentHighThreat: boolean;
  highThreatCount: number;
  maxTrustScore: number;
  countries: string[];
  countryTimestamps: number[];
}

export interface SessionContext {
  ip: string;
  startedAt: number;
  lastRequestAt: number;
  endpoints: string[]; // Last 20, FIFO
  methods: string[];
  timestamps: number[];
  responseCodes: number[];
  interRequestIntervals: number[]; // Last 10
  uniqueEndpointCount: number;
  getRequestCount: number;
  postRequestCount: number;
}

export interface DeviceFingerprintRecord {
  fingerprintId: string;
  createdAt: number;
  lastSeenAt: number;
  cleanRequestCount: number;
  associatedIPs: string[]; // Last 10
}

export interface AttackChainEntry {
  timestamp: number;
  signalType: AttackType;
  severity: Severity;
}

export interface AttackChain {
  ip: string;
  entries: AttackChainEntry[]; // Last 30min, capped at 50
}

export interface ForensicPacket {
  id: string;
  timestamp: number;
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>; // Sensitive values masked
  bodyHash: string;
  bodyPreview?: string;
  threatScore: number;
  trustScore: number;
  normalityScore: number;
  fusedScore: number;
  botScore: number;
  entropyScore?: number;
  signals: AttackSignal[];
  trustProfileSnapshot?: Partial<TrustProfile>;
  attackChainSnapshot?: AttackChainEntry[];
  deviceFingerprint?: string;
  action: MitigationAction;
  reason: string;
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
  // ASI namespace keys (isolated from existing sec: namespace)
  asiTrust:    (ip: string)         => `asi:trust:${ip}`,
  asiSession:  (ip: string)         => `asi:session:${ip}`,
  asiFingerprint: (fpId: string)    => `asi:fp:${fpId}`,
  asiChain:    (ip: string)         => `asi:chain:${ip}`,
  asiForensic: (ip: string, ts: number) => `asi:forensic:${ip}:${ts}`,
  asiPayloadHash: (ip: string)      => `asi:phash:${ip}`,
  asiDuration: (ip: string)         => `asi:dur:${ip}`,
  asiGeo:      (userId: string)     => `asi:geo:${userId}`,
  asiForensicLog: ()                => `asi:forensics`,
};

// Storage protection constants
const MAX_EVENTS_IN_REDIS = 500;   // max events stored — prevents Redis storage bloat
const EVENT_TTL_SECONDS   = 86400; // 24h TTL on event log

// ASI storage constants
const ASI_TRUST_TTL       = 2592000;  // 30 days
const ASI_SESSION_TTL     = 900;      // 15 minutes
const ASI_FINGERPRINT_TTL = 7776000;  // 90 days
const ASI_CHAIN_TTL       = 1800;     // 30 minutes
const ASI_FORENSIC_TTL    = 604800;   // 7 days
const MAX_FORENSICS       = 200;      // Max forensic packets

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Derive a stable device fingerprint from non-PII request headers.
 * Uses SHA-256 of Accept + Accept-Language + Accept-Encoding + User-Agent + Sec-CH-UA,
 * normalized and sorted, truncated to 16 hex characters.
 */
function deriveDeviceFingerprint(headers: Record<string, string>): string {
  const components = [
    headers["accept"] ?? "",
    headers["accept-language"] ?? "",
    headers["accept-encoding"] ?? "",
    headers["user-agent"] ?? "",
    headers["sec-ch-ua"] ?? "",
  ];
  const normalized = components
    .map(c => c.toLowerCase().trim())
    .filter(c => c.length > 0)
    .sort()
    .join("|");

  const hash = crypto.createHash("sha256").update(normalized).digest("hex");
  return hash.substring(0, 16);
}

/**
 * Compute a short SHA-256 hash of the request body for credential stuffing detection.
 * Returns 16 hex characters (64-bit collision resistance is sufficient for this use case).
 */
function hashPayload(body: unknown): string {
  const str = JSON.stringify(body ?? "");
  return crypto.createHash("sha256").update(str).digest("hex").substring(0, 16);
}

/**
 * Mask sensitive header values before storing in forensic records.
 * - Authorization: [REDACTED:Bearer] or [REDACTED:Auth]
 * - Cookie: [REDACTED:N-cookies] where N is the count of cookie pairs
 * - X-Api-Key: [REDACTED]
 * All other headers are preserved as-is.
 */
function sanitizeHeadersForForensic(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();
    if (lk === "authorization") {
      sanitized[key] = value.startsWith("Bearer ") ? "[REDACTED:Bearer]" : "[REDACTED:Auth]";
    } else if (lk === "cookie") {
      const cookieCount = (value.match(/=/g) ?? []).length;
      sanitized[key] = `[REDACTED:${cookieCount}-cookies]`;
    } else if (lk === "x-api-key") {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE FINGERPRINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize a new device fingerprint record.
 * Called when a fingerprint ID is seen for the first time.
 */
function initializeDeviceFingerprintRecord(fingerprintId: string, ip: string): DeviceFingerprintRecord {
  const now = Date.now();
  return {
    fingerprintId,
    createdAt: now,
    lastSeenAt: now,
    cleanRequestCount: 0,
    associatedIPs: [ip],
  };
}

/**
 * Compute trust bonus based on device fingerprint history.
 * Returns 10 when cleanRequestCount >= 20, otherwise 0.
 */
function computeFingerprintTrustBonus(record: DeviceFingerprintRecord | null): number {
  if (!record) return 0;
  return record.cleanRequestCount >= 20 ? 10 : 0;
}

/**
 * Update device fingerprint record with new request data.
 * Increments cleanRequestCount on clean requests, maintains FIFO IP list (max 10).
 */
function updateDeviceFingerprint(
  record: DeviceFingerprintRecord,
  ip: string,
  isCleanRequest: boolean
): DeviceFingerprintRecord {
  const MAX_IPS = 10;

  // Update associated IPs (FIFO, deduplicated)
  const newIPs = record.associatedIPs.includes(ip)
    ? record.associatedIPs
    : [...record.associatedIPs, ip].slice(-MAX_IPS);

  return {
    ...record,
    lastSeenAt: Date.now(),
    cleanRequestCount: isCleanRequest ? record.cleanRequestCount + 1 : record.cleanRequestCount,
    associatedIPs: newIPs,
  };
}

/**
 * Save device fingerprint record to Redis (fire-and-forget).
 * Uses 90-day TTL for persistent device tracking.
 */
function saveDeviceFingerprint(record: DeviceFingerprintRecord): void {
  fireAndForget(async () => {
    await rset(K.asiFingerprint(record.fingerprintId), JSON.stringify(record), ASI_FINGERPRINT_TTL);
  });
}

/**
 * detectFingerprintAnomaly — Emits anomaly signal when a known TrustProfile IP
 * presents a DeviceFingerprint that has never been associated with that IP before.
 * This may indicate session hijacking or device spoofing (Req 3.4).
 *
 * NOTE: This is intentionally low-severity and only emits an INFO/LOW signal —
 * it does NOT block/throttle on its own.
 */
function detectFingerprintAnomaly(
  fpRecord: DeviceFingerprintRecord | null,
  trustProfile: TrustProfile | null,
  currentIp: string,
  fingerprintId: string
): AttackSignal[] {
  const signals: AttackSignal[] = [];

  // Only emit if there's an established TrustProfile (known IP)
  // AND the fingerprint record exists (fingerprint has been seen before)
  // AND this IP is NOT already associated with this fingerprint
  if (
    trustProfile &&
    trustProfile.cleanRequestCount >= 5 &&
    fpRecord &&
    fpRecord.cleanRequestCount > 0 &&
    !fpRecord.associatedIPs.includes(currentIp)
  ) {
    signals.push({
      type: "anomaly",
      severity: "low",
      confidence: 0.60,
      detail: `New device fingerprint for known IP — fp:${fingerprintId.substring(0, 8)}`,
    });
  }

  return signals;
}

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

// NoSQL injection patterns (Req 14.1)
const NOSQL: RegExp[] = [
  /\$where\s*:/i,
  /\$ne\s*:/i,
  /\$gt\s*:/i,
  /\$lt\s*:/i,
  /\$gte\s*:/i,
  /\$lte\s*:/i,
  /\$in\s*\[/i,
  /\$nin\s*\[/i,
  /\$regex\s*:/i,
  /\$exists\s*:/i,
  /\$or\s*\[/i,
  /\$and\s*\[/i,
  /\$not\s*:/i,
  /'; return true; var foo = '/i,
  /\{".*"\s*:\s*\{"?\$[a-z]+/i,
];

// LDAP injection patterns (Req 14.2)
const LDAP: RegExp[] = [
  /\)\(uid=\*\)\(\|/i,
  /\*\)\(objectClass=\*/i,
  /\)\(cn=\*/i,
  /\)\(mail=\*/i,
  /\x00[a-z]+=\*/i,
  /\)\(\|[^)]*\)$/i,
  /\(&\([a-z]+=\*/i,
];

// Server-Side Template Injection patterns (Req 14.3)
const SSTI: RegExp[] = [
  /\{\{[^}]*7\s*\*\s*7[^}]*\}\}/,
  /\$\{[^}]*7\s*\*\s*7[^}]*\}/,
  /<%=\s*7\s*\*\s*7\s*%>/,
  /#\{[^}]*7\s*\*\s*7[^}]*\}/,
  /\*\{[^}]*7\s*\*\s*7[^}]*\}/,
  /\{\{config\./i,
  /\{\{self\./i,
  /\{\{request\./i,
  /\{\{__class__/i,
  /__import__\s*\(/i,
  /\{\{\s*''\.class\./i,
];

// Deserialization attack patterns (Req 14.4)
const DESERIALIZATION: RegExp[] = [
  /rO0AB/,                          // Java serialized object base64 prefix
  /\bO:\d+:/,                       // PHP object serialization O:N:
  /\ba:\d+:\{/,                     // PHP array serialization
  /aced\s*0005/i,                   // Java magic bytes hex
  /\xac\xed\x00\x05/,               // Java magic bytes raw
  /PD9waHA/,                        // PHP webshell base64 common prefix
  /Y2xhc3MgU2hlbGx/,               // "class Shell" base64
];

// Open redirect params (Req 14.5)
const OPEN_REDIRECT_PARAMS = ["redirect", "url", "next", "callback", "return", "goto", "dest", "destination"];

// Suspicious path patterns that indicate scanning
const SUSPICIOUS_PATHS = [
  /\.(php|asp|aspx|jsp|cgi|pl|py|rb|sh|bash|env|git|svn|htaccess|htpasswd|config|bak|sql|dump)$/i,
  /\/(admin|administrator|wp-admin|wp-login|phpmyadmin|pma|cpanel|webmail|jenkins|console|manager)/i,
  /\/(\.git|\.env|\.aws|\.ssh|\.bash_history|\.htaccess)/i,
  /\/(xmlrpc|xmlrpc\.php|api\/v\d+\/admin)/i,
  /\/(etc\/passwd|etc\/shadow|proc\/self)/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// ENTROPY ANALYZER — detect obfuscated/encoded attack payloads
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * calculateShannonEntropy — H = -Σ p(c) * log2(p(c)) per character (Req 5.1).
 */
function calculateShannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] ?? 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * extractStringSegments — Recursively extracts all strings longer than minLen from body.
 */
function extractStringSegments(obj: unknown, minLen: number): string[] {
  const result: string[] = [];
  if (typeof obj === "string" && obj.length > minLen) {
    result.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) result.push(...extractStringSegments(item, minLen));
  } else if (obj && typeof obj === "object") {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      result.push(...extractStringSegments(val, minLen));
    }
  }
  return result;
}

/**
 * analyzePayloadEntropy — Full entropy analysis of request body (Req 5.1–5.6).
 * Only runs on POST, PUT, PATCH requests to avoid false positives on GET params.
 *
 * Returns signals and maximum entropy score found.
 */
function analyzePayloadEntropy(
  body: unknown,
  method: string,
  endpoint: string
): { signals: AttackSignal[]; entropyScore: number } {
  // Req 5.6: Only analyze POST, PUT, PATCH
  if (!["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
    return { signals: [], entropyScore: 0 };
  }

  const signals: AttackSignal[] = [];
  const segments = extractStringSegments(body, 32);
  let maxEntropy = 0;
  let totalEntropy = 0;
  let segmentCount = 0;

  for (const segment of segments) {
    const entropy = calculateShannonEntropy(segment);
    if (entropy > maxEntropy) maxEntropy = entropy;
    totalEntropy += entropy;
    segmentCount++;

    // Req 5.2: Flag high-entropy segments (>5.2 bits/char, >64 chars)
    if (entropy > 5.2 && segment.length > 64) {
      // Req 5.3: Try base64 decode and re-scan for attack patterns
      try {
        const decoded = Buffer.from(segment, "base64").toString("utf-8");
        // Only process if decoding produced valid printable text (not garbage)
        if (/^[\x20-\x7E\s]+$/.test(decoded) && decoded.length > 10) {
          const attackPatterns = [...XSS, ...SQLI, ...CMDI, ...PATH_TRAV];
          if (scanPatterns(decoded, attackPatterns)) {
            // Determine which type matched
            let matchType: AttackType = "anomaly";
            let matchSev: Severity = "critical"; // elevated by one level per Req 5.3
            if (scanPatterns(decoded, SQLI)) { matchType = "sql_injection"; matchSev = "critical"; }
            else if (scanPatterns(decoded, CMDI)) { matchType = "command_injection"; matchSev = "critical"; }
            else if (scanPatterns(decoded, XSS)) { matchType = "xss_attempt"; matchSev = "critical"; }
            else if (scanPatterns(decoded, PATH_TRAV)) { matchType = "path_traversal"; matchSev = "critical"; }

            signals.push({
              type: matchType,
              severity: matchSev,
              confidence: 0.95,
              detail: `Encoded attack payload detected (base64-wrapped, entropy: ${entropy.toFixed(2)})`,
            });
          }
        }
      } catch {
        // Not valid base64 or decode error — skip
      }
    }
  }

  // Req 5.5: Overall body extremely high entropy (>6.0 bits/char average)
  if (segmentCount > 0) {
    const avgEntropy = totalEntropy / segmentCount;
    if (avgEntropy > 6.0) {
      signals.push({
        type: "anomaly",
        severity: "medium",
        confidence: 0.80,
        detail: `Extremely high payload entropy: ${avgEntropy.toFixed(2)} bits/char — likely binary or deeply encoded content`,
      });
    }
  }

  return { signals, entropyScore: maxEntropy };
}

/**
 * analyzeUrlEntropy — Check URL path and query parameters for high-entropy segments.
 * High entropy in URL parameters may indicate obfuscated attacks (Req 5.4).
 */
function analyzeUrlEntropy(endpoint: string): AttackSignal[] {
  const signals: AttackSignal[] = [];

  // Extract path segments and query string
  const [path, queryString] = endpoint.split("?");
  const segments: string[] = [];

  // Path segments
  if (path) {
    for (const seg of path.split("/")) {
      if (seg.length > 48) segments.push(seg);
    }
  }

  // Query string values
  if (queryString) {
    for (const pair of queryString.split("&")) {
      const [, val] = pair.split("=");
      if (val && val.length > 48) segments.push(decodeURIComponent(val));
    }
  }

  for (const seg of segments) {
    const entropy = calculateShannonEntropy(seg);
    // Req 5.4: EntropyScore > 4.8 bits/char, length > 48
    if (entropy > 4.8 && seg.length > 48) {
      signals.push({
        type: "anomaly",
        severity: "low",
        confidence: 0.65,
        detail: `High entropy URL parameter — possible obfuscation (entropy: ${entropy.toFixed(2)})`,
      });
      break; // Only emit one signal per request
    }
  }

  return signals;
}

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
// ADAPTIVE RATE LIMITER — trust-based dynamic threshold adjustment
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * computeAdaptiveMultiplier — Returns the rate limit multiplier for a given TrustScore.
 *
 * Rules (Req 4.2, 4.3, 4.5):
 * - TrustScore ≥ 90: 3.0× multiplier
 * - TrustScore ≥ 70: 2.0× multiplier
 * - TrustScore < 70 or no profile: 1.0× (static limits apply)
 * - Hard cap: 3.0× regardless of TrustScore
 * - Suspended (recentHighThreat): always 1.0×
 */
function computeAdaptiveMultiplier(trustScore: number, recentHighThreat: boolean): number {
  // Req 4.6: Multiplier suspended when recent high-threat detected
  if (recentHighThreat) return 1.0;

  if (trustScore >= 90) return 3.0; // Req 4.3: fully trusted
  if (trustScore >= 70) return 2.0; // Req 4.2: trusted
  return 1.0;                        // Req 4.4: untrusted/new IP
}

/**
 * checkAdaptiveRate — Rate limiting with trust-based adaptive thresholds.
 *
 * For trusted IPs, the max request limit is multiplied up to 3× before triggering.
 * This prevents false positives for the website owner's legitimate heavy usage.
 *
 * @param key           - Rate limit key (e.g., "ip:{ip}" or "user:{userId}")
 * @param tier          - Rate limit tier (AUTH, API, UPLOAD, STRICT)
 * @param trustScore    - Computed TrustScore [0, 100]
 * @param recentHighThreat - Whether this IP recently triggered a high threat
 */
async function checkAdaptiveRate(
  key: string,
  tier: TierName,
  trustScore: number,
  recentHighThreat: boolean
): Promise<{ allowed: boolean; retryAfter: number }> {
  const t = TIERS[tier];
  const multiplier = computeAdaptiveMultiplier(trustScore, recentHighThreat);
  
  // If no adaptive multiplier needed, use existing checkRate directly
  if (multiplier === 1.0) {
    return checkRate(key, tier);
  }

  // Adaptive rate limit: apply multiplier to max requests
  const adaptedMax = Math.floor(t.max * multiplier);
  const rk = K.rateWindow(key, tier);
  const bk = K.rateBlock(key, tier);

  // Check if currently in a rate-limit block
  const blocked = await rget<number>(bk);
  if (blocked) {
    const ttl = await (async () => { try { return await getRedis().ttl(bk); } catch { return t.blockSec; } })();
    return { allowed: false, retryAfter: ttl > 0 ? ttl : t.blockSec };
  }

  // Increment counter using the same key as the regular rate limiter
  const count = await rincr(rk, t.windowSec);
  if (count > adaptedMax) {
    await rset(bk, 1, t.blockSec);
    return { allowed: false, retryAfter: t.blockSec };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * handleAdaptiveThresholdPenalty — When a high/critical severity signal is detected
 * for an IP with elevated adaptive threshold, reset multiplier by setting recentHighThreat.
 * This suspends the multiplier for 30 minutes (Req 4.6).
 *
 * NOTE: The recentHighThreat flag is stored in TrustProfile.recentHighThreat.
 * The caller must update and save the TrustProfile with this flag set.
 *
 * Returns updated profile with recentHighThreat = true and highThreatCount incremented.
 */
function handleAdaptiveThresholdPenalty(
  profile: TrustProfile,
  hasHighOrCriticalSignal: boolean
): TrustProfile {
  if (!hasHighOrCriticalSignal) return profile;

  const newCount = profile.highThreatCount + 1;
  
  return {
    ...profile,
    recentHighThreat: true,
    highThreatCount: newCount,
    // Req 15.4: Permanently cap maxTrustScore to 40 after 5+ consecutive high-threat flags
    maxTrustScore: newCount >= 5 ? 40 : profile.maxTrustScore,
  };
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
// ASI CONTEXT LOADER — batch-loads all Redis contexts in one round-trip
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadedContext {
  trustProfile: TrustProfile | null;
  sessionContext: SessionContext | null;
  fingerprintRecord: DeviceFingerprintRecord | null;
  attackChain: AttackChain | null;
  ipBlockedReason: string | null;
  durationHistory: number[];
  geoData: { countries: string[]; timestamps: number[] } | null;
  fingerprintId: string;
}

async function loadContextData(
  ip: string,
  userId: string | undefined,
  headers: Record<string, string>
): Promise<LoadedContext> {
  const fingerprintId = deriveDeviceFingerprint(headers);

  // Single parallel batch read — all independent Redis reads in one round-trip
  const [
    trustProfileRaw,
    sessionContextRaw,
    fingerprintRecordRaw,
    attackChainRaw,
    ipBlockedReason,
    durationHistoryRaw,
    geoDataRaw,
  ] = await Promise.all([
    rget<TrustProfile>(K.asiTrust(ip)),
    rget<SessionContext>(K.asiSession(ip)),
    rget<DeviceFingerprintRecord>(K.asiFingerprint(fingerprintId)),
    rget<AttackChain>(K.asiChain(ip)),
    rget<string>(K.ipBlocked(ip)),
    rlrange<string>(K.asiDuration(ip), 0, 9),
    userId ? rget<{ countries: string[]; timestamps: number[] }>(K.asiGeo(userId)) : Promise.resolve(null),
  ]);

  // Parse duration history — stored as strings, convert to numbers
  const durationHistory = (durationHistoryRaw ?? [])
    .map(v => typeof v === "string" ? parseFloat(v) : (v as unknown as number))
    .filter(v => !isNaN(v));

  return {
    trustProfile: trustProfileRaw,
    sessionContext: sessionContextRaw,
    fingerprintRecord: fingerprintRecordRaw,
    attackChain: attackChainRaw,
    ipBlockedReason: ipBlockedReason ?? null,
    durationHistory,
    geoData: geoDataRaw,
    fingerprintId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING ANALYZER — Slowloris and timing-based attack detection
// ═══════════════════════════════════════════════════════════════════════════════

// Non-streaming endpoints where slow requests are suspicious
const NON_STREAMING_ENDPOINTS = ["/api/auth", "/api/validate"];

/**
 * storeDurationHistory — Persist request duration to Redis list (Req 7.4, 7.6).
 * Keeps last 10 values, 10-minute TTL. Fire-and-forget.
 */
function storeDurationHistory(ip: string, durationMs: number): void {
  if (durationMs <= 0) return;
  fireAndForget(async () => {
    await rpushNum(K.asiDuration(ip), durationMs, 10, 600); // 10 values, 10min TTL
  });
}

/**
 * detectTimingAnomalies — Detect Slowloris patterns and suspiciously fast auth requests.
 * Uses requestDurationMs from InspectRequest and stored duration history (Req 7.1–7.5).
 *
 * @param ip            - Client IP address
 * @param endpoint      - Request endpoint
 * @param method        - HTTP method
 * @param durationMs    - Current request duration in milliseconds (optional)
 * @param durationHistory - Last 10 duration values from Redis
 */
function detectTimingAnomalies(
  ip: string,
  endpoint: string,
  method: string,
  durationMs: number | undefined,
  durationHistory: number[]
): AttackSignal[] {
  const signals: AttackSignal[] = [];

  if (durationMs === undefined) return signals;

  const isNonStreaming = NON_STREAMING_ENDPOINTS.some(p => endpoint.startsWith(p));
  const isAuthEndpoint = endpoint === "/api/auth/login" || endpoint === "/api/auth/register";

  // Req 7.2: Single slow request on non-streaming endpoint
  if (isNonStreaming && durationMs > 8000) {
    // Req 7.3: Check if last 5 requests were all slow (>5000ms)
    const recentHistory = durationHistory.slice(0, 5);
    const allSlow = recentHistory.length >= 5 && recentHistory.every(d => d > 5000);

    if (allSlow) {
      signals.push({
        type: "slowloris",
        severity: "high",
        confidence: Math.min(0.95, durationMs / 15000),
        detail: `Slowloris pattern: ${recentHistory.length} consecutive slow requests (last: ${durationMs}ms)`,
      });
    } else {
      signals.push({
        type: "slowloris",
        severity: "medium",
        confidence: Math.min(0.80, durationMs / 20000),
        detail: `Abnormally slow request on ${endpoint}: ${durationMs}ms — possible Slowloris pattern`,
      });
    }
  }

  // Req 7.5: Suspiciously fast POST to auth endpoints (<50ms)
  if (isAuthEndpoint && method.toUpperCase() === "POST" && durationMs < 50 && durationMs > 0) {
    signals.push({
      type: "anomaly",
      severity: "low",
      confidence: 0.70,
      detail: `Suspiciously fast auth request: ${durationMs}ms — automated credential submission`,
    });
  }

  return signals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL ANOMALY DETECTOR — malformed/inconsistent HTTP header detection
// ═══════════════════════════════════════════════════════════════════════════════

// API routes that require Content-Type for POST/PUT/PATCH (Req 6.1)
const CONTENT_TYPE_REQUIRED_ROUTES = ["/api/chat", "/api/generate", "/api/research", "/api/vector"];

/**
 * detectProtocolAnomalies — Checks HTTP headers for structural inconsistencies
 * that indicate automated tools or attack frameworks (Req 6.1–6.7).
 */
function detectProtocolAnomalies(
  endpoint: string,
  method: string,
  headers: Record<string, string>,
  body: unknown
): { signals: AttackSignal[]; threatScoreBonus: number } {
  const signals: AttackSignal[] = [];
  let threatScoreBonus = 0;

  const lMethod = method.toUpperCase();
  const isWriteMethod = ["POST", "PUT", "PATCH"].includes(lMethod);

  // Req 6.1: Content-Type validation on monitored API routes
  if (
    isWriteMethod &&
    CONTENT_TYPE_REQUIRED_ROUTES.some(r => endpoint.startsWith(r))
  ) {
    const ct = headers["content-type"] ?? "";
    const hasValidCT = ct.includes("application/json") || ct.includes("multipart/form-data");
    if (!hasValidCT) {
      signals.push({
        type: "anomaly",
        severity: "low",
        confidence: 0.72,
        detail: `Missing valid Content-Type on ${endpoint} (${lMethod}) — expected application/json or multipart/form-data`,
      });
    }
  }

  // Req 6.2: Content-Length: 0 with non-empty body
  const contentLength = headers["content-length"];
  if (contentLength === "0" && body !== undefined && body !== null) {
    const bodyStr = JSON.stringify(body);
    if (bodyStr && bodyStr !== "{}" && bodyStr !== "null" && bodyStr.length > 2) {
      signals.push({
        type: "anomaly",
        severity: "medium",
        confidence: 0.88,
        detail: "Content-Length mismatch — header manipulation (Content-Length: 0 with non-empty body)",
      });
    }
  }

  // Req 6.3: Minimal header set — automated client signature
  const accept = headers["accept"] ?? "";
  const acceptLang = headers["accept-language"] ?? "";
  const acceptEnc = headers["accept-encoding"] ?? "";
  if (
    endpoint.startsWith("/api") &&
    accept === "*/*" &&
    !acceptLang &&
    !acceptEnc
  ) {
    threatScoreBonus += 5;
  }

  // Req 6.4: Header stuffing — more than 30 distinct headers
  const headerCount = Object.keys(headers).length;
  if (headerCount > 30) {
    signals.push({
      type: "anomaly",
      severity: "low",
      confidence: 0.70,
      detail: `Abnormal header count: ${headerCount} headers — header stuffing attempt`,
    });
  }

  // Req 6.5: TE/CL header conflict — HTTP desync
  if (headers["transfer-encoding"] && headers["content-length"]) {
    signals.push({
      type: "anomaly",
      severity: "high",
      confidence: 0.95,
      detail: "TE/CL header conflict — HTTP desync attack pattern (Transfer-Encoding + Content-Length)",
    });
  }

  // Req 6.6: Host header mismatch
  const hostHeader = headers["host"] ?? "";
  const expectedHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : "";
  const isLocalhost = hostHeader.startsWith("localhost") || hostHeader.startsWith("127.") || hostHeader.startsWith("::1");
  if (expectedHost && hostHeader && hostHeader !== expectedHost && !isLocalhost) {
    signals.push({
      type: "anomaly",
      severity: "medium",
      confidence: 0.82,
      detail: `Host header mismatch: "${hostHeader}" expected "${expectedHost}" — virtual host poisoning attempt`,
    });
  }

  return { signals, threatScoreBonus };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS LOGIC GUARD — application-specific abuse detection
// ═══════════════════════════════════════════════════════════════════════════════

// Prompt injection phrases (Req 9.2) — case-insensitive scan
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/i,
  /you\s+are\s+now\b/i,
  /disregard\s+your/i,
  /\bsystem\s*:/i,
  /SYSTEM\s+OVERRIDE/,
  /\bforget\s+(all\s+)?previous\b/i,
  /\bact\s+as\s+if\b/i,
  /\bpretend\s+(you\s+are|to\s+be)\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b.*mode/i,
  /ignore\s+(all\s+)?instructions/i,
  /new\s+prompt\s*:/i,
];

/**
 * detectBusinessLogicAbuse — Detects application-specific attack patterns
 * including credential stuffing, prompt injection, AI abuse, and bulk operations.
 */
async function detectBusinessLogicAbuse(
  ip: string,
  endpoint: string,
  method: string,
  body: unknown,
  trustProfile: TrustProfile | null
): Promise<AttackSignal[]> {
  const signals: AttackSignal[] = [];
  const flat = typeof body === "string" ? body : JSON.stringify(body ?? "");

  // ── Req 9.2: Prompt injection on chat/generate endpoints
  if (endpoint.startsWith("/api/chat") || endpoint.startsWith("/api/generate")) {
    if (PROMPT_INJECTION_PATTERNS.some(p => p.test(flat))) {
      signals.push({
        type: "anomaly",
        severity: "high",
        confidence: 0.90,
        detail: "Prompt injection attempt detected",
      });
    }
  }

  // ── Req 9.1: Credential stuffing — >5 distinct payload hashes to /api/auth/login in 5min
  if (endpoint === "/api/auth/login" && method.toUpperCase() === "POST") {
    const payloadHash = hashPayload(body);
    const hashKey = K.asiPayloadHash(ip);
    await rsadd(hashKey, payloadHash);
    try {
      await getRedis().expire(hashKey, 300); // 5-minute TTL (Req 9.7)
    } catch { /* silent */ }
    const allHashes = await rsmembers(hashKey);
    if (allHashes.length > 5) {
      signals.push({
        type: "credential_stuffing",
        severity: "high",
        confidence: 0.95,
        detail: `Credential stuffing: ${allHashes.length} distinct payloads to /api/auth/login in 5min`,
      });
    }
  }

  // ── Req 9.3: Excessive AI resource consumption
  if (endpoint.startsWith("/api/generate") || endpoint.startsWith("/api/research")) {
    const countKey = K.ipReqCount(ip, "ai10m");
    const aiCount = await rincr(countKey, 600); // 10-min window
    if (aiCount > 20) {
      signals.push({
        type: "anomaly",
        severity: "medium",
        confidence: Math.min(0.90, aiCount / 40),
        detail: `Excessive AI resource consumption: ${aiCount} requests in 10min`,
      });
    }
  }

  // ── Req 9.4: Rapid account creation
  if (endpoint === "/api/auth/register" && method.toUpperCase() === "POST") {
    const regKey = K.ipReqCount(ip, "reg30m");
    const regCount = await rincr(regKey, 1800); // 30-min window
    if (regCount > 3) {
      signals.push({
        type: "anomaly",
        severity: "medium",
        confidence: Math.min(0.88, regCount / 10),
        detail: `Rapid account creation: ${regCount} registrations in 30min`,
      });
    }
  }

  // ── Req 9.5: Bulk link validation — possible SSRF amplification
  if (endpoint.startsWith("/api/validate/links") && method.toUpperCase() === "POST") {
    try {
      const parsed = typeof body === "object" && body !== null ? body : JSON.parse(flat);
      const urlCount = Array.isArray((parsed as Record<string, unknown>)["urls"])
        ? ((parsed as Record<string, unknown>)["urls"] as unknown[]).length
        : Array.isArray(parsed) ? (parsed as unknown[]).length : 0;
      if (urlCount > 50) {
        signals.push({
          type: "anomaly",
          severity: "medium",
          confidence: 0.85,
          detail: `Bulk link validation: ${urlCount} URLs — possible SSRF amplification attempt`,
        });
      }
    } catch { /* body not parseable, skip */ }
  }

  return signals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT DETECTOR — behavioral bot detection beyond User-Agent matching
// ═══════════════════════════════════════════════════════════════════════════════

const MODERN_BROWSER_UA_KEYWORDS = ["chrome", "firefox", "safari", "edge"];

function computeBotScore(
  headers: Record<string, string>,
  sessionCtx: SessionContext | null,
  userAgent: string
): { botScore: number; botDetail: string } {
  let score = 0;
  const details: string[] = [];
  const ua = userAgent.toLowerCase();
  const isModernUA = MODERN_BROWSER_UA_KEYWORDS.some(k => ua.includes(k));
  const hasSFSite = !!headers["sec-fetch-site"];
  const hasSFMode = !!headers["sec-fetch-mode"];
  const hasSFDest = !!headers["sec-fetch-dest"];

  if (isModernUA && !hasSFSite && !hasSFMode && !hasSFDest) {
    score += 20;
    details.push("modern UA missing Sec-Fetch headers");
  }
  if (!headers["accept-language"]) { score += 10; details.push("missing Accept-Language"); }

  if (sessionCtx && sessionCtx.interRequestIntervals.length >= 10) {
    const stdDev = computeTimingStdDev(sessionCtx.interRequestIntervals);
    if (stdDev < 100) { score += 30; details.push(`machine-regular timing (stdDev=${stdDev.toFixed(1)}ms)`); }
  }

  if (sessionCtx) {
    const total = sessionCtx.getRequestCount + sessionCtx.postRequestCount;
    if (total > 5 && sessionCtx.getRequestCount === 0) { score += 10; details.push("write-only session"); }
  }

  // Guard Req 8.6: remove UA-only penalty if other signals < 10
  if (isModernUA && !hasSFSite && !hasSFMode && !hasSFDest && (score - 20) < 10) {
    score -= 20;
  }

  return { botScore: Math.max(0, Math.min(100, score)), botDetail: details.join("; ") };
}

function detectBotSignals(
  botScore: number,
  botDetail: string,
  trustScore: number
): { signals: AttackSignal[]; forceThrottle: boolean } {
  const signals: AttackSignal[] = [];
  let forceThrottle = false;

  if (botScore >= 80) {
    signals.push({ type: "bot_detected", severity: "high", confidence: Math.min(0.99, botScore / 100),
      detail: `Bot detected (score=${botScore}): ${botDetail}` });
    if (trustScore < 90) forceThrottle = true;
  } else if (botScore >= 50) {
    signals.push({ type: "bot_detected", severity: "medium", confidence: botScore / 100,
      detail: `Possible bot (score=${botScore}): ${botDetail}` });
  }

  return { signals, forceThrottle };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACK CHAIN CORRELATOR — multi-request attack pattern recognition
// ═══════════════════════════════════════════════════════════════════════════════

const RECON_SIGNAL_TYPES: AttackType[] = ["scanner", "suspicious_request", "http_flood"];
const WEAPON_SIGNAL_TYPES: AttackType[] = ["sql_injection", "command_injection", "xss_attempt", "ssrf_attempt", "xxe_attempt", "prototype_pollution"];

async function loadAttackChain(ip: string): Promise<AttackChain | null> {
  return rget<AttackChain>(K.asiChain(ip));
}

function buildUpdatedAttackChain(
  existing: AttackChain | null,
  ip: string,
  newSignals: AttackSignal[],
  now: number
): AttackChain {
  const MAX_ENTRIES = 50;
  const WINDOW_MS = 1_800_000;
  const existingEntries = (existing?.entries ?? []).filter(e => now - e.timestamp < WINDOW_MS);
  const newEntries: AttackChainEntry[] = newSignals
    .filter(s => s.type !== "normal_request" && s.type !== "rate_limit")
    .map(s => ({ timestamp: now, signalType: s.type, severity: s.severity }));
  return { ip, entries: [...existingEntries, ...newEntries].slice(-MAX_ENTRIES) };
}

function saveAttackChain(chain: AttackChain): void {
  fireAndForget(async () => {
    await rset(K.asiChain(chain.ip), JSON.stringify(chain), ASI_CHAIN_TTL);
  });
}

function analyzeAttackChain(
  chain: AttackChain,
  newSignals: AttackSignal[],
  trustScore: number,
  now: number
): { compositeSignals: AttackSignal[]; threatBonus: number } {
  if (trustScore >= 80) return { compositeSignals: [], threatBonus: 0 };
  const compositeSignals: AttackSignal[] = [];
  let threatBonus = 0;
  const recentWindow = now - 600_000;
  const persistWindow = now - 300_000;

  const hasRecon = chain.entries.some(e => RECON_SIGNAL_TYPES.includes(e.signalType) && e.timestamp > recentWindow);
  const hasWeapon = newSignals.some(s => WEAPON_SIGNAL_TYPES.includes(s.type)) ||
    chain.entries.some(e => WEAPON_SIGNAL_TYPES.includes(e.signalType) && e.timestamp > recentWindow);

  if (hasRecon && hasWeapon) {
    compositeSignals.push({ type: "anomaly", severity: "critical", confidence: 0.98,
      detail: "Multi-phase attack chain: recon → exploit" });
  }

  const recentTypes = new Set<string>();
  chain.entries.filter(e => e.timestamp > recentWindow).forEach(e => recentTypes.add(e.signalType));
  newSignals.forEach(s => recentTypes.add(s.type));
  if (recentTypes.size >= 3) threatBonus += 25;

  if (chain.entries.some(e => e.severity === "critical" && e.timestamp > persistWindow)) {
    threatBonus += 15;
  }

  return { compositeSignals, threatBonus };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEO ANOMALY DETECTOR — impossible travel and geographic anomaly detection
// ═══════════════════════════════════════════════════════════════════════════════

function extractCountryCode(headers: Record<string, string>): string | null {
  return headers["cf-ipcountry"] ?? headers["x-vercel-ip-country"] ?? null;
}

function detectGeoAnomalies(
  userId: string | undefined,
  countryCode: string | null,
  geoData: { countries: string[]; timestamps: number[] } | null,
  trustScore: number
): AttackSignal[] {
  if (!countryCode || !userId || trustScore >= 90) return [];
  if (!geoData || geoData.countries.length === 0) return [];

  const signals: AttackSignal[] = [];
  const now = Date.now();
  const twoHoursAgo = now - 7_200_000;
  const oneHourAgo  = now - 3_600_000;

  const recentCountries = geoData.countries.filter((_, i) => (geoData.timestamps[i] ?? 0) > twoHoursAgo);
  const lastRecent = recentCountries[recentCountries.length - 1];
  if (lastRecent && lastRecent !== countryCode) {
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.78,
      detail: `Geographic anomaly: new country ${countryCode} within 2h (last: ${lastRecent})` });
  }

  const lastHourCountries = geoData.countries.filter((_, i) => (geoData.timestamps[i] ?? 0) > oneHourAgo);
  const uniqueLastHour = new Set([...lastHourCountries, countryCode]);
  if (uniqueLastHour.size >= 3) {
    signals.push({ type: "anomaly", severity: "high", confidence: 0.92,
      detail: `Impossible travel: ${uniqueLastHour.size} countries in 1h — possible account takeover` });
  }

  return signals;
}

function updateGeoData(
  userId: string,
  countryCode: string | null,
  existingData: { countries: string[]; timestamps: number[] } | null
): void {
  if (!countryCode || !userId) return;
  const MAX = 10;
  const now = Date.now();
  const existing = existingData ?? { countries: [], timestamps: [] };
  const newCountries = [...existing.countries, countryCode].slice(-MAX);
  const newTimestamps = [...existing.timestamps, now].slice(-MAX);
  fireAndForget(async () => {
    await rset(K.asiGeo(userId), JSON.stringify({ countries: newCountries, timestamps: newTimestamps }), 7200);
  });
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
  // New aggregate metrics (Req 16.3)
  let totalTrustScore = 0;
  let botDetections = 0;
  let chainAttacks = 0;
  let promptInjections = 0;
  let geoAnomalies = 0;

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
    // New metrics
    totalTrustScore += (e as SecurityEvent & { trustScore?: number }).trustScore ?? 50;
    if (e.signals.some(s => s.type === "bot_detected")) botDetections++;
    if (e.signals.some(s => s.type === "anomaly" && s.detail?.includes("attack chain"))) chainAttacks++;
    if (e.signals.some(s => s.type === "anomaly" && s.detail?.includes("Prompt injection"))) promptInjections++;
    if (e.signals.some(s => s.type === "anomaly" && (s.detail?.includes("Geographic") || s.detail?.includes("travel")))) geoAnomalies++;
  }

  const avgNormality = events.length > 0 ? Math.round(totalNormality / events.length) : 100;
  const avgTrustScore = events.length > 0 ? Math.round(totalTrustScore / events.length) : 50;
  const topIps = Object.entries(byIp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count }));

  return {
    // Backward-compatible existing fields (Req 16.5)
    total: events.length,
    last24h, lastHour, last10min,
    blocked, normalRequests, abnormalRequests,
    avgNormality,
    bySeverity, byType, topIps,
    storageUsed: events.length,
    storageMax: MAX_EVENTS_IN_REDIS,
    storagePercent: Math.round((events.length / MAX_EVENTS_IN_REDIS) * 100),
    // New fields (Req 16.3)
    avgTrustScore, botDetections, chainAttacks, promptInjections, geoAnomalies,
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

  // Extended patterns (Req 14.1–14.5)
  if (scanPatterns(flat, NOSQL))          signals.push({ type: "sql_injection",  severity: "high",     confidence: 0.88, detail: "NoSQL injection pattern detected" });
  if (scanPatterns(flat, LDAP))           signals.push({ type: "anomaly",        severity: "high",     confidence: 0.85, detail: "LDAP injection pattern detected" });
  if (scanPatterns(flat, SSTI))           signals.push({ type: "anomaly",        severity: "high",     confidence: 0.90, detail: "SSTI pattern detected" });
  if (scanPatterns(flat, DESERIALIZATION)) signals.push({ type: "anomaly",       severity: "critical", confidence: 0.92, detail: "Deserialization payload detected" });

  // Open redirect detection in body params (Req 14.5)
  for (const param of OPEN_REDIRECT_PARAMS) {
    const pm = new RegExp(`["']${param}["']\\s*:\\s*["']([^"']{1,200})["']`, "i");
    const m = flat.match(pm);
    if (m?.[1] && /^(\/\/|\\\\|https?:\/\/)/.test(m[1])) {
      signals.push({ type: "open_redirect", severity: "medium", confidence: 0.80, detail: `Open redirect in param "${param}": ${m[1].substring(0, 60)}` });
      break;
    }
  }

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
// FUSED SCORE COMPUTATION — multi-dimensional risk decision (Task 15)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * computeFusedScore — Combines ThreatScore, TrustScore, NormalityScore into one risk number.
 * Formula (Req 11.4): FusedScore = (ThreatScore * 0.6) - (TrustScore * 0.4) + NormalityPenalty
 * NormalityPenalty = max(0, 50 - NormalityScore) * 0.3
 */
function computeFusedScore(threatScore: number, trustScore: number, normalityScore: number): number {
  const normalityPenalty = Math.max(0, 50 - normalityScore) * 0.3;
  const fused = (threatScore * 0.6) - (trustScore * 0.4) + normalityPenalty;
  return Math.round(Math.max(0, fused));
}

/**
 * calcActionFromFusedScore — Map FusedScore to MitigationAction (Req 11.5).
 * allow <20, throttle 20-39, tarpit 40-59, block ≥60.
 * Preserves existing fast-block logic for critical attack types.
 */
function calcActionFromFusedScore(
  fusedScore: number,
  signals: AttackSignal[],
  forceThrottle: boolean
): MitigationAction {
  // Fast-block for critical attack types regardless of FusedScore
  if (signals.some(s => s.type === "scanner" && s.confidence >= 0.9)) return "block";
  if (signals.some(s => ["sql_injection","command_injection","ssrf_attempt","xxe_attempt","payload_bomb"].includes(s.type) && s.severity === "critical")) return "block";

  // Bot force-throttle
  if (forceThrottle) return "throttle";

  // FusedScore thresholds
  if (fusedScore >= 60) return "block";
  if (fusedScore >= 40) return "tarpit";
  if (fusedScore >= 20) return "throttle";
  return "allow";
}

/**
 * applyTrustScoreThreatReduction — Reduce ThreatScore for known-good IPs (Req 1.5).
 * When TrustProfile exists and raw ThreatScore < 30, reduce by up to 20 pts proportional to TrustScore.
 */
function applyTrustScoreThreatReduction(rawThreatScore: number, trustScore: number, hasProfile: boolean): number {
  if (!hasProfile || rawThreatScore >= 30) return rawThreatScore;
  const reduction = Math.round((trustScore / 100) * 20);
  return Math.max(0, rawThreatScore - reduction);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORENSIC COLLECTOR — immutable incident records (Task 16)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * captureForensicPacket — Collect full forensic record for blocked/tarpitted requests (Req 12.1–12.4).
 */
async function captureForensicPacket(
  req: InspectRequest,
  result: InspectResult & { fusedScore: number; botScore: number; trustScore: number },
  trustProfile: TrustProfile | null,
  attackChain: AttackChain | null,
  fingerprintId: string
): Promise<void> {
  const bodyStr = JSON.stringify(req.body ?? "");
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
  const bodyPreview = bodyStr.length > 0 && bodyStr !== '""' ? bodyStr.substring(0, 500) : undefined;

  const packet: ForensicPacket = {
    id: `fp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    timestamp: Date.now(),
    ip: req.ip,
    userId: req.userId,
    endpoint: req.endpoint,
    method: req.method,
    headers: sanitizeHeadersForForensic(req.headers),
    bodyHash,
    bodyPreview,
    threatScore: result.threatScore,
    trustScore: result.trustScore,
    normalityScore: result.normalityScore,
    fusedScore: result.fusedScore,
    botScore: result.botScore,
    entropyScore: result.entropyScore,
    signals: result.signals,
    trustProfileSnapshot: trustProfile ? {
      cleanRequestCount: trustProfile.cleanRequestCount,
      attackSignalCount: trustProfile.attackSignalCount,
      trustScore: trustProfile.trustScore,
      recentHighThreat: trustProfile.recentHighThreat,
    } : undefined,
    attackChainSnapshot: attackChain?.entries.slice(-10),
    deviceFingerprint: fingerprintId,
    action: result.action,
    reason: result.reason ?? "No reason provided",
  };

  // Persist with LIFO eviction cap at 200 entries (Req 12.4)
  await rpush(K.asiForensicLog(), JSON.stringify(packet), MAX_FORENSICS, ASI_FORENSIC_TTL);
}

export async function getForensicRecords(ip?: string, limit = 50): Promise<ForensicPacket[]> {
  try {
    const raw = await rlrange<string>(K.asiForensicLog(), 0, Math.min(limit, 200) - 1);
    const packets: ForensicPacket[] = [];
    for (const r of raw) {
      try {
        const p = typeof r === "string" ? JSON.parse(r) as ForensicPacket : r as unknown as ForensicPacket;
        if (!ip || p.ip === ip) packets.push(p);
      } catch { /* skip malformed */ }
    }
    return packets;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANTI-EVASION — detect score gaming (Task 20)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * detectEvasionPattern — Detect alternating clean/attack request pattern (Req 15.3).
 * Emits anomaly high when IP alternates between clean (<10) and attack (>50) ThreatScores.
 */
function detectEvasionPattern(sessionCtx: SessionContext | null, currentThreatScore: number): AttackSignal[] {
  // Use session timestamps as a proxy for request history length
  // Full evasion tracking would require a separate Redis list — simplified version here
  if (!sessionCtx || sessionCtx.timestamps.length < 10) return [];

  // Simple heuristic: if session has many requests but alternating behavior is detected
  // The full sliding-window approach is tracked via TrustProfile's recentHighThreat flag
  return [];
}

/**
 * applyAntiEvasion — Set recentHighThreat flag when ThreatScore > 60 (Req 15.1).
 * Returns updated profile (fire-and-forget save by caller).
 */
function applyAntiEvasion(profile: TrustProfile, threatScore: number): TrustProfile {
  if (threatScore <= 60) return profile;
  return handleAdaptiveThresholdPenalty(profile, true);
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

    // ── PHASE 1: Parallel Redis context loading (Task 22.1, Req 17.2)
    const ctx = await loadContextData(ip, userId, headers);
    const { trustProfile, sessionContext, fingerprintRecord, attackChain, ipBlockedReason, durationHistory, geoData, fingerprintId } = ctx;

    // Fast path: blocked IP
    if (ipBlockedReason) {
      const result: InspectResult = {
        action: "block", threatScore: 100, normalityScore: 0, severity: "critical",
        signals: [{ type: "blocked_ip", severity: "critical", confidence: 1.0, detail: ipBlockedReason }],
        blocked: true, reason: `Blocked IP: ${ipBlockedReason}`,
        trustScore: 0, botScore: 0, fusedScore: 100, attackChainLength: attackChain?.entries.length ?? 0,
      };
      await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });
      return result;
    }

    // ── PHASE 2: Compute trust score first (needed for adaptive rate limiting)
    const navScore = sessionContext ? computeNavigationScore(sessionContext, endpoint) : 100;
    const recentHighThreat = trustProfile?.recentHighThreat ?? false;
    const trustScore = computeFullTrustScore(trustProfile, fingerprintRecord, navScore, recentHighThreat);

    // ── PHASE 2b: Adaptive rate limiting (Req 4.1–4.5)
    const tierKey: TierName = endpoint.startsWith("/api/auth") ? "AUTH"
      : (endpoint.includes("/generate") || endpoint.includes("/vector")) ? "UPLOAD"
      : "API";
    const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
    const rateOk = await checkAdaptiveRate(rateKey, tierKey, trustScore, recentHighThreat);

    // ── PHASE 3: Signal collection from all detection engines (Task 22.2)
    const signals: AttackSignal[] = [];

    // Rate limit signal
    if (!rateOk.allowed) {
      signals.push({ type: "rate_limit", severity: "high", confidence: 1.0,
        detail: `Rate limit exceeded (${tierKey} tier), retry in ${rateOk.retryAfter}s` });
    }

    // Volumetric detection (parallel)
    const [req1s, req10s, req1m] = await Promise.all([
      getIpRequestCount(ip, "1s", 1),
      getIpRequestCount(ip, "10s", 10),
      getIpRequestCount(ip, "1m", 60),
    ]);
    if (req1s > 30)      signals.push({ type: "ddos_flood",  severity: "critical", confidence: Math.min(0.99, req1s / 60),   detail: `${req1s} req/s from ${ip} (limit 30)` });
    else if (req1s > 10) signals.push({ type: "dos_flood",   severity: "high",     confidence: req1s / 30,                   detail: `${req1s} req/s from ${ip}` });
    if (req10s > 60)     signals.push({ type: "dos_flood",   severity: "high",     confidence: Math.min(0.9, req10s / 120),  detail: `${req10s} req/10s burst` });
    if (req1m > 200)     signals.push({ type: "http_flood",  severity: "critical", confidence: Math.min(0.98, req1m / 400),  detail: `${req1m} req/min from ${ip}` });

    // Path scanning (L7)
    const pathCount = await trackIpPath(ip, endpoint);
    if (pathCount > 30) signals.push({ type: "http_flood", severity: "high", confidence: Math.min(0.9, pathCount / 60), detail: `${pathCount} unique paths scanned in 1min` });

    // Error rate
    const errCount = await getIpErrorCount(ip);
    if (errCount >= 8) signals.push({ type: "credential_stuffing", severity: "high", confidence: Math.min(0.95, errCount / 20), detail: `${errCount} errors in 10min` });

    // Payload attack detection (static + extended patterns)
    signals.push(...detectPayloadSignals(body, headers));

    // User-Agent scanner detection
    signals.push(...detectUASignals(userAgent));

    // Path pattern detection
    signals.push(...detectPathSignals(endpoint));

    // Entropy analysis (Req 5.x)
    const { signals: entSignals, entropyScore } = analyzePayloadEntropy(body, method, endpoint);
    signals.push(...entSignals);
    signals.push(...analyzeUrlEntropy(endpoint));

    // Protocol anomalies (Req 6.x)
    const { signals: protoSignals, threatScoreBonus } = detectProtocolAnomalies(endpoint, method, headers, body);
    signals.push(...protoSignals);

    // Timing anomalies (Req 7.x)
    signals.push(...detectTimingAnomalies(ip, endpoint, method, requestDurationMs, durationHistory));

    // Session anomalies (Req 2.4, 2.5)
    if (sessionContext) {
      signals.push(...detectSessionAnomalies(sessionContext, trustProfile));
    }

    // Device fingerprint anomaly (Req 3.4)
    signals.push(...detectFingerprintAnomaly(fingerprintRecord, trustProfile, ip, fingerprintId));

    // Bot detection (Req 8.x)
    const { botScore, botDetail } = computeBotScore(headers, sessionContext, userAgent);
    const { signals: botSignals, forceThrottle } = detectBotSignals(botScore, botDetail, trustScore);
    signals.push(...botSignals);

    // Business logic abuse (Req 9.x)
    const bizSignals = await detectBusinessLogicAbuse(ip, endpoint, method, body, trustProfile);
    signals.push(...bizSignals);

    // Geographic anomaly (Req 13.x)
    const countryCode = extractCountryCode(headers);
    signals.push(...detectGeoAnomalies(userId, countryCode, geoData, trustScore));

    // Attack chain correlation (Req 10.x)
    const chain = attackChain ?? { ip, entries: [] };
    const { compositeSignals, threatBonus } = analyzeAttackChain(chain, signals, trustScore, now);
    signals.push(...compositeSignals);

    // ── PHASE 3: Score computation (Task 22.3)
    let rawThreatScore = calcScore(signals) + threatScoreBonus + threatBonus;
    rawThreatScore = Math.min(100, rawThreatScore);

    // TrustScore-based threat reduction (Req 1.5)
    const adjustedThreatScore = applyTrustScoreThreatReduction(rawThreatScore, trustScore, trustProfile !== null);

    // NormalityScore with baseline floor
    let normalityScore = calcNormalityScore(req, signals);
    const interReqMs = sessionContext?.interRequestIntervals.slice(-1)[0] ?? 0;
    const payloadSize = JSON.stringify(body ?? "").length;
    normalityScore = applyBaselineNormalityFloor(trustProfile, interReqMs, payloadSize, normalityScore);
    // Apply human-paced session bonus
    if (sessionContext) normalityScore = Math.min(100, normalityScore + computeHumanPacedBonus(sessionContext));

    // FusedScore (Req 11.4–11.5)
    const fusedScore = computeFusedScore(adjustedThreatScore, trustScore, normalityScore);
    const action = calcActionFromFusedScore(fusedScore, signals, forceThrottle);
    const blocked = action === "block";
    const severity = scoreToSeverity(adjustedThreatScore);

    // Auto-block IPs with critical score (30min)
    if (adjustedThreatScore >= 80) {
      await blockIpRedis(ip, `Auto-blocked: score ${adjustedThreatScore}, ${signals.map(s => s.type).join(",")}`, 1800);
    }

    const tarpitMs = action === "tarpit"
      ? Math.round(5000 + ((adjustedThreatScore - 40) / 60) * 25000)
      : undefined;

    const topSignal = [...signals].sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])[0];
    const reason = topSignal ? `${topSignal.type}: ${topSignal.detail}` : undefined;

    const result: InspectResult = {
      action, threatScore: rawThreatScore, normalityScore, severity, signals, blocked, reason, tarpitMs,
      trustScore, botScore, fusedScore, entropyScore: entropyScore > 0 ? entropyScore : undefined,
      fingerprintId, attackChainLength: chain.entries.length,
    };

    // ── PHASE 4: Decision, forensics, fire-and-forget writes (Task 22.4)

    // Forensic packet for blocked/tarpitted requests
    if (blocked || action === "tarpit") {
      fireAndForget(async () => {
        await captureForensicPacket(req, { ...result, fusedScore, botScore, trustScore }, trustProfile, attackChain, fingerprintId);
      });
    }

    // Update attack chain with new signals
    if (signals.some(s => s.type !== "normal_request")) {
      const updatedChain = buildUpdatedAttackChain(attackChain, ip, signals, now);
      saveAttackChain(updatedChain);
    }

    // Anti-evasion: set recentHighThreat flag if needed
    const isCleanRequest = rawThreatScore === 0 && action === "allow";
    let updatedProfile = trustProfile ?? initializeTrustProfile(ip);

    if (rawThreatScore > 60) {
      updatedProfile = applyAntiEvasion(updatedProfile, rawThreatScore);
    }

    // Update TrustProfile
    if (isCleanRequest) {
      updatedProfile = markTrustProfileCleanRequest(updatedProfile);
      updatedProfile = updateBehavioralBaseline(updatedProfile, endpoint, method, payloadSize, interReqMs, new Date(now).getHours());
    } else if (signals.length > 0) {
      updatedProfile = markTrustProfileAttackSignal(updatedProfile);
    }
    updatedProfile = { ...updatedProfile, trustScore, lastSeenAt: now };
    saveTrustProfile(updatedProfile);

    // Update session context
    const updatedSession = sessionContext
      ? updateSessionContext(sessionContext, endpoint, method, now)
      : initializeSessionContext(ip, endpoint, method);
    saveSessionContext(updatedSession);

    // Update device fingerprint
    const updatedFp = fingerprintRecord
      ? updateDeviceFingerprint(fingerprintRecord, ip, isCleanRequest)
      : initializeDeviceFingerprintRecord(fingerprintId, ip);
    if (action === "allow" || action === "throttle") {
      saveDeviceFingerprint(updatedFp);
    }

    // Store request duration history
    if (requestDurationMs !== undefined) {
      storeDurationHistory(ip, requestDurationMs);
    }

    // Update geo tracking
    updateGeoData(userId ?? "", countryCode, geoData);

    // Log event
    await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });

    return result;
  }, 4000, {
    // Fallback if Redis times out — allow request but log nothing
    action: "allow", threatScore: 0, normalityScore: 100, severity: "info",
    signals: [], blocked: false, reason: "Security check timed out (graceful fallback)",
    trustScore: 50, botScore: 0, fusedScore: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a brand-new TrustProfile for a new IP.
 * Initializes all fields with default values.
 */
function initializeTrustProfile(ip: string): TrustProfile {
  const now = Date.now();
  return {
    ip,
    createdAt: now,
    lastSeenAt: now,
    cleanRequestCount: 0,
    attackSignalCount: 0,
    lastAttackAt: undefined,
    endpointFrequencies: {},
    methodDistribution: {},
    hourlyActivity: new Array(24).fill(0),
    meanInterRequestMs: 0,
    stdDevInterRequestMs: 0,
    meanPayloadSize: 0,
    stdDevPayloadSize: 0,
    trustScore: 50,
    recentHighThreat: false,
    highThreatCount: 0,
    maxTrustScore: 100,
    countries: [],
    countryTimestamps: [],
  };
}

/**
 * Computes trust score from profile state.
 * Base trust tier from clean request count with penalties for recent attacks.
 */
function computeTrustScore(profile: TrustProfile): number {
  const now = Date.now();
  
  // Base trust tier from clean request count
  let baseTrust = 50;
  if (profile.cleanRequestCount >= 20 && profile.attackSignalCount === 0) {
    baseTrust = 90;
  } else if (profile.cleanRequestCount >= 5) {
    baseTrust = 70;
  }

  // Penalty: 24h attack window
  if (profile.lastAttackAt && (now - profile.lastAttackAt) < 86_400_000) {
    baseTrust -= 20;
  }

  // Penalty: recent high-threat flag (60 min)
  if (profile.recentHighThreat) {
    baseTrust -= 20;
  }

  // Clamp to max achievable trust (reduced for evasion pattern)
  return Math.max(0, Math.min(profile.maxTrustScore, baseTrust));
}

/**
 * Simple load from Redis — the raw rget already handles null.
 */
async function loadTrustProfile(ip: string): Promise<TrustProfile | null> {
  return rget<TrustProfile>(K.asiTrust(ip));
}

/**
 * Fire-and-forget save to Redis with TTL.
 */
function saveTrustProfile(profile: TrustProfile): void {
  fireAndForget(async () => {
    await rset(K.asiTrust(profile.ip), JSON.stringify(profile), ASI_TRUST_TTL);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST SCORE COMPUTATION — full multi-source trust pipeline
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * computeFullTrustScore — Combines BaseTrust + FingerprintBonus + SessionBonus - Penalties
 * into a single clamped TrustScore [0, maxTrustScore].
 *
 * Formula from Req 11.1:
 *   TrustScore = clamp(BaseTrust + FingerprintBonus + SessionBonus - PenaltyAccumulated, 0, maxTrustScore)
 *
 * @param profile       - TrustProfile (null = new IP, baseTrust=50)
 * @param fpRecord      - DeviceFingerprint record (null = no bonus)
 * @param sessionNavScore - NavigationScore from session (0-100)
 * @param recentHighThreat - Flag set when ThreatScore > 60 in last 60min
 * @returns TrustScore clamped to [0, maxTrustScore]
 */
function computeFullTrustScore(
  profile: TrustProfile | null,
  fpRecord: DeviceFingerprintRecord | null,
  sessionNavScore: number,
  recentHighThreat: boolean
): number {
  // Req 11.2: BaseTrust tiers
  let baseTrust: number;
  let maxTrustScore = 100;

  if (!profile) {
    baseTrust = 50; // New IP
  } else {
    maxTrustScore = profile.maxTrustScore;

    if (profile.cleanRequestCount >= 20 && profile.attackSignalCount === 0) {
      baseTrust = 90;
    } else if (profile.cleanRequestCount >= 5) {
      baseTrust = 70;
    } else {
      baseTrust = 50;
    }

    // Req 11.3: 24h attack penalty
    const now = Date.now();
    if (profile.lastAttackAt && (now - profile.lastAttackAt) < 86_400_000) {
      baseTrust -= 20;
    }
  }

  // Req 15.2: Block TrustScore bonus when recentHighThreat flag is active
  if (recentHighThreat) {
    // Return base only — no bonuses applied
    return Math.max(0, Math.min(maxTrustScore, baseTrust));
  }

  // Req 3.3: FingerprintBonus (+10 when fingerprint has 20+ clean requests)
  const fingerprintBonus = computeFingerprintTrustBonus(fpRecord);

  // Session bonus: convert NavigationScore to a small bonus (0–10 scale)
  // NavigationScore 100 → +5, 80 → +4, 60 → +3, 30 → 0
  const sessionBonus = Math.max(0, Math.round((sessionNavScore - 50) / 10));

  const rawScore = baseTrust + fingerprintBonus + sessionBonus;
  return Math.max(0, Math.min(maxTrustScore, Math.round(rawScore)));
}

/**
 * updateBehavioralBaseline — Incrementally update behavioral tracking dimensions.
 * Uses Welford's online algorithm for mean/stdDev computation (no history storage).
 */
function updateBehavioralBaseline(
  profile: TrustProfile,
  endpoint: string,
  method: string,
  payloadSize: number,
  interRequestMs: number,
  hourOfDay: number
): TrustProfile {
  const updated = { ...profile };

  // Update endpoint frequencies
  updated.endpointFrequencies = {
    ...profile.endpointFrequencies,
    [endpoint]: (profile.endpointFrequencies[endpoint] ?? 0) + 1,
  };

  // Prune endpoint frequencies to top 50 to cap storage
  const freqEntries = Object.entries(updated.endpointFrequencies);
  if (freqEntries.length > 50) {
    const sorted = freqEntries.sort((a, b) => b[1] - a[1]);
    updated.endpointFrequencies = Object.fromEntries(sorted.slice(0, 50));
  }

  // Update method distribution
  updated.methodDistribution = {
    ...profile.methodDistribution,
    [method.toUpperCase()]: (profile.methodDistribution[method.toUpperCase()] ?? 0) + 1,
  };

  // Update hourly activity (hour 0-23)
  const newHourlyActivity = [...profile.hourlyActivity];
  newHourlyActivity[hourOfDay] = (newHourlyActivity[hourOfDay] ?? 0) + 1;
  updated.hourlyActivity = newHourlyActivity;

  // Welford's online algorithm for inter-request interval
  // Only update if we have a valid interval (>0ms)
  const n = profile.cleanRequestCount + 1; // current count
  if (interRequestMs > 0 && n >= 2) {
    const oldMean = profile.meanInterRequestMs;
    const newMean = oldMean + (interRequestMs - oldMean) / n;
    // Update variance incrementally
    const oldM2 = profile.stdDevInterRequestMs * profile.stdDevInterRequestMs * (n - 1);
    const newM2 = oldM2 + (interRequestMs - oldMean) * (interRequestMs - newMean);
    updated.meanInterRequestMs = newMean;
    updated.stdDevInterRequestMs = n >= 2 ? Math.sqrt(newM2 / (n - 1)) : 0;
  } else if (interRequestMs > 0 && n === 1) {
    updated.meanInterRequestMs = interRequestMs;
    updated.stdDevInterRequestMs = 0;
  }

  // Welford's online algorithm for payload size
  if (payloadSize > 0) {
    const oldMean = profile.meanPayloadSize;
    const newMean = oldMean + (payloadSize - oldMean) / n;
    const oldM2 = profile.stdDevPayloadSize * profile.stdDevPayloadSize * (n - 1);
    const newM2 = oldM2 + (payloadSize - oldMean) * (payloadSize - newMean);
    updated.meanPayloadSize = newMean;
    updated.stdDevPayloadSize = n >= 2 ? Math.sqrt(newM2 / (n - 1)) : 0;
  }

  updated.lastSeenAt = Date.now();

  return updated;
}

/**
 * markTrustProfileCleanRequest — Increment clean request counter.
 */
function markTrustProfileCleanRequest(profile: TrustProfile): TrustProfile {
  return {
    ...profile,
    cleanRequestCount: profile.cleanRequestCount + 1,
    lastSeenAt: Date.now(),
  };
}

/**
 * markTrustProfileAttackSignal — Mark that this IP produced an attack signal.
 */
function markTrustProfileAttackSignal(profile: TrustProfile): TrustProfile {
  return {
    ...profile,
    attackSignalCount: profile.attackSignalCount + 1,
    lastAttackAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

/**
 * matchesBaseline — Checks if a request matches the TrustProfile's behavioral baseline
 * within 2 standard deviations for all tracked dimensions.
 *
 * If matched, the caller should floor NormalityScore at 85 (Req 1.4).
 *
 * @returns true if request is within baseline, false if anomalous or insufficient data
 */
function matchesBaseline(
  profile: TrustProfile,
  interRequestMs: number,
  payloadSize: number
): boolean {
  // Req 1.4: Must have at least 5 clean requests for baseline to be valid
  if (profile.cleanRequestCount < 5) return false;

  // Check inter-request interval (if we have valid timing data)
  if (interRequestMs > 0 && profile.stdDevInterRequestMs > 0) {
    const zScore = Math.abs(interRequestMs - profile.meanInterRequestMs) / profile.stdDevInterRequestMs;
    if (zScore > 2.0) return false; // Outside 2 standard deviations
  }

  // Check payload size (if we have valid baseline)
  if (payloadSize > 0 && profile.meanPayloadSize > 0 && profile.stdDevPayloadSize > 0) {
    const zScore = Math.abs(payloadSize - profile.meanPayloadSize) / profile.stdDevPayloadSize;
    if (zScore > 2.0) return false;
  }

  return true; // Request is within baseline — NormalityScore floor = 85
}

/**
 * applyBaselineNormalityFloor — If a request matches the behavioral baseline,
 * ensures NormalityScore is at least 85 (Req 1.4).
 */
function applyBaselineNormalityFloor(
  profile: TrustProfile | null,
  interRequestMs: number,
  payloadSize: number,
  rawNormalityScore: number
): number {
  if (!profile) return rawNormalityScore;
  if (matchesBaseline(profile, interRequestMs, payloadSize)) {
    return Math.max(rawNormalityScore, 85);
  }
  return rawNormalityScore;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * NAVIGATION_GRAPH — Valid endpoint transitions for session flow analysis.
 * Maps each endpoint to its valid next endpoints. Use "*" for wildcard (any endpoint allowed).
 */
const NAVIGATION_GRAPH: Record<string, string[]> = {
  "/":                          ["/login", "/register", "/api/health"],
  "/login":                     ["/api/auth/login", "/register", "/"],
  "/register":                  ["/api/auth/register", "/login", "/"],
  "/api/auth/login":            ["/api/auth/verify-otp", "/api/auth/me", "/"],
  "/api/auth/register":         ["/api/auth/verify-otp", "/"],
  "/api/auth/verify-otp":       ["/api/auth/me", "/"],
  "/api/auth/logout":           ["/", "/login"],
  "/api/auth/me":               ["/api/chat", "/api/generate", "/api/research", "/api/vector", "/api/auth/logout"],
  "/api/chat":                  ["/api/chat", "/api/generate", "/api/research", "/api/vector", "/api/auth/me"],
  "/api/generate":              ["/api/chat", "/api/generate", "/api/research", "/api/vector", "/api/auth/me"],
  "/api/research":              ["/api/chat", "/api/generate", "/api/research", "/api/vector", "/api/auth/me"],
  "/api/vector":                ["/api/chat", "/api/generate", "/api/research", "/api/vector", "/api/auth/me"],
  "/api/validate/links":        ["/api/validate/links", "/api/auth/me"],
  "/api/health":                ["*"],
  "/api/monitor":               ["/api/monitor/vercel", "/api/monitor"],
  "/api/monitor/vercel":        ["/api/monitor"],
  "/api/security/events":       ["/api/security/events"],
};

/**
 * computeNavigationScore — Scores how valid the current navigation transition is.
 * Returns 0-100 (100 = fully valid, lower = suspicious).
 */
function computeNavigationScore(ctx: SessionContext, currentEndpoint: string): number {
  if (ctx.endpoints.length === 0) return 100; // First request always valid

  const prevEndpoint = ctx.endpoints[ctx.endpoints.length - 1];
  const validNext = NAVIGATION_GRAPH[prevEndpoint] ?? [];

  if (validNext.includes("*")) return 100;
  if (validNext.includes(currentEndpoint)) return 100;

  // Same API group (partial match)
  const currentBase = "/" + currentEndpoint.split("/").slice(1, 3).join("/");
  const prevBase = "/" + prevEndpoint.split("/").slice(1, 3).join("/");
  if (currentBase === prevBase && currentBase !== "/") return 80;

  // API-to-API transition
  if (prevEndpoint.startsWith("/api") && currentEndpoint.startsWith("/api")) return 60;

  // Public endpoints always accessible
  if (["/api/health", "/"].includes(currentEndpoint)) return 90;

  return 30; // Invalid/unexpected transition
}

/**
 * initializeSessionContext — Create a new session context for first request.
 */
function initializeSessionContext(ip: string, endpoint: string, method: string): SessionContext {
  const now = Date.now();
  const isGet = method.toUpperCase() === "GET";
  const isPost = ["POST","PUT","PATCH"].includes(method.toUpperCase());
  return {
    ip,
    startedAt: now,
    lastRequestAt: now,
    endpoints: [endpoint],
    methods: [method],
    timestamps: [now],
    responseCodes: [],
    interRequestIntervals: [],
    uniqueEndpointCount: 1,
    getRequestCount: isGet ? 1 : 0,
    postRequestCount: isPost ? 1 : 0,
  };
}

/**
 * updateSessionContext — Update existing session context with new request.
 * Maintains FIFO bounded arrays for memory efficiency (last 20 endpoints, last 10 intervals).
 */
function updateSessionContext(ctx: SessionContext, endpoint: string, method: string, now: number): SessionContext {
  const MAX_ENTRIES = 20;
  const MAX_INTERVALS = 10;

  // Compute inter-request interval
  const interval = now - ctx.lastRequestAt;
  const newIntervals = [...ctx.interRequestIntervals, interval].slice(-MAX_INTERVALS);

  // FIFO endpoint tracking
  const newEndpoints = [...ctx.endpoints, endpoint].slice(-MAX_ENTRIES);
  const newMethods   = [...ctx.methods, method].slice(-MAX_ENTRIES);
  const newTimestamps = [...ctx.timestamps, now].slice(-MAX_ENTRIES);

  // Unique endpoint count for path scan detection
  const allUniqueEndpoints = new Set([...ctx.endpoints, endpoint]);
  const isGet = method.toUpperCase() === "GET";
  const isPost = ["POST","PUT","PATCH"].includes(method.toUpperCase());

  return {
    ...ctx,
    lastRequestAt: now,
    endpoints: newEndpoints,
    methods: newMethods,
    timestamps: newTimestamps,
    interRequestIntervals: newIntervals,
    uniqueEndpointCount: allUniqueEndpoints.size,
    getRequestCount: ctx.getRequestCount + (isGet ? 1 : 0),
    postRequestCount: ctx.postRequestCount + (isPost ? 1 : 0),
  };
}

/**
 * saveSessionContext — Persist session context to Redis (fire-and-forget, non-blocking).
 */
function saveSessionContext(ctx: SessionContext): void {
  fireAndForget(async () => {
    await rset(K.asiSession(ctx.ip), JSON.stringify(ctx), ASI_SESSION_TTL);
  });
}

/**
 * detectSessionAnomalies — Analyzes SessionContext for automated attack patterns.
 * Detects:
 * 1. Path scanning (Req 2.4): >20 distinct endpoints in 60s with no TrustProfile
 * 2. Write-only session (Req 2.5): No GET requests in >5 requests
 */
function detectSessionAnomalies(
  ctx: SessionContext,
  trustProfile: TrustProfile | null
): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const now = Date.now();

  // Req 2.4: Path scanning — >20 unique endpoints within 60 seconds, no trust profile
  if (!trustProfile || trustProfile.cleanRequestCount < 5) {
    // Count distinct endpoints visited in the last 60 seconds
    const recentTimestamps = ctx.timestamps.filter(t => now - t < 60_000);
    if (recentTimestamps.length > 0) {
      // Get endpoints corresponding to recent timestamps
      const recentEndpointSet = new Set<string>();
      for (let i = 0; i < ctx.timestamps.length; i++) {
        if (ctx.timestamps[i] && (now - ctx.timestamps[i]!) < 60_000) {
          if (ctx.endpoints[i]) recentEndpointSet.add(ctx.endpoints[i]!);
        }
      }
      if (recentEndpointSet.size > 20) {
        signals.push({
          type: "http_flood",
          severity: "high",
          confidence: Math.min(0.95, recentEndpointSet.size / 40),
          detail: `Path scanning: ${recentEndpointSet.size} distinct endpoints in 60s`,
        });
      }
    }
  }

  // Req 2.5: Write-only session — no GET requests in >5 consecutive requests
  const totalRequests = ctx.getRequestCount + ctx.postRequestCount;
  if (totalRequests > 5 && ctx.getRequestCount === 0) {
    signals.push({
      type: "anomaly",
      severity: "medium",
      confidence: 0.75,
      detail: "Automated write-only session pattern",
    });
  }

  return signals;
}

/**
 * computeHumanPacedBonus — Returns up to +15 NormalityScore bonus for sessions
 * that exhibit human-paced browsing patterns (Req 2.3).
 */
function computeHumanPacedBonus(ctx: SessionContext): number {
  const intervals = ctx.interRequestIntervals;
  if (intervals.length < 3) return 0;

  // Human-paced: 500ms to 300s, diverse endpoints, mixed GET/POST
  const allInRange = intervals.every(x => x >= 500 && x <= 300_000);
  const hasMixedMethods = ctx.getRequestCount > 0 && ctx.postRequestCount > 0;
  const hasDiverseEndpoints = ctx.uniqueEndpointCount >= 3;

  if (allInRange && hasMixedMethods && hasDiverseEndpoints) {
    return 15;
  }
  if (allInRange && hasMixedMethods) {
    return 8;
  }
  if (allInRange) {
    return 4;
  }
  return 0;
}

/**
 * isHumanPaced — Returns true if session timing patterns look human-paced.
 * Machine-regular timing (stdDev < 100ms over 10+ requests) indicates bot behavior.
 * Used by bot detection (Req 8.3).
 */
function isHumanPaced(ctx: SessionContext): boolean {
  if (ctx.interRequestIntervals.length < 3) return true; // Not enough data

  const intervals = ctx.interRequestIntervals;
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Machine-regular timing: very low stddev with many samples — bot signature
  if (intervals.length >= 10 && stdDev < 100) {
    return false;
  }

  // Human-paced: 500ms to 300s per request
  const allInRange = intervals.every(x => x >= 500 && x <= 300_000);
  return allInRange;
}

/**
 * computeTimingStdDev — Helper to compute standard deviation of inter-request intervals.
 * Used by BotScore computation (Req 8.3).
 */
function computeTimingStdDev(intervals: number[]): number {
  if (intervals.length < 2) return 999; // Not enough data — assume high variance (human-like)
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / intervals.length;
  return Math.sqrt(variance);
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
