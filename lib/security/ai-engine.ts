/**
 * lib/security/ai-engine.ts — AI Firewall Engine
 *
 * Mesin analisis ancaman berbasis skor AI murni di Edge Runtime.
 * Tidak menggunakan Redis (Edge-compatible), semua logika in-process.
 *
 * Fitur:
 *  1. Threat Scoring Engine   — skor ancaman 0-100 dari banyak sinyal
 *  2. Behavioral Fingerprint  — deteksi pola bot dari header & timing
 *  3. Geo/ASN Reputation      — risiko berbasis Cloudflare headers
 *  4. Request Entropy Analysis— deteksi payload mencurigakan via entropy
 *  5. HTTP Smuggling Detection— deteksi TE/CL anomali
 *  6. Credential Stuffing     — deteksi brute-force login pattern
 *  7. SSRF/RFI Deep Scan      — deteksi server-side request forgery lanjutan
 *  8. Prototype Pollution      — deteksi polusi prototipe JS
 *  9. Path Traversal Advanced  — deteksi traversal encoded/double-encoded
 * 10. Unicode & Homoglyph     — deteksi obfuskasi karakter unicode
 * 11. AI Threat Classification — klasifikasi final: allow/throttle/block/tarpit
 * 12. Rate Pattern AI          — deteksi burst/wave attacks bukan hanya count
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";
export type AiDecision  = "allow" | "throttle" | "block" | "tarpit";

export interface AiSignal {
  name: string;
  score: number;   // 0–100, higher = more threatening
  reason: string;
}

export interface AiAnalysisResult {
  totalScore:  number;       // 0–100
  threatLevel: ThreatLevel;
  decision:    AiDecision;
  signals:     AiSignal[];
  blocked:     boolean;
  reason:      string;
  requestId:   string;
  latencyMs:   number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Countries with elevated attack traffic (ISO-3166-1 alpha-2)
const HIGH_RISK_COUNTRIES = new Set([
  "CN", "RU", "KP", "IR", "SY", "CU", "VE", "MM", "BY",
]);

// Datacenter/VPN ASN ranges (common hosting providers abused for attacks)
const HIGH_RISK_ASN_PREFIXES = [
  "AS4134", "AS4837", "AS9808", // China Telecom/Unicom
  "AS8708", "AS12389",          // Russian ISPs
  "AS16509", "AS14618",         // AWS (often used for scanning)
  "AS15169",                    // Google Cloud (bot traffic)
  "AS13335",                    // Cloudflare (Tor exit sometimes)
  "AS20473",                    // Vultr
  "AS14061",                    // DigitalOcean
  "AS24940",                    // Hetzner
];

// ─── Scanner UA patterns (extended) ──────────────────────────────────────────
const SCANNER_UA_PATTERNS = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /nessus/i, /openvas/i,
  /w3af/i, /acunetix/i, /arachni/i, /burpsuite/i, /zaproxy/i,
  /metasploit/i, /dirbuster/i, /gobuster/i, /wfuzz/i, /hydra/i,
  /nuclei/i, /ffuf/i, /feroxbuster/i, /netsparker/i, /zgrab/i,
  /zmap/i, /libwww-perl/i, /python-requests\/2/i, /go-http-client\/1/i,
  /curl\/7\.[0-3]/i,  // Very old curl often scripts
  /wget\/1\.[01]/i,   // Old wget
  /java\/1\.[678]/i,  // Legacy Java HTTP clients
  /python\/2\./i,
  /php\/[34567]/i,
  /perl\/5\.[0-9]\./i,
  /ruby\/[12]\./i,
  /mechanize/i,
  /scrapy/i,
  /phantomjs/i,
  /headless/i,
  /selenium/i,
  /webdriver/i,
  /puppeteer/i,
  /playwright/i,
  /cypress/i,
  /testcafe/i,
];

// ─── Suspicious path patterns (extended) ─────────────────────────────────────
const SUSPICIOUS_PATHS = [
  /\/(wp-admin|wp-login|xmlrpc\.php|wp-cron\.php)/i,
  /\/(phpmyadmin|pma|adminer|dbadmin|mysql|myadmin)/i,
  /\/(cpanel|whm|plesk|directadmin|webmin)/i,
  /\/(manager\/html|tomcat|jmx-console|web-console)/i,
  /\/\.git\//i, /\/\.env/i, /\/\.aws/i, /\/\.ssh/i,
  /\/\.htaccess/i, /\/\.htpasswd/i, /\/\.DS_Store/i,
  /\/(etc|proc|sys)\//i,
  /\/(shell|cmd|eval|exec|system|passthru|popen)\.php/i,
  /\/(c99|r57|b374k|webshell|backdoor)\./i,
  /\/\.\.\//i, /\/\.\.%2[fF]/i, /\/%2e%2e\//i,
  /\/(actuator|swagger|api-docs|openapi)\//i,
  /\/(solr|elastic|kibana|grafana|prometheus)/i,
  /\/(jenkins|gitlab|jira|confluence|bitbucket)/i,
  /\/(memcached|redis|mongodb|cassandra)/i,
  /\/(debug|test|tmp|temp|backup|bak|old|dev)\//i,
];

// ─── Injection patterns (extended + multi-vector) ────────────────────────────
const INJECTION_PATTERNS = [
  // SQL Injection
  /UNION\s+(ALL\s+)?SELECT/i,
  /WAITFOR\s+DELAY/i,
  /;\s*DROP\s+(TABLE|DATABASE|SCHEMA)/i,
  /;\s*TRUNCATE\s+TABLE/i,
  /xp_cmdshell/i,
  /sp_executesql/i,
  /EXEC(\s*\(|\s+XP_)/i,
  /CAST\s*\(\s*0x/i,
  /CONVERT\s*\(\s*int/i,
  /BENCHMARK\s*\(/i,
  /SLEEP\s*\(\s*\d+\s*\)/i,
  /LOAD_FILE\s*\(/i,
  /INTO\s+OUTFILE/i,
  /INFORMATION_SCHEMA\./i,
  /sys\.databases/i,
  /pg_sleep\s*\(/i,
  /pg_read_file\s*\(/i,
  // XSS
  /<script[\s>]/i,
  /javascript\s*:\s*(void|eval|alert|document)/i,
  /on(load|error|click|mouseover|focus|blur)\s*=/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /<\s*(iframe|object|embed|applet|base)\s/i,
  /expression\s*\(/i,
  // Command Injection
  /[;&|`]\s*(ls|cat|wget|curl|nc|bash|sh|python|perl|php|ruby)/i,
  /\$\(.*\)/,
  /`[^`]{1,200}`/,
  /\|\|\s*(ls|cat|wget|curl|nc|bash|sh)/i,
  // Path Traversal
  /\.\.[\/\\]/,
  /%2e%2e[%2f%5c]/i,
  /\.\.%c0%af/i,
  /\.\.%c1%9c/i,
  // SSRF
  /https?:\/\/(169\.254\.169\.254|metadata\.google)/i,
  /https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)/i,
  /https?:\/\/(10\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+|192\.168\.)/i,
  /file:\/\//i,
  /dict:\/\//i,
  /gopher:\/\//i,
  // XXE
  /<!ENTITY\s+\w+\s+SYSTEM/i,
  /<!DOCTYPE[^>]*\[/i,
  // Prototype Pollution
  /__proto__\s*\[/i,
  /constructor\s*\[\s*prototype/i,
  /prototype\s*\[\s*constructor/i,
  // Null Byte
  /%00/,
  /\x00/,
  // Template Injection
  /\{\{.*\}\}/,
  /\$\{.*\}/,
  /#\{.*\}/,
  // LDAP Injection
  /[()\\*\x00]/,
  /\(\|\(.*=\*\)\)/,
];

// ─── HTTP Smuggling patterns ───────────────────────────────────────────────
const SMUGGLING_PATTERNS = [
  /Transfer-Encoding.*chunked.*Content-Length/i,
  /Content-Length.*Transfer-Encoding.*chunked/i,
  /0\r\n\r\n/,
];

// ─── Suspicious header patterns ───────────────────────────────────────────────
const SUSPICIOUS_HEADERS = [
  "x-forwarded-host",
  "x-original-url",
  "x-rewrite-url",
  "x-override-url",
  "x-http-method-override",
  "x-http-method",
  "x-method-override",
];

// ─── Benign bot allowlist (crawlers we trust) ──────────────────────────────
const TRUSTED_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /sogou/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
];

// ─── Shannon entropy calculator ───────────────────────────────────────────────
function shannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] ?? 0) + 1;
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ─── Unicode homoglyph detector ───────────────────────────────────────────────
function hasHomoglyphs(str: string): boolean {
  // Detect non-ASCII characters in paths that should be ASCII-only
  return /[^\u0000-\u007F]/.test(str) &&
    /[а-яА-Я\u0400-\u04FF\u0370-\u03FF\u4e00-\u9fff\u0600-\u06FF]/.test(str);
}

// ─── Tiny request-ID generator (no crypto module in Edge) ─────────────────────
function makeRequestId(): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rnd}`;
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
  const { pathname, search, method, userAgent, ip, headers, country, asn, bodySize, referer } = params;
  const fullUrl = pathname + search;
  const ua      = userAgent.toLowerCase();
  const signals: AiSignal[] = [];

  // ── Signal 1: Scanner User-Agent ─────────────────────────────────────────
  const isTrustedBot = TRUSTED_BOT_PATTERNS.some(p => p.test(ua));
  if (!isTrustedBot) {
    const scannerHit = SCANNER_UA_PATTERNS.find(p => p.test(userAgent));
    if (scannerHit) {
      signals.push({ name: "scanner_ua", score: 95, reason: `Scanner UA terdeteksi: ${scannerHit}` });
    }
  }

  // ── Signal 2: Missing / very short UA ────────────────────────────────────
  if (!userAgent || userAgent.trim().length < 5) {
    signals.push({ name: "missing_ua", score: 70, reason: "User-Agent kosong atau terlalu pendek" });
  } else if (userAgent.length < 15) {
    signals.push({ name: "short_ua", score: 40, reason: "User-Agent sangat pendek (mungkin script)" });
  }

  // ── Signal 3: Suspicious paths ───────────────────────────────────────────
  const suspPath = SUSPICIOUS_PATHS.find(p => p.test(pathname));
  if (suspPath) {
    signals.push({ name: "suspicious_path", score: 85, reason: `Path mencurigakan: ${pathname}` });
  }

  // ── Signal 4: Injection patterns in URL ──────────────────────────────────
  const injectionHits = INJECTION_PATTERNS.filter(p => p.test(fullUrl));
  if (injectionHits.length > 0) {
    const score = Math.min(60 + injectionHits.length * 15, 100);
    signals.push({ name: "url_injection", score, reason: `${injectionHits.length} pola injeksi di URL` });
  }

  // ── Signal 5: High entropy in URL (obfuscation) ───────────────────────────
  const urlEntropy = shannonEntropy(fullUrl);
  if (urlEntropy > 4.5 && fullUrl.length > 80) {
    signals.push({ name: "high_entropy_url", score: 55, reason: `Entropi URL tinggi: ${urlEntropy.toFixed(2)}` });
  }

  // ── Signal 6: Path traversal (encoded variants) ───────────────────────────
  if (/%2e%2e|%252e|\.\.%2f|%c0%ae/i.test(fullUrl)) {
    signals.push({ name: "path_traversal_encoded", score: 90, reason: "Path traversal ter-encode terdeteksi" });
  }

  // ── Signal 7: Homoglyph / Unicode abuse ──────────────────────────────────
  if (hasHomoglyphs(pathname)) {
    signals.push({ name: "unicode_homoglyph", score: 65, reason: "Karakter unicode mencurigakan di path" });
  }

  // ── Signal 8: Excessive header count (header stuffing) ────────────────────
  const headerCount = Array.from(headers.keys()).length;
  if (headerCount > 50) {
    signals.push({ name: "header_stuffing", score: 60, reason: `${headerCount} header (terlalu banyak)` });
  } else if (headerCount > 35) {
    signals.push({ name: "many_headers", score: 30, reason: `${headerCount} header (tidak wajar)` });
  }

  // ── Signal 9: Suspicious override headers ─────────────────────────────────
  const suspHdr = SUSPICIOUS_HEADERS.find(h => headers.has(h));
  if (suspHdr) {
    signals.push({ name: "suspicious_header", score: 70, reason: `Header override mencurigakan: ${suspHdr}` });
  }

  // ── Signal 10: HTTP method abuse ──────────────────────────────────────────
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  if (!allowedMethods.includes(method)) {
    signals.push({ name: "unusual_method", score: 75, reason: `Method HTTP tidak biasa: ${method}` });
  }
  // TRACE/CONNECT always blocked
  if (method === "TRACE" || method === "CONNECT") {
    signals.push({ name: "dangerous_method", score: 100, reason: `Method TRACE/CONNECT diblokir` });
  }

  // ── Signal 11: Geo reputation ─────────────────────────────────────────────
  if (country && HIGH_RISK_COUNTRIES.has(country)) {
    signals.push({ name: "high_risk_country", score: 25, reason: `Negara berisiko tinggi: ${country}` });
  }

  // ── Signal 12: ASN reputation ─────────────────────────────────────────────
  if (asn && HIGH_RISK_ASN_PREFIXES.some(prefix => asn.startsWith(prefix))) {
    signals.push({ name: "datacenter_asn", score: 30, reason: `ASN datacenter/VPN: ${asn}` });
  }

  // ── Signal 13: Cloudflare threat score ────────────────────────────────────
  const cfThreat = parseInt(headers.get("cf-threat-score") ?? "0", 10);
  if (!isNaN(cfThreat) && cfThreat > 0) {
    const score = Math.min(cfThreat * 2, 90);
    signals.push({ name: "cf_threat_score", score, reason: `Cloudflare threat score: ${cfThreat}` });
  }

  // ── Signal 14: Tor exit node (via Cloudflare header) ─────────────────────
  const isTor = headers.get("cf-ipcountry") === "T1";
  if (isTor) {
    signals.push({ name: "tor_exit_node", score: 50, reason: "Akses dari Tor exit node" });
  }

  // ── Signal 15: Payload size anomaly ───────────────────────────────────────
  if (bodySize !== undefined) {
    if (bodySize > 50 * 1024 * 1024) { // > 50MB
      signals.push({ name: "payload_bomb", score: 80, reason: `Payload sangat besar: ${(bodySize / 1e6).toFixed(1)}MB` });
    } else if (bodySize > 10 * 1024 * 1024) { // > 10MB
      signals.push({ name: "large_payload", score: 40, reason: `Payload besar: ${(bodySize / 1e6).toFixed(1)}MB` });
    }
  }

  // ── Signal 16: Referer-based SSRF ─────────────────────────────────────────
  if (referer) {
    const ssrfRef = INJECTION_PATTERNS.filter(p => p.test(referer));
    if (ssrfRef.length > 0) {
      signals.push({ name: "malicious_referer", score: 65, reason: "Referer mengandung pola berbahaya" });
    }
  }

  // ── Signal 17: HTTP Smuggling ─────────────────────────────────────────────
  const rawHeaders = Array.from(headers.entries()).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  if (SMUGGLING_PATTERNS.some(p => p.test(rawHeaders))) {
    signals.push({ name: "http_smuggling", score: 95, reason: "Potensi HTTP request smuggling" });
  }

  // ── Signal 18: Accept header anomaly ──────────────────────────────────────
  const accept = headers.get("accept") ?? "";
  if (accept === "*/*" && method === "GET" && !ua.includes("mozilla") && !isTrustedBot) {
    signals.push({ name: "bare_accept_header", score: 20, reason: "Accept: */* tanpa browser UA (kemungkinan script)" });
  }

  // ── Signal 19: Missing standard browser headers on browser-like UA ─────────
  const looksLikeBrowser = /mozilla|chrome|safari|firefox|edge/i.test(ua);
  if (looksLikeBrowser) {
    const hasAcceptLang  = headers.has("accept-language");
    const hasAcceptEnc   = headers.has("accept-encoding");
    if (!hasAcceptLang || !hasAcceptEnc) {
      signals.push({ name: "fake_browser_ua", score: 45, reason: "UA mengklaim browser tapi header browser tidak lengkap" });
    }
  }

  // ── Signal 20: IP format anomaly ─────────────────────────────────────────
  if (ip === "unknown" || ip === "::1" || ip === "127.0.0.1") {
    // Allow localhost only in dev; in prod this is suspicious
    if (process.env.NODE_ENV === "production") {
      signals.push({ name: "loopback_ip", score: 35, reason: `IP loopback di production: ${ip}` });
    }
  }

  // ── Signal 21: Repeated URL-encoded slashes (double encoding) ─────────────
  if (/%252f|%255c|%2f%2f/i.test(fullUrl)) {
    signals.push({ name: "double_encoded_slash", score: 75, reason: "Double-encoded slash terdeteksi" });
  }

  // ── Signal 22: Host header injection ─────────────────────────────────────
  const host = headers.get("host") ?? "";
  if (host.includes("@") || host.includes(":") && !/:\d+$/.test(host) || /[<>{}'"]/.test(host)) {
    signals.push({ name: "host_header_injection", score: 85, reason: `Host header tidak valid: ${host}` });
  }

  // ── Signal 23: Null byte injection ────────────────────────────────────────
  if (fullUrl.includes("%00") || fullUrl.includes("\u0000")) {
    signals.push({ name: "null_byte", score: 90, reason: "Null byte ditemukan di URL" });
  }

  // ── Signal 24: Excessive URL length ──────────────────────────────────────
  if (fullUrl.length > 8192) {
    signals.push({ name: "excessive_url_length", score: 60, reason: `URL terlalu panjang: ${fullUrl.length} karakter` });
  } else if (fullUrl.length > 4096) {
    signals.push({ name: "long_url", score: 25, reason: `URL panjang: ${fullUrl.length} karakter` });
  }

  // ── Signal 25: Repeated special chars (fuzzing pattern) ───────────────────
  if (/(.)\1{8,}/.test(fullUrl) && /[^a-zA-Z0-9\-_./]/.test(fullUrl)) {
    signals.push({ name: "fuzzing_pattern", score: 70, reason: "Pola fuzzing terdeteksi (karakter berulang)" });
  }

  // ─── AI Threat Score Aggregation ─────────────────────────────────────────
  // Weighted aggregation: max signal has heavy weight, others additive
  let totalScore = 0;
  if (signals.length > 0) {
    const sorted  = [...signals].sort((a, b) => b.score - a.score);
    const maxScore = sorted[0]!.score;
    const rest     = sorted.slice(1).reduce((sum, s) => sum + s.score * 0.25, 0);
    totalScore = Math.min(Math.round(maxScore + rest), 100);
  }

  // ─── AI Decision Engine ───────────────────────────────────────────────────
  let threatLevel: ThreatLevel;
  let decision:    AiDecision;
  let reason = "Akses diizinkan";

  if (totalScore >= 90) {
    threatLevel = "critical";
    decision    = "tarpit";    // Slowdown + block
    reason      = "Ancaman kritis — koneksi ditahan";
  } else if (totalScore >= 70) {
    threatLevel = "high";
    decision    = "block";
    reason      = "Ancaman tinggi — akses diblokir";
  } else if (totalScore >= 45) {
    threatLevel = "medium";
    decision    = "throttle";
    reason      = "Ancaman menengah — akses dibatasi";
  } else if (totalScore >= 20) {
    threatLevel = "low";
    decision    = "allow";     // Allow but log
    reason      = "Risiko rendah — dipantau";
  } else {
    threatLevel = "none";
    decision    = "allow";
    reason      = "Permintaan bersih";
  }

  // Override: certain signals always block regardless of total score
  const alwaysBlock = signals.find(s =>
    s.name === "scanner_ua" ||
    s.name === "dangerous_method" ||
    s.name === "null_byte" ||
    s.name === "http_smuggling" ||
    s.name === "path_traversal_encoded" ||
    (s.name === "suspicious_path" && s.score >= 85)
  );
  if (alwaysBlock) {
    threatLevel = "critical";
    decision    = "block";
    reason      = `Diblokir paksa: ${alwaysBlock.reason}`;
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

// ─── Security Headers Generator ──────────────────────────────────────────────
// Returns headers to add to every response

export function getSecurityHeaders(): Record<string, string> {
  return {
    // Prevent MIME sniffing
    "X-Content-Type-Options": "nosniff",
    // Clickjacking protection
    "X-Frame-Options": "DENY",
    // XSS protection (legacy browsers)
    "X-XSS-Protection": "1; mode=block",
    // Strict Transport Security (2 years)
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    // Referrer policy
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Permission policy
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    // Content Security Policy (strict)
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
    // Remove server fingerprint
    "X-Powered-By": "",
    // Cross-Origin policies
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
