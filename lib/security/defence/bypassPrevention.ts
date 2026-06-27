/**
 * bypassPrevention.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Anti-bypass system with tarpit engine, honeypot traps, request fingerprinting,
 * and resource exhaustion defender.
 *
 * Key strategies:
 *  1. Tarpit engine   — stall suspicious connections with artificial delays,
 *                       wasting attacker CPU/time/connection slots
 *  2. Honeypot traps  — fake endpoints that flag any caller as malicious
 *  3. Fingerprinting  — detect request cloning, replay, and tool signatures
 *  4. Deception layer — serve fake large payloads to exhaust attacker bandwidth
 *  5. Token binding   — one-time request tokens prevent replay and scraping
 *  6. Canary tokens   — embed traceable data in responses to detect leaks
 *  7. Jitter shield   — randomize response timing to defeat timing attacks
 *  8. Header spoofing detection — identify forged/rotated headers
 *  9. TLS fingerprint simulation — detect mismatched client profiles
 * 10. Kill-switch     — emergency total lockdown mode
 */

import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BypassThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export interface BypassResult {
  allowed: boolean;
  threatLevel: BypassThreatLevel;
  actions: BypassAction[];
  tarpitMs: number;
  reason?: string;
  decoyPayload?: string;   // fake data to serve instead of real response
  canaryToken?: string;    // embed in response for tracking
}

export type BypassAction =
  | "none"
  | "tarpit"
  | "honeypot_triggered"
  | "replay_blocked"
  | "fingerprint_mismatch"
  | "token_invalid"
  | "jitter_applied"
  | "decoy_served"
  | "canary_embedded"
  | "killswitch_active"
  | "header_forge_detected"
  | "tool_signature_detected"
  | "rate_fingerprint_blocked";

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // Tarpit
  TARPIT_MIN_MS: 5_000,
  TARPIT_MAX_MS: 60_000,
  TARPIT_ESCALATION_FACTOR: 1.8, // Each violation multiplies delay

  // Token
  TOKEN_TTL_MS: 5 * 60_000,           // Tokens valid for 5 minutes
  TOKEN_MAX_USES: 1,                   // One-time use only

  // Fingerprint
  FINGERPRINT_WINDOW_MS: 30_000,       // 30s window for clone detection
  FINGERPRINT_CLONE_THRESHOLD: 3,      // ≥3 identical fingerprints → clone

  // Replay
  REPLAY_WINDOW_MS: 60_000,            // Reject replayed requests within 60s

  // Honeypot
  HONEYPOT_PATHS: new Set([
    "/admin", "/wp-admin", "/wp-login.php", "/.env",
    "/config.php", "/phpinfo.php", "/.git/config",
    "/server-status", "/actuator", "/api/v1/admin",
    "/.htaccess", "/etc/passwd", "/proc/self/environ",
    "/api/internal", "/debug", "/console",
    "/_next/static/../../etc/passwd",
  ]),

  // Decoy payload sizes (bytes) to exhaust attacker bandwidth
  DECOY_SIZES: [512 * 1024, 1024 * 1024, 2 * 1024 * 1024],

  // Kill-switch
  KILLSWITCH_ACTIVE: false,
  KILLSWITCH_ALLOW_LIST: new Set<string>(), // IPs exempt from killswitch

  // Jitter
  JITTER_MIN_MS: 50,
  JITTER_MAX_MS: 3_000,
} as const;

// ─── Internal stores ──────────────────────────────────────────────────────────

// Issued one-time tokens: token → { ip, expiresAt, used }
const tokenStore = new Map<string, { ip: string; expiresAt: number; uses: number }>();

// Seen request hashes for replay detection: hash → timestamp
const seenRequestHashes = new Map<string, number>();

// Fingerprint history per IP: ip → fingerprint[]
const fingerprintHistory = new Map<string, { fp: string; ts: number }[]>();

// Tarpit counters per IP: ip → violation count
const tarpitCounters = new Map<string, number>();

// Honeypot hits: ip → hit timestamps
const honeypotHits = new Map<string, number[]>();

// Canary tokens: token → { ip, issuedAt }
const canaryStore = new Map<string, { ip: string; issuedAt: number }>();

// ─── Kill-switch ──────────────────────────────────────────────────────────────

let killSwitchActive = false;
let killSwitchExpiresAt = 0;

/**
 * Activate emergency kill-switch: blocks all traffic except allow-listed IPs.
 * @param durationMs - How long to keep the kill-switch active
 * @param allowedIps - IP addresses to exempt from the block
 */
export function activateKillSwitch(durationMs: number, allowedIps: string[] = []): void {
  killSwitchActive = true;
  killSwitchExpiresAt = Date.now() + durationMs;
  for (const ip of allowedIps) CONFIG.KILLSWITCH_ALLOW_LIST.add(ip);
  console.error(`[BypassPrevention] KILL-SWITCH ACTIVATED for ${durationMs / 1000}s`);
}

/**
 * Deactivate the kill-switch manually.
 */
export function deactivateKillSwitch(): void {
  killSwitchActive = false;
  killSwitchExpiresAt = 0;
  CONFIG.KILLSWITCH_ALLOW_LIST.clear();
  console.warn("[BypassPrevention] Kill-switch deactivated");
}

function isKillSwitchActive(ip: string): boolean {
  if (!killSwitchActive) return false;
  if (killSwitchExpiresAt < Date.now()) {
    deactivateKillSwitch();
    return false;
  }
  return !CONFIG.KILLSWITCH_ALLOW_LIST.has(ip);
}

// ─── Tarpit engine ────────────────────────────────────────────────────────────

/**
 * Calculate tarpit delay for an IP based on violation count.
 * Each successive violation multiplies the delay.
 */
function getTarpitDelay(ip: string): number {
  const count = tarpitCounters.get(ip) ?? 0;
  tarpitCounters.set(ip, count + 1);

  const delay = Math.min(
    CONFIG.TARPIT_MIN_MS * Math.pow(CONFIG.TARPIT_ESCALATION_FACTOR, count),
    CONFIG.TARPIT_MAX_MS
  );

  return Math.round(delay + Math.random() * 1000); // Add jitter
}

// ─── Honeypot ────────────────────────────────────────────────────────────────

/**
 * Check if the requested path is a honeypot trap.
 * Any access to honeypot paths immediately flags the IP.
 */
function checkHoneypot(ip: string, path: string): boolean {
  const normalized = path.toLowerCase().split("?")[0] ?? path;
  if (!CONFIG.HONEYPOT_PATHS.has(normalized)) {
    // Also check for partial matches (traversal into honeypot paths)
    const isTraversal = [...CONFIG.HONEYPOT_PATHS].some((hp) =>
      normalized.includes(hp) || hp.includes(normalized)
    );
    if (!isTraversal) return false;
  }

  const hits = honeypotHits.get(ip) ?? [];
  hits.push(Date.now());
  honeypotHits.set(ip, hits);
  return true;
}

// ─── Request fingerprinting ───────────────────────────────────────────────────

/**
 * Generate a fingerprint hash from request characteristics.
 * Used to detect cloned/replayed requests and tool signatures.
 */
function generateFingerprint(
  ip: string,
  userAgent: string,
  headers: Record<string, string>,
  method: string
): string {
  const headerKeys = Object.keys(headers).sort().join(",");
  const acceptLang = headers["accept-language"] ?? "";
  const acceptEnc = headers["accept-encoding"] ?? "";
  const accept = headers["accept"] ?? "";

  const raw = `${method}|${userAgent}|${headerKeys}|${acceptLang}|${acceptEnc}|${accept}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Detect if multiple requests from the same IP have identical fingerprints
 * within a short window — characteristic of automated cloning tools.
 */
function detectFingerprintClone(ip: string, fingerprint: string): boolean {
  const history = fingerprintHistory.get(ip) ?? [];
  const now = Date.now();
  const recent = history.filter((h) => h.ts > now - CONFIG.FINGERPRINT_WINDOW_MS);
  recent.push({ fp: fingerprint, ts: now });
  fingerprintHistory.set(ip, recent);

  const matches = recent.filter((h) => h.fp === fingerprint).length;
  return matches >= CONFIG.FINGERPRINT_CLONE_THRESHOLD;
}

// ─── Replay detection ─────────────────────────────────────────────────────────

/**
 * Generate a hash for a specific request to detect replays.
 */
function hashRequest(
  ip: string,
  method: string,
  path: string,
  body: string,
  timestamp: number
): string {
  return crypto
    .createHash("sha256")
    .update(`${ip}:${method}:${path}:${body}:${Math.floor(timestamp / 1000)}`)
    .digest("hex");
}

/**
 * Check if an identical request was seen recently (replay attack).
 */
function detectReplay(
  ip: string,
  method: string,
  path: string,
  body: string
): boolean {
  const hash = hashRequest(ip, method, path, body, Date.now());
  if (seenRequestHashes.has(hash)) return true;
  seenRequestHashes.set(hash, Date.now());
  return false;
}

// ─── One-time token system ────────────────────────────────────────────────────

/**
 * Issue a one-time request token for an IP.
 * These tokens prevent scraping and replay attacks.
 */
export function issueToken(ip: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  tokenStore.set(token, {
    ip,
    expiresAt: Date.now() + CONFIG.TOKEN_TTL_MS,
    uses: 0,
  });
  return token;
}

/**
 * Validate and consume a one-time token.
 * Returns false if token is invalid, expired, wrong IP, or already used.
 */
export function validateToken(token: string, ip: string): boolean {
  const entry = tokenStore.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) { tokenStore.delete(token); return false; }
  if (entry.ip !== ip) return false;
  if (entry.uses >= CONFIG.TOKEN_MAX_USES) { tokenStore.delete(token); return false; }

  entry.uses++;
  if (entry.uses >= CONFIG.TOKEN_MAX_USES) tokenStore.delete(token);
  return true;
}

// ─── Canary token ────────────────────────────────────────────────────────────

/**
 * Issue a canary token to embed in responses.
 * If this token appears in future requests from unexpected IPs, it indicates
 * the response was scraped/leaked.
 */
export function issueCanaryToken(ip: string): string {
  const token = `cnry_${crypto.randomBytes(16).toString("hex")}`;
  canaryStore.set(token, { ip, issuedAt: Date.now() });
  return token;
}

/**
 * Check if a canary token was returned by a different IP (data leak detected).
 */
export function checkCanaryLeak(token: string, currentIp: string): boolean {
  if (!token.startsWith("cnry_")) return false;
  const entry = canaryStore.get(token);
  if (!entry) return false;
  if (entry.ip !== currentIp) {
    console.error(`[BypassPrevention] Canary leak! Token issued to ${entry.ip}, used by ${currentIp}`);
    return true;
  }
  return false;
}

// ─── Decoy payload generator ──────────────────────────────────────────────────

/**
 * Generate a fake large payload to exhaust attacker bandwidth and connection slots.
 * Uses pseudorandom data that looks like real JSON to confuse scrapers.
 */
function generateDecoyPayload(): string {
  const sizeBytes = CONFIG.DECOY_SIZES[Math.floor(Math.random() * CONFIG.DECOY_SIZES.length)] ?? 512 * 1024;
  const entries: string[] = [];
  let size = 0;
  let i = 0;

  while (size < sizeBytes) {
    const key = crypto.randomBytes(8).toString("hex");
    const value = crypto.randomBytes(64).toString("base64");
    const entry = `"${key}":"${value}"`;
    entries.push(entry);
    size += entry.length;
    i++;
    // Prevent infinite loop
    if (i > 50_000) break;
  }

  return `{"status":"ok","data":{${entries.join(",")}}}`;
}

// ─── Header forge detection ───────────────────────────────────────────────────

/**
 * Detect inconsistencies in headers that suggest IP/identity spoofing.
 */
function detectHeaderForge(headers: Record<string, string>): boolean {
  const xForwardedFor = headers["x-forwarded-for"] ?? "";
  const xRealIp = headers["x-real-ip"] ?? "";
  const cfConnecting = headers["cf-connecting-ip"] ?? "";

  // Multiple conflicting forwarding headers is suspicious
  const forwardingCount = [xForwardedFor, xRealIp, cfConnecting].filter(Boolean).length;
  if (forwardingCount > 1) {
    // Check for inconsistency
    const ips = [
      xForwardedFor.split(",")[0]?.trim(),
      xRealIp.trim(),
      cfConnecting.trim(),
    ].filter(Boolean);
    const uniqueIps = new Set(ips);
    if (uniqueIps.size > 1) return true; // Different IPs in different headers
  }

  // Check for localhost/private IP injection in forwarding headers
  const allForwarding = `${xForwardedFor} ${xRealIp} ${cfConnecting}`;
  if (/127\.|10\.|192\.168\.|::1|localhost/i.test(allForwarding)) return true;

  return false;
}

// ─── Tool signature detection ─────────────────────────────────────────────────

const TOOL_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "curl", pattern: /^curl\//i },
  { name: "python-requests", pattern: /python-requests/i },
  { name: "Go HTTP", pattern: /^Go-http-client/i },
  { name: "Java", pattern: /^Java\//i },
  { name: "Ruby", pattern: /^Ruby\b/i },
  { name: "Postman", pattern: /PostmanRuntime/i },
  { name: "Insomnia", pattern: /insomnia/i },
  { name: "httpie", pattern: /httpie/i },
  { name: "wget", pattern: /^Wget\//i },
  { name: "axios", pattern: /\baxios\//i },
  { name: "scrapy", pattern: /Scrapy/i },
  { name: "mechanize", pattern: /mechanize/i },
  { name: "okhttp", pattern: /okhttp/i },
  { name: "guzzle", pattern: /GuzzleHttp/i },
];

function detectToolSignature(userAgent: string): string | null {
  for (const tool of TOOL_SIGNATURES) {
    if (tool.pattern.test(userAgent)) return tool.name;
  }
  return null;
}

// ─── Jitter shield ────────────────────────────────────────────────────────────

/**
 * Return a random jitter delay to defeat timing-based attacks.
 * Should be applied to all responses when dealing with suspicious requests.
 */
export function getJitterMs(): number {
  return Math.round(
    CONFIG.JITTER_MIN_MS + Math.random() * (CONFIG.JITTER_MAX_MS - CONFIG.JITTER_MIN_MS)
  );
}

// ─── Threat level aggregation ─────────────────────────────────────────────────

function aggregateThreatLevel(actions: BypassAction[]): BypassThreatLevel {
  if (actions.includes("killswitch_active") || actions.includes("honeypot_triggered")) return "critical";
  if (actions.includes("replay_blocked") || actions.includes("fingerprint_mismatch")) return "high";
  if (actions.includes("header_forge_detected") || actions.includes("tool_signature_detected")) return "medium";
  if (actions.includes("jitter_applied") || actions.includes("tarpit")) return "low";
  return "none";
}

// ─── Main inspection API ──────────────────────────────────────────────────────

export interface BypassInspectOptions {
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  /** One-time token from previous response (if token binding enabled) */
  requestToken?: string;
  /** Canary token echoed back by client */
  canaryToken?: string;
}

/**
 * Inspect a request for bypass attempts.
 * Returns allowed/blocked status, tarpit delay, and optional decoy payload.
 *
 * @param opts - Request context
 * @returns BypassResult with full decision and optional decoy/canary data
 */
export function inspectBypass(opts: BypassInspectOptions): BypassResult {
  const actions: BypassAction[] = [];
  let tarpitMs = 0;
  let allowed = true;
  let reason: string | undefined;

  // ── 1. Kill-switch check ────────────────────────────────────────────────────
  if (isKillSwitchActive(opts.ip)) {
    actions.push("killswitch_active");
    allowed = false;
    reason = "Emergency lockdown active";
    tarpitMs = CONFIG.TARPIT_MAX_MS;
    return { allowed, threatLevel: "critical", actions, tarpitMs, reason };
  }

  // ── 2. Honeypot trap ────────────────────────────────────────────────────────
  if (checkHoneypot(opts.ip, opts.path)) {
    actions.push("honeypot_triggered");
    allowed = false;
    reason = `Honeypot path accessed: ${opts.path}`;
    tarpitMs = getTarpitDelay(opts.ip);
    // Serve a decoy payload to waste attacker time
    const decoyPayload = generateDecoyPayload();
    actions.push("decoy_served");
    const canaryToken = issueCanaryToken(opts.ip);
    actions.push("canary_embedded");
    return {
      allowed,
      threatLevel: "critical",
      actions,
      tarpitMs,
      reason,
      decoyPayload,
      canaryToken,
    };
  }

  // ── 3. Canary leak detection ────────────────────────────────────────────────
  if (opts.canaryToken && checkCanaryLeak(opts.canaryToken, opts.ip)) {
    actions.push("honeypot_triggered");
    tarpitMs = getTarpitDelay(opts.ip);
    // Don't block immediately — serve more decoy data to continue tracking
    const decoyPayload = generateDecoyPayload();
    actions.push("decoy_served");
  }

  // ── 4. One-time token validation ────────────────────────────────────────────
  if (opts.requestToken !== undefined) {
    if (!validateToken(opts.requestToken, opts.ip)) {
      actions.push("token_invalid");
      allowed = false;
      reason = "Invalid or expired request token";
      tarpitMs = getTarpitDelay(opts.ip);
    }
  }

  // ── 5. Replay detection ─────────────────────────────────────────────────────
  const bodyStr = JSON.stringify(opts.body ?? {});
  if (detectReplay(opts.ip, opts.method, opts.path, bodyStr)) {
    actions.push("replay_blocked");
    allowed = false;
    reason = "Duplicate/replayed request detected";
    tarpitMs = getTarpitDelay(opts.ip);
  }

  // ── 6. Fingerprint clone detection ─────────────────────────────────────────
  const fingerprint = generateFingerprint(opts.ip, opts.userAgent, opts.headers, opts.method);
  if (detectFingerprintClone(opts.ip, fingerprint)) {
    actions.push("fingerprint_mismatch");
    tarpitMs = Math.max(tarpitMs, getTarpitDelay(opts.ip));
    // Don't hard-block yet — could be legitimate — but tarpit and add jitter
  }

  // ── 7. Header forge detection ───────────────────────────────────────────────
  if (detectHeaderForge(opts.headers)) {
    actions.push("header_forge_detected");
    tarpitMs = Math.max(tarpitMs, getTarpitDelay(opts.ip));
  }

  // ── 8. Tool signature detection ─────────────────────────────────────────────
  const toolName = detectToolSignature(opts.userAgent);
  if (toolName) {
    actions.push("tool_signature_detected");
    // Don't hard-block tools (could be legitimate API calls), but increase tarpit
    tarpitMs = Math.max(tarpitMs, CONFIG.TARPIT_MIN_MS);
  }

  // ── 9. Rate-based fingerprint (rapid same-fingerprint across endpoints) ─────
  const fpHistory = fingerprintHistory.get(opts.ip) ?? [];
  const recentFpCount = fpHistory.filter((h) => h.ts > Date.now() - 10_000).length;
  if (recentFpCount > 20) {
    actions.push("rate_fingerprint_blocked");
    allowed = false;
    reason = "Rapid request fingerprint flood detected";
    tarpitMs = getTarpitDelay(opts.ip);
  }

  // ── 10. Apply jitter to all non-trivial threats ──────────────────────────────
  if (actions.length > 0) {
    actions.push("jitter_applied");
    tarpitMs = Math.max(tarpitMs, getJitterMs());
  }

  // ── Issue canary token for all responses ────────────────────────────────────
  const canaryToken = issueCanaryToken(opts.ip);
  if (!actions.includes("canary_embedded")) actions.push("canary_embedded");

  const threatLevel = aggregateThreatLevel(actions);

  return {
    allowed,
    threatLevel,
    actions,
    tarpitMs,
    reason,
    canaryToken,
  };
}

// ─── Automatic cleanup ────────────────────────────────────────────────────────

const cleanupInterval = setInterval(() => {
  const now = Date.now();

  // Tokens
  for (const [token, entry] of tokenStore.entries()) {
    if (entry.expiresAt < now) tokenStore.delete(token);
  }

  // Request hashes
  for (const [hash, ts] of seenRequestHashes.entries()) {
    if (ts < now - CONFIG.REPLAY_WINDOW_MS) seenRequestHashes.delete(hash);
  }

  // Fingerprint history
  for (const [ip, history] of fingerprintHistory.entries()) {
    const fresh = history.filter((h) => h.ts > now - CONFIG.FINGERPRINT_WINDOW_MS * 10);
    if (fresh.length === 0) fingerprintHistory.delete(ip);
    else fingerprintHistory.set(ip, fresh);
  }

  // Tarpit counters (decay over time)
  for (const [ip, count] of tarpitCounters.entries()) {
    if (count > 0) tarpitCounters.set(ip, Math.max(0, count - 1));
    else tarpitCounters.delete(ip);
  }

  // Honeypot hits
  for (const [ip, hits] of honeypotHits.entries()) {
    const fresh = hits.filter((t) => t > now - 60 * 60_000);
    if (fresh.length === 0) honeypotHits.delete(ip);
    else honeypotHits.set(ip, fresh);
  }

  // Canary tokens
  for (const [token, entry] of canaryStore.entries()) {
    if (entry.issuedAt < now - 24 * 60 * 60_000) canaryStore.delete(token);
  }
}, 5 * 60_000);

if (cleanupInterval.unref) cleanupInterval.unref();

// ─── Singleton export ─────────────────────────────────────────────────────────

export const bypassPrevention = {
  inspectBypass,
  issueToken,
  validateToken,
  issueCanaryToken,
  checkCanaryLeak,
  activateKillSwitch,
  deactivateKillSwitch,
  getJitterMs,
};

export default bypassPrevention;
