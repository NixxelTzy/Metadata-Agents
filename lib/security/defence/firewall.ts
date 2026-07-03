/**
 * lib/security/defence/firewall.ts — Advanced Firewall Engine
 *
 * Terintegrasi dengan core.ts untuk sistem pertahanan berlapis:
 * - Layer 1: Request validation & rate enforcement
 * - Layer 2: Payload deep inspection (XSS, SQLi, CMDi, XXE, SSRF, NoSQLi, SSTI)
 * - Layer 3: Behavioral anomaly detection
 * - Layer 4: Connection flood protection (UDP-style burst detection)
 * - Layer 5: Automatic challenge verification gate
 * - Layer 6: Real-time alert propagation to core.ts & monitoring
 *
 * PENTING: File ini berjalan di Node.js runtime (bukan Edge).
 * Untuk Edge, gunakan middleware.ts yang sudah ada.
 */

import crypto from "crypto";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import {
  inspect,
  getClientIp,
  manualBlockIp,
  recordIpError,
  type InspectRequest,
  type InspectResult,
  type AttackSignal,
  type Severity,
  type MitigationAction,
} from "@/lib/security/core";

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

let _fwRedis: Redis | null = null;
function getFwRedis(): Redis {
  if (_fwRedis) return _fwRedis;
  const { url, token } = getRedisConfig();
  if (!url || !token) throw new Error("Redis tidak dikonfigurasi");
  _fwRedis = new Redis({ url, token });
  return _fwRedis;
}
async function fwGet<T>(key: string): Promise<T | null> {
  try { return await getFwRedis().get<T>(key); } catch { return null; }
}
async function fwSet(key: string, val: unknown, ex?: number): Promise<void> {
  try {
    if (ex) await getFwRedis().set(key, val, { ex });
    else await getFwRedis().set(key, val);
  } catch { /* silent */ }
}
async function fwIncr(key: string, ex: number): Promise<number> {
  try {
    const v = await getFwRedis().incr(key);
    await getFwRedis().expire(key, ex);
    return v;
  } catch { return 0; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type FirewallDecision = "allow" | "challenge" | "block" | "tarpit";
export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type AttackCategory =
  | "flood" | "injection" | "xss" | "traversal" | "ssrf" | "bot"
  | "scanner" | "credential_stuffing" | "payload_bomb" | "proto_pollution"
  | "deserialization" | "ssti" | "ldap" | "nosql" | "open_redirect"
  | "protocol_anomaly" | "timing_attack" | "unknown";

export interface FirewallAlert {
  id: string;
  timestamp: number;
  ip: string;
  endpoint: string;
  method: string;
  category: AttackCategory;
  threatLevel: ThreatLevel;
  decision: FirewallDecision;
  detail: string;
  signals: AttackSignal[];
  requestMeta: {
    userAgent: string;
    contentLength?: number;
    headers: Record<string, string>;
    bodyPreview?: string;
  };
  coreResult?: InspectResult;
}

export interface FirewallContext {
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  userAgent: string;
  headers: Record<string, string>;
  body?: unknown;
  requestDurationMs?: number;
  challengeToken?: string;
}

export interface FirewallResult {
  decision: FirewallDecision;
  threatLevel: ThreatLevel;
  category: AttackCategory;
  reason: string;
  tarpitMs?: number;
  challengeRequired: boolean;
  challengeToken?: string;
  alert?: FirewallAlert;
  coreResult?: InspectResult;
  blockedAt?: number;
}

export interface ChallengeRecord {
  token: string;
  ip: string;
  createdAt: number;
  solvedAt?: number;
  attempts: number;
  browserFingerprint?: string;
  passed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS KEYS
// ═══════════════════════════════════════════════════════════════════════════════

const FW = {
  challenge:    (ip: string)     => `fw:challenge:${ip}`,
  challengeTok: (tok: string)    => `fw:tok:${tok}`,
  burst:        (ip: string, w: string) => `fw:burst:${w}:${ip}`,
  blocked:      (ip: string)     => `fw:block:${ip}`,
  alertLog:     ()               => `fw:alerts`,
  bypassToken:  (tok: string)    => `fw:bypass:${tok}`,
  verifyAttempt:(ip: string)     => `fw:vattempt:${ip}`,
  floodWindow:  (ip: string, w: string) => `fw:flood:${w}:${ip}`,
};

const MAX_ALERTS       = 300;
const ALERT_TTL        = 86400;      // 24h
const CHALLENGE_TTL    = 300;        // 5min to solve challenge
const BLOCK_TTL        = 3600;       // 1h for firewall blocks
const CHALLENGE_BYPASS_TTL = 43200; // 12h bypass after solved

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOD / BURST PROTECTION — Layer 1
// Detects UDP-style high-volume bursts and HTTP floods
// ═══════════════════════════════════════════════════════════════════════════════

interface BurstResult {
  isFlood: boolean;
  burstRate: number;
  window: string;
  detail: string;
}

async function checkBurst(ip: string): Promise<BurstResult> {
  // Count requests across multiple time windows simultaneously
  const [w100ms, w1s, w5s, w30s] = await Promise.all([
    fwIncr(FW.burst(ip, "100ms"), 1),
    fwIncr(FW.burst(ip, "1s"), 1),
    fwIncr(FW.burst(ip, "5s"), 5),
    fwIncr(FW.burst(ip, "30s"), 30),
  ]);

  // Thresholds: tuned to allow human usage but catch bots/floods
  if (w100ms > 8)  return { isFlood: true, burstRate: w100ms, window: "100ms", detail: `${w100ms} req/100ms — UDP-style burst flood` };
  if (w1s > 25)    return { isFlood: true, burstRate: w1s,    window: "1s",    detail: `${w1s} req/s — HTTP flood detected` };
  if (w5s > 80)    return { isFlood: true, burstRate: w5s,    window: "5s",    detail: `${w5s} req/5s — sustained flood` };
  if (w30s > 250)  return { isFlood: true, burstRate: w30s,   window: "30s",   detail: `${w30s} req/30s — volumetric attack` };

  return { isFlood: false, burstRate: w1s, window: "1s", detail: "" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP PAYLOAD INSPECTION — Layer 2
// ═══════════════════════════════════════════════════════════════════════════════

// Compiled once at module load — zero per-request regex compilation
const PAYLOAD_RULES: Array<{ pattern: RegExp; category: AttackCategory; severity: Severity; detail: string }> = [
  // XSS
  { pattern: /<script[\s>]/i,            category: "xss",           severity: "high",     detail: "XSS: <script> tag injection" },
  { pattern: /javascript\s*:/i,          category: "xss",           severity: "high",     detail: "XSS: javascript: URI" },
  { pattern: /on\w+\s*=\s*[^\s>]+/i,    category: "xss",           severity: "high",     detail: "XSS: inline event handler" },
  { pattern: /<svg[^>]*onload/i,         category: "xss",           severity: "critical", detail: "XSS: SVG onload vector" },
  { pattern: /document\.cookie/i,        category: "xss",           severity: "high",     detail: "XSS: cookie stealing" },
  // SQLi
  { pattern: /'\s*OR\s*'1'\s*=\s*'1/i,  category: "injection",     severity: "critical", detail: "SQLi: classic OR bypass" },
  { pattern: /UNION\s+ALL\s+SELECT/i,    category: "injection",     severity: "critical", detail: "SQLi: UNION SELECT exfil" },
  { pattern: /WAITFOR\s+DELAY/i,         category: "injection",     severity: "critical", detail: "SQLi: time-based blind" },
  { pattern: /;\s*DROP\s+TABLE/i,        category: "injection",     severity: "critical", detail: "SQLi: DROP TABLE" },
  { pattern: /xp_cmdshell/i,            category: "injection",     severity: "critical", detail: "SQLi: xp_cmdshell RCE" },
  // Command injection
  { pattern: /;\s*(ls|cat|id|whoami)\b/i, category: "injection",   severity: "critical", detail: "CMDi: shell command injection" },
  { pattern: /\$\([^)]{1,80}\)/,         category: "injection",    severity: "critical", detail: "CMDi: command substitution" },
  { pattern: /\/bin\/(ba)?sh/i,          category: "injection",    severity: "critical", detail: "CMDi: shell binary reference" },
  // Path traversal
  { pattern: /\.\.[/\\]/,               category: "traversal",     severity: "high",     detail: "Path traversal: ../ sequence" },
  { pattern: /\/etc\/passwd/i,           category: "traversal",     severity: "critical", detail: "Path traversal: /etc/passwd" },
  { pattern: /%252[Ff]/i,               category: "traversal",     severity: "high",     detail: "Path traversal: double-encoded" },
  // SSRF
  { pattern: /https?:\/\/169\.254\.\d+\.\d+/, category: "ssrf",    severity: "critical", detail: "SSRF: AWS metadata endpoint" },
  { pattern: /https?:\/\/127\.\d+\.\d+\.\d+/, category: "ssrf",   severity: "critical", detail: "SSRF: localhost target" },
  { pattern: /file:\/\//i,              category: "ssrf",          severity: "critical", detail: "SSRF: file:// protocol" },
  // XXE
  { pattern: /<!ENTITY\s+\w+\s+SYSTEM/i, category: "injection",   severity: "critical", detail: "XXE: entity injection" },
  // Prototype pollution
  { pattern: /"__proto__"\s*:/,          category: "proto_pollution", severity: "high",  detail: "Prototype pollution" },
  { pattern: /constructor\.prototype/i,  category: "proto_pollution", severity: "high",  detail: "Prototype pollution via constructor" },
  // NoSQLi
  { pattern: /\$where\s*:/i,            category: "nosql",         severity: "high",     detail: "NoSQLi: $where operator" },
  { pattern: /\$ne\s*:\s*null/i,        category: "nosql",         severity: "high",     detail: "NoSQLi: $ne null bypass" },
  // SSTI
  { pattern: /\{\{[^}]*7\s*\*\s*7/,    category: "ssti",          severity: "high",     detail: "SSTI: template expression probe" },
  { pattern: /\$\{[^}]*7\s*\*\s*7/,    category: "ssti",          severity: "high",     detail: "SSTI: JS template expression" },
  // Deserialization
  { pattern: /rO0AB/,                   category: "deserialization", severity: "critical", detail: "Java deserialization payload" },
  { pattern: /\bO:\d+:/,               category: "deserialization", severity: "critical", detail: "PHP deserialization payload" },
  // LDAP
  { pattern: /\)\(uid=\*\)/i,          category: "ldap",           severity: "high",     detail: "LDAP injection pattern" },
];

interface PayloadScanResult {
  detected: boolean;
  category: AttackCategory;
  severity: Severity;
  details: string[];
  signals: AttackSignal[];
}

function deepScanPayload(body: unknown, headers: Record<string, string>): PayloadScanResult {
  const signals: AttackSignal[] = [];
  const details: string[] = [];
  let topCategory: AttackCategory = "unknown";
  let topSeverity: Severity = "info";
  const sevOrder: Severity[] = ["info", "low", "medium", "high", "critical"];

  // Flatten body recursively (max depth 6)
  const flattenDeep = (v: unknown, d = 0): string => {
    if (d > 6) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(x => flattenDeep(x, d + 1)).join(" ");
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(x => flattenDeep(x, d + 1)).join(" ");
    return String(v ?? "");
  };

  const flat = flattenDeep(body);
  const safeHeaders = Object.entries(headers)
    .filter(([k]) => !["authorization", "cookie"].includes(k.toLowerCase()))
    .map(([k, v]) => `${k}: ${v}`).join(" ");
  const combined = flat + " " + safeHeaders;

  // Payload bomb detection
  if (flat.length > 5_000_000) {
    details.push(`Payload bomb: ${flat.length} bytes`);
    signals.push({ type: "payload_bomb", severity: "critical", confidence: 1.0, detail: `Payload ${flat.length} bytes exceeds 5MB` });
    topSeverity = "critical";
    topCategory = "payload_bomb";
  }

  for (const rule of PAYLOAD_RULES) {
    if (rule.pattern.test(combined)) {
      details.push(rule.detail);
      signals.push({ type: "anomaly", severity: rule.severity, confidence: 0.92, detail: rule.detail });
      if (sevOrder.indexOf(rule.severity) > sevOrder.indexOf(topSeverity)) {
        topSeverity = rule.severity;
        topCategory = rule.category;
      }
    }
  }

  return {
    detected: signals.length > 0,
    category: topCategory,
    severity: topSeverity,
    details,
    signals,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHALLENGE / VERIFICATION SYSTEM — Layer 5
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a cryptographic challenge token for the verification gate.
 * Token is bound to the IP and has a limited TTL.
 */
export async function generateChallengeToken(ip: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const record: ChallengeRecord = {
    token,
    ip,
    createdAt: Date.now(),
    attempts: 0,
    passed: false,
  };
  await fwSet(FW.challengeTok(token), JSON.stringify(record), CHALLENGE_TTL);
  await fwSet(FW.challenge(ip), token, CHALLENGE_TTL);
  return token;
}

/**
 * Verify a challenge token submitted by the client.
 * Validates IP binding, expiry, and attempt count.
 */
export async function verifyChallengeToken(
  token: string,
  ip: string,
  browserFingerprint?: string
): Promise<{ valid: boolean; reason: string }> {
  const raw = await fwGet<string>(FW.challengeTok(token));
  if (!raw) return { valid: false, reason: "Challenge token expired or invalid" };

  let record: ChallengeRecord;
  try { record = JSON.parse(raw) as ChallengeRecord; }
  catch { return { valid: false, reason: "Malformed challenge record" }; }

  // IP binding check (prevent token sharing)
  if (record.ip !== ip) return { valid: false, reason: "IP mismatch — token not valid for this client" };

  // Already solved
  if (record.passed) return { valid: true, reason: "Already verified" };

  // Expiry check
  if (Date.now() - record.createdAt > CHALLENGE_TTL * 1000) {
    return { valid: false, reason: "Challenge expired" };
  }

  // Max attempts (anti-brute force)
  if (record.attempts >= 5) {
    await manualBlockIp(ip, "Firewall: too many challenge attempts", BLOCK_TTL);
    return { valid: false, reason: "Too many attempts — IP blocked" };
  }

  // Mark as solved
  record.passed = true;
  record.solvedAt = Date.now();
  record.browserFingerprint = browserFingerprint;

  await Promise.all([
    fwSet(FW.challengeTok(token), JSON.stringify(record), CHALLENGE_TTL),
    fwSet(FW.bypassToken(ip), token, CHALLENGE_BYPASS_TTL), // 12h bypass
  ]);

  return { valid: true, reason: "Challenge passed" };
}

/**
 * Check if IP has an active bypass token (already solved challenge recently).
 */
export async function hasValidBypass(ip: string): Promise<boolean> {
  const tok = await fwGet<string>(FW.bypassToken(ip));
  return !!tok;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT PROPAGATION — Layer 6
// Real-time alerts to monitoring + core.ts
// ═══════════════════════════════════════════════════════════════════════════════

async function emitAlert(alert: FirewallAlert): Promise<void> {
  // Console log (visible in Vercel logs)
  const prefix = alert.threatLevel === "critical" ? "🚨 [FIREWALL CRITICAL]"
    : alert.threatLevel === "high" ? "⚠️ [FIREWALL HIGH]"
    : `🛡️ [FIREWALL ${alert.threatLevel.toUpperCase()}]`;

  console.log(`${prefix} ${alert.ip} | ${alert.method} ${alert.endpoint} | ${alert.category} | ${alert.detail}`);

  // Persist to Redis alert log (max 300 entries, 24h TTL)
  try {
    const r = getFwRedis();
    await r.lpush(FW.alertLog(), JSON.stringify(alert));
    await r.ltrim(FW.alertLog(), 0, MAX_ALERTS - 1);
    await r.expire(FW.alertLog(), ALERT_TTL);
  } catch { /* silent */ }

  // Auto-block IPs with critical threats
  if (alert.threatLevel === "critical") {
    await manualBlockIp(
      alert.ip,
      `Firewall auto-block: ${alert.category} — ${alert.detail}`,
      BLOCK_TTL
    );
  }

  // Record error in core.ts error tracking
  if (alert.threatLevel === "high" || alert.threatLevel === "critical") {
    await recordIpError(alert.ip);
  }
}

export async function getFirewallAlerts(limit = 100): Promise<FirewallAlert[]> {
  try {
    const r = getFwRedis();
    const raw = await r.lrange(FW.alertLog(), 0, Math.min(limit, MAX_ALERTS) - 1) as string[];
    const alerts: FirewallAlert[] = [];
    for (const item of raw) {
      try {
        const parsed = typeof item === "string" ? JSON.parse(item) : item;
        alerts.push(parsed as FirewallAlert);
      } catch { /* skip */ }
    }
    return alerts;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FIREWALL ENGINE — evaluate()
// Orchestrates all layers and returns a unified decision
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * evaluate() — Main firewall evaluation function.
 *
 * Call this in every API route handler before processing requests.
 * Integrates with core.ts inspect() for deep behavioral analysis.
 */
export async function evaluate(ctx: FirewallContext): Promise<FirewallResult> {
  const { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs, challengeToken } = ctx;
  const now = Date.now();

  // ── FAST PATH: Check firewall block list
  const fwBlocked = await fwGet<string>(FW.blocked(ip));
  if (fwBlocked) {
    const alert: FirewallAlert = {
      id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
      timestamp: now, ip, endpoint, method,
      category: "unknown", threatLevel: "critical",
      decision: "block",
      detail: `Firewall block active: ${fwBlocked}`,
      signals: [{ type: "blocked_ip", severity: "critical", confidence: 1.0, detail: fwBlocked }],
      requestMeta: { userAgent, headers },
    };
    await emitAlert(alert);
    return { decision: "block", threatLevel: "critical", category: "unknown", reason: fwBlocked, challengeRequired: false, alert, blockedAt: now };
  }

  // ── LAYER 1: Burst / Flood detection
  const burst = await checkBurst(ip);
  if (burst.isFlood) {
    const alert: FirewallAlert = {
      id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
      timestamp: now, ip, endpoint, method,
      category: "flood", threatLevel: "critical",
      decision: "block",
      detail: burst.detail,
      signals: [{ type: "ddos_flood", severity: "critical", confidence: Math.min(0.99, burst.burstRate / 50), detail: burst.detail }],
      requestMeta: { userAgent, headers },
    };
    await emitAlert(alert);
    await fwSet(FW.blocked(ip), burst.detail, BLOCK_TTL);
    return { decision: "block", threatLevel: "critical", category: "flood", reason: burst.detail, challengeRequired: false, alert, blockedAt: now };
  }

  // ── LAYER 2: Deep payload inspection
  const scan = deepScanPayload(body, headers);
  if (scan.detected && (scan.severity === "critical" || scan.severity === "high")) {
    const alert: FirewallAlert = {
      id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
      timestamp: now, ip, endpoint, method,
      category: scan.category, threatLevel: scan.severity as ThreatLevel,
      decision: scan.severity === "critical" ? "block" : "tarpit",
      detail: scan.details.join("; "),
      signals: scan.signals,
      requestMeta: {
        userAgent, headers,
        bodyPreview: typeof body === "string" ? body.substring(0, 200) : JSON.stringify(body ?? "").substring(0, 200),
      },
    };
    await emitAlert(alert);
    return {
      decision: alert.decision as FirewallDecision,
      threatLevel: scan.severity as ThreatLevel,
      category: scan.category,
      reason: scan.details[0] ?? "Malicious payload detected",
      tarpitMs: alert.decision === "tarpit" ? 8000 : undefined,
      challengeRequired: false, alert,
      blockedAt: alert.decision === "block" ? now : undefined,
    };
  }

  // ── LAYER 3: Core ASI deep analysis
  const inspectReq: InspectRequest = { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs };
  const coreResult = await inspect(inspectReq);

  // Propagate core.ts block decisions to firewall alert log
  if (coreResult.blocked || coreResult.action === "tarpit") {
    const topSignal = coreResult.signals[0];
    const alert: FirewallAlert = {
      id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
      timestamp: now, ip, endpoint, method,
      category: mapCoreTypeToCat(topSignal?.type ?? "anomaly"),
      threatLevel: mapScoreToLevel(coreResult.threatScore),
      decision: coreResult.action as FirewallDecision,
      detail: coreResult.reason ?? topSignal?.detail ?? "ASI detection",
      signals: coreResult.signals,
      requestMeta: { userAgent, headers },
      coreResult,
    };
    await emitAlert(alert);
    return {
      decision: coreResult.action as FirewallDecision,
      threatLevel: alert.threatLevel,
      category: alert.category,
      reason: alert.detail,
      tarpitMs: coreResult.tarpitMs,
      challengeRequired: false,
      alert, coreResult,
      blockedAt: coreResult.blocked ? now : undefined,
    };
  }

  // ── LAYER 4: Challenge gate for new/suspicious IPs
  // Medium-threat IPs or new visitors need to pass the challenge
  const needsChallenge = (coreResult.threatScore >= 20 && coreResult.action === "throttle")
    || (!coreResult.trustScore || coreResult.trustScore < 50);

  const bypass = await hasValidBypass(ip);

  if (needsChallenge && !bypass && !challengeToken) {
    const token = await generateChallengeToken(ip);
    return {
      decision: "challenge",
      threatLevel: "medium",
      category: "bot",
      reason: "Verification required for new or suspicious visitor",
      challengeRequired: true,
      challengeToken: token,
      coreResult,
    };
  }

  // Validate submitted challenge token
  if (challengeToken) {
    const verify = await verifyChallengeToken(challengeToken, ip);
    if (!verify.valid) {
      await recordIpError(ip);
      const alert: FirewallAlert = {
        id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
        timestamp: now, ip, endpoint, method,
        category: "bot", threatLevel: "high",
        decision: "block",
        detail: `Challenge failed: ${verify.reason}`,
        signals: [{ type: "bot_detected", severity: "high", confidence: 0.95, detail: verify.reason }],
        requestMeta: { userAgent, headers },
        coreResult,
      };
      await emitAlert(alert);
      return { decision: "block", threatLevel: "high", category: "bot", reason: verify.reason, challengeRequired: false, alert, coreResult, blockedAt: now };
    }
  }

  // ── ALLOW: All layers passed
  return {
    decision: "allow",
    threatLevel: "none",
    category: "unknown",
    reason: "Request passed all firewall layers",
    challengeRequired: false,
    coreResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function mapScoreToLevel(score: number): ThreatLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  if (score > 0)   return "low";
  return "none";
}

function mapCoreTypeToCat(type: string): AttackCategory {
  const map: Record<string, AttackCategory> = {
    xss_attempt: "xss", sql_injection: "injection", command_injection: "injection",
    path_traversal: "traversal", ssrf_attempt: "ssrf", xxe_attempt: "injection",
    prototype_pollution: "proto_pollution", scanner: "scanner", bot_detected: "bot",
    dos_flood: "flood", ddos_flood: "flood", http_flood: "flood",
    credential_stuffing: "credential_stuffing", payload_bomb: "payload_bomb",
    anomaly: "unknown",
  };
  return map[type] ?? "unknown";
}

// Middleware helper — lightweight check for Edge-adjacent use
export async function firewallCheck(ip: string, userAgent: string): Promise<{ blocked: boolean; reason: string }> {
  const fwBlocked = await fwGet<string>(FW.blocked(ip));
  if (fwBlocked) return { blocked: true, reason: fwBlocked };

  const burst = await checkBurst(ip);
  if (burst.isFlood) {
    await fwSet(FW.blocked(ip), burst.detail, BLOCK_TTL);
    return { blocked: true, reason: burst.detail };
  }

  return { blocked: false, reason: "" };
}
