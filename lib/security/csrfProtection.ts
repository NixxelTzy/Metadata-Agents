/**
 * CSRF protection using double-submit cookie pattern + HMAC-SHA256.
 * Provides token generation/validation, one-time nonces, and request signatures
 * with replay attack protection.
 *
 * Uses Node.js built-in `crypto` module — no external dependencies required.
 */

import crypto from "crypto";

/** Default CSRF secret — override via environment variable in production */
const DEFAULT_SECRET =
  process.env.CSRF_SECRET ?? "changeme-use-env-csrf-secret-32chars+";

/** In-memory nonce store for one-time use nonces */
const usedNonces = new Map<string, number>();

/** Max age for a nonce before it can be pruned (30 minutes) */
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

/** Max replay attack window for request signatures (5 minutes) */
const DEFAULT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Periodically prune expired nonces to prevent unbounded memory growth.
 * Runs every 10 minutes.
 */
const nonceCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - NONCE_MAX_AGE_MS;
  for (const [nonce, ts] of usedNonces.entries()) {
    if (ts < cutoff) usedNonces.delete(nonce);
  }
}, 10 * 60 * 1000);

// Allow Node.js process to exit even with the interval active
if (nonceCleanupInterval.unref) {
  nonceCleanupInterval.unref();
}

/**
 * Generate an HMAC-SHA256-based CSRF token tied to a session ID.
 * @param sessionId - The current user's session identifier
 * @param secret - HMAC secret key (defaults to CSRF_SECRET env var)
 * @returns Hex-encoded CSRF token
 */
export function generateCsrfToken(sessionId: string, secret?: string): string {
  const key = secret ?? DEFAULT_SECRET;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${sessionId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", key).update(payload).digest("hex");
  // Encode as base64url: timestamp.hmac
  return Buffer.from(`${timestamp}.${hmac}`).toString("base64url");
}

/**
 * Validate a CSRF token for a given session using timing-safe comparison.
 * Tokens are considered valid for 1 hour.
 * @param token - Token from the request header/cookie
 * @param sessionId - The current user's session identifier
 * @param secret - HMAC secret key (defaults to CSRF_SECRET env var)
 * @returns true if the token is valid and not expired
 */
export function validateCsrfToken(
  token: string,
  sessionId: string,
  secret?: string
): boolean {
  if (!token || !sessionId) return false;
  const key = secret ?? DEFAULT_SECRET;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dotIndex = decoded.indexOf(".");
    if (dotIndex === -1) return false;

    const timestamp = decoded.slice(0, dotIndex);
    const providedHmac = decoded.slice(dotIndex + 1);

    // Check token age (max 1 hour)
    const tokenAge = Date.now() / 1000 - parseInt(timestamp, 10);
    if (tokenAge > 3600 || tokenAge < 0) return false;

    // Recompute expected HMAC
    const payload = `${sessionId}:${timestamp}`;
    const expectedHmac = crypto
      .createHmac("sha256", key)
      .update(payload)
      .digest("hex");

    // Timing-safe comparison
    const a = Buffer.from(providedHmac, "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically random one-time nonce.
 * @returns 32-byte hex nonce string
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Validate and consume a one-time nonce.
 * A nonce is valid only if it has not been used before and is not expired.
 * @param nonce - The nonce string to validate
 * @returns true if the nonce is valid; false if already used or expired
 */
export function validateNonce(nonce: string): boolean {
  if (!nonce || typeof nonce !== "string") return false;
  if (usedNonces.has(nonce)) return false;

  // Mark as used
  usedNonces.set(nonce, Date.now());
  return true;
}

/**
 * Generate an HMAC-SHA256 request signature for API request signing.
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @param body - Serialized request body string
 * @param timestamp - Unix timestamp in milliseconds
 * @param secret - Signing secret
 * @returns Hex-encoded HMAC signature
 */
export function generateRequestSignature(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  secret: string
): string {
  const payload = `${method.toUpperCase()}:${path}:${body}:${timestamp}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Validate a request signature and check for replay attacks.
 * @param sig - Provided signature from the request
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Serialized request body string
 * @param timestamp - Unix timestamp from the request
 * @param secret - Signing secret
 * @param maxAgeMs - Maximum age of the signature before rejection (default: 5 minutes)
 * @returns true if the signature is valid and within the time window
 */
export function validateRequestSignature(
  sig: string,
  method: string,
  path: string,
  body: string,
  timestamp: number,
  secret: string,
  maxAgeMs = DEFAULT_SIGNATURE_MAX_AGE_MS
): boolean {
  if (!sig || !secret) return false;

  // Replay attack protection — reject old signatures
  const age = Date.now() - timestamp;
  if (age > maxAgeMs || age < 0) return false;

  const expected = generateRequestSignature(method, path, body, timestamp, secret);

  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Exported object grouping all CSRF protection utilities */
export const csrfProtection = {
  generateCsrfToken,
  validateCsrfToken,
  generateNonce,
  validateNonce,
  generateRequestSignature,
  validateRequestSignature,
};
