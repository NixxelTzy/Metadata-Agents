/**
 * HTTP request validation for detecting malicious or suspicious requests.
 * Covers headers, content type, size, CORS origin, CSRF, bot detection, and JSON structure.
 */

import crypto from "crypto";

export interface ValidationResult {
  valid: boolean;
  /** Threat score from 0 (clean) to 100 (highly suspicious) */
  score: number;
  violations: string[];
}

/** Known malicious/scanner user agents */
const SUSPICIOUS_USER_AGENTS: string[] = [
  "sqlmap",
  "nikto",
  "nmap",
  "masscan",
  "nessus",
  "openvas",
  "w3af",
  "acunetix",
  "arachni",
  "appscan",
  "burpsuite",
  "zaproxy",
  "owasp",
  "metasploit",
  "dirbuster",
  "gobuster",
  "wfuzz",
  "hydra",
  "medusa",
  "havij",
  "pangolin",
  "datasheriff",
  "netsparker",
  "webinspect",
  "paros",
  "webscarab",
  "skipfish",
  "grabber",
  "vega",
  "fierce",
  "recon-ng",
  "maltego",
];

/** User agent patterns indicating bots, crawlers, or scanners */
const BOT_PATTERNS: Array<{ pattern: RegExp; type: string; confidence: number }> = [
  { pattern: /googlebot/i, type: "search_crawler", confidence: 0.95 },
  { pattern: /bingbot/i, type: "search_crawler", confidence: 0.95 },
  { pattern: /slurp/i, type: "search_crawler", confidence: 0.9 },
  { pattern: /duckduckbot/i, type: "search_crawler", confidence: 0.9 },
  { pattern: /baiduspider/i, type: "search_crawler", confidence: 0.9 },
  { pattern: /yandexbot/i, type: "search_crawler", confidence: 0.9 },
  { pattern: /facebookexternalhit/i, type: "social_crawler", confidence: 0.95 },
  { pattern: /twitterbot/i, type: "social_crawler", confidence: 0.95 },
  { pattern: /linkedinbot/i, type: "social_crawler", confidence: 0.95 },
  { pattern: /whatsapp/i, type: "social_crawler", confidence: 0.9 },
  { pattern: /telegrambot/i, type: "social_crawler", confidence: 0.9 },
  { pattern: /python-requests/i, type: "http_library", confidence: 0.7 },
  { pattern: /go-http-client/i, type: "http_library", confidence: 0.7 },
  { pattern: /java\/\d/i, type: "http_library", confidence: 0.65 },
  { pattern: /axios/i, type: "http_library", confidence: 0.5 },
  { pattern: /curl\//i, type: "http_library", confidence: 0.6 },
  { pattern: /wget\//i, type: "http_library", confidence: 0.65 },
  { pattern: /libwww-perl/i, type: "http_library", confidence: 0.7 },
  { pattern: /scrapy/i, type: "scraper", confidence: 0.9 },
  { pattern: /selenium/i, type: "automation", confidence: 0.85 },
  { pattern: /puppeteer/i, type: "automation", confidence: 0.85 },
  { pattern: /playwright/i, type: "automation", confidence: 0.85 },
  { pattern: /headlesschrome/i, type: "automation", confidence: 0.9 },
  { pattern: /phantomjs/i, type: "automation", confidence: 0.95 },
  { pattern: /sqlmap/i, type: "security_scanner", confidence: 1.0 },
  { pattern: /nikto/i, type: "security_scanner", confidence: 1.0 },
  { pattern: /nessus/i, type: "security_scanner", confidence: 1.0 },
  { pattern: /masscan/i, type: "security_scanner", confidence: 1.0 },
];

/**
 * Validate HTTP request headers for suspicious or missing values.
 * @param headers - Key/value map of request headers (lowercase keys recommended)
 * @returns ValidationResult with threat score and violations list
 */
export function validateHeaders(
  headers: Record<string, string>
): ValidationResult {
  const violations: string[] = [];
  let score = 0;

  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v;
  }

  const userAgent = normalized["user-agent"] ?? "";

  // Missing user-agent is suspicious
  if (!userAgent) {
    violations.push("Missing User-Agent header");
    score += 20;
  } else {
    // Check known malicious user agents
    const lowerUa = userAgent.toLowerCase();
    for (const pattern of SUSPICIOUS_USER_AGENTS) {
      if (lowerUa.includes(pattern)) {
        violations.push(`Suspicious User-Agent: ${pattern}`);
        score += 50;
        break;
      }
    }
  }

  // Check for header injection characters
  for (const [key, value] of Object.entries(normalized)) {
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
      violations.push(`Header injection detected in header: ${key}`);
      score += 40;
    }
  }

  // Excessively long header values
  for (const [key, value] of Object.entries(normalized)) {
    if (value.length > 8192) {
      violations.push(`Oversized header value for: ${key}`);
      score += 15;
    }
  }

  // Suspicious content in host header
  const host = normalized["host"] ?? "";
  if (host && /[^a-zA-Z0-9.\-:]/.test(host)) {
    violations.push("Invalid characters in Host header");
    score += 25;
  }

  return {
    valid: violations.length === 0,
    score: Math.min(score, 100),
    violations,
  };
}

/**
 * Validate that the Content-Type header matches the expected type.
 * @param contentType - Actual Content-Type header value
 * @param expected - Expected MIME type (e.g. "application/json")
 * @returns true if the content type matches
 */
export function validateContentType(
  contentType: string,
  expected: string
): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith(expected.toLowerCase());
}

/**
 * Validate that the request body size does not exceed the maximum.
 * @param size - Actual request size in bytes
 * @param maxBytes - Maximum allowed size in bytes
 * @returns true if within limits
 */
export function validateRequestSize(size: number, maxBytes: number): boolean {
  return size >= 0 && size <= maxBytes;
}

/**
 * Validate the Origin header against a list of allowed origins.
 * @param origin - The Origin header value from the request
 * @param allowedOrigins - List of allowed origin strings
 * @returns true if the origin is allowed
 */
export function validateOrigin(
  origin: string,
  allowedOrigins: string[]
): boolean {
  if (!origin) return false;
  const normalized = origin.trim().toLowerCase().replace(/\/$/, "");
  return allowedOrigins
    .map((o) => o.trim().toLowerCase().replace(/\/$/, ""))
    .includes(normalized);
}

/**
 * Validate a CSRF token using timing-safe comparison.
 * This validates simple header-based tokens (double-submit cookie pattern).
 * For HMAC-based CSRF tokens, use `csrfProtection.validateCsrfToken` instead.
 * @param token - Token from the request (header or form field)
 * @param sessionToken - Expected token derived from session
 * @returns true if tokens match
 */
export function validateCsrfHeader(
  token: string,
  sessionToken: string
): boolean {
  if (!token || !sessionToken) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(sessionToken, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Detect bot or automated tool patterns in a User-Agent string.
 * @param userAgent - User-Agent header value
 * @returns Detection result with confidence score and bot type
 */
export function detectBotPattern(userAgent: string): {
  isBot: boolean;
  confidence: number;
  botType?: string;
} {
  if (!userAgent) return { isBot: true, confidence: 0.8, botType: "unknown" };

  for (const entry of BOT_PATTERNS) {
    if (entry.pattern.test(userAgent)) {
      return {
        isBot: true,
        confidence: entry.confidence,
        botType: entry.type,
      };
    }
  }

  // Very short user agents are suspicious
  if (userAgent.length < 10) {
    return { isBot: true, confidence: 0.6, botType: "minimal_ua" };
  }

  return { isBot: false, confidence: 0 };
}

/**
 * Validate JSON body structure to prevent JSON bomb or deeply nested attacks.
 * @param body - Parsed JSON body (unknown type)
 * @param maxDepth - Maximum allowed nesting depth (default: 20)
 * @param maxKeys - Maximum allowed keys per object (default: 100)
 * @returns ValidationResult with score and any violations
 */
export function validateJsonStructure(
  body: unknown,
  maxDepth = 20,
  maxKeys = 100
): ValidationResult {
  const violations: string[] = [];
  let score = 0;

  const actualDepth = getDepth(body, 0);
  if (actualDepth > maxDepth) {
    violations.push(
      `JSON nesting depth ${actualDepth} exceeds maximum ${maxDepth}`
    );
    score += 40;
  }

  const maxFoundKeys = getMaxKeys(body);
  if (maxFoundKeys > maxKeys) {
    violations.push(
      `JSON object has ${maxFoundKeys} keys which exceeds maximum ${maxKeys}`
    );
    score += 30;
  }

  const totalSize = approximateSize(body);
  if (totalSize > 1_000_000) {
    violations.push("JSON body is excessively large");
    score += 20;
  }

  return {
    valid: violations.length === 0,
    score: Math.min(score, 100),
    violations,
  };
}

/** Recursively compute the maximum nesting depth of a value */
function getDepth(value: unknown, current: number): number {
  if (current > 100) return current; // Guard against infinite loops
  if (Array.isArray(value)) {
    if (value.length === 0) return current + 1;
    return Math.max(...value.map((v) => getDepth(v, current + 1)));
  }
  if (value !== null && typeof value === "object") {
    const values = Object.values(value);
    if (values.length === 0) return current + 1;
    return Math.max(...values.map((v) => getDepth(v, current + 1)));
  }
  return current;
}

/** Find the maximum number of keys in any object within the value */
function getMaxKeys(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((max, v) => Math.max(max, getMaxKeys(v)), 0);
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).length;
    const childMax = Object.values(value).reduce(
      (max: number, v) => Math.max(max, getMaxKeys(v)),
      0
    );
    return Math.max(keys, childMax);
  }
  return 0;
}

/** Approximate the JSON serialized byte size */
function approximateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
