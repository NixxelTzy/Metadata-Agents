/**
 * attackDefence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive attack detection and mitigation layer.
 * Handles: DDoS, DoS, Layer-7 floods, Slowloris, XSS, SQLi, Command/Path
 * injection, HTTP flood, amplification patterns, and more.
 *
 * Runs automatically — integrate via `attackDefence.inspect()` in API routes.
 * All tracking is in-memory with automatic cleanup (no external deps required).
 */

import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttackType =
  | "ddos_flood"
  | "dos_volumetric"
  | "layer7_flood"
  | "slowloris"
  | "http_flood"
  | "xss_attempt"
  | "sql_injection"
  | "command_injection"
  | "path_traversal"
  | "header_injection"
  | "amplification"
  | "credential_stuffing"
  | "scanner"
  | "payload_bomb"
  | "prototype_pollution"
  | "ssrf_attempt"
  | "xxe_attempt"
  | "open_redirect"
  | "null_byte"
  | "unicode_abuse";

export type MitigationAction =
  | "allow"
  | "challenge"   // Return a slow/heavy challenge response
  | "throttle"    // Enforce a delay before processing
  | "block"       // Reject immediately with 429/403
  | "tarpit"      // Accept but silently delay and waste attacker time
  | "drop";       // Drop silently (no response body)

export interface AttackSignal {
  type: AttackType;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number; // 0.0 – 1.0
  detail: string;
}

export interface InspectionResult {
  action: MitigationAction;
  threatScore: number; // 0 – 100
  signals: AttackSignal[];
  blocked: boolean;
  tarpitMs?: number;   // If action = 'tarpit', how many ms to stall
  challengeToken?: string;
}

// ─── Internal tracking stores ────────────────────────────────────────────────

interface ConnectionRecord {
  timestamps: number[];        // request timestamps (sliding window)
  bytesSent: number[];         // payload sizes
  slowRequests: number;        // requests with suspiciously large gap
  errors: number[];            // error timestamps
  lastSeen: number;
  circuitOpen: boolean;        // circuit breaker tripped
  circuitOpenUntil: number;
}

const connections = new Map<string, ConnectionRecord>();

// Active Slowloris detection: track partial-header connections
const slowlorisTracker = new Map<string, number[]>(); // ip → timestamps of slow/partial requests

// Layer-7 HTTP flood pattern: track unique paths per IP per minute
const pathsPerIp = new Map<string, Set<string>>();

// Circuit breaker state per endpoint
const endpointCircuits = new Map<string, { openUntil: number; failCount: number }>();

// ─── Thresholds ──────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Volumetric
  DOS_REQUESTS_PER_SECOND: 30,        // >30 req/s per IP → DoS
  DDOS_REQUESTS_PER_MINUTE: 500,      // >500 req/min per IP → DDoS
  HTTP_FLOOD_UNIQUE_PATHS_PER_MIN: 40,// >40 unique paths/min → L7 flood
  MAX_PAYLOAD_BYTES: 10 * 1024 * 1024,// 10 MB payload hard limit

  // Slowloris
  SLOWLORIS_PARTIAL_THRESHOLD: 5,     // ≥5 partial/slow requests in 60s
  REQUEST_TIMEOUT_SLOW_MS: 30_000,    // >30s to complete = suspicious

  // Scoring
  BLOCK_THRESHOLD: 70,   // threatScore ≥ 70 → block
  TARPIT_THRESHOLD: 45,  // threatScore 45–69 → tarpit
  CHALLENGE_THRESHOLD: 25, // threatScore 25–44 → challenge

  // Tarpit
  TARPIT_BASE_MS: 8_000,
  TARPIT_MAX_MS: 45_000,

  // Circuit breaker
  CIRCUIT_FAIL_THRESHOLD: 20,         // 20 errors → open circuit
  CIRCUIT_OPEN_DURATION_MS: 60_000,   // 60s
} as const;

// ─── Attack signature patterns ────────────────────────────────────────────────

const XSS_PATTERNS: RegExp[] = [
  /<script[\s>]/i, /<\/script>/i, /javascript\s*:/i, /vbscript\s*:/i,
  /on\w+\s*=\s*["']?[^"']*["']?/i, /<iframe/i, /<object/i, /<embed/i,
  /data\s*:\s*text\/html/i, /expression\s*\(/i, /-moz-binding/i,
  /document\.cookie/i, /document\.write/i, /window\.location/i,
  /eval\s*\(/i, /setTimeout\s*\(/i, /setInterval\s*\(/i,
  /String\.fromCharCode/i, /\balert\s*\(/i, /\bconfirm\s*\(/i,
  /&#x[0-9a-f]+;/i, /&#\d+;/, /\x00/,
];

const SQLI_PATTERNS: RegExp[] = [
  /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b|\bTRUNCATE\b)/i,
  /(\bUNION\b\s+\bSELECT\b)/i, /(--|#|\/\*|\*\/)/,
  /(\bOR\b\s+[\w'"]+\s*=\s*[\w'"]+)/i, /('\s*(OR|AND)\s*')/i,
  /;\s*(DROP|DELETE|INSERT|UPDATE|EXEC)/i, /WAITFOR\s+DELAY/i,
  /BENCHMARK\s*\(/i, /SLEEP\s*\(/i, /xp_cmdshell/i,
  /INTO\s+(OUTFILE|DUMPFILE)/i, /LOAD_FILE\s*\(/i,
  /'\s*OR\s*'1'\s*=\s*'1/i, /1=1/, /1\s*=\s*1/,
  /\bEXEC\b\s*\(/i, /\bCAST\s*\(/i, /\bCONVERT\s*\(/i,
];

const CMDI_PATTERNS: RegExp[] = [
  /[;&|`$]/, /\$\(/, /`[^`]*`/, /\|\|/, /&&(?!\w)/,
  /\b(ncat|netcat|wget|curl|bash|sh|zsh|cmd\.exe|powershell|perl|python|ruby|php)\b/i,
  /%0a|%0d|%00/i, /\bnslookup\b/i, /\bping\b.*-[nc]\s*\d/i,
  /\/bin\/(ba)?sh/i, /\\x[0-9a-f]{2}/i,
];

const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\.\//,  /\.\.\\/,  /\.\.%2[Ff]/, /\.\.%5[Cc]/,
  /%2E%2E%2F/i, /%252E/i, /\/etc\/passwd/i, /\/etc\/shadow/i,
  /\/proc\/self/i, /c:\\windows/i, /\/windows\/system32/i,
  /\.\.[/\\]/,
];

const SSRF_PATTERNS: RegExp[] = [
  /https?:\/\/(localhost|127\.|0\.0\.0\.0|::1|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i,
  /file:\/\//i, /gopher:\/\//i, /dict:\/\//i, /ftp:\/\//i,
  /\bmetadata\.google\b/i, /169\.254\.169\.254/,
  /\bec2-\d+-\d+-\d+-\d+\./i,
];

const PROTOTYPE_POLLUTION_PATTERNS: RegExp[] = [
  /__proto__/i, /constructor\s*\[/, /prototype\s*\[/,
  /"__proto__"\s*:/, /"constructor"\s*:.*"prototype"\s*:/,
];

const XXE_PATTERNS: RegExp[] = [
  /<!ENTITY/i, /<!DOCTYPE[^>]*\[/i, /SYSTEM\s+"file:/i,
  /SYSTEM\s+'file:/i, /PUBLIC\s+"-\/\//i,
];

const OPEN_REDIRECT_PATTERNS: RegExp[] = [
  /https?:\/\/[^/]*(?:\.ru|\.cn|\.tk|\.ml|\.ga|\.cf|\.gq)\//i,
  /\/\/[^/].*@/,
  /url=https?:\/\//i,
  /redirect=https?:\/\//i,
  /next=https?:\/\//i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateRecord(ip: string): ConnectionRecord {
  let rec = connections.get(ip);
  if (!rec) {
    rec = {
      timestamps: [],
      bytesSent: [],
      slowRequests: 0,
      errors: [],
      lastSeen: Date.now(),
      circuitOpen: false,
      circuitOpenUntil: 0,
    };
    connections.set(ip, rec);
  }
  return rec;
}

function trimWindow(arr: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return arr.filter((t) => t > cutoff);
}

function scanPayload(input: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(input));
}

function flattenToString(value: unknown, depth = 0): string {
  if (depth > 8) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => flattenToString(v, depth + 1)).join(" ");
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((v) => flattenToString(v, depth + 1))
      .join(" ");
  }
  return String(value ?? "");
}

function generateChallengeToken(ip: string): string {
  const data = `${ip}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`;
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

// ─── Core detection functions ─────────────────────────────────────────────────

function detectVolumetricAttack(ip: string): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const rec = getOrCreateRecord(ip);
  const now = Date.now();

  rec.timestamps.push(now);
  rec.lastSeen = now;

  const perSecond = trimWindow([...rec.timestamps], 1_000).length;
  const perMinute = trimWindow([...rec.timestamps], 60_000).length;

  rec.timestamps = trimWindow(rec.timestamps, 5 * 60_000);

  if (perSecond > THRESHOLDS.DOS_REQUESTS_PER_SECOND) {
    signals.push({
      type: "dos_volumetric",
      severity: perSecond > 100 ? "critical" : "high",
      confidence: Math.min(0.99, perSecond / (THRESHOLDS.DOS_REQUESTS_PER_SECOND * 2)),
      detail: `${perSecond} req/s from ${ip} (threshold: ${THRESHOLDS.DOS_REQUESTS_PER_SECOND})`,
    });
  }

  if (perMinute > THRESHOLDS.DDOS_REQUESTS_PER_MINUTE) {
    signals.push({
      type: "ddos_flood",
      severity: "critical",
      confidence: Math.min(0.99, perMinute / (THRESHOLDS.DDOS_REQUESTS_PER_MINUTE * 2)),
      detail: `${perMinute} req/min from ${ip} (threshold: ${THRESHOLDS.DDOS_REQUESTS_PER_MINUTE})`,
    });
  }

  return signals;
}

function detectLayer7Flood(ip: string, path: string): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const now = Date.now();

  // Maintain per-IP unique path set (reset every minute)
  let pathSet = pathsPerIp.get(ip);
  if (!pathSet) {
    pathSet = new Set();
    pathsPerIp.set(ip, pathSet);
    setTimeout(() => pathsPerIp.delete(ip), 60_000);
  }
  pathSet.add(path);

  if (pathSet.size > THRESHOLDS.HTTP_FLOOD_UNIQUE_PATHS_PER_MIN) {
    signals.push({
      type: "layer7_flood",
      severity: "high",
      confidence: Math.min(0.95, pathSet.size / (THRESHOLDS.HTTP_FLOOD_UNIQUE_PATHS_PER_MIN * 2)),
      detail: `${pathSet.size} unique paths/min from ${ip} — L7 flood pattern`,
    });
  }

  return signals;
}

function detectSlowloris(ip: string, requestDurationMs: number): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const now = Date.now();

  if (requestDurationMs > THRESHOLDS.REQUEST_TIMEOUT_SLOW_MS) {
    const times = slowlorisTracker.get(ip) ?? [];
    times.push(now);
    const recent = times.filter((t) => t > now - 60_000);
    slowlorisTracker.set(ip, recent);

    if (recent.length >= THRESHOLDS.SLOWLORIS_PARTIAL_THRESHOLD) {
      signals.push({
        type: "slowloris",
        severity: "high",
        confidence: Math.min(0.95, recent.length / (THRESHOLDS.SLOWLORIS_PARTIAL_THRESHOLD * 2)),
        detail: `${recent.length} slow/partial requests in 60s from ${ip}`,
      });
    }
  }

  return signals;
}

function detectPayloadAttacks(body: unknown, headers: Record<string, string>): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const flat = flattenToString(body);
  const headersFlat = Object.values(headers).join(" ");

  // Payload size bomb
  if (flat.length > THRESHOLDS.MAX_PAYLOAD_BYTES) {
    signals.push({
      type: "payload_bomb",
      severity: "high",
      confidence: 0.9,
      detail: `Payload size ${flat.length} bytes exceeds limit ${THRESHOLDS.MAX_PAYLOAD_BYTES}`,
    });
  }

  // XSS
  if (scanPayload(flat, XSS_PATTERNS) || scanPayload(headersFlat, XSS_PATTERNS)) {
    signals.push({
      type: "xss_attempt",
      severity: "high",
      confidence: 0.92,
      detail: "XSS pattern detected in request body or headers",
    });
  }

  // SQLi
  if (scanPayload(flat, SQLI_PATTERNS)) {
    signals.push({
      type: "sql_injection",
      severity: "critical",
      confidence: 0.9,
      detail: "SQL injection pattern detected in request body",
    });
  }

  // Command injection
  if (scanPayload(flat, CMDI_PATTERNS)) {
    signals.push({
      type: "command_injection",
      severity: "critical",
      confidence: 0.88,
      detail: "Command injection pattern detected",
    });
  }

  // Path traversal (including headers like Referer)
  const combined = flat + " " + headersFlat;
  if (scanPayload(combined, PATH_TRAVERSAL_PATTERNS)) {
    signals.push({
      type: "path_traversal",
      severity: "high",
      confidence: 0.9,
      detail: "Path traversal sequence detected",
    });
  }

  // SSRF
  if (scanPayload(flat, SSRF_PATTERNS)) {
    signals.push({
      type: "ssrf_attempt",
      severity: "critical",
      confidence: 0.93,
      detail: "SSRF target detected in request body",
    });
  }

  // Prototype pollution
  if (scanPayload(flat, PROTOTYPE_POLLUTION_PATTERNS)) {
    signals.push({
      type: "prototype_pollution",
      severity: "high",
      confidence: 0.85,
      detail: "Prototype pollution pattern detected",
    });
  }

  // XXE
  if (scanPayload(flat, XXE_PATTERNS)) {
    signals.push({
      type: "xxe_attempt",
      severity: "critical",
      confidence: 0.9,
      detail: "XXE entity pattern detected",
    });
  }

  // Open redirect
  if (scanPayload(flat, OPEN_REDIRECT_PATTERNS)) {
    signals.push({
      type: "open_redirect",
      severity: "medium",
      confidence: 0.75,
      detail: "Potential open redirect target detected",
    });
  }

  // Null byte injection
  if (/\x00|%00/i.test(flat)) {
    signals.push({
      type: "null_byte",
      severity: "high",
      confidence: 0.95,
      detail: "Null byte injection detected",
    });
  }

  // Unicode abuse (overlong encodings)
  if (/%c0%ae|%c0%af|%e0%80%ae/i.test(flat)) {
    signals.push({
      type: "unicode_abuse",
      severity: "high",
      confidence: 0.88,
      detail: "Overlong Unicode encoding detected (bypass attempt)",
    });
  }

  // Header injection
  if (/[\r\n]/.test(headersFlat)) {
    signals.push({
      type: "header_injection",
      severity: "high",
      confidence: 0.95,
      detail: "CRLF sequence detected in headers",
    });
  }

  return signals;
}

function detectScanner(userAgent: string, headers: Record<string, string>): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const SCANNER_UA = [
    "sqlmap", "nikto", "nmap", "masscan", "nessus", "openvas", "w3af",
    "acunetix", "arachni", "appscan", "burpsuite", "zaproxy", "owasp",
    "metasploit", "dirbuster", "gobuster", "wfuzz", "hydra", "medusa",
    "havij", "pangolin", "netsparker", "webinspect", "paros", "skipfish",
    "grabber", "vega", "fierce", "recon-ng", "maltego", "nuclei",
    "zgrab", "zmap", "censys", "shodan", "httpx", "ffuf", "feroxbuster",
  ];

  const ua = userAgent.toLowerCase();
  const matched = SCANNER_UA.find((s) => ua.includes(s));
  if (matched) {
    signals.push({
      type: "scanner",
      severity: "critical",
      confidence: 0.99,
      detail: `Known security scanner detected: ${matched}`,
    });
  }

  // Missing or empty User-Agent
  if (!userAgent || userAgent.trim().length < 5) {
    signals.push({
      type: "scanner",
      severity: "medium",
      confidence: 0.65,
      detail: "Missing or minimal User-Agent string",
    });
  }

  return signals;
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

/**
 * Trip the circuit breaker for an endpoint if too many errors occur.
 * While circuit is open, requests are immediately rejected.
 */
export function recordEndpointError(endpoint: string): void {
  const state = endpointCircuits.get(endpoint) ?? { openUntil: 0, failCount: 0 };
  state.failCount++;
  if (state.failCount >= THRESHOLDS.CIRCUIT_FAIL_THRESHOLD && state.openUntil === 0) {
    state.openUntil = Date.now() + THRESHOLDS.CIRCUIT_OPEN_DURATION_MS;
    console.warn(`[AttackDefence] Circuit OPEN for endpoint: ${endpoint}`);
  }
  endpointCircuits.set(endpoint, state);
}

export function isCircuitOpen(endpoint: string): boolean {
  const state = endpointCircuits.get(endpoint);
  if (!state) return false;
  if (state.openUntil > 0 && state.openUntil < Date.now()) {
    // Half-open: reset and allow one probe
    state.failCount = 0;
    state.openUntil = 0;
    endpointCircuits.set(endpoint, state);
    return false;
  }
  return state.openUntil > Date.now();
}

// ─── Score aggregation ────────────────────────────────────────────────────────

function aggregateScore(signals: AttackSignal[]): number {
  const weights: Record<AttackSignal["severity"], number> = {
    low: 10,
    medium: 25,
    high: 45,
    critical: 70,
  };
  let score = 0;
  for (const s of signals) {
    score += weights[s.severity] * s.confidence;
  }
  return Math.min(Math.round(score), 100);
}

function determineAction(score: number, signals: AttackSignal[]): MitigationAction {
  // Always block known scanners and critical injections
  const hasHardBlock = signals.some(
    (s) => s.type === "scanner" && s.confidence >= 0.9
  );
  if (hasHardBlock) return "block";

  const hasCritical = signals.some((s) => s.severity === "critical" && s.confidence >= 0.85);
  if (hasCritical) return "block";

  if (score >= THRESHOLDS.BLOCK_THRESHOLD) return "block";
  if (score >= THRESHOLDS.TARPIT_THRESHOLD) return "tarpit";
  if (score >= THRESHOLDS.CHALLENGE_THRESHOLD) return "challenge";
  return "allow";
}

function calculateTarpitMs(score: number): number {
  // Higher score → longer tarpit, up to TARPIT_MAX_MS
  const factor = Math.max(0, score - THRESHOLDS.TARPIT_THRESHOLD) / (100 - THRESHOLDS.TARPIT_THRESHOLD);
  return Math.round(THRESHOLDS.TARPIT_BASE_MS + factor * (THRESHOLDS.TARPIT_MAX_MS - THRESHOLDS.TARPIT_BASE_MS));
}

// ─── Main inspection API ──────────────────────────────────────────────────────

export interface InspectOptions {
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  requestDurationMs?: number;
}

/**
 * Inspect an incoming request for attacks.
 * Call this at the start of every API handler.
 *
 * @param opts - Request metadata and body
 * @returns InspectionResult with action, threat score, and signals
 */
export function inspect(opts: InspectOptions): InspectionResult {
  const signals: AttackSignal[] = [
    ...detectVolumetricAttack(opts.ip),
    ...detectLayer7Flood(opts.ip, opts.path),
    ...(opts.requestDurationMs !== undefined
      ? detectSlowloris(opts.ip, opts.requestDurationMs)
      : []),
    ...detectPayloadAttacks(opts.body ?? {}, opts.headers),
    ...detectScanner(opts.userAgent, opts.headers),
  ];

  // Circuit breaker check
  if (isCircuitOpen(opts.path)) {
    signals.push({
      type: "layer7_flood",
      severity: "critical",
      confidence: 1.0,
      detail: `Circuit breaker OPEN for endpoint ${opts.path}`,
    });
  }

  const threatScore = aggregateScore(signals);
  const action = determineAction(threatScore, signals);
  const blocked = action === "block" || action === "drop";
  const tarpitMs = action === "tarpit" ? calculateTarpitMs(threatScore) : undefined;
  const challengeToken =
    action === "challenge" ? generateChallengeToken(opts.ip) : undefined;

  return { action, threatScore, signals, blocked, tarpitMs, challengeToken };
}

// ─── Automatic cleanup ────────────────────────────────────────────────────────

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoff = now - 10 * 60_000; // 10 minutes

  for (const [ip, rec] of connections.entries()) {
    if (rec.lastSeen < cutoff) connections.delete(ip);
    else rec.timestamps = trimWindow(rec.timestamps, 5 * 60_000);
  }

  for (const [ip, times] of slowlorisTracker.entries()) {
    const fresh = times.filter((t) => t > now - 60_000);
    if (fresh.length === 0) slowlorisTracker.delete(ip);
    else slowlorisTracker.set(ip, fresh);
  }

  for (const [ep, state] of endpointCircuits.entries()) {
    if (state.openUntil > 0 && state.openUntil < now && state.failCount < THRESHOLDS.CIRCUIT_FAIL_THRESHOLD) {
      endpointCircuits.delete(ep);
    }
  }
}, 5 * 60_000);

if (cleanupInterval.unref) cleanupInterval.unref();

// ─── Singleton export ─────────────────────────────────────────────────────────

export const attackDefence = { inspect, recordEndpointError, isCircuitOpen };
export default attackDefence;
