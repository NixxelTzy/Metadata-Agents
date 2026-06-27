/**
 * fileEnumerationDefence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Protection against file enumeration, directory traversal, source code
 * disclosure, URL probing, and reconnaissance attacks.
 *
 * Key features:
 *  1. File/path enumeration detection — blocks scanning of source files,
 *     configs, env files, and sensitive paths
 *  2. URL probe detection — detects systematic URL probing patterns
 *  3. Directory traversal blocking — multi-encoding traversal detection
 *  4. Source disclosure prevention — blocks access to source map, build files
 *  5. Decoy payload engine — serves 1–5 MB fake payloads to exhaust attacker
 *     bandwidth and connection slots, then immediately frees server memory
 *  6. Payload self-cleanup — generated payloads are wiped from memory after
 *     use so the server bears zero lasting memory cost
 *  7. Probe velocity tracker — auto-escalates response size for repeat probers
 *  8. Fake directory listing — confuses enumeration tools with fake data
 *  9. Response streaming simulation — trickle fake data slowly to hold
 *     attacker connections open (tarpit via stream)
 * 10. Automatic cleanup — all tracking data expires automatically
 */

import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnumerationThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export interface EnumerationResult {
  /** Whether the request should be allowed through */
  allowed: boolean;
  threatLevel: EnumerationThreatLevel;
  signals: string[];
  /** If truthy, send this as the response body and then discard it */
  decoyPayload?: DecoyPayload;
  /** Artificial delay before responding (ms) */
  tarpitMs: number;
  reason?: string;
}

export interface DecoyPayload {
  /** The fake response body (1–5 MB) */
  body: string;
  /** MIME type to send */
  contentType: string;
  /** Byte size — for Content-Length header */
  sizeBytes: number;
  /**
   * Call this IMMEDIATELY after sending the response.
   * It nullifies the body reference so GC can reclaim memory.
   * The server should never hold onto the payload after sending.
   */
  destroy(): void;
}

// ─── Sensitive path patterns ─────────────────────────────────────────────────

/** Paths that should never be accessible — instant block + decoy */
const FORBIDDEN_EXACT = new Set([
  "/.env", "/.env.local", "/.env.production", "/.env.development",
  "/.env.staging", "/.env.backup", "/.env.bak",
  "/package.json", "/package-lock.json", "/yarn.lock",
  "/tsconfig.json", "/tsconfig.build.json",
  "/next.config.js", "/next.config.ts", "/next.config.mjs",
  "/.gitignore", "/.git/config", "/.git/HEAD",
  "/webpack.config.js", "/babel.config.js",
  "/.htaccess", "/.htpasswd",
  "/wp-config.php", "/config.php", "/database.php",
  "/composer.json", "/composer.lock",
  "/Dockerfile", "/docker-compose.yml", "/docker-compose.yaml",
  "/.dockerenv",
  "/server.js", "/app.js", "/index.js",
  "/prisma/schema.prisma",
  "/vercel.json", "/netlify.toml",
]);

/** Path patterns (regex) that are forbidden */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\/\.git\//i,
  /\/\.svn\//i,
  /\/\.hg\//i,
  /\/__pycache__\//i,
  /\/node_modules\//i,
  /\.env(\.|$)/i,
  /\.map$/i,              // Source maps
  /\.sql$/i,              // Database dumps
  /\.bak$/i,              // Backups
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,
  /\.swp$/i,              // Vim swap files
  /~$/,                   // Editor temp files
  /\/proc\/self\//i,
  /\/etc\/(passwd|shadow|hosts|group)/i,
  /\/windows\/system32/i,
  /\/(web\.config|applicationhost\.config)/i,
  /\/(phpinfo|info)\.php/i,
  /\/actuator\/(env|beans|mappings|health\/details)/i,
  /\/_next\/static\/.*\.js\.map/i,
  /\/api\/(_internal|internal|admin\/debug)/i,
  /\/(graphql|graphiql)\?.*introspection/i,
  /\/swagger(ui|\.json|\.yaml)/i,
  /\/openapi\.(json|yaml)/i,
  /\/\.well-known\/.*private/i,
  /\bsecret\b|\bprivate\b|\bcredential\b/i,
];

/** Extensions that signal source/config file access */
const SENSITIVE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js.map", ".ts.map",
  ".sql", ".db", ".sqlite", ".sqlite3",
  ".pem", ".key", ".crt", ".cer", ".p12", ".pfx",
  ".sh", ".bash", ".zsh", ".fish",
  ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
  ".bak", ".backup", ".old", ".orig", ".swp",
  ".log", ".access_log", ".error_log",
]);

// ─── Probe velocity tracker ───────────────────────────────────────────────────

interface ProbeRecord {
  timestamps: number[];     // timestamps of probe attempts
  uniquePaths: Set<string>; // unique paths probed
  totalProbes: number;
  lastSeen: number;
}

const probeTracker = new Map<string, ProbeRecord>();

const PROBE_THRESHOLDS = {
  WINDOW_MS: 60_000,            // 1-minute sliding window
  LOW_THRESHOLD: 5,             // ≥5 probes/min → low threat
  MEDIUM_THRESHOLD: 15,         // ≥15 probes/min → medium
  HIGH_THRESHOLD: 30,           // ≥30 probes/min → high
  CRITICAL_THRESHOLD: 50,       // ≥50 probes/min → critical + max decoy
} as const;

function recordProbe(ip: string, path: string): ProbeRecord {
  const now = Date.now();
  let rec = probeTracker.get(ip);
  if (!rec) {
    rec = { timestamps: [], uniquePaths: new Set(), totalProbes: 0, lastSeen: now };
    probeTracker.set(ip, rec);
  }
  // Sliding window
  rec.timestamps = rec.timestamps.filter(t => t > now - PROBE_THRESHOLDS.WINDOW_MS);
  rec.timestamps.push(now);
  rec.uniquePaths.add(path);
  rec.totalProbes++;
  rec.lastSeen = now;
  return rec;
}

function getProbeLevel(rec: ProbeRecord): EnumerationThreatLevel {
  const count = rec.timestamps.length;
  if (count >= PROBE_THRESHOLDS.CRITICAL_THRESHOLD) return "critical";
  if (count >= PROBE_THRESHOLDS.HIGH_THRESHOLD)     return "high";
  if (count >= PROBE_THRESHOLDS.MEDIUM_THRESHOLD)   return "medium";
  if (count >= PROBE_THRESHOLDS.LOW_THRESHOLD)      return "low";
  return "none";
}

// ─── Decoy payload engine ─────────────────────────────────────────────────────

/**
 * Size tiers (bytes) based on threat level.
 * Higher threat → larger payload → more attacker bandwidth wasted.
 * Server memory is freed immediately after the payload is sent via destroy().
 */
const DECOY_SIZE_MAP: Record<EnumerationThreatLevel, [number, number]> = {
  none:     [0, 0],
  low:      [512  * 1024,   1 * 1024 * 1024],  // 512 KB – 1 MB
  medium:   [1    * 1024 * 1024, 2 * 1024 * 1024],  // 1 MB – 2 MB
  high:     [2    * 1024 * 1024, 4 * 1024 * 1024],  // 2 MB – 4 MB
  critical: [4    * 1024 * 1024, 5 * 1024 * 1024],  // 4 MB – 5 MB
};

type DecoyFlavor = "json" | "html" | "xml" | "env" | "source";

function pickFlavor(path: string): DecoyFlavor {
  if (path.endsWith(".env") || path.includes("env"))  return "env";
  if (path.endsWith(".html") || path.endsWith(".php")) return "html";
  if (path.endsWith(".xml"))                           return "xml";
  if (path.endsWith(".ts") || path.endsWith(".js"))   return "source";
  return "json";
}

function randomHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

/**
 * Build a fake payload that looks realistic to scanners.
 * The payload is generated on the fly, returned, and immediately eligible
 * for GC once destroy() is called.
 *
 * @param targetBytes - Approximate target size
 * @param flavor - Content flavor to mimic
 * @returns DecoyPayload with a destroy() self-cleanup method
 */
function buildDecoyPayload(targetBytes: number, flavor: DecoyFlavor): DecoyPayload {
  let body: string;
  let contentType: string;

  if (flavor === "env") {
    // Looks like a .env file with fake credentials
    const lines: string[] = [];
    const fakeKeys = [
      "DATABASE_URL", "JWT_SECRET", "API_KEY", "SECRET_KEY",
      "STRIPE_SECRET", "AWS_ACCESS_KEY", "AWS_SECRET_KEY",
      "REDIS_URL", "SMTP_PASSWORD", "OAUTH_SECRET",
      "NEXTAUTH_SECRET", "ENCRYPTION_KEY", "MASTER_KEY",
    ];
    while (
      lines.join("\n").length < targetBytes - 200
    ) {
      for (const k of fakeKeys) {
        lines.push(`${k}=${randomHex(48)}`);
      }
    }
    body = lines.join("\n");
    contentType = "text/plain";

  } else if (flavor === "html") {
    // Fake HTML page with lots of lorem ipsum content
    const paragraphs: string[] = [];
    const lorem = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
    while (paragraphs.join("").length < targetBytes - 500) {
      paragraphs.push(`<p>${lorem.repeat(Math.ceil(200 / lorem.length))}</p>`);
      paragraphs.push(`<!-- ${randomHex(32)} -->`);
    }
    body = `<!DOCTYPE html><html><head><title>Error</title></head><body>${paragraphs.join("\n")}</body></html>`;
    contentType = "text/html";

  } else if (flavor === "xml") {
    const items: string[] = [];
    while (items.join("").length < targetBytes - 200) {
      items.push(`<item id="${randomHex(8)}"><value>${randomHex(64)}</value><meta>${randomHex(32)}</meta></item>`);
    }
    body = `<?xml version="1.0" encoding="UTF-8"?><root>${items.join("\n")}</root>`;
    contentType = "application/xml";

  } else if (flavor === "source") {
    // Fake TypeScript/JS source code
    const lines: string[] = [
      `// Auto-generated ${new Date().toISOString()}`,
      `import crypto from 'crypto';`,
      `const SECRET = '${randomHex(32)}';`,
      `const DB_URL = 'postgresql://user:${randomHex(16)}@localhost:5432/db';`,
    ];
    while (lines.join("\n").length < targetBytes - 500) {
      const fn = `fn_${randomHex(6)}`;
      lines.push(`\nexport function ${fn}(input: string): string {`);
      lines.push(`  const key = '${randomHex(32)}';`);
      lines.push(`  return crypto.createHmac('sha256', key).update(input).digest('hex');`);
      lines.push(`}`);
      lines.push(`// ${randomHex(40)}`);
    }
    body = lines.join("\n");
    contentType = "text/plain";

  } else {
    // JSON flavor — looks like a real API response with leaked data
    const entries: string[] = [];
    const fakeKeys = ["token", "hash", "secret", "id", "key", "value", "data", "meta", "config"];
    while (entries.join("").length < targetBytes - 100) {
      const k = fakeKeys[Math.floor(Math.random() * fakeKeys.length)] ?? "key";
      entries.push(`"${k}_${randomHex(4)}":"${randomHex(64)}"`);
    }
    body = `{"status":"ok","timestamp":${Date.now()},"data":{${entries.join(",")}}}`;
    contentType = "application/json";
  }

  // Pad to target size if needed
  if (body.length < targetBytes) {
    const pad = "0".repeat(targetBytes - body.length);
    // Insert padding as a comment-style suffix that doesn't break the format
    body = body + (flavor === "json" ? `<!-- ${pad} -->` : ` /* ${pad} */`);
  }

  const sizeBytes = Buffer.byteLength(body, "utf8");

  // Wrap in a container that can zero out the body reference
  const container = { body };

  return {
    body: container.body,
    contentType,
    sizeBytes,
    destroy() {
      // Zero out memory — overwrite with empty string so GC reclaims it
      container.body = "";
      (this as { body: string }).body = "";
    },
  };
}

/**
 * Create a decoy payload sized for the given threat level.
 * Returns null for "none" threat level (no payload needed).
 */
export function createDecoy(
  threatLevel: EnumerationThreatLevel,
  path: string
): DecoyPayload | null {
  const [min, max] = DECOY_SIZE_MAP[threatLevel];
  if (min === 0) return null;

  const targetBytes = min + Math.floor(Math.random() * (max - min));
  const flavor = pickFlavor(path);
  return buildDecoyPayload(targetBytes, flavor);
}

// ─── Fake directory listing ───────────────────────────────────────────────────

/**
 * Generate a convincing fake directory listing to confuse enumeration tools.
 * These are fake paths — no real files are disclosed.
 */
export function generateFakeDirectoryListing(basePath: string): string {
  const fakeFiles = [
    "config.bak", "database.old", "backup.sql", ".env.bak",
    "secrets.json", "admin.php", "debug.log", "test.php",
    "credentials.txt", "keys.pem", "private.key",
    `deploy_${randomHex(4)}.sh`, `dump_${randomHex(4)}.sql`,
  ];
  const entries = fakeFiles.map(f =>
    `<a href="${basePath}/${f}">${f}</a> ${randomHex(8)}\n`
  );
  return `<!DOCTYPE html><html><body><pre>\nIndex of ${basePath}\n\n${entries.join("")}\n</pre></body></html>`;
}

// ─── Detection functions ──────────────────────────────────────────────────────

/**
 * Check if a path is forbidden (exact match or pattern match).
 */
export function isForbiddenPath(path: string): boolean {
  const clean = decodeURIComponent(path)
    .replace(/\/+/g, "/")
    .replace(/\\/g, "/")
    .toLowerCase();

  if (FORBIDDEN_EXACT.has(clean)) return true;
  if (FORBIDDEN_PATTERNS.some(p => p.test(clean))) return true;

  // Check extension
  const ext = clean.includes(".") ? "." + clean.split(".").pop() : "";
  if (SENSITIVE_EXTENSIONS.has(ext)) return true;

  return false;
}

/**
 * Detect URL probing patterns: sequential numeric IDs, UUID enumeration,
 * alphabetic enumeration, etc.
 */
export function detectUrlProbing(paths: string[]): boolean {
  if (paths.length < 5) return false;

  // Sequential numeric IDs: /item/1, /item/2, /item/3 …
  const numericPattern = /\/(\d+)(\/|$)/;
  const numbers = paths
    .map(p => numericPattern.exec(p)?.[1])
    .filter(Boolean)
    .map(Number);

  if (numbers.length >= 5) {
    const sorted = [...numbers].sort((a, b) => a - b);
    let sequential = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]! - sorted[i - 1]! <= 2) sequential++;
    }
    if (sequential >= 4) return true;
  }

  // UUID enumeration: many requests with different UUIDs on same base path
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const uuidPaths = paths.filter(p => uuidPattern.test(p));
  if (uuidPaths.length >= 5) return true;

  // Alphabetic enumeration: /item/a, /item/b …
  const alphaPattern = /\/([a-z])(?:\/|$)/;
  const alphas = paths.map(p => alphaPattern.exec(p)?.[1]).filter(Boolean);
  const uniqueAlphas = new Set(alphas);
  if (uniqueAlphas.size >= 5) return true;

  return false;
}

// ─── Trickle stream helper ────────────────────────────────────────────────────

/**
 * Generate an async generator that trickles fake data slowly.
 * Use this to hold attacker connections open while wasting minimal server CPU.
 * Each chunk is generated on demand and GC'd immediately after yield.
 *
 * @param totalBytes - Total bytes to stream
 * @param chunkBytes - Bytes per chunk
 * @param delayMs - Delay between chunks (ms)
 */
export async function* trickleStream(
  totalBytes: number,
  chunkBytes = 1024,
  delayMs = 500
): AsyncGenerator<string, void, unknown> {
  let sent = 0;
  while (sent < totalBytes) {
    const chunk = randomHex(chunkBytes / 2); // hex = 2 chars per byte
    sent += chunk.length;
    yield chunk;
    // Deliberately slow — holds attacker connection without blocking event loop
    await new Promise(r => setTimeout(r, delayMs));
  }
}

// ─── Main inspection function ─────────────────────────────────────────────────

export interface EnumerationInspectOptions {
  ip: string;
  path: string;
  method: string;
  /** Recent paths accessed by this IP (for probe detection) */
  recentPaths?: string[];
  userAgent?: string;
}

/**
 * Inspect a request for file/URL enumeration and reconnaissance attacks.
 *
 * How to use the decoy payload:
 * ```ts
 * const result = inspectEnumeration({ ip, path, method });
 * if (result.decoyPayload) {
 *   // Send the decoy response
 *   res.setHeader('Content-Type', result.decoyPayload.contentType);
 *   res.send(result.decoyPayload.body);
 *   result.decoyPayload.destroy(); // ← MUST call this to free server memory
 *   return;
 * }
 * ```
 *
 * @param opts - Request context
 * @returns EnumerationResult with action guidance and optional decoy
 */
export function inspectEnumeration(opts: EnumerationInspectOptions): EnumerationResult {
  const signals: string[] = [];
  let threatLevel: EnumerationThreatLevel = "none";
  let allowed = true;
  let tarpitMs = 0;
  let reason: string | undefined;

  // ── 1. Forbidden path check ──────────────────────────────────────────────────
  if (isForbiddenPath(opts.path)) {
    signals.push(`Forbidden path accessed: ${opts.path}`);
    threatLevel = "critical";
    allowed = false;
    reason = "Access to protected resource denied";
  }

  // ── 2. Probe velocity tracking ────────────────────────────────────────────────
  const rec = recordProbe(opts.ip, opts.path);
  const probeLevel = getProbeLevel(rec);

  if (probeLevel !== "none") {
    signals.push(`Probe velocity: ${rec.timestamps.length} requests in 60s (level: ${probeLevel})`);
    if (probeLevel === "critical" || probeLevel === "high") {
      allowed = false;
      reason = reason ?? "Excessive probe velocity detected";
    }
    // Escalate to highest threat
    const levels: EnumerationThreatLevel[] = ["none", "low", "medium", "high", "critical"];
    if (levels.indexOf(probeLevel) > levels.indexOf(threatLevel)) {
      threatLevel = probeLevel;
    }
  }

  // ── 3. URL probing pattern ────────────────────────────────────────────────────
  const pathsToCheck = opts.recentPaths ?? [];
  pathsToCheck.push(opts.path);
  if (detectUrlProbing(pathsToCheck)) {
    signals.push("Sequential URL probing pattern detected");
    if (threatLevel === "none" || threatLevel === "low") threatLevel = "medium";
  }

  // ── 4. Suspicious user-agent ──────────────────────────────────────────────────
  const ua = (opts.userAgent ?? "").toLowerCase();
  const scannerUa = ["gobuster", "dirbuster", "wfuzz", "ffuf", "feroxbuster",
    "dirb", "nikto", "nuclei", "httpx", "zgrab", "masscan"];
  const matchedUa = scannerUa.find(s => ua.includes(s));
  if (matchedUa) {
    signals.push(`Enumeration tool detected: ${matchedUa}`);
    threatLevel = "critical";
    allowed = false;
    reason = reason ?? `Known enumeration tool: ${matchedUa}`;
  }

  // ── 5. Multi-encoding traversal ───────────────────────────────────────────────
  const decodedPath = decodeURIComponent(opts.path);
  const traversalPatterns = [
    /\.\.\//,  /\.\.\\/,
    /%2e%2e/i, /%252e/i, /\.\.%2f/i, /\.\.%5c/i,
    /%c0%ae/i, /%c0%af/i,
  ];
  if (traversalPatterns.some(p => p.test(opts.path) || p.test(decodedPath))) {
    signals.push("Directory traversal encoding detected");
    threatLevel = "critical";
    allowed = false;
    reason = reason ?? "Directory traversal attempt blocked";
  }

  // ── 6. Unique path diversity ──────────────────────────────────────────────────
  if (rec.uniquePaths.size > 25) {
    signals.push(`High path diversity: ${rec.uniquePaths.size} unique paths from this IP`);
    if (threatLevel === "none") threatLevel = "medium";
  }

  // ── 7. Calculate tarpit delay ─────────────────────────────────────────────────
  const tarpitMap: Record<EnumerationThreatLevel, number> = {
    none:     0,
    low:      1_000,
    medium:   5_000,
    high:     15_000,
    critical: 30_000,
  };
  tarpitMs = tarpitMap[threatLevel];
  // Add random jitter ±20%
  tarpitMs = Math.round(tarpitMs * (0.8 + Math.random() * 0.4));

  // ── 8. Build decoy payload ───────────────────────────────────────────────────
  // Only serve decoy when there's a meaningful threat and request is blocked
  let decoyPayload: DecoyPayload | undefined;
  if (!allowed && threatLevel !== "none") {
    const decoy = createDecoy(threatLevel, opts.path);
    if (decoy) decoyPayload = decoy;
  }

  return {
    allowed,
    threatLevel,
    signals,
    decoyPayload,
    tarpitMs,
    reason,
  };
}

// ─── Automatic cleanup ────────────────────────────────────────────────────────

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoff = now - 10 * 60_000; // 10 minutes
  for (const [ip, rec] of probeTracker.entries()) {
    if (rec.lastSeen < cutoff) {
      probeTracker.delete(ip);
    } else {
      // Trim old timestamps
      rec.timestamps = rec.timestamps.filter(t => t > now - PROBE_THRESHOLDS.WINDOW_MS);
    }
  }
}, 5 * 60_000);

if (cleanupInterval.unref) cleanupInterval.unref();

// ─── Singleton export ─────────────────────────────────────────────────────────

export const fileEnumerationDefence = {
  inspectEnumeration,
  isForbiddenPath,
  detectUrlProbing,
  createDecoy,
  generateFakeDirectoryListing,
  trickleStream,
};

export default fileEnumerationDefence;
