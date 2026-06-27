/**
 * IP threat analysis module.
 * Detects proxies, datacenters, and suspicious IP patterns.
 * Maintains an in-memory blocklist with automatic expiry.
 */

export interface IpAnalysis {
  ip: string;
  isTor: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  /** Threat score from 0 (clean) to 100 (highly suspicious) */
  threatScore: number;
  country: string | null;
  blocked: boolean;
  reason?: string;
}

interface BlockEntry {
  reason: string;
  expiresAt: number;
}

/**
 * Known datacenter IP ranges (CIDR notation represented as prefix checks).
 * Covers major cloud providers: AWS, GCP, Azure, DigitalOcean, Linode, OVH.
 */
const DATACENTER_RANGES: Array<{ label: string; prefixes: string[] }> = [
  {
    label: "AWS",
    prefixes: ["3.", "52.", "54.", "18.", "34."],
  },
  {
    label: "GCP",
    prefixes: ["34.", "35.", "130.211.", "104.196.", "104.154."],
  },
  {
    label: "Azure",
    prefixes: ["40.", "13.", "20.", "104.40.", "104.42."],
  },
  {
    label: "DigitalOcean",
    prefixes: ["167.99.", "167.172.", "134.209.", "104.248.", "165.22."],
  },
  {
    label: "Linode",
    prefixes: ["45.33.", "45.56.", "45.79.", "96.126.", "173.255."],
  },
  {
    label: "OVH",
    prefixes: ["51.68.", "51.75.", "51.89.", "51.161.", "178.32."],
  },
  {
    label: "Vultr",
    prefixes: ["45.32.", "45.63.", "45.76.", "45.77.", "207.246."],
  },
  {
    label: "Hetzner",
    prefixes: ["49.12.", "78.46.", "88.99.", "95.216.", "116.202."],
  },
];

/** Reserved/private IP ranges that should never originate external requests */
const RESERVED_PREFIXES = [
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "127.",
  "169.254.",
  "0.",
  "255.",
];

/**
 * Analyzer for IP-based threat detection.
 * Maintains a blocklist with expiry and calculates threat scores.
 */
export class IpAnalyzer {
  private blocklist: Map<string, BlockEntry>;
  private requestHistory: Map<string, number[]>;
  private errorHistory: Map<string, number[]>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.blocklist = new Map();
    this.requestHistory = new Map();
    this.errorHistory = new Map();

    // Auto cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Analyze an IP address for potential threats.
   * @param ip - The IP address to analyze
   * @returns IpAnalysis result with threat assessment
   */
  async analyze(ip: string): Promise<IpAnalysis> {
    const blocked = this.isBlocked(ip);
    const blockEntry = this.blocklist.get(ip);
    const isDatacenter = this.checkDatacenter(ip);
    const isPrivate = this.isPrivateOrReserved(ip);
    const threatScore = this.calculateThreatScore(ip);

    // Track the request
    const now = Date.now();
    const history = this.requestHistory.get(ip) ?? [];
    history.push(now);
    this.requestHistory.set(ip, history.filter((t) => t > now - 60 * 60 * 1000));

    return {
      ip,
      isTor: false, // Requires external API; not available without external deps
      isProxy: isPrivate || isDatacenter,
      isDatacenter,
      threatScore,
      country: null, // Requires GeoIP database; not available without external deps
      blocked,
      reason: blockEntry?.reason,
    };
  }

  /**
   * Block an IP address for a given duration.
   * @param ip - IP address to block
   * @param reason - Human-readable reason for the block
   * @param durationMs - Duration of the block in milliseconds
   */
  block(ip: string, reason: string, durationMs: number): void {
    this.blocklist.set(ip, {
      reason,
      expiresAt: Date.now() + durationMs,
    });
  }

  /**
   * Check if an IP address is currently blocked.
   * @param ip - IP address to check
   */
  isBlocked(ip: string): boolean {
    const entry = this.blocklist.get(ip);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.blocklist.delete(ip);
      return false;
    }
    return true;
  }

  /**
   * Record an error event for an IP (used in threat scoring).
   * @param ip - IP address that triggered the error
   */
  recordError(ip: string): void {
    const now = Date.now();
    const errors = this.errorHistory.get(ip) ?? [];
    errors.push(now);
    this.errorHistory.set(ip, errors.filter((t) => t > now - 60 * 60 * 1000));
  }

  /**
   * Calculate a threat score (0–100) based on IP characteristics and history.
   * @param ip - IP address to score
   */
  private calculateThreatScore(ip: string): number {
    let score = 0;
    const now = Date.now();

    // Invalid IP format
    if (!this.isValidIp(ip)) {
      score += 50;
      return Math.min(score, 100);
    }

    // Private/reserved range used as external IP (bypass attempt)
    if (this.isPrivateOrReserved(ip)) {
      score += 40;
    }

    // Datacenter/cloud IP
    if (this.checkDatacenter(ip)) {
      score += 20;
    }

    // High error rate in the past hour
    const errors = this.errorHistory.get(ip) ?? [];
    const recentErrors = errors.filter((t) => t > now - 60 * 60 * 1000).length;
    if (recentErrors > 20) score += 30;
    else if (recentErrors > 10) score += 20;
    else if (recentErrors > 5) score += 10;

    // High request frequency in the past hour
    const history = this.requestHistory.get(ip) ?? [];
    const recentRequests = history.filter((t) => t > now - 60 * 60 * 1000).length;
    if (recentRequests > 500) score += 20;
    else if (recentRequests > 200) score += 10;
    else if (recentRequests > 100) score += 5;

    // Previously blocked
    if (this.blocklist.has(ip)) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /** Check whether an IP falls within known datacenter ranges */
  private checkDatacenter(ip: string): boolean {
    for (const range of DATACENTER_RANGES) {
      for (const prefix of range.prefixes) {
        if (ip.startsWith(prefix)) return true;
      }
    }
    return false;
  }

  /** Check whether an IP is a private/reserved address */
  private isPrivateOrReserved(ip: string): boolean {
    if (ip === "::1" || ip === "localhost") return true;
    for (const prefix of RESERVED_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Validate basic IPv4/IPv6 format */
  private isValidIp(ip: string): boolean {
    // IPv4
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 (simplified)
    const ipv6 = /^[0-9a-fA-F:]{2,39}$/;
    if (ipv4.test(ip)) {
      return ip.split(".").every((octet) => parseInt(octet, 10) <= 255);
    }
    return ipv6.test(ip);
  }

  /** Remove expired entries from all stores */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    for (const [ip, entry] of this.blocklist.entries()) {
      if (entry.expiresAt < now) this.blocklist.delete(ip);
    }
    for (const [ip, history] of this.requestHistory.entries()) {
      const filtered = history.filter((t) => t > oneHourAgo);
      if (filtered.length === 0) this.requestHistory.delete(ip);
      else this.requestHistory.set(ip, filtered);
    }
    for (const [ip, errors] of this.errorHistory.entries()) {
      const filtered = errors.filter((t) => t > oneHourAgo);
      if (filtered.length === 0) this.errorHistory.delete(ip);
      else this.errorHistory.set(ip, filtered);
    }
  }

  /** Stop the cleanup interval (useful for tests). */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Singleton instance of IpAnalyzer */
export const ipAnalyzer = new IpAnalyzer();
