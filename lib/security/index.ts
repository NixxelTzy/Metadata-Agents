/**
 * Security module entry point.
 * Explicit named re-exports to avoid ambiguity between modules.
 */

// ── rateLimiter ───────────────────────────────────────────────────────────────
export type { RateLimitResult, RateLimitTier } from "./rateLimiter";
export { TIERS, MultiTierRateLimiter, rateLimiter } from "./rateLimiter";

// ── ipAnalyzer ────────────────────────────────────────────────────────────────
export type { IpAnalysis } from "./ipAnalyzer";
export { IpAnalyzer, ipAnalyzer } from "./ipAnalyzer";

// ── inputSanitizer ────────────────────────────────────────────────────────────
export {
  COMMON_PASSWORDS,
  sanitizeString,
  sanitizeEmail,
  sanitizeUsername,
  sanitizePassword,
  sanitizeHtml,
  sanitizeObject,
  detectSqlInjection,
  detectXss,
  detectCommandInjection,
  detectPathTraversal,
} from "./inputSanitizer";

// ── requestValidator ──────────────────────────────────────────────────────────
export type { ValidationResult } from "./requestValidator";
export {
  validateHeaders,
  validateContentType,
  validateRequestSize,
  validateOrigin,
  validateCsrfHeader,   // renamed from validateCsrfToken to avoid conflict
  detectBotPattern,
  validateJsonStructure,
} from "./requestValidator";

// ── anomalyDetector ───────────────────────────────────────────────────────────
export type {
  UserBehavior,
  AnomalySeverity,
  AnomalyAction,
  AnomalyReport,
} from "./anomalyDetector";
export { AnomalyDetector, anomalyDetector } from "./anomalyDetector";

// ── securityLogger ────────────────────────────────────────────────────────────
export type {
  SecurityEventType,
  SecuritySeverity,
  SecurityEvent,
} from "./securityLogger";
export { SecurityLogger, securityLogger } from "./securityLogger";

// ── csrfProtection ────────────────────────────────────────────────────────────
export {
  generateCsrfToken,
  validateCsrfToken,       // HMAC-based, from csrfProtection
  generateNonce,
  validateNonce,
  generateRequestSignature,
  validateRequestSignature,
  csrfProtection,
} from "./csrfProtection";

// ─── Internal imports for runSecurityChecks ───────────────────────────────────
import { rateLimiter, TIERS } from "./rateLimiter";
import { ipAnalyzer } from "./ipAnalyzer";
import { anomalyDetector } from "./anomalyDetector";
import { securityLogger } from "./securityLogger";
import { validateHeaders, detectBotPattern } from "./requestValidator";

// ── SecurityContext & SecurityCheckResult ─────────────────────────────────────

export interface SecurityContext {
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  userAgent: string;
  contentType?: string;
  body?: unknown;
}

export interface SecurityCheckResult {
  passed: boolean;
  blocked: boolean;
  reason?: string;
  threatScore: number;
  actions: string[];
}

// ── runSecurityChecks ─────────────────────────────────────────────────────────

export async function runSecurityChecks(
  ctx: SecurityContext
): Promise<SecurityCheckResult> {
  const actions: string[] = [];
  let threatScore = 0;
  let blocked = false;
  let reason: string | undefined;

  // 1. IP Analysis
  const ipAnalysis = await ipAnalyzer.analyze(ctx.ip);
  threatScore = Math.max(threatScore, ipAnalysis.threatScore);

  if (ipAnalysis.blocked) {
    blocked = true;
    reason = `Blocked IP: ${ipAnalysis.reason ?? "policy violation"}`;
    actions.push("ip_blocked");
    securityLogger.log({
      type: "blocked_ip",
      severity: "error",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: { reason: ipAnalysis.reason, threatScore: ipAnalysis.threatScore },
    });
    return { passed: false, blocked, reason, threatScore, actions };
  }

  if (ipAnalysis.threatScore >= 70) {
    actions.push("high_threat_ip");
    securityLogger.log({
      type: "suspicious_request",
      severity: "warn",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: {
        isDatacenter: ipAnalysis.isDatacenter,
        isProxy: ipAnalysis.isProxy,
        threatScore: ipAnalysis.threatScore,
      },
    });
  }

  // 2. Rate Limiting
  const rateLimitKey = ctx.userId ? `user:${ctx.userId}` : `ip:${ctx.ip}`;
  const rateLimitResult = rateLimiter.check(rateLimitKey, TIERS.API!);

  if (!rateLimitResult.allowed) {
    blocked = true;
    reason = "Rate limit exceeded";
    actions.push("rate_limited");
    securityLogger.log({
      type: "rate_limit",
      severity: "warn",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: { resetAt: rateLimitResult.resetAt, retryAfter: rateLimitResult.retryAfter },
    });
    return { passed: false, blocked, reason, threatScore, actions };
  }

  // 3. Anomaly Detection
  const anomalyKey = ctx.userId ?? ctx.ip;
  anomalyDetector.track(anomalyKey, ctx.endpoint, false);
  const anomalyReport = anomalyDetector.analyze(anomalyKey);

  if (anomalyReport.detected) {
    actions.push(`anomaly_${anomalyReport.severity}`);
    threatScore = Math.min(threatScore + scoreFromSeverity(anomalyReport.severity), 100);
    securityLogger.log({
      type: "anomaly",
      severity:
        anomalyReport.severity === "critical" ? "critical"
        : anomalyReport.severity === "high" ? "error"
        : anomalyReport.severity === "medium" ? "warn"
        : "info",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: { reasons: anomalyReport.reasons, action: anomalyReport.action },
    });
    if (anomalyReport.action === "ban" || anomalyReport.action === "block") {
      blocked = true;
      reason = `Anomaly detected: ${anomalyReport.reasons[0] ?? "suspicious behavior"}`;
      return { passed: false, blocked, reason, threatScore, actions };
    }
  }

  // 4. Header Validation
  const headerValidation = validateHeaders({
    "user-agent": ctx.userAgent,
    ...(ctx.contentType ? { "content-type": ctx.contentType } : {}),
  });

  if (!headerValidation.valid) {
    threatScore = Math.min(threatScore + headerValidation.score, 100);
    actions.push("header_violations");
    securityLogger.log({
      type: "suspicious_request",
      severity: headerValidation.score >= 50 ? "error" : "warn",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: { violations: headerValidation.violations, score: headerValidation.score },
    });
    if (headerValidation.score >= 50) {
      blocked = true;
      reason = `Suspicious headers: ${headerValidation.violations[0] ?? "unknown"}`;
      return { passed: false, blocked, reason, threatScore, actions };
    }
  }

  // 5. Bot Detection
  const botResult = detectBotPattern(ctx.userAgent);
  if (botResult.isBot) {
    actions.push(`bot_detected:${botResult.botType ?? "unknown"}`);
    if (botResult.botType === "security_scanner") {
      blocked = true;
      reason = `Security scanner detected: ${ctx.userAgent}`;
      securityLogger.log({
        type: "bot_detected",
        severity: "error",
        ip: ctx.ip,
        userId: ctx.userId,
        endpoint: ctx.endpoint,
        details: { botType: botResult.botType, confidence: botResult.confidence },
      });
      return { passed: false, blocked, reason, threatScore, actions };
    }
    securityLogger.log({
      type: "bot_detected",
      severity: "info",
      ip: ctx.ip,
      userId: ctx.userId,
      endpoint: ctx.endpoint,
      details: { botType: botResult.botType, confidence: botResult.confidence },
    });
  }

  return { passed: !blocked, blocked, reason, threatScore, actions };
}

// ── getClientIp ───────────────────────────────────────────────────────────────

export function getClientIp(headers: Record<string, string | undefined>): string {
  const cfIp = headers["cf-connecting-ip"];
  if (cfIp?.trim()) return cfIp.trim();

  const realIp = headers["x-real-ip"];
  if (realIp?.trim()) return realIp.trim();

  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first?.trim()) return first.trim();
  }

  return "unknown";
}

// ── Internal helper ───────────────────────────────────────────────────────────

function scoreFromSeverity(severity: string): number {
  switch (severity) {
    case "critical": return 40;
    case "high":     return 25;
    case "medium":   return 15;
    default:         return 5;
  }
}
