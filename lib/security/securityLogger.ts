/**
 * Centralized security event logging with severity levels and in-memory circular buffer.
 * Logs structured JSON to console and provides query methods for event analysis.
 */

/** All possible security event types */
export type SecurityEventType =
  | "rate_limit"
  | "blocked_ip"
  | "injection_attempt"
  | "bot_detected"
  | "anomaly"
  | "auth_failure"
  | "suspicious_request"
  | "csrf_violation"
  | "path_traversal"
  | "xss_attempt";

/** Severity levels for security events */
export type SecuritySeverity = "info" | "warn" | "error" | "critical";

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  ip?: string;
  userId?: string;
  endpoint?: string;
  details: Record<string, unknown>;
  timestamp: number;
  requestId: string;
}

/** Maximum events to keep in the circular buffer */
const MAX_BUFFER_SIZE = 1000;

/** 24 hours in milliseconds */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Centralized security logger with circular buffer and structured JSON output.
 * Keeps the last 1000 events in memory and provides filtering/stats methods.
 */
export class SecurityLogger {
  private buffer: SecurityEvent[];
  private head: number;
  private size: number;
  private counter: number;

  constructor() {
    this.buffer = new Array(MAX_BUFFER_SIZE);
    this.head = 0;
    this.size = 0;
    this.counter = 0;
  }

  /**
   * Log a security event. Automatically adds timestamp and generates a request ID.
   * @param event - Security event data (without timestamp and requestId)
   */
  log(event: Omit<SecurityEvent, "timestamp" | "requestId">): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
    };

    // Store in circular buffer
    this.buffer[this.head] = fullEvent;
    this.head = (this.head + 1) % MAX_BUFFER_SIZE;
    if (this.size < MAX_BUFFER_SIZE) this.size++;

    // Output structured JSON to console
    const logFn = this.getLogFunction(fullEvent.severity);
    logFn(JSON.stringify(fullEvent));
  }

  /**
   * Get the most recent security events.
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Array of recent events, most recent first
   */
  getRecentEvents(limit = 100): SecurityEvent[] {
    const events = this.getAllEvents();
    return events.slice(-limit).reverse();
  }

  /**
   * Get all events of a specific type.
   * @param type - The event type to filter by
   * @returns Array of matching events, most recent first
   */
  getEventsByType(type: SecurityEventType): SecurityEvent[] {
    return this.getAllEvents()
      .filter((e) => e.type === type)
      .reverse();
  }

  /**
   * Get aggregated statistics about logged events.
   * @returns Stats including totals, breakdown by severity and type, and last-24h count
   */
  getStats(): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    last24h: number;
  } {
    const events = this.getAllEvents();
    const cutoff = Date.now() - ONE_DAY_MS;

    const bySeverity: Record<string, number> = {
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
    };
    const byType: Record<string, number> = {};
    let last24h = 0;

    for (const event of events) {
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      if (event.timestamp > cutoff) last24h++;
    }

    return {
      total: events.length,
      bySeverity,
      byType,
      last24h,
    };
  }

  /**
   * Clear all events from the buffer.
   */
  clear(): void {
    this.buffer = new Array(MAX_BUFFER_SIZE);
    this.head = 0;
    this.size = 0;
  }

  /** Reconstruct ordered events from the circular buffer (oldest to newest) */
  private getAllEvents(): SecurityEvent[] {
    if (this.size === 0) return [];
    const result: SecurityEvent[] = [];

    if (this.size < MAX_BUFFER_SIZE) {
      // Buffer not yet full — events are at indices 0..size-1
      for (let i = 0; i < this.size; i++) {
        const event = this.buffer[i];
        if (event) result.push(event);
      }
    } else {
      // Buffer is full — oldest entry is at `head`
      for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
        const event = this.buffer[(this.head + i) % MAX_BUFFER_SIZE];
        if (event) result.push(event);
      }
    }

    return result;
  }

  /** Generate a unique request ID */
  private generateRequestId(): string {
    this.counter++;
    return `sec_${Date.now()}_${this.counter}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  }

  /** Return the appropriate console log function for a severity level */
  private getLogFunction(
    severity: SecuritySeverity
  ): (msg: string) => void {
    switch (severity) {
      case "critical":
      case "error":
        return console.error;
      case "warn":
        return console.warn;
      default:
        return console.log;
    }
  }
}

/** Singleton instance of SecurityLogger */
export const securityLogger = new SecurityLogger();
