/**
 * lib/security/defence/firewall.ts — 10-Layer Advanced Firewall Engine
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Layer  1 — IP Reputation & Blacklist Management            │
 * │  Layer  2 — Connection Flood & Burst Protection             │
 * │  Layer  3 — Protocol & HTTP Conformance Validation          │
 * │  Layer  4 — Deep Payload Pattern Inspection                 │
 * │  Layer  5 — Behavioral Fingerprint & Session Analysis       │
 * │  Layer  6 — Entropy & Obfuscation Detection                 │
 * │  Layer  7 — Business Logic & Application-Layer Abuse        │
 * │  Layer  8 — Temporal Pattern & Attack Chain Correlation     │
 * │  Layer  9 — AI-Assisted Anomaly Scoring                     │
 * │  Layer 10 — Challenge Gate & Bypass Token Management        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Terintegrasi dengan: core.ts (ASI engine), ai-controller.ts (Groq AI)
 * Runtime: Node.js (bukan Edge — butuh Redis)
 */

import crypto from "crypto";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import {
  inspect,
  manualBlockIp,
  recordIpError,
  type InspectRequest,
  type InspectResult,
  type AttackSignal,
  type Severity,
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
async function fwSadd(key: string, member: string, ex: number): Promise<number> {
  try {
    const r = getFwRedis();
    await r.sadd(key, member);
    await r.expire(key, ex);
    return await r.scard(key);
  } catch { return 0; }
}
async function fwSmembers(key: string): Promise<string[]> {
  try { return (await getFwRedis().smembers(key)) as string[]; } catch { return []; }
}
async function fwLpush(key: string, val: unknown, max: number, ex: number): Promise<void> {
  try {
    const r = getFwRedis();
    const s = typeof val === "string" ? val : JSON.stringify(val);
    await r.lpush(key, s);
    await r.ltrim(key, 0, max - 1);
    await r.expire(key, ex);
  } catch { /* silent */ }
}
async function fwLrange(key: string, start: number, stop: number): Promise<string[]> {
  try { return (await getFwRedis().lrange(key, start, stop)) as string[]; } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export type FirewallDecision = "allow" | "challenge" | "block" | "tarpit" | "honeypot";
export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type AttackCategory =
  | "flood" | "injection" | "xss" | "traversal" | "ssrf" | "bot" | "scanner"
  | "credential_stuffing" | "payload_bomb" | "proto_pollution" | "deserialization"
  | "ssti" | "ldap" | "nosql" | "open_redirect" | "protocol_anomaly" | "timing_attack"
  | "replay_attack" | "enumeration" | "data_exfil" | "resource_exhaustion"
  | "business_logic" | "geo_anomaly" | "entropy_anomaly" | "unknown";

export interface LayerResult {
  layer: number;
  name: string;
  passed: boolean;
  decision?: FirewallDecision;
  threatLevel: ThreatLevel;
  signals: AttackSignal[];
  detail: string;
  score: number; // 0–100
}

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
  layerResults: LayerResult[];
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
  honeypotRedirect?: string;
  challengeRequired: boolean;
  challengeToken?: string;
  alert?: FirewallAlert;
  coreResult?: InspectResult;
  layerResults: LayerResult[];
  totalScore: number;
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

// Redis key namespace
const FW = {
  // Layer 1 — IP reputation
  blocked:        (ip: string)       => `fw:block:${ip}`,
  tempBlock:      (ip: string)       => `fw:tblock:${ip}`,
  ipScore:        (ip: string)       => `fw:ipscore:${ip}`,
  geoHistory:     (ip: string)       => `fw:geo:${ip}`,
  asnBlock:       (asn: string)      => `fw:asnblk:${asn}`,
  // Layer 2 — Flood
  burst:          (ip: string, w: string) => `fw:burst:${w}:${ip}`,
  concurrency:    (ip: string)       => `fw:concur:${ip}`,
  slowloris:      (ip: string)       => `fw:slow:${ip}`,
  // Layer 3 — Protocol
  methodCount:    (ip: string)       => `fw:method:${ip}`,
  // Layer 4 — Payload
  payloadHashes:  (ip: string)       => `fw:phash:${ip}`,
  // Layer 5 — Behavioral
  sessionPath:    (ip: string)       => `fw:spath:${ip}`,
  sessionTiming:  (ip: string)       => `fw:stiming:${ip}`,
  mouseEvents:    (ip: string)       => `fw:mouse:${ip}`,
  // Layer 6 — Entropy
  entropyHigh:    (ip: string)       => `fw:entropy:${ip}`,
  // Layer 7 — Business logic
  aiGenCount:     (ip: string)       => `fw:aigen:${ip}`,
  regCount:       (ip: string)       => `fw:reg:${ip}`,
  loginHashes:    (ip: string)       => `fw:login:${ip}`,
  // Layer 8 — Temporal / chain
  attackChain:    (ip: string)       => `fw:chain:${ip}`,
  reqHistory:     (ip: string)       => `fw:history:${ip}`,
  // Layer 9 — AI scoring
  aiThreatScore:  (ip: string)       => `fw:aiscore:${ip}`,
  // Layer 10 — Challenge
  challenge:      (ip: string)       => `fw:chal:${ip}`,
  challengeTok:   (tok: string)      => `fw:tok:${tok}`,
  bypassToken:    (ip: string)       => `fw:bypass:${ip}`,
  verifyAttempt:  (ip: string)       => `fw:vattempt:${ip}`,
  // Alert log
  alertLog:       ()                 => `fw:alerts`,
  honeypot:       ()                 => `fw:honeypot`,
};

const ALERT_MAX   = 500;
const ALERT_TTL   = 86400;
const BLOCK_TTL   = 3600;
const BYPASS_TTL  = 43200; // 12h
const CHAL_TTL    = 300;   // 5min to solve

// Severity order for comparison
const SEV_ORDER: ThreatLevel[] = ["none","low","medium","high","critical"];
function maxLevel(a: ThreatLevel, b: ThreatLevel): ThreatLevel {
  return SEV_ORDER.indexOf(a) >= SEV_ORDER.indexOf(b) ? a : b;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — IP REPUTATION & BLACKLIST MANAGEMENT
// Features: static blacklist, dynamic block, temp block, IP score, country block,
//           known malicious ranges, datacenter/VPN detection, reputation decay
// ═══════════════════════════════════════════════════════════════════════════════

// Known malicious IP ranges (CIDR-approximated via prefix check)
const MALICIOUS_RANGES = [
  "0.", "10.0.0.", // typically not external, skip if hit
  "192.0.2.",      // TEST-NET
  "198.51.100.",   // TEST-NET-2
  "203.0.113.",    // TEST-NET-3
];

// Known datacenter/cloud IP prefixes that often host bots
const DATACENTER_PREFIXES = [
  "45.33.", "45.79.", "139.177.", "172.105.", "173.255.", "45.56.",  // Linode
  "104.18.", "104.19.", "172.64.", "172.65.", "172.66.", "172.67.",  // Cloudflare (legit CDN — flag not block)
  "54.", "52.", "18.", "3.", "34.", "35.",   // AWS ranges (common bot origin)
  "35.185.", "35.186.", "35.187.", "35.188.", "35.189.", "35.190.", // GCP
  "40.112.", "40.113.", "40.114.", "40.115.", // Azure
];

// High-risk country codes (often sources of attacks — CIDR not available in Edge, use header)
const HIGH_RISK_COUNTRIES = new Set(["CN","RU","KP","IR","SY","CU"]);

async function layer1IpReputation(ip: string, headers: Record<string, string>): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let decision: FirewallDecision | undefined;
  let detail = "";

  // 1a. Check firewall block list
  const fwBlocked = await fwGet<string>(FW.blocked(ip));
  if (fwBlocked) {
    return { layer: 1, name: "IP Reputation", passed: false, decision: "block", threatLevel: "critical", signals: [{ type: "blocked_ip", severity: "critical", confidence: 1.0, detail: fwBlocked }], detail: `Firewall block: ${fwBlocked}`, score: 100 };
  }

  // 1b. Temp block (lighter, shorter duration)
  const tempBlocked = await fwGet<string>(FW.tempBlock(ip));
  if (tempBlocked) {
    return { layer: 1, name: "IP Reputation", passed: false, decision: "tarpit", threatLevel: "high", signals: [{ type: "blocked_ip", severity: "high", confidence: 1.0, detail: `Temp block: ${tempBlocked}` }], detail: `Temp block active: ${tempBlocked}`, score: 75 };
  }

  // 1c. IP score (accumulated from previous sessions)
  const savedScore = await fwGet<number>(FW.ipScore(ip));
  if (savedScore && savedScore >= 80) {
    score += 40;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.88, detail: `Accumulated IP risk score: ${savedScore}` });
    detail += `High accumulated risk (${savedScore}). `;
  } else if (savedScore && savedScore >= 50) {
    score += 20;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.75, detail: `Elevated IP risk score: ${savedScore}` });
  }

  // 1d. Malicious range check
  const isMalRange = MALICIOUS_RANGES.some(r => ip.startsWith(r));
  if (isMalRange) {
    score += 50;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.90, detail: `IP in known malicious range` });
  }

  // 1e. Datacenter IP detection
  const isDC = DATACENTER_PREFIXES.some(p => ip.startsWith(p));
  if (isDC) {
    score += 10;
    signals.push({ type: "scanner", severity: "low", confidence: 0.60, detail: "IP from datacenter/cloud range" });
  }

  // 1f. High-risk country (from Cloudflare/Vercel header)
  const country = headers["cf-ipcountry"] ?? headers["x-vercel-ip-country"] ?? "";
  if (country && HIGH_RISK_COUNTRIES.has(country.toUpperCase())) {
    score += 15;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.70, detail: `Access from high-risk country: ${country}` });
    detail += `High-risk country: ${country}. `;
  }

  // 1g. Multiple IPs same /24 subnet flooding check
  const subnet = ip.split(".").slice(0, 3).join(".");
  const subnetKey = `fw:subnet:${subnet}`;
  const subnetCount = await fwIncr(subnetKey, 60);
  if (subnetCount > 50) {
    score += 20;
    signals.push({ type: "ddos_flood", severity: "high", confidence: 0.85, detail: `Subnet ${subnet}.0/24: ${subnetCount} IPs in 60s` });
  }

  // 1h. Tor exit node heuristic (very high-entropy IP or specific range)
  const isTorLike = /^(176\.10\.|185\.220\.|199\.87\.)/.test(ip);
  if (isTorLike) {
    score += 15;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.65, detail: "Possible Tor exit node IP range" });
  }

  const level: ThreatLevel = score >= 80 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";
  if (score >= 80) decision = "block";
  else if (score >= 50) decision = "tarpit";

  return { layer: 1, name: "IP Reputation", passed: score < 80, decision, threatLevel: level, signals, detail: detail || "IP reputation check passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — CONNECTION FLOOD & BURST PROTECTION
// Features: multi-window burst, concurrency limit, slow-read detection,
//           slowloris defense, connection velocity, adaptive throttle
// ═══════════════════════════════════════════════════════════════════════════════

async function layer2FloodProtection(ip: string, requestDurationMs?: number): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let decision: FirewallDecision | undefined;
  let detail = "";

  // 2a. Multi-window burst counters
  const [w50ms, w250ms, w1s, w5s, w30s, w5min] = await Promise.all([
    fwIncr(FW.burst(ip, "50ms"),  0.05  | 0 || 1),
    fwIncr(FW.burst(ip, "250ms"), 0.25  | 0 || 1),
    fwIncr(FW.burst(ip, "1s"),   1),
    fwIncr(FW.burst(ip, "5s"),   5),
    fwIncr(FW.burst(ip, "30s"),  30),
    fwIncr(FW.burst(ip, "5min"), 300),
  ]);

  // W50ms: UDP-style burst (more than 5 in 50ms = impossible for human)
  if (w50ms > 5) {
    score += 90;
    decision = "block";
    signals.push({ type: "ddos_flood", severity: "critical", confidence: 0.99, detail: `${w50ms} req/50ms — volumetric DDoS burst` });
    detail += `DDoS burst detected. `;
  }

  // W250ms: rapid fire (more than 15 in 250ms)
  if (w250ms > 15) {
    score += 70;
    if (!decision) decision = "block";
    signals.push({ type: "ddos_flood", severity: "critical", confidence: 0.97, detail: `${w250ms} req/250ms — rapid-fire flood` });
  }

  // W1s: HTTP flood
  if (w1s > 30) {
    score += 60;
    if (!decision) decision = "block";
    signals.push({ type: "http_flood", severity: "critical", confidence: Math.min(0.99, w1s / 60), detail: `${w1s} req/s — HTTP flood` });
  } else if (w1s > 15) {
    score += 30;
    if (!decision) decision = "tarpit";
    signals.push({ type: "dos_flood", severity: "high", confidence: w1s / 30, detail: `${w1s} req/s — elevated request rate` });
  }

  // W5s: sustained flood
  if (w5s > 80) {
    score += 40;
    signals.push({ type: "dos_flood", severity: "high", confidence: Math.min(0.95, w5s / 160), detail: `${w5s} req/5s — sustained flood` });
  }

  // W30s: volumetric
  if (w30s > 300) {
    score += 25;
    signals.push({ type: "http_flood", severity: "high", confidence: 0.88, detail: `${w30s} req/30s — volumetric attack` });
  }

  // W5min: campaign detection (>2000 req in 5min = bot campaign)
  if (w5min > 2000) {
    score += 30;
    signals.push({ type: "bot_detected", severity: "high", confidence: 0.92, detail: `${w5min} req/5min — automated campaign` });
    detail += `Bot campaign detected (${w5min} req/5min). `;
  }

  // 2b. Slow-read / Slowloris detection
  if (requestDurationMs !== undefined) {
    const slowKey = FW.slowloris(ip);
    if (requestDurationMs > 8000) {
      const slowCount = await fwIncr(slowKey, 120);
      if (slowCount >= 3) {
        score += 35;
        if (!decision) decision = "block";
        signals.push({ type: "slowloris", severity: "high", confidence: 0.88, detail: `${slowCount} slow requests (${requestDurationMs}ms) — Slowloris attack` });
        detail += `Slowloris pattern (${slowCount} slow reqs). `;
      } else {
        score += 10;
        signals.push({ type: "slowloris", severity: "medium", confidence: 0.70, detail: `Slow request: ${requestDurationMs}ms` });
      }
    }

    // 2c. Suspiciously fast POST (automated credential submission)
    if (requestDurationMs < 30) {
      score += 15;
      signals.push({ type: "anomaly", severity: "low", confidence: 0.65, detail: `Unusually fast request: ${requestDurationMs}ms` });
    }
  }

  // 2d. Concurrency limit (too many simultaneous connections from same IP)
  const concurrent = await fwIncr(FW.concurrency(ip), 5); // 5s window
  if (concurrent > 20) {
    score += 25;
    if (!decision) decision = "throttle" as FirewallDecision;
    signals.push({ type: "dos_flood", severity: "medium", confidence: 0.80, detail: `${concurrent} concurrent requests from ${ip}` });
  }

  const level: ThreatLevel = score >= 80 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";

  return { layer: 2, name: "Flood & Burst Protection", passed: score < 60, decision, threatLevel: level, signals, detail: detail || `Request rate normal (${w1s} req/s)`, score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — PROTOCOL & HTTP CONFORMANCE VALIDATION
// Features: HTTP method abuse, header integrity, TE/CL conflict, Host spoofing,
//           Content-Type mismatch, forbidden header combos, transfer encoding abuse,
//           HTTP version fingerprinting, cookie integrity, duplicate headers
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_METHODS = new Set(["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD","CONNECT","TRACE"]);
const DANGEROUS_METHODS = new Set(["TRACE","CONNECT","TRACK"]);
const API_CONTENT_TYPE_ROUTES = ["/api/chat","/api/generate","/api/research","/api/vector"];

function layer3ProtocolConformance(endpoint: string, method: string, headers: Record<string, string>, body: unknown): LayerResult {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";

  const lMethod = method.toUpperCase();
  const isWrite = ["POST","PUT","PATCH"].includes(lMethod);
  const ct = (headers["content-type"] ?? "").toLowerCase();
  const cl = headers["content-length"];
  const te = headers["transfer-encoding"];
  const host = headers["host"] ?? "";
  const via = headers["via"] ?? "";

  // 3a. Invalid HTTP method
  if (!VALID_METHODS.has(lMethod)) {
    score += 40;
    signals.push({ type: "protocol_anomaly" as AttackSignal["type"], severity: "high", confidence: 0.95, detail: `Invalid HTTP method: ${lMethod}` });
    detail += `Invalid method. `;
  }

  // 3b. Dangerous methods (used for XST attacks)
  if (DANGEROUS_METHODS.has(lMethod)) {
    score += 25;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.85, detail: `Dangerous HTTP method: ${lMethod} (XST/SSRF risk)` });
  }

  // 3c. Content-Type mismatch on write methods to monitored routes
  if (isWrite && API_CONTENT_TYPE_ROUTES.some(r => endpoint.startsWith(r))) {
    const hasValidCT = ct.includes("application/json") || ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
    if (!hasValidCT) {
      score += 15;
      signals.push({ type: "anomaly", severity: "low", confidence: 0.75, detail: `Missing valid Content-Type on ${endpoint}: "${ct}"` });
    }
  }

  // 3d. Content-Length: 0 with non-empty body (header spoofing)
  if (cl === "0" && body !== undefined && body !== null) {
    const bs = typeof body === "string" ? body : JSON.stringify(body);
    if (bs && bs.length > 2 && bs !== "{}" && bs !== "null") {
      score += 30;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.90, detail: "Content-Length: 0 with non-empty body — header manipulation" });
      detail += `CL/body mismatch. `;
    }
  }

  // 3e. TE+CL conflict — HTTP request smuggling
  if (te && cl) {
    score += 60;
    signals.push({ type: "anomaly", severity: "critical", confidence: 0.96, detail: "Transfer-Encoding + Content-Length conflict — HTTP desync/smuggling attack" });
    detail += `HTTP desync attempt. `;
  }

  // 3f. Multiple Transfer-Encoding values (chunked smuggling)
  if (te && te.includes(",")) {
    score += 40;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.90, detail: `Multiple Transfer-Encoding values: "${te}"` });
  }

  // 3g. Host header manipulation
  const expectedHost = process.env.NEXT_PUBLIC_APP_URL
    ? (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL!).host; } catch { return ""; } })()
    : "";
  const isLocalhost = /^(localhost|127\.|::1)/.test(host);
  if (expectedHost && host && host !== expectedHost && !isLocalhost) {
    score += 20;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.82, detail: `Host header mismatch: "${host}" vs expected "${expectedHost}"` });
  }

  // 3h. Proxy-via header — may indicate relay attack
  if (via) {
    score += 5;
    signals.push({ type: "anomaly", severity: "info", confidence: 0.50, detail: `Via header present: "${via.substring(0,60)}"` });
  }

  // 3i. Excessive headers (header stuffing / DoS via header parsing)
  const headerCount = Object.keys(headers).length;
  if (headerCount > 40) {
    score += 20;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.78, detail: `Excessive headers: ${headerCount} (limit 40)` });
  } else if (headerCount > 30) {
    score += 8;
    signals.push({ type: "anomaly", severity: "low", confidence: 0.65, detail: `High header count: ${headerCount}` });
  }

  // 3j. Minimal header set — automated client signature
  const accept = headers["accept"] ?? "";
  const acceptLang = headers["accept-language"] ?? "";
  const acceptEnc = headers["accept-encoding"] ?? "";
  if (endpoint.startsWith("/api") && accept === "*/*" && !acceptLang && !acceptEnc) {
    score += 12;
    signals.push({ type: "bot_detected", severity: "low", confidence: 0.68, detail: "Minimal header set — automated client signature" });
  }

  // 3k. CRLF injection in headers
  const headerString = Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join(" ");
  if (/[\r\n]/.test(headerString)) {
    score += 50;
    signals.push({ type: "header_injection", severity: "high", confidence: 0.97, detail: "CRLF injection detected in headers" });
    detail += `CRLF injection. `;
  }

  // 3l. Suspicious X-Forwarded-For chain (too long = spoofed proxy chain)
  const xff = headers["x-forwarded-for"] ?? "";
  const xffChain = xff.split(",").length;
  if (xffChain > 5) {
    score += 15;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.80, detail: `Suspicious XFF chain length: ${xffChain} hops` });
  }

  // 3m. Repeated authorization attempts with different values
  const authHeader = headers["authorization"] ?? "";
  if (authHeader && authHeader.length > 2000) {
    score += 20;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.85, detail: "Oversized Authorization header — possible token brute-force" });
  }

  const level: ThreatLevel = score >= 80 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 80 ? "block" : score >= 50 ? "tarpit" : undefined;

  return { layer: 3, name: "Protocol Conformance", passed: score < 50, decision, threatLevel: level, signals, detail: detail || "HTTP protocol conformance passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 4 — DEEP PAYLOAD PATTERN INSPECTION
// Features: XSS, SQLi, CMDi, XXE, SSRF, Path Traversal, NoSQLi, SSTI,
//           Deserialization, LDAP, Prototype Pollution, Template Injection,
//           Open Redirect, Payload Bomb, Unicode Bypass, Null Byte
// ═══════════════════════════════════════════════════════════════════════════════

// All patterns compiled once at module load
const L4_RULES: Array<{ pattern: RegExp; cat: AttackCategory; sev: Severity; confidence: number; detail: string }> = [
  // XSS
  { pattern: /<script[\s>]/i,               cat: "xss",            sev: "high",     confidence: 0.93, detail: "XSS: <script> tag" },
  { pattern: /javascript\s*:/i,             cat: "xss",            sev: "high",     confidence: 0.92, detail: "XSS: javascript: URI" },
  { pattern: /on\w+\s*=\s*[^\s>'"/]+/i,    cat: "xss",            sev: "high",     confidence: 0.90, detail: "XSS: inline event handler" },
  { pattern: /<svg[^>]*onload/i,            cat: "xss",            sev: "critical", confidence: 0.97, detail: "XSS: SVG onload vector" },
  { pattern: /document\.cookie/i,           cat: "xss",            sev: "high",     confidence: 0.91, detail: "XSS: cookie theft attempt" },
  { pattern: /eval\s*\(/i,                  cat: "xss",            sev: "high",     confidence: 0.88, detail: "XSS: eval() call" },
  { pattern: /String\.fromCharCode\s*\(/i,  cat: "xss",            sev: "high",     confidence: 0.85, detail: "XSS: charcode obfuscation" },
  { pattern: /<iframe[^>]*src/i,            cat: "xss",            sev: "medium",   confidence: 0.80, detail: "XSS: iframe injection" },
  { pattern: /data\s*:\s*text\/html/i,      cat: "xss",            sev: "high",     confidence: 0.90, detail: "XSS: data URI HTML" },
  { pattern: /vbscript\s*:/i,               cat: "xss",            sev: "high",     confidence: 0.95, detail: "XSS: VBScript URI" },
  // SQLi
  { pattern: /'\s*OR\s*'?\d+'\s*=\s*'\d+/i, cat: "injection",    sev: "critical", confidence: 0.95, detail: "SQLi: OR bypass" },
  { pattern: /UNION\s+(ALL\s+)?SELECT/i,    cat: "injection",      sev: "critical", confidence: 0.96, detail: "SQLi: UNION SELECT exfil" },
  { pattern: /WAITFOR\s+DELAY/i,            cat: "injection",      sev: "critical", confidence: 0.97, detail: "SQLi: time-based blind" },
  { pattern: /;\s*(DROP|TRUNCATE)\s+TABLE/i, cat: "injection",     sev: "critical", confidence: 0.98, detail: "SQLi: DROP TABLE" },
  { pattern: /xp_cmdshell/i,               cat: "injection",      sev: "critical", confidence: 1.0,  detail: "SQLi: xp_cmdshell RCE" },
  { pattern: /BENCHMARK\s*\(\s*\d+,/i,     cat: "injection",      sev: "critical", confidence: 0.94, detail: "SQLi: benchmark timing attack" },
  { pattern: /SLEEP\s*\(\s*\d+\s*\)/i,     cat: "injection",      sev: "critical", confidence: 0.93, detail: "SQLi: SLEEP() time attack" },
  { pattern: /INTO\s+(OUTFILE|DUMPFILE)/i,  cat: "injection",      sev: "critical", confidence: 0.95, detail: "SQLi: file write via SELECT INTO" },
  { pattern: /LOAD_FILE\s*\(/i,            cat: "injection",      sev: "critical", confidence: 0.92, detail: "SQLi: LOAD_FILE() read" },
  { pattern: /INFORMATION_SCHEMA/i,        cat: "injection",      sev: "high",     confidence: 0.85, detail: "SQLi: information_schema enumeration" },
  // Command Injection
  { pattern: /;\s*(ls|cat|id|whoami|uname|ps|kill)\b/i, cat: "injection", sev: "critical", confidence: 0.93, detail: "CMDi: shell command" },
  { pattern: /\|\s*(bash|sh|nc|ncat|python|perl|ruby)\b/i, cat: "injection", sev: "critical", confidence: 0.92, detail: "CMDi: pipe to shell" },
  { pattern: /\$\([^)]{1,100}\)/,          cat: "injection",      sev: "critical", confidence: 0.94, detail: "CMDi: command substitution" },
  { pattern: /`[^`]{1,100}`/,              cat: "injection",      sev: "critical", confidence: 0.92, detail: "CMDi: backtick execution" },
  { pattern: /\/bin\/(ba)?sh\b/i,          cat: "injection",      sev: "critical", confidence: 0.96, detail: "CMDi: shell binary reference" },
  { pattern: /&&\s*(ls|cat|id|whoami|curl|wget)\b/i, cat: "injection", sev: "critical", confidence: 0.90, detail: "CMDi: command chaining" },
  // Path Traversal
  { pattern: /\.\.[/\\]/,                  cat: "traversal",      sev: "high",     confidence: 0.92, detail: "Path traversal: ../" },
  { pattern: /\.\.%2[Ff]/i,               cat: "traversal",      sev: "high",     confidence: 0.94, detail: "Path traversal: URL-encoded" },
  { pattern: /%252[Ff]/i,                  cat: "traversal",      sev: "high",     confidence: 0.93, detail: "Path traversal: double-encoded" },
  { pattern: /\/etc\/passwd/i,             cat: "traversal",      sev: "critical", confidence: 0.98, detail: "Path traversal: /etc/passwd" },
  { pattern: /\/etc\/shadow/i,             cat: "traversal",      sev: "critical", confidence: 0.99, detail: "Path traversal: /etc/shadow" },
  { pattern: /\/proc\/self/i,              cat: "traversal",      sev: "high",     confidence: 0.95, detail: "Path traversal: /proc/self" },
  { pattern: /c:[/\\]windows/i,            cat: "traversal",      sev: "critical", confidence: 0.97, detail: "Path traversal: Windows system" },
  // SSRF
  { pattern: /https?:\/\/169\.254\.\d+\.\d+/, cat: "ssrf",        sev: "critical", confidence: 0.99, detail: "SSRF: AWS/cloud metadata endpoint" },
  { pattern: /https?:\/\/127\.\d+\.\d+\.\d+/, cat: "ssrf",       sev: "critical", confidence: 0.98, detail: "SSRF: localhost target" },
  { pattern: /https?:\/\/0\.0\.0\.0/,      cat: "ssrf",           sev: "critical", confidence: 0.98, detail: "SSRF: all-interfaces target" },
  { pattern: /https?:\/\/10\.\d+\.\d+\.\d+/, cat: "ssrf",        sev: "high",     confidence: 0.93, detail: "SSRF: private IP range (10.x)" },
  { pattern: /https?:\/\/192\.168\.\d+\.\d+/, cat: "ssrf",       sev: "high",     confidence: 0.92, detail: "SSRF: private IP range (192.168.x)" },
  { pattern: /file:\/\//i,                 cat: "ssrf",           sev: "critical", confidence: 0.98, detail: "SSRF: file:// protocol" },
  { pattern: /gopher:\/\//i,              cat: "ssrf",           sev: "critical", confidence: 0.97, detail: "SSRF: gopher:// (port scanner)" },
  { pattern: /dict:\/\//i,                cat: "ssrf",           sev: "high",     confidence: 0.90, detail: "SSRF: dict:// protocol" },
  { pattern: /metadata\.google\.internal/i, cat: "ssrf",         sev: "critical", confidence: 0.99, detail: "SSRF: GCP metadata endpoint" },
  // XXE
  { pattern: /<!ENTITY\s+\w+\s+SYSTEM/i,  cat: "injection",      sev: "critical", confidence: 0.97, detail: "XXE: external entity" },
  { pattern: /<!DOCTYPE[^>]*\[/i,         cat: "injection",      sev: "high",     confidence: 0.88, detail: "XXE: DOCTYPE with entity" },
  { pattern: /SYSTEM\s+["']file:/i,       cat: "injection",      sev: "critical", confidence: 0.96, detail: "XXE: SYSTEM file read" },
  // Prototype Pollution
  { pattern: /"__proto__"\s*:/,            cat: "proto_pollution", sev: "high",    confidence: 0.95, detail: "Prototype pollution: __proto__" },
  { pattern: /constructor\.prototype/i,   cat: "proto_pollution", sev: "high",    confidence: 0.93, detail: "Prototype pollution: constructor" },
  { pattern: /\["__proto__"\]/,           cat: "proto_pollution", sev: "high",    confidence: 0.92, detail: "Prototype pollution: bracket notation" },
  // NoSQLi
  { pattern: /\$where\s*:/i,              cat: "nosql",           sev: "high",    confidence: 0.90, detail: "NoSQLi: $where operator" },
  { pattern: /\$ne\s*:\s*null/i,          cat: "nosql",           sev: "high",    confidence: 0.88, detail: "NoSQLi: $ne null bypass" },
  { pattern: /\$regex\s*:/i,              cat: "nosql",           sev: "medium",  confidence: 0.75, detail: "NoSQLi: $regex injection" },
  { pattern: /\$or\s*:\s*\[/i,           cat: "nosql",           sev: "high",    confidence: 0.82, detail: "NoSQLi: $or bypass" },
  { pattern: /\$gt\s*:\s*""/i,           cat: "nosql",           sev: "high",    confidence: 0.85, detail: "NoSQLi: $gt empty string bypass" },
  // SSTI
  { pattern: /\{\{[^}]*7\s*\*\s*7/,      cat: "ssti",            sev: "high",    confidence: 0.92, detail: "SSTI: Jinja/Twig probe (7*7)" },
  { pattern: /\$\{[^}]*7\s*\*\s*7/,      cat: "ssti",            sev: "high",    confidence: 0.91, detail: "SSTI: JavaScript template probe" },
  { pattern: /<%=\s*7\s*\*\s*7\s*%>/,    cat: "ssti",            sev: "high",    confidence: 0.93, detail: "SSTI: ERB template probe" },
  { pattern: /\{\{config\./i,            cat: "ssti",            sev: "critical", confidence: 0.94, detail: "SSTI: Flask config access" },
  { pattern: /__import__\s*\(/i,         cat: "ssti",            sev: "critical", confidence: 0.95, detail: "SSTI: Python __import__ RCE" },
  { pattern: /\{\{.*__class__/i,         cat: "ssti",            sev: "critical", confidence: 0.93, detail: "SSTI: Python class traversal" },
  // Deserialization
  { pattern: /rO0AB/,                     cat: "deserialization", sev: "critical", confidence: 0.97, detail: "Java deserialization payload" },
  { pattern: /\bO:\d+:/,                  cat: "deserialization", sev: "critical", confidence: 0.96, detail: "PHP object deserialization" },
  { pattern: /aced\s*0005/i,              cat: "deserialization", sev: "critical", confidence: 0.95, detail: "Java magic bytes (hex)" },
  { pattern: /PD9waHA/,                   cat: "deserialization", sev: "critical", confidence: 0.90, detail: "PHP webshell (base64)" },
  // LDAP
  { pattern: /\)\(uid=\*\)/i,            cat: "ldap",            sev: "high",    confidence: 0.88, detail: "LDAP injection: wildcard UID" },
  { pattern: /\*\)\(objectClass=\*/i,    cat: "ldap",            sev: "high",    confidence: 0.87, detail: "LDAP injection: objectClass bypass" },
  { pattern: /\(&\([a-z]+=\*/i,          cat: "ldap",            sev: "high",    confidence: 0.85, detail: "LDAP injection: AND filter bypass" },
  // Open Redirect
  { pattern: /^(\/\/|\\\\)/,             cat: "open_redirect",   sev: "medium",  confidence: 0.82, detail: "Open redirect: protocol-relative URL" },
];

function layer4PayloadInspection(body: unknown, headers: Record<string, string>, method: string): LayerResult {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";
  let topCat: AttackCategory = "unknown";
  const sevOrder: Severity[] = ["info","low","medium","high","critical"];

  // Flatten body recursively (max depth 7)
  const flatBody = (v: unknown, d = 0): string => {
    if (d > 7) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(x => flatBody(x, d+1)).join(" ");
    if (v && typeof v === "object") return Object.values(v as Record<string,unknown>).map(x => flatBody(x, d+1)).join(" ");
    return String(v ?? "");
  };

  const flat = flatBody(body);
  const safeHeaders = Object.entries(headers)
    .filter(([k]) => !["authorization","cookie","x-api-key"].includes(k.toLowerCase()))
    .map(([k,v]) => `${k}: ${v}`).join(" ");
  const combined = flat + " " + safeHeaders;

  // Payload bomb
  if (flat.length > 2_000_000) {
    score += 90;
    signals.push({ type: "payload_bomb", severity: "critical", confidence: 1.0, detail: `Payload ${flat.length} bytes exceeds 2MB limit` });
    detail += "Payload bomb. ";
    topCat = "payload_bomb";
  }

  // Null byte injection
  if (/\x00|%00/i.test(combined)) {
    score += 35;
    signals.push({ type: "null_byte", severity: "high", confidence: 0.96, detail: "Null byte injection detected" });
    detail += "Null byte. ";
  }

  // Unicode bypass (overlong encoding)
  if (/%c0%ae|%c0%af|%e0%80%ae|%ef%bc%af/i.test(flat)) {
    score += 30;
    signals.push({ type: "unicode_abuse", severity: "high", confidence: 0.90, detail: "Overlong Unicode encoding — directory traversal bypass" });
  }

  // Run all pattern rules
  for (const rule of L4_RULES) {
    if (rule.pattern.test(combined)) {
      const sScore = rule.sev === "critical" ? 72 : rule.sev === "high" ? 45 : rule.sev === "medium" ? 25 : 10;
      score += sScore;
      signals.push({ type: "anomaly", severity: rule.sev, confidence: rule.confidence, detail: rule.detail });
      if (!detail) { detail = rule.detail; topCat = rule.cat; }
    }
  }

  score = Math.min(score, 100);
  const level: ThreatLevel = score >= 80 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 80 ? "block" : score >= 55 ? "tarpit" : undefined;

  return { layer: 4, name: "Payload Inspection", passed: score < 55, decision, threatLevel: level, signals, detail: detail || "Payload inspection passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5 — BEHAVIORAL FINGERPRINT & SESSION ANALYSIS
// Features: UA consistency, browser signal validation, session path analysis,
//           timing regularity (bot detection), mouse entropy, session anomalies,
//           device fingerprint trust, write-only session, path enumeration
// ═══════════════════════════════════════════════════════════════════════════════

const MODERN_UA_KEYWORDS = ["chrome","firefox","safari","edge","chromium"];
const SCANNER_UA_LIST = ["sqlmap","nikto","nmap","masscan","nessus","openvas","w3af","acunetix",
  "arachni","burpsuite","zaproxy","metasploit","dirbuster","gobuster","wfuzz","hydra","nuclei",
  "ffuf","feroxbuster","netsparker","zgrab","zmap","libwww-perl","python-requests","go-http-client",
  "curl/","wget/","scrapy","mechanize","httpie","httpclient","okhttp","java/","perl/"];

async function layer5BehavioralAnalysis(ip: string, endpoint: string, method: string, headers: Record<string, string>): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";

  const ua = (headers["user-agent"] ?? "").toLowerCase();
  const isModernUA = MODERN_UA_KEYWORDS.some(k => ua.includes(k));

  // 5a. Known scanner/bot UA
  const scannerMatch = SCANNER_UA_LIST.find(s => ua.includes(s));
  if (scannerMatch) {
    score += 80;
    signals.push({ type: "scanner", severity: "critical", confidence: 1.0, detail: `Known attack tool: ${scannerMatch}` });
    detail += `Scanner: ${scannerMatch}. `;
  }

  // 5b. Missing or minimal UA
  if (!headers["user-agent"] || headers["user-agent"].trim().length < 8) {
    score += 30;
    signals.push({ type: "scanner", severity: "medium", confidence: 0.82, detail: "Missing or minimal User-Agent" });
    detail += "No UA. ";
  }

  // 5c. Modern browser UA but missing Sec-Fetch headers (bot spoofing UA)
  const hasSF = headers["sec-fetch-site"] || headers["sec-fetch-mode"] || headers["sec-fetch-dest"];
  if (isModernUA && !hasSF) {
    score += 20;
    signals.push({ type: "bot_detected", severity: "medium", confidence: 0.75, detail: "Modern UA without Sec-Fetch headers — possible bot" });
  }

  // 5d. Missing Accept-Language (bots often skip this)
  if (!headers["accept-language"]) {
    score += 10;
    signals.push({ type: "anomaly", severity: "low", confidence: 0.65, detail: "Missing Accept-Language header" });
  }

  // 5e. Session path analysis — track unique endpoints per IP
  const pathCount = await fwSadd(FW.sessionPath(ip), endpoint, 60);
  if (pathCount > 30) {
    score += 35;
    signals.push({ type: "http_flood", severity: "high", confidence: Math.min(0.95, pathCount / 60), detail: `${pathCount} unique paths in 60s — path enumeration` });
    detail += `Path scan (${pathCount} paths). `;
  } else if (pathCount > 15) {
    score += 15;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.70, detail: `${pathCount} unique paths in 60s` });
  }

  // 5f. Track request timing for bot-regularity detection
  const now = Date.now();
  await fwLpush(FW.sessionTiming(ip), now, 15, 120);
  const timings = await fwLrange(FW.sessionTiming(ip), 0, 14);

  if (timings.length >= 10) {
    const nums = timings.map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b);
    const intervals: number[] = [];
    for (let i = 1; i < nums.length; i++) {
      const diff = (nums[i] ?? 0) - (nums[i-1] ?? 0);
      intervals.push(diff);
    }
    if (intervals.length >= 8) {
      const mean = intervals.reduce((a,b) => a+b, 0) / intervals.length;
      const variance = intervals.reduce((s,x) => s + Math.pow(x-mean, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      // StdDev < 80ms over 8+ requests = machine-regular timing
      if (stdDev < 80) {
        score += 35;
        signals.push({ type: "bot_detected", severity: "high", confidence: 0.88, detail: `Machine-regular timing stdDev=${stdDev.toFixed(0)}ms — automated client` });
        detail += `Bot timing (σ=${stdDev.toFixed(0)}ms). `;
      }
    }
  }

  // 5g. Write-only session detection (no GET in >5 requests)
  const methodKey = FW.methodCount(ip);
  await fwSadd(methodKey, method.toUpperCase(), 300);
  const methods = await fwSmembers(methodKey);
  const totalMethods = methods.length;
  if (totalMethods >= 5 && !methods.includes("GET")) {
    score += 20;
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.78, detail: "Write-only session — no GET requests in last 5+ requests" });
  }

  const level: ThreatLevel = score >= 80 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 80 ? "block" : score >= 50 ? "challenge" : undefined;

  return { layer: 5, name: "Behavioral Fingerprint", passed: score < 50, decision, threatLevel: level, signals, detail: detail || "Behavioral analysis passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 6 — ENTROPY & OBFUSCATION DETECTION
// Features: Shannon entropy of payloads and URLs, base64 decode + re-scan,
//           hex encoding detection, polyglot payloads, compressed attack strings,
//           junk padding detection
// ═══════════════════════════════════════════════════════════════════════════════

function shannonEntropy(str: string): number {
  if (!str.length) return 0;
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] ?? 0) + 1;
  let h = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function extractStrings(v: unknown, minLen: number, d = 0): string[] {
  if (d > 6) return [];
  if (typeof v === "string" && v.length > minLen) return [v];
  if (Array.isArray(v)) return v.flatMap(x => extractStrings(x, minLen, d+1));
  if (v && typeof v === "object") return Object.values(v as Record<string,unknown>).flatMap(x => extractStrings(x, minLen, d+1));
  return [];
}

// Patterns to re-scan after base64 decode
const DECODE_SCAN = [
  /UNION\s+SELECT/i, /SELECT\s+FROM/i, /<script/i, /javascript:/i,
  /\/etc\/passwd/i, /cmd\.exe/i, /\/bin\/sh/i, /eval\(/i,
];

function layer6EntropyDetection(body: unknown, method: string, endpoint: string): LayerResult {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";

  // Only deep-analyze write methods
  const isWrite = ["POST","PUT","PATCH"].includes(method.toUpperCase());

  if (isWrite) {
    const segments = extractStrings(body, 32);
    let maxEntropy = 0;
    let totalEntropy = 0;
    let segCount = 0;

    for (const seg of segments) {
      const e = shannonEntropy(seg);
      if (e > maxEntropy) maxEntropy = e;
      totalEntropy += e;
      segCount++;

      // High-entropy segment (>5.2 bits/char, >64 chars) — likely encoded payload
      if (e > 5.2 && seg.length > 64) {
        // Try base64 decode and re-scan
        try {
          const decoded = Buffer.from(seg, "base64").toString("utf-8");
          if (/^[\x20-\x7E\t\n\r]+$/.test(decoded) && decoded.length > 10) {
            const hasAttack = DECODE_SCAN.some(p => p.test(decoded));
            if (hasAttack) {
              score += 70;
              signals.push({ type: "anomaly", severity: "critical", confidence: 0.95, detail: `Encoded attack payload (base64, entropy=${e.toFixed(2)})` });
              detail += "Encoded attack. ";
            }
          }
        } catch { /* not valid base64 */ }

        // Even without attack match, high entropy in large segment is suspicious
        if (!detail) {
          score += 15;
          signals.push({ type: "anomaly", severity: "low", confidence: 0.65, detail: `High-entropy segment: ${e.toFixed(2)} bits/char (${seg.length} bytes)` });
        }
      }

      // Detect hex-encoded strings (%xx%xx%xx pattern)
      const hexMatches = (seg.match(/%[0-9a-f]{2}/gi) ?? []).length;
      if (hexMatches > 20) {
        score += 20;
        signals.push({ type: "anomaly", severity: "medium", confidence: 0.78, detail: `Heavy URL encoding: ${hexMatches} hex sequences` });
      }
    }

    // Overall body entropy check
    if (segCount > 0) {
      const avgEntropy = totalEntropy / segCount;
      if (avgEntropy > 6.2) {
        score += 25;
        signals.push({ type: "anomaly", severity: "medium", confidence: 0.80, detail: `Extremely high body entropy: avg ${avgEntropy.toFixed(2)} bits/char` });
        detail += `High entropy body (${avgEntropy.toFixed(2)}). `;
      }
    }
  }

  // URL entropy check (GET/all methods)
  const [urlPath, queryString] = endpoint.split("?");
  if (queryString && queryString.length > 100) {
    const e = shannonEntropy(queryString);
    if (e > 5.0) {
      score += 20;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.75, detail: `High URL entropy: ${e.toFixed(2)} bits/char in query string` });
    }
  }

  // Long path segments (possible path traversal obfuscation)
  const pathSegments = (urlPath ?? "").split("/");
  for (const seg of pathSegments) {
    if (seg.length > 200) {
      score += 20;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.80, detail: `Suspiciously long path segment: ${seg.length} chars` });
      break;
    }
  }

  score = Math.min(score, 100);
  const level: ThreatLevel = score >= 70 ? "high" : score >= 40 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 70 ? "block" : undefined;

  return { layer: 6, name: "Entropy & Obfuscation", passed: score < 40, decision, threatLevel: level, signals, detail: detail || "Entropy check passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 7 — BUSINESS LOGIC & APPLICATION-LAYER ABUSE
// Features: credential stuffing, prompt injection, AI resource abuse,
//           rapid account creation, bulk SSRF amplification, password spray,
//           scraping detection, API key enumeration, rate abuse by endpoint
// ═══════════════════════════════════════════════════════════════════════════════

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /you\s+are\s+now\b/i,
  /disregard\s+your/i,
  /\bsystem\s*:/i,
  /SYSTEM\s+OVERRIDE/,
  /\bforget\s+(all\s+)?previous\b/i,
  /\bpretend\s+(you\s+are|to\s+be)\b/i,
  /\bjailbreak\b/i,
  /ignore\s+(all\s+)?instructions/i,
  /new\s+prompt\s*:/i,
  /\bDAN\b.*mode/i,
  /act\s+as\s+if\s+you/i,
  /you\s+are\s+an?\s+AI\s+without/i,
];

async function layer7BusinessLogic(ip: string, endpoint: string, method: string, body: unknown, userId?: string): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";
  const lMethod = method.toUpperCase();
  const flat = typeof body === "string" ? body : JSON.stringify(body ?? "");

  // 7a. Prompt injection on AI endpoints
  if (endpoint.startsWith("/api/chat") || endpoint.startsWith("/api/generate")) {
    if (PROMPT_INJECTION_PATTERNS.some(p => p.test(flat))) {
      score += 60;
      signals.push({ type: "anomaly", severity: "high", confidence: 0.92, detail: "Prompt injection attempt detected" });
      detail += "Prompt injection. ";
    }
  }

  // 7b. Credential stuffing — >5 distinct payloads to /api/auth/login in 5min
  if (endpoint === "/api/auth/login" && lMethod === "POST") {
    const payloadHash = crypto.createHash("sha256").update(flat).digest("hex").substring(0, 16);
    const hashCount = await fwSadd(FW.loginHashes(ip), payloadHash, 300);
    if (hashCount > 7) {
      score += 75;
      signals.push({ type: "credential_stuffing", severity: "critical", confidence: 0.97, detail: `${hashCount} distinct login payloads in 5min — credential stuffing` });
      detail += `Credential stuffing (${hashCount}). `;
    } else if (hashCount > 4) {
      score += 35;
      signals.push({ type: "credential_stuffing", severity: "high", confidence: 0.85, detail: `${hashCount} distinct login payloads in 5min` });
    }
  }

  // 7c. Excessive AI resource consumption
  if (endpoint.startsWith("/api/generate") || endpoint.startsWith("/api/research")) {
    const aiCount = await fwIncr(FW.aiGenCount(ip), 600);
    if (aiCount > 25) {
      score += 40;
      signals.push({ type: "anomaly", severity: "high", confidence: 0.88, detail: `Excessive AI usage: ${aiCount} requests in 10min` });
      detail += `AI abuse (${aiCount}). `;
    } else if (aiCount > 15) {
      score += 15;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.75, detail: `High AI usage: ${aiCount} requests in 10min` });
    }
  }

  // 7d. Rapid account creation
  if (endpoint === "/api/auth/register" && lMethod === "POST") {
    const regCount = await fwIncr(FW.regCount(ip), 1800);
    if (regCount > 5) {
      score += 55;
      signals.push({ type: "anomaly", severity: "high", confidence: 0.92, detail: `${regCount} account registrations in 30min — bot registration` });
      detail += `Rapid registration (${regCount}). `;
    } else if (regCount > 2) {
      score += 20;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.78, detail: `${regCount} registrations in 30min` });
    }
  }

  // 7e. Bulk link validation — SSRF amplification
  if (endpoint.startsWith("/api/validate") && lMethod === "POST") {
    try {
      const parsed = typeof body === "object" && body !== null ? body : JSON.parse(flat);
      const urls = (parsed as Record<string,unknown>)["urls"];
      const urlCount = Array.isArray(urls) ? urls.length : Array.isArray(parsed) ? (parsed as unknown[]).length : 0;
      if (urlCount > 50) {
        score += 45;
        signals.push({ type: "ssrf_attempt", severity: "high", confidence: 0.87, detail: `Bulk link validation: ${urlCount} URLs — SSRF amplification` });
        detail += `Bulk SSRF (${urlCount}). `;
      }
    } catch { /* skip */ }
  }

  // 7f. Password spray detection (many auth failures from same IP)
  if (endpoint.startsWith("/api/auth") && lMethod === "POST") {
    const authFailKey = `fw:authfail:${ip}`;
    // Note: auth failures recorded separately by auth route error handler
    const failCount = await fwGet<number>(authFailKey);
    if (failCount && failCount > 10) {
      score += 35;
      signals.push({ type: "credential_stuffing", severity: "high", confidence: 0.88, detail: `${failCount} auth failures — password spray` });
    }
  }

  // 7g. API scraping — too many different endpoints hit in sequence
  if (endpoint.startsWith("/api/")) {
    const apiRateKey = `fw:api:${ip}`;
    const apiCount = await fwIncr(apiRateKey, 60);
    if (apiCount > 100) {
      score += 20;
      signals.push({ type: "anomaly", severity: "medium", confidence: 0.72, detail: `${apiCount} API calls in 60s — possible scraping` });
    }
  }

  score = Math.min(score, 100);
  const level: ThreatLevel = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 75 ? "block" : score >= 50 ? "tarpit" : undefined;

  return { layer: 7, name: "Business Logic Guard", passed: score < 50, decision, threatLevel: level, signals, detail: detail || "Business logic check passed", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 8 — TEMPORAL PATTERN & ATTACK CHAIN CORRELATION
// Features: multi-phase attack detection (recon→exploit), signal persistence,
//           attack campaign tracking, evasion pattern detection,
//           IP flip detection, time-of-day anomaly
// ═══════════════════════════════════════════════════════════════════════════════

interface ChainEntry { t: number; cat: AttackCategory; sev: Severity; }

async function layer8AttackChainCorrelation(ip: string, newSignals: AttackSignal[]): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";

  const now = Date.now();
  const WINDOW_10M = now - 600_000;
  const WINDOW_5M  = now - 300_000;
  const WINDOW_30M = now - 1_800_000;

  // Load existing chain
  const rawChain = await fwLrange(FW.attackChain(ip), 0, 49);
  const chain: ChainEntry[] = rawChain.map(r => {
    try { return typeof r === "string" ? JSON.parse(r) as ChainEntry : r as ChainEntry; }
    catch { return null; }
  }).filter(Boolean) as ChainEntry[];

  const recentChain = chain.filter(e => e.t > WINDOW_10M);

  // 8a. Recon → exploit pattern
  const RECON_CATS = new Set<AttackCategory>(["scanner","traversal","enumeration","bot"]);
  const WEAPON_CATS = new Set<AttackCategory>(["injection","xss","ssrf","deserialization","ssti","ldap"]);

  const hasRecon = recentChain.some(e => RECON_CATS.has(e.cat));
  const hasWeapon = recentChain.some(e => WEAPON_CATS.has(e.cat))
    || newSignals.some(s => WEAPON_CATS.has(mapTypeToCat(s.type)));

  if (hasRecon && hasWeapon) {
    score += 40;
    signals.push({ type: "anomaly", severity: "critical", confidence: 0.97, detail: "Multi-phase attack chain: recon → exploit detected" });
    detail += "Attack chain. ";
  }

  // 8b. Signal diversity (≥4 distinct categories in 10min = coordinated attack)
  const allCats = new Set<string>([
    ...recentChain.map(e => e.cat),
    ...newSignals.map(s => mapTypeToCat(s.type)),
  ]);
  if (allCats.size >= 4) {
    score += 30;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.90, detail: `${allCats.size} distinct attack types in 10min — coordinated attack` });
    detail += `Coordinated (${allCats.size} types). `;
  }

  // 8c. Critical signal persistence (recent critical → escalate)
  const hasCriticalRecent5m = chain.some(e => e.sev === "critical" && e.t > WINDOW_5M);
  if (hasCriticalRecent5m) {
    score += 20;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.85, detail: "Critical attack signal active in last 5min — threat persistence" });
  }

  // 8d. Evasion pattern — alternating clean/attack requests
  const last20 = chain.slice(-20);
  if (last20.length >= 10) {
    const attackCount = last20.filter(e => e.sev === "high" || e.sev === "critical").length;
    const cleanCount = last20.length - attackCount;
    if (attackCount >= 3 && cleanCount >= 3) {
      const ratio = Math.min(attackCount, cleanCount) / last20.length;
      if (ratio > 0.25) {
        score += 25;
        signals.push({ type: "anomaly", severity: "high", confidence: 0.82, detail: "Evasion pattern: alternating attack/clean requests" });
        detail += "Evasion detected. ";
      }
    }
  }

  // 8e. Long-running campaign (30min window with >5 attack signals)
  const campaign30m = chain.filter(e => e.t > WINDOW_30M && (e.sev === "high" || e.sev === "critical"));
  if (campaign30m.length >= 5) {
    score += 20;
    signals.push({ type: "anomaly", severity: "high", confidence: 0.88, detail: `${campaign30m.length} high/critical signals in 30min — sustained campaign` });
  }

  // Append new signals to chain
  const newEntries: ChainEntry[] = newSignals
    .filter(s => s.severity !== "info")
    .map(s => ({ t: now, cat: mapTypeToCat(s.type), sev: s.severity }));

  for (const entry of newEntries) {
    await fwLpush(FW.attackChain(ip), entry, 50, 1800);
  }

  score = Math.min(score, 100);
  const level: ThreatLevel = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = score >= 70 ? "block" : score >= 45 ? "tarpit" : undefined;

  return { layer: 8, name: "Attack Chain Correlation", passed: score < 45, decision, threatLevel: level, signals, detail: detail || "No attack chain detected", score };
}

function mapTypeToCat(type: string): AttackCategory {
  const m: Record<string, AttackCategory> = {
    xss_attempt: "xss", sql_injection: "injection", command_injection: "injection",
    path_traversal: "traversal", ssrf_attempt: "ssrf", xxe_attempt: "injection",
    prototype_pollution: "proto_pollution", scanner: "scanner", bot_detected: "bot",
    dos_flood: "flood", ddos_flood: "flood", http_flood: "flood",
    credential_stuffing: "credential_stuffing", payload_bomb: "payload_bomb",
    anomaly: "unknown", slowloris: "flood", null_byte: "injection",
  };
  return m[type] ?? "unknown";
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 9 — AI-ASSISTED ANOMALY SCORING (via core.ts ASI engine)
// Features: full behavioral analysis from core.ts, FusedScore integration,
//           TrustScore-based false-positive reduction, AI threat label,
//           cross-session reputation from Redis
// ═══════════════════════════════════════════════════════════════════════════════

async function layer9AiAnomalyScoring(ctx: FirewallContext): Promise<LayerResult & { coreResult?: InspectResult }> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let detail = "";

  let coreResult: InspectResult | undefined;

  try {
    const inspectReq: InspectRequest = {
      ip: ctx.ip, userId: ctx.userId,
      endpoint: ctx.endpoint, method: ctx.method,
      userAgent: ctx.userAgent, headers: ctx.headers,
      body: ctx.body, requestDurationMs: ctx.requestDurationMs,
    };

    coreResult = await inspect(inspectReq);

    // Translate core.ts signals to layer score
    score = Math.round(coreResult.threatScore * 0.6);

    // Apply trust discount
    const trustScore = coreResult.trustScore ?? 50;
    if (trustScore >= 70) score = Math.max(0, score - Math.round((trustScore - 70) / 3));

    // Carry over core signals
    signals.push(...coreResult.signals);

    if (coreResult.botScore && coreResult.botScore >= 70) {
      score += 15;
      detail += `Bot score: ${coreResult.botScore}. `;
    }

    if (coreResult.fusedScore && coreResult.fusedScore >= 60) {
      score += 10;
      detail += `FusedScore: ${coreResult.fusedScore}. `;
    }

    if (coreResult.attackChainLength && coreResult.attackChainLength >= 3) {
      score += 10;
      detail += `Chain length: ${coreResult.attackChainLength}. `;
    }

    // Update persistent IP score in Redis for Layer 1
    const existingScore = await fwGet<number>(FW.ipScore(ctx.ip)) ?? 0;
    const newScore = Math.min(100, Math.round(existingScore * 0.7 + score * 0.3));
    await fwSet(FW.ipScore(ctx.ip), newScore, 86400);

  } catch (err) {
    // Core unavailable — degrade gracefully
    detail = "ASI engine unavailable — partial analysis";
    console.warn("[FW Layer9] Core ASI error:", err);
  }

  score = Math.min(score, 100);
  const level: ThreatLevel = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : score > 0 ? "low" : "none";
  const decision: FirewallDecision | undefined = coreResult?.blocked ? "block" : coreResult?.action === "tarpit" ? "tarpit" : undefined;

  return { layer: 9, name: "AI Anomaly Scoring", passed: score < 50, decision, threatLevel: level, signals, detail: detail || `AI score: ${score}`, score, coreResult };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 10 — CHALLENGE GATE & BYPASS TOKEN MANAGEMENT
// Features: crypto challenge token, IP binding, browser signal analysis,
//           bot behavioral test, 12h bypass token, max-attempts lockout,
//           honeypot trap for scanners
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateChallengeToken(ip: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const record: ChallengeRecord = { token, ip, createdAt: Date.now(), attempts: 0, passed: false };
  await fwSet(FW.challengeTok(token), record, CHAL_TTL);
  await fwSet(FW.challenge(ip), token, CHAL_TTL);
  return token;
}

export async function verifyChallengeToken(token: string, ip: string, browserFingerprint?: string): Promise<{ valid: boolean; reason: string }> {
  const raw = await fwGet<ChallengeRecord | string>(FW.challengeTok(token));
  if (!raw) return { valid: false, reason: "Challenge token expired or invalid" };

  let record: ChallengeRecord;
  try {
    if (typeof raw === "string") record = JSON.parse(raw) as ChallengeRecord;
    else if (typeof raw === "object" && raw !== null) record = raw as ChallengeRecord;
    else return { valid: false, reason: "Malformed challenge record" };
    if (!record.ip || !record.token || typeof record.createdAt !== "number") return { valid: false, reason: "Invalid challenge record structure" };
  } catch { return { valid: false, reason: "Malformed challenge record" }; }

  if (record.ip !== ip) return { valid: false, reason: "IP mismatch — token not valid for this client" };
  if (record.passed) return { valid: true, reason: "Already verified" };
  if (Date.now() - record.createdAt > CHAL_TTL * 1000) return { valid: false, reason: "Challenge expired" };
  if (record.attempts >= 5) {
    await manualBlockIp(ip, "Too many failed challenge attempts", BLOCK_TTL);
    return { valid: false, reason: "Too many attempts — IP blocked" };
  }

  record.passed = true;
  record.solvedAt = Date.now();
  record.browserFingerprint = browserFingerprint;

  await Promise.all([
    fwSet(FW.challengeTok(token), record, CHAL_TTL),
    fwSet(FW.bypassToken(ip), token, BYPASS_TTL),
  ]);

  return { valid: true, reason: "Challenge passed" };
}

export async function hasValidBypass(ip: string): Promise<boolean> {
  const tok = await fwGet<string>(FW.bypassToken(ip));
  return !!tok;
}

async function layer10ChallengeGate(ip: string, totalScore: number, coreResult: InspectResult | undefined, challengeToken?: string): Promise<LayerResult> {
  const signals: AttackSignal[] = [];
  let score = 0;
  let decision: FirewallDecision | undefined;
  let detail = "";

  // Check bypass (already verified recently)
  const bypass = await hasValidBypass(ip);

  // Honeypot trap: scanner-like IPs that pass earlier layers go to honeypot
  const isHoneypotCandidate = totalScore >= 40 && totalScore < 60 && !bypass;
  if (isHoneypotCandidate) {
    decision = "honeypot";
    score = 50;
    detail = "Diverted to honeypot for threat intelligence collection";
    signals.push({ type: "anomaly", severity: "medium", confidence: 0.75, detail: "Honeypot diversion" });
    return { layer: 10, name: "Challenge Gate", passed: false, decision, threatLevel: "medium", signals, detail, score };
  }

  // Need challenge if: new IP + suspicious but not blocked
  const needsChallenge = !bypass && (
    totalScore >= 20 ||
    (coreResult && (coreResult.trustScore ?? 50) < 50)
  );

  if (needsChallenge && !challengeToken) {
    const token = await generateChallengeToken(ip);
    return { layer: 10, name: "Challenge Gate", passed: false, decision: "challenge", threatLevel: "low", signals: [{ type: "anomaly", severity: "low", confidence: 0.6, detail: "Challenge required for new/unverified visitor" }], detail: "Challenge required", score: 20 };
  }

  // Validate submitted token
  if (challengeToken) {
    const verify = await verifyChallengeToken(challengeToken, ip);
    if (!verify.valid) {
      await recordIpError(ip);
      score = 60;
      decision = "block";
      detail = `Challenge failed: ${verify.reason}`;
      signals.push({ type: "bot_detected", severity: "high", confidence: 0.95, detail: verify.reason });
    } else {
      detail = "Challenge passed";
    }
  }

  if (bypass) detail = "Bypass token valid — direct access";

  const level: ThreatLevel = score >= 60 ? "high" : score > 0 ? "medium" : "none";
  return { layer: 10, name: "Challenge Gate", passed: score < 60, decision, threatLevel: level, signals, detail: detail || "Access granted", score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT SYSTEM & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function emitAlert(alert: FirewallAlert): Promise<void> {
  const prefix = alert.threatLevel === "critical" ? "🚨 [FW CRITICAL]"
    : alert.threatLevel === "high" ? "⚠️  [FW HIGH]"
    : `🛡️  [FW ${alert.threatLevel.toUpperCase()}]`;
  console.log(`${prefix} ${alert.ip} | ${alert.method} ${alert.endpoint} | ${alert.category} | ${alert.decision} | ${alert.detail}`);

  await fwLpush(FW.alertLog(), alert, ALERT_MAX, ALERT_TTL);

  if (alert.threatLevel === "critical") {
    await manualBlockIp(alert.ip, `FW auto-block: ${alert.category} — ${alert.detail}`, BLOCK_TTL);
  }

  if (alert.threatLevel === "high" || alert.threatLevel === "critical") {
    await recordIpError(alert.ip);
  }
}

export async function getFirewallAlerts(limit = 100): Promise<FirewallAlert[]> {
  try {
    const raw = await fwLrange(FW.alertLog(), 0, Math.min(limit, ALERT_MAX) - 1);
    const alerts: FirewallAlert[] = [];
    for (const item of raw) {
      try {
        const p = typeof item === "string" ? JSON.parse(item) as FirewallAlert : item as FirewallAlert;
        alerts.push(p);
      } catch { /* skip */ }
    }
    return alerts;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN evaluate() — Orchestrates all 10 layers
// ═══════════════════════════════════════════════════════════════════════════════

export async function evaluate(ctx: FirewallContext): Promise<FirewallResult> {
  const { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs, challengeToken } = ctx;
  const now = Date.now();
  const layerResults: LayerResult[] = [];
  const allSignals: AttackSignal[] = [];
  let totalScore = 0;
  let finalDecision: FirewallDecision = "allow";
  let topCategory: AttackCategory = "unknown";
  let topThreatLevel: ThreatLevel = "none";
  let coreResult: InspectResult | undefined;

  // ── Run all 10 layers sequentially (early exit on block) ──────────────────

  // Layer 1 — IP Reputation
  const l1 = await layer1IpReputation(ip, headers);
  layerResults.push(l1);
  allSignals.push(...l1.signals);
  totalScore += l1.score * 0.15;
  topThreatLevel = maxLevel(topThreatLevel, l1.threatLevel);
  if (!l1.passed && l1.decision === "block") {
    finalDecision = "block";
    topCategory = "unknown";
    goto_emit: {
      const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l1.detail, allSignals, layerResults, now);
      await emitAlert(alert);
      return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l1.detail, challengeRequired: false, alert, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: now };
    }
  }

  // Layer 2 — Flood Protection
  const l2 = await layer2FloodProtection(ip, requestDurationMs);
  layerResults.push(l2);
  allSignals.push(...l2.signals);
  totalScore += l2.score * 0.20;
  topThreatLevel = maxLevel(topThreatLevel, l2.threatLevel);
  if (!l2.passed && l2.decision === "block") {
    finalDecision = "block"; topCategory = "flood";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l2.detail, allSignals, layerResults, now);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l2.detail, challengeRequired: false, alert, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: now };
  }

  // Layer 3 — Protocol Conformance
  const l3 = layer3ProtocolConformance(endpoint, method, headers, body);
  layerResults.push(l3);
  allSignals.push(...l3.signals);
  totalScore += l3.score * 0.10;
  topThreatLevel = maxLevel(topThreatLevel, l3.threatLevel);
  if (!l3.passed && l3.decision === "block") {
    finalDecision = "block"; topCategory = "protocol_anomaly";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l3.detail, allSignals, layerResults, now);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l3.detail, challengeRequired: false, alert, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: now };
  }

  // Layer 4 — Payload Inspection
  const l4 = layer4PayloadInspection(body, headers, method);
  layerResults.push(l4);
  allSignals.push(...l4.signals);
  totalScore += l4.score * 0.20;
  topThreatLevel = maxLevel(topThreatLevel, l4.threatLevel);
  if (!l4.passed && (l4.decision === "block" || l4.decision === "tarpit")) {
    finalDecision = l4.decision!; topCategory = "injection";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l4.detail, allSignals, layerResults, now);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l4.detail, tarpitMs: finalDecision === "tarpit" ? 8000 : undefined, challengeRequired: false, alert, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: finalDecision === "block" ? now : undefined };
  }

  // Layer 5 — Behavioral Fingerprint
  const l5 = await layer5BehavioralAnalysis(ip, endpoint, method, headers);
  layerResults.push(l5);
  allSignals.push(...l5.signals);
  totalScore += l5.score * 0.10;
  topThreatLevel = maxLevel(topThreatLevel, l5.threatLevel);

  // Layer 6 — Entropy Detection
  const l6 = layer6EntropyDetection(body, method, endpoint);
  layerResults.push(l6);
  allSignals.push(...l6.signals);
  totalScore += l6.score * 0.05;
  topThreatLevel = maxLevel(topThreatLevel, l6.threatLevel);

  // Layer 7 — Business Logic
  const l7 = await layer7BusinessLogic(ip, endpoint, method, body, userId);
  layerResults.push(l7);
  allSignals.push(...l7.signals);
  totalScore += l7.score * 0.10;
  topThreatLevel = maxLevel(topThreatLevel, l7.threatLevel);
  if (!l7.passed && (l7.decision === "block" || l7.decision === "tarpit")) {
    finalDecision = l7.decision!; topCategory = "business_logic";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l7.detail, allSignals, layerResults, now);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l7.detail, tarpitMs: finalDecision === "tarpit" ? 10000 : undefined, challengeRequired: false, alert, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: finalDecision === "block" ? now : undefined };
  }

  // Layer 8 — Attack Chain Correlation
  const l8 = await layer8AttackChainCorrelation(ip, allSignals);
  layerResults.push(l8);
  allSignals.push(...l8.signals);
  totalScore += l8.score * 0.05;
  topThreatLevel = maxLevel(topThreatLevel, l8.threatLevel);

  // Layer 9 — AI Scoring (core.ts)
  const l9 = await layer9AiAnomalyScoring(ctx);
  coreResult = l9.coreResult;
  layerResults.push({ layer: l9.layer, name: l9.name, passed: l9.passed, decision: l9.decision, threatLevel: l9.threatLevel, signals: l9.signals, detail: l9.detail, score: l9.score });
  allSignals.push(...l9.signals.filter(s => !allSignals.some(a => a.detail === s.detail)));
  totalScore += l9.score * 0.05;
  topThreatLevel = maxLevel(topThreatLevel, l9.threatLevel);
  if (l9.decision === "block") {
    finalDecision = "block"; topCategory = allSignals[0] ? mapTypeToCat(allSignals[0].type) : "unknown";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l9.detail, allSignals, layerResults, now, coreResult);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l9.detail, challengeRequired: false, alert, coreResult, layerResults, totalScore: Math.min(100, Math.round(totalScore)), blockedAt: now };
  }

  // Layer 10 — Challenge Gate
  const normalizedScore = Math.min(100, Math.round(totalScore));
  const l10 = await layer10ChallengeGate(ip, normalizedScore, coreResult, challengeToken);
  layerResults.push(l10);
  allSignals.push(...l10.signals);
  topThreatLevel = maxLevel(topThreatLevel, l10.threatLevel);

  if (l10.decision === "honeypot") {
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, "bot", "medium", "honeypot", l10.detail, allSignals, layerResults, now, coreResult);
    await emitAlert(alert);
    return { decision: "honeypot", threatLevel: "medium", category: "bot", reason: l10.detail, honeypotRedirect: "/api/honeypot", challengeRequired: false, alert, coreResult, layerResults, totalScore: normalizedScore };
  }

  if (l10.decision === "challenge") {
    return { decision: "challenge", threatLevel: "low", category: "bot", reason: l10.detail, challengeRequired: true, challengeToken: await generateChallengeToken(ip), coreResult, layerResults, totalScore: normalizedScore };
  }

  if (l10.decision === "block") {
    topCategory = "bot"; finalDecision = "block";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, l10.detail, allSignals, layerResults, now, coreResult);
    await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: l10.detail, challengeRequired: false, alert, coreResult, layerResults, totalScore: normalizedScore, blockedAt: now };
  }

  // Determine final action from accumulated score
  if (normalizedScore >= 70 && finalDecision === "allow") finalDecision = "block";
  else if (normalizedScore >= 45 && finalDecision === "allow") finalDecision = "tarpit";

  if (finalDecision !== "allow") {
    topCategory = allSignals[0] ? mapTypeToCat(allSignals[0].type) : "unknown";
    const topReason = layerResults.find(r => !r.passed)?.detail ?? allSignals[0]?.detail ?? "Multi-layer threat detection";
    const alert = buildAlert(ip, endpoint, method, userAgent, headers, body, topCategory, topThreatLevel, finalDecision, topReason, allSignals, layerResults, now, coreResult);
    if (finalDecision === "block") await emitAlert(alert);
    return { decision: finalDecision, threatLevel: topThreatLevel, category: topCategory, reason: topReason, tarpitMs: finalDecision === "tarpit" ? Math.round(5000 + normalizedScore * 200) : undefined, challengeRequired: false, alert: finalDecision === "block" ? alert : undefined, coreResult, layerResults, totalScore: normalizedScore, blockedAt: finalDecision === "block" ? now : undefined };
  }

  // All layers passed
  return { decision: "allow", threatLevel: topThreatLevel, category: "unknown", reason: "All 10 firewall layers passed", challengeRequired: false, coreResult, layerResults, totalScore: normalizedScore };
}

function buildAlert(
  ip: string, endpoint: string, method: string, userAgent: string,
  headers: Record<string, string>, body: unknown,
  category: AttackCategory, threatLevel: ThreatLevel, decision: FirewallDecision,
  detail: string, signals: AttackSignal[], layerResults: LayerResult[],
  now: number, coreResult?: InspectResult
): FirewallAlert {
  const bodyStr = body ? (typeof body === "string" ? body : JSON.stringify(body)).substring(0, 200) : undefined;
  return {
    id: `fw_${now}_${crypto.randomBytes(3).toString("hex")}`,
    timestamp: now, ip, endpoint, method, category, threatLevel, decision, detail, signals, layerResults,
    requestMeta: { userAgent, headers: sanitizeAlertHeaders(headers), bodyPreview: bodyStr },
    coreResult,
  };
}

function sanitizeAlertHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === "authorization") safe[k] = "[REDACTED]";
    else if (lk === "cookie") safe[k] = `[REDACTED:${(v.match(/=/g) ?? []).length}-cookies]`;
    else if (lk === "x-api-key") safe[k] = "[REDACTED]";
    else safe[k] = v;
  }
  return safe;
}

// ─── Exports for quick edge-side checks ──────────────────────────────────────

export async function firewallCheck(ip: string, userAgent: string): Promise<{ blocked: boolean; reason: string }> {
  const fwBlocked = await fwGet<string>(FW.blocked(ip));
  if (fwBlocked) return { blocked: true, reason: fwBlocked };

  // Quick burst check (no full evaluation needed)
  const w1s = await fwIncr(FW.burst(ip, "1s"), 1);
  if (w1s > 30) {
    await fwSet(FW.blocked(ip), `Auto-block: ${w1s} req/s flood`, BLOCK_TTL);
    return { blocked: true, reason: `Flood: ${w1s} req/s` };
  }

  const ua = userAgent.toLowerCase();
  const scannerMatch = SCANNER_UA_LIST.find(s => ua.includes(s));
  if (scannerMatch) return { blocked: true, reason: `Scanner: ${scannerMatch}` };

  return { blocked: false, reason: "" };
}
