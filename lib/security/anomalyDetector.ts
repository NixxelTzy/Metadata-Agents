/**
 * Real-time user behavior anomaly detection.
 * Tracks request velocity, error rates, endpoint scanning, and credential stuffing patterns.
 * Uses in-memory store with automatic cleanup every 10 minutes.
 */

export interface UserBehavior {
  /** User ID or session ID */
  userId: string;
  sessionId: string;
  requestCount: number;
  errorCount: number;
  /** Number of unique endpoints accessed */
  uniqueEndpoints: number;
  requestTimestamps: number[];
  suspiciousActions: string[];
}

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyAction = "allow" | "warn" | "block" | "ban";

export interface AnomalyReport {
  detected: boolean;
  severity: AnomalySeverity;
  reasons: string[];
  action: AnomalyAction;
}

interface TrackedSession {
  requestTimestamps: number[];
  errorTimestamps: number[];
  endpoints: Set<string>;
  suspiciousActions: string[];
  createdAt: number;
  lastSeen: number;
}

/** Detection thresholds */
const THRESHOLDS = {
  /** Max requests in 10-minute window before triggering alert */
  MAX_REQUESTS_PER_10MIN: 100,
  /** Max errors in 10-minute window */
  MAX_ERRORS_PER_10MIN: 20,
  /** Max unique endpoints in 10-minute window (scanning detection) */
  MAX_ENDPOINTS_PER_10MIN: 30,
  /** Error rate ratio that triggers credential stuffing detection */
  HIGH_ERROR_RATE: 0.5,
  /** Min requests required before calculating error rate */
  MIN_REQUESTS_FOR_RATE: 10,
  /** Window used for velocity checks */
  WINDOW_MS: 10 * 60 * 1000,
  /** Burst detection: max requests per 10 seconds */
  BURST_THRESHOLD: 20,
  BURST_WINDOW_MS: 10 * 1000,
};

/**
 * Anomaly detector for real-time behavioral analysis.
 * Tracks sessions and analyzes patterns to detect malicious activity.
 */
export class AnomalyDetector {
  private sessions: Map<string, TrackedSession>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.sessions = new Map();
    // Auto cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Track a request for a given identifier.
   * @param identifier - User ID, session ID, or IP address
   * @param endpoint - The endpoint path being requested
   * @param isError - Whether this request resulted in an error
   */
  track(identifier: string, endpoint: string, isError: boolean): void {
    const now = Date.now();
    let session = this.sessions.get(identifier);

    if (!session) {
      session = {
        requestTimestamps: [],
        errorTimestamps: [],
        endpoints: new Set(),
        suspiciousActions: [],
        createdAt: now,
        lastSeen: now,
      };
      this.sessions.set(identifier, session);
    }

    session.requestTimestamps.push(now);
    session.endpoints.add(endpoint);
    session.lastSeen = now;

    if (isError) {
      session.errorTimestamps.push(now);
    }

    // Trim timestamps to prevent unbounded memory growth
    const cutoff = now - 60 * 60 * 1000; // Keep 1 hour
    session.requestTimestamps = session.requestTimestamps.filter((t) => t > cutoff);
    session.errorTimestamps = session.errorTimestamps.filter((t) => t > cutoff);
  }

  /**
   * Analyze an identifier's behavior and produce an anomaly report.
   * @param identifier - The identifier to analyze (user/session/IP)
   * @returns AnomalyReport with severity and recommended action
   */
  analyze(identifier: string): AnomalyReport {
    const session = this.sessions.get(identifier);
    if (!session) {
      return { detected: false, severity: "low", reasons: [], action: "allow" };
    }

    const now = Date.now();
    const windowStart = now - THRESHOLDS.WINDOW_MS;
    const burstWindowStart = now - THRESHOLDS.BURST_WINDOW_MS;

    const recentRequests = session.requestTimestamps.filter(
      (t) => t > windowStart
    ).length;
    const recentErrors = session.errorTimestamps.filter(
      (t) => t > windowStart
    ).length;
    const burstRequests = session.requestTimestamps.filter(
      (t) => t > burstWindowStart
    ).length;

    // Re-calculate unique endpoints in window
    // We approximate by using total unique endpoints (accurate without per-request timestamps per endpoint)
    const uniqueEndpointCount = session.endpoints.size;

    const reasons: string[] = [];
    let score = 0;

    // 1. Velocity spike
    if (recentRequests > THRESHOLDS.MAX_REQUESTS_PER_10MIN) {
      reasons.push(
        `Request velocity exceeded: ${recentRequests} requests in 10 minutes (max ${THRESHOLDS.MAX_REQUESTS_PER_10MIN})`
      );
      score += 30;
    }

    // 2. Burst detection
    if (burstRequests > THRESHOLDS.BURST_THRESHOLD) {
      reasons.push(
        `Burst detected: ${burstRequests} requests in 10 seconds (max ${THRESHOLDS.BURST_THRESHOLD})`
      );
      score += 25;
    }

    // 3. High error rate — credential stuffing pattern
    if (
      recentRequests >= THRESHOLDS.MIN_REQUESTS_FOR_RATE &&
      recentErrors / recentRequests >= THRESHOLDS.HIGH_ERROR_RATE
    ) {
      reasons.push(
        `High error rate: ${recentErrors}/${recentRequests} requests failed (${Math.round((recentErrors / recentRequests) * 100)}%)`
      );
      score += 35;
    }

    // 4. Excessive error count
    if (recentErrors > THRESHOLDS.MAX_ERRORS_PER_10MIN) {
      reasons.push(
        `Error count exceeded: ${recentErrors} errors in 10 minutes (max ${THRESHOLDS.MAX_ERRORS_PER_10MIN})`
      );
      score += 20;
    }

    // 5. Endpoint scanning behavior
    if (uniqueEndpointCount > THRESHOLDS.MAX_ENDPOINTS_PER_10MIN) {
      reasons.push(
        `Endpoint scanning detected: ${uniqueEndpointCount} unique endpoints accessed (max ${THRESHOLDS.MAX_ENDPOINTS_PER_10MIN})`
      );
      score += 30;
    }

    // 6. Pre-flagged suspicious actions
    if (session.suspiciousActions.length > 0) {
      reasons.push(
        `Previous suspicious actions recorded: ${session.suspiciousActions.join(", ")}`
      );
      score += 15;
    }

    const detected = reasons.length > 0;
    const severity = this.scoreTeSeverity(score);
    const action = this.severityToAction(severity);

    return { detected, severity, reasons, action };
  }

  /**
   * Flag a suspicious action for an identifier.
   * @param identifier - The identifier to flag
   * @param action - Description of the suspicious action
   */
  flagSuspicious(identifier: string, action: string): void {
    const session = this.sessions.get(identifier);
    if (session) {
      session.suspiciousActions.push(action);
    }
  }

  /**
   * Reset tracking data for a given identifier.
   * @param identifier - The identifier to reset
   */
  reset(identifier: string): void {
    this.sessions.delete(identifier);
  }

  /**
   * Get the current behavior snapshot for an identifier.
   * @param identifier - The identifier to retrieve
   * @returns UserBehavior snapshot or null if not tracked
   */
  getBehavior(identifier: string): UserBehavior | null {
    const session = this.sessions.get(identifier);
    if (!session) return null;
    return {
      userId: identifier,
      sessionId: identifier,
      requestCount: session.requestTimestamps.length,
      errorCount: session.errorTimestamps.length,
      uniqueEndpoints: session.endpoints.size,
      requestTimestamps: [...session.requestTimestamps],
      suspiciousActions: [...session.suspiciousActions],
    };
  }

  /** Map a numeric score to a severity level */
  private scoreTeSeverity(score: number): AnomalySeverity {
    if (score >= 80) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    return "low";
  }

  /** Map severity to recommended action */
  private severityToAction(severity: AnomalySeverity): AnomalyAction {
    switch (severity) {
      case "critical":
        return "ban";
      case "high":
        return "block";
      case "medium":
        return "warn";
      default:
        return "allow";
    }
  }

  /** Clean up sessions older than 30 minutes with no recent activity */
  private cleanup(): void {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of this.sessions.entries()) {
      if (session.lastSeen < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  /** Stop the cleanup interval (useful for tests). */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Singleton instance of AnomalyDetector */
export const anomalyDetector = new AnomalyDetector();
