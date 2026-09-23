# Design Document: Advanced Security Intelligence

## Overview

This document details the comprehensive technical design for upgrading the existing security system (`lib/security/core.ts` and `lib/security/index.ts`) into an **Advanced Security Intelligence (ASI)** engine. The design addresses the fundamental limitation of the current pattern-matching approach: it cannot distinguish between legitimate user behavior and sophisticated attacks, leading to false positives.

### Core Innovation

The ASI engine introduces **behavioral context and multi-dimensional scoring** to achieve near-zero false positives while maximizing threat detection. Instead of evaluating each request in isolation, ASI builds persistent identity profiles, tracks session navigation patterns, analyzes device fingerprints, and correlates signals across multiple requests to understand the difference between "my own normal usage" and "an attacker probing my system."

### Critical Constraints

1. **No new files** — all code lives in `lib/security/core.ts` and `lib/security/index.ts` ONLY
2. **Backward compatibility** — existing `inspect()` API signature preserved
3. **Target implementation** — 4000+ lines of comprehensive security logic
4. **Vercel serverless** — must handle ephemeral instances with Redis as shared state
5. **Performance** — complete all checks within existing 4-second timeout
6. **Storage efficiency** — Redis overhead limited to ~512 bytes per request average

### Key Components

1. **TrustProfile System** — persistent behavioral baseline for known-good identities
2. **SessionContext Tracker** — transient navigation and timing analysis
3. **DeviceFingerprint Engine** — stable device identification across sessions
4. **AdaptiveRateLimiter** — dynamic thresholds based on reputation
5. **EntropyAnalyzer** — Shannon entropy detection for obfuscated payloads
6. **BotDetector** — behavioral bot detection beyond User-Agent matching
7. **AttackChainCorrelator** — multi-request attack pattern recognition
8. **BusinessLogicGuard** — application-specific abuse detection
9. **ForensicCollector** — immutable incident records for investigation
10. **GeoAnomalyDetector** — impossible travel and location-based signals


## Architecture

### High-Level Flow

```
Incoming Request
       ↓
   getClientIp() → Extract IP and headers
       ↓
   inspect(InspectRequest) ← Main entry point
       ↓
   [Parallel Redis Reads - Phase 1]
       ├→ Load TrustProfile(IP)
       ├→ Load SessionContext(IP)
       ├→ Load DeviceFingerprint(hash)
       ├→ Load AttackChain(IP)
       └→ Check IP Blocklist
       ↓
   [Signal Detection - Phase 2]
       ├→ Rate Limiting Check
       ├→ Volumetric Detection (req/s, req/m)
       ├→ Payload Pattern Scanning (XSS, SQLi, CMDi, etc.)
       ├→ Entropy Analysis (obfuscated payloads)
       ├→ Bot Scoring (behavioral signals)
       ├→ Navigation Validation (session flow)
       ├→ Business Logic Analysis (prompt injection, credential stuffing)
       ├→ Protocol Anomaly Detection (header analysis)
       ├→ Timing Analysis (slowloris detection)
       └→ Geographic Anomaly Check
       ↓
   [Score Computation - Phase 3]
       ├→ Compute RawThreatScore from signals
       ├→ Compute BotScore from behavioral signals
       ├→ Compute NormalityScore (existing + enhanced)
       ├→ Compute TrustScore from TrustProfile + Fingerprint
       └→ Compute FusedScore = f(Threat, Trust, Normality)
       ↓
   [Decision Making - Phase 4]
       ├→ Determine MitigationAction (allow/throttle/tarpit/block)
       ├→ Check AttackChain correlation
       ├→ Auto-block high-threat IPs
       └→ Capture ForensicPacket if blocked/tarpitted
       ↓
   [Fire-and-Forget Writes - Phase 5]
       ├→ Update TrustProfile (if clean request)
       ├→ Update SessionContext (endpoint/timestamp)
       ├→ Update DeviceFingerprint counter
       ├→ Update AttackChain (if signals present)
       ├→ Store ForensicPacket (if blocked)
       ├→ Increment Error Counter (if auth failure)
       └→ Log SecurityEvent to Redis
       ↓
   Return InspectResult
```

### Layered Architecture

**Layer 1: Data Access**
- Redis client wrapper with graceful degradation
- Safe async wrappers (rget, rset, rpush, etc.)
- Batch read operations via Promise.all
- Fire-and-forget writes for non-critical updates

**Layer 2: Core Data Structures**
- TrustProfile (persistent behavioral baseline)
- SessionContext (transient navigation state)
- DeviceFingerprint (stable device identity)
- AttackChain (temporal signal correlation)
- ForensicPacket (immutable incident record)

**Layer 3: Detection Engines**
- Pattern Scanners (XSS, SQLi, CMDi, Path Traversal, SSRF, XXE, Prototype Pollution, NoSQLi, LDAP, SSTI, Deserialization)
- Entropy Analyzer (Shannon entropy + base64 decoding)
- Bot Detector (behavioral signals beyond UA)
- Navigation Validator (session flow analysis)
- Timing Analyzer (slowloris detection)
- Protocol Analyzer (header anomalies)
- Business Logic Analyzer (application-specific abuse)
- Geographic Analyzer (impossible travel)

**Layer 4: Scoring Logic**
- ThreatScore computation (signal aggregation)
- TrustScore computation (reputation)
- BotScore computation (behavioral bot indicators)
- NormalityScore enhancement (behavioral baseline matching)
- FusedScore computation (composite risk decision)

**Layer 5: Action Logic**
- AdaptiveRateLimiter (trust-based threshold adjustment)
- MitigationAction selector (allow/throttle/tarpit/block)
- Auto-block logic (persistent threat IPs)
- AttackChain correlation (multi-request escalation)

**Layer 6: API Surface**
- inspect() — main request evaluation
- getSecurityEvents() — event log retrieval
- getSecurityStats() — aggregate statistics
- getForensicRecords() — incident investigation
- manualBlockIp() — operator intervention
- Utility functions (sanitization, validation)


## Components and Interfaces

### 1. TrustProfile

**Purpose:** Persistent behavioral baseline for known-good identities. Tracks historical patterns to enable reputation-based scoring.

**Interface:**
```typescript
interface TrustProfile {
  ip: string;
  createdAt: number;                      // Unix timestamp
  lastSeenAt: number;                     // Unix timestamp
  cleanRequestCount: number;              // Total requests without attack signals
  attackSignalCount: number;              // Total requests with attack signals
  lastAttackAt?: number;                  // Unix timestamp of most recent attack
  
  // Behavioral Baseline
  endpointFrequencies: Record<string, number>;  // {'/api/chat': 45, '/api/generate': 12, ...}
  methodDistribution: Record<string, number>;   // {'GET': 80, 'POST': 20}
  hourlyActivity: number[];                     // [0..23] — requests per hour
  
  // Statistical baseline
  meanInterRequestMs: number;             // Average time between consecutive requests
  stdDevInterRequestMs: number;           // Standard deviation of inter-request interval
  meanPayloadSize: number;                // Average request body size (bytes)
  stdDevPayloadSize: number;              // Standard deviation of payload size
  
  // Trust state
  trustScore: number;                     // Current trust score [0, 100]
  recentHighThreat: boolean;              // True if any request in last 60min had ThreatScore > 60
  highThreatCount: number;                // Count of consecutive recentHighThreat resets
  maxTrustScore: number;                  // Maximum achievable trust (100 normally, reduced for evasion)
  
  // Geographic tracking
  countries: string[];                    // Last 10 country codes seen (FIFO)
  countryTimestamps: number[];            // Corresponding timestamps
}
```

**Redis Key:** `asi:trust:{ip}`

**Storage Size:** ~400 bytes per profile (JSON serialized)

**TTL:** 30 days, sliding window (reset on each clean request)

**Operations:**
- `loadTrustProfile(ip: string): Promise<TrustProfile | null>` — load from Redis
- `updateTrustProfile(profile: TrustProfile): Promise<void>` — persist to Redis (fire-and-forget)
- `computeTrustScore(profile: TrustProfile): number` — calculate reputation score
- `updateBehavioralBaseline(profile: TrustProfile, req: InspectRequest): TrustProfile` — incremental stats update

**Trust Score Computation Algorithm:**
```typescript
function computeTrustScore(profile: TrustProfile): number {
  // Base trust from clean request count
  let baseTrust = 50; // New IPs start at neutral
  if (profile.cleanRequestCount >= 5 && profile.cleanRequestCount < 20) {
    baseTrust = 70;
  } else if (profile.cleanRequestCount >= 20) {
    baseTrust = 90;
  }
  
  // Penalty for recent attacks
  const now = Date.now();
  if (profile.recentHighThreat) {
    baseTrust -= 20;
  }
  if (profile.lastAttackAt && (now - profile.lastAttackAt) < 86400000) {
    baseTrust -= 20; // 24h penalty for any attack signal
  }
  
  // Penalty for evasion pattern
  if (profile.highThreatCount >= 5) {
    // Permanent reduction
    baseTrust = Math.min(baseTrust, 40);
  }
  
  // Clamp to max achievable trust
  return Math.max(0, Math.min(profile.maxTrustScore, baseTrust));
}
```

**Baseline Matching Algorithm:**
```typescript
function matchesBaseline(profile: TrustProfile, req: InspectRequest): boolean {
  if (profile.cleanRequestCount < 5) return false; // Not enough data
  
  // Check inter-request interval (if we have timing data from SessionContext)
  const interReqMs = req.timeSinceLastRequest ?? 0;
  if (interReqMs > 0) {
    const zScore = Math.abs(interReqMs - profile.meanInterRequestMs) / profile.stdDevInterRequestMs;
    if (zScore > 2.0) return false; // Outside 2 std deviations
  }
  
  // Check payload size
  const payloadSize = JSON.stringify(req.body ?? '').length;
  if (profile.meanPayloadSize > 0 && profile.stdDevPayloadSize > 0) {
    const zScore = Math.abs(payloadSize - profile.meanPayloadSize) / profile.stdDevPayloadSize;
    if (zScore > 2.0) return false;
  }
  
  return true;
}
```


### 2. SessionContext

**Purpose:** Transient per-session state tracking navigation patterns and timing behavior to detect automated scanning and anomalous flows.

**Interface:**
```typescript
interface SessionContext {
  ip: string;
  startedAt: number;                      // Unix timestamp
  lastRequestAt: number;                  // Unix timestamp
  
  // Navigation tracking
  endpoints: string[];                    // Last 20 endpoints visited (FIFO)
  methods: string[];                      // Corresponding HTTP methods
  timestamps: number[];                   // Corresponding timestamps
  responseCodes: number[];                // Inferred/hinted response codes
  
  // Timing analysis
  interRequestIntervals: number[];        // Last 10 intervals in milliseconds
  
  // Pattern indicators
  uniqueEndpointCount: number;            // Distinct endpoints in current session
  getRequestCount: number;                // Total GET requests
  postRequestCount: number;               // Total POST/PUT/PATCH requests
}
```

**Redis Key:** `asi:session:{ip}`

**Storage Size:** ~300 bytes per session

**TTL:** 15 minutes, sliding window

**Operations:**
- `loadSessionContext(ip: string): Promise<SessionContext | null>`
- `updateSessionContext(ctx: SessionContext, req: InspectRequest): SessionContext`
- `computeNavigationScore(ctx: SessionContext, currentEndpoint: string): number`

**Navigation Graph (Application-Specific):**
```typescript
const NAVIGATION_GRAPH: Record<string, string[]> = {
  '/': ['/login', '/register', '/api/health'],
  '/login': ['/api/auth/login', '/register', '/'],
  '/register': ['/api/auth/register', '/login', '/'],
  '/api/auth/login': ['/api/auth/verify-otp', '/api/auth/me', '/'],
  '/api/auth/register': ['/api/auth/verify-otp', '/'],
  '/api/auth/verify-otp': ['/api/auth/me', '/'],
  '/api/auth/me': ['/api/chat', '/api/generate', '/api/research', '/api/vector', '/api/auth/logout'],
  '/api/chat': ['/api/chat', '/api/generate', '/api/research', '/api/vector', '/api/auth/me'],
  '/api/generate': ['/api/chat', '/api/generate', '/api/research', '/api/vector', '/api/auth/me'],
  '/api/research': ['/api/chat', '/api/generate', '/api/research', '/api/vector', '/api/auth/me'],
  '/api/vector': ['/api/chat', '/api/generate', '/api/research', '/api/vector', '/api/auth/me'],
  '/api/health': ['*'], // Public health check — can transition anywhere
  '/api/monitor': ['/api/monitor/vercel', '/api/monitor'],
  '/api/security/events': ['/api/security/events'],
};

function computeNavigationScore(ctx: SessionContext, currentEndpoint: string): number {
  if (ctx.endpoints.length === 0) return 100; // First request is always valid
  
  const prevEndpoint = ctx.endpoints[ctx.endpoints.length - 1];
  const validNext = NAVIGATION_GRAPH[prevEndpoint] ?? [];
  
  // Wildcard always valid
  if (validNext.includes('*')) return 100;
  
  // Exact match
  if (validNext.includes(currentEndpoint)) return 100;
  
  // Partial match (same base path)
  const currentBase = currentEndpoint.split('/').slice(0, 3).join('/'); // /api/auth/...
  const prevBase = prevEndpoint.split('/').slice(0, 3).join('/');
  if (currentBase === prevBase) return 80; // Same API group
  
  // API-to-API transition (not in graph but plausible)
  if (prevEndpoint.startsWith('/api') && currentEndpoint.startsWith('/api')) return 60;
  
  // Public endpoints always accessible
  if (['/api/health', '/'].includes(currentEndpoint)) return 90;
  
  // Invalid transition
  return 30;
}
```

**Timing Pattern Analysis:**
```typescript
function isHumanPaced(ctx: SessionContext): boolean {
  if (ctx.interRequestIntervals.length < 3) return true; // Not enough data
  
  const mean = ctx.interRequestIntervals.reduce((a, b) => a + b, 0) / ctx.interRequestIntervals.length;
  const variance = ctx.interRequestIntervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / ctx.interRequestIntervals.length;
  const stdDev = Math.sqrt(variance);
  
  // Machine-regular timing: very low stddev with many samples
  if (ctx.interRequestIntervals.length >= 10 && stdDev < 100) {
    return false; // Bot signature: exact timing
  }
  
  // Human-paced: 500ms to 300s per request
  const allInRange = ctx.interRequestIntervals.every(x => x >= 500 && x <= 300000);
  return allInRange;
}
```


### 3. DeviceFingerprint

**Purpose:** Stable device identification across sessions based on non-PII browser characteristics.

**Interface:**
```typescript
interface DeviceFingerprintRecord {
  fingerprintId: string;                  // SHA-256 hash truncated to 16 hex chars
  createdAt: number;
  lastSeenAt: number;
  cleanRequestCount: number;
  associatedIPs: string[];                // Last 10 IPs seen with this fingerprint
}
```

**Redis Key:** `asi:fp:{fingerprintId}`

**Storage Size:** ~120 bytes per fingerprint

**TTL:** 90 days, sliding window

**Derivation Algorithm:**
```typescript
function deriveDeviceFingerprint(headers: Record<string, string>): string {
  // Extract stable, non-PII headers
  const components = [
    headers['accept'] ?? '',
    headers['accept-language'] ?? '',
    headers['accept-encoding'] ?? '',
    headers['user-agent'] ?? '',
    headers['sec-ch-ua'] ?? '', // Chromium client hints
  ];
  
  // Normalize: lowercase, trim, sort (order-independent)
  const normalized = components
    .map(c => c.toLowerCase().trim())
    .filter(c => c.length > 0)
    .sort()
    .join('|');
  
  // Hash with SHA-256, truncate to 16 hex chars
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}
```

**Trust Bonus Calculation:**
```typescript
function computeFingerprintTrustBonus(record: DeviceFingerprintRecord): number {
  if (record.cleanRequestCount >= 20) {
    return 10; // Subtract 10 points from ThreatScore
  }
  return 0;
}
```

### 4. AttackChain

**Purpose:** Temporal correlation of attack signals across multiple requests to detect multi-phase attacks.

**Interface:**
```typescript
interface AttackChainEntry {
  timestamp: number;
  signalType: AttackType;
  severity: Severity;
}

interface AttackChain {
  ip: string;
  entries: AttackChainEntry[];           // Last 30 minutes of signals
}
```

**Redis Key:** `asi:chain:{ip}`

**Storage Size:** ~200 bytes (stores up to 50 entries)

**TTL:** 30 minutes

**Chain Analysis Algorithm:**
```typescript
function analyzeAttackChain(chain: AttackChain, newSignals: AttackSignal[]): {
  compositeSignals: AttackSignal[];
  threatBonus: number;
} {
  const now = Date.now();
  const recentWindow = now - 600000; // 10 min
  const persistenceWindow = now - 300000; // 5 min
  
  const compositeSignals: AttackSignal[] = [];
  let threatBonus = 0;
  
  // Check for reconnaissance → weaponization pattern
  const reconTypes: AttackType[] = ['scanner', 'suspicious_request', 'http_flood'];
  const weaponTypes: AttackType[] = ['sql_injection', 'command_injection', 'xss_attempt', 'ssrf_attempt'];
  
  const hasRecon = chain.entries.some(e => 
    reconTypes.includes(e.signalType) && e.timestamp > recentWindow
  );
  const hasWeapon = [...newSignals, ...chain.entries].some(s => {
    const type = 'type' in s ? s.type : (s as AttackChainEntry).signalType;
    const ts = 'timestamp' in s ? s.timestamp : now;
    return weaponTypes.includes(type as AttackType) && ts > recentWindow;
  });
  
  if (hasRecon && hasWeapon) {
    compositeSignals.push({
      type: 'anomaly',
      severity: 'critical',
      confidence: 0.98,
      detail: 'Multi-phase attack chain: recon → exploit'
    });
  }
  
  // Check for signal diversity (3+ distinct types in 10min)
  const recentTypes = new Set<string>();
  chain.entries.forEach(e => {
    if (e.timestamp > recentWindow) recentTypes.add(e.signalType);
  });
  newSignals.forEach(s => recentTypes.add(s.type));
  
  if (recentTypes.size >= 3) {
    threatBonus += 25;
  }
  
  // Check for persistence bonus (critical signal in last 5min)
  const hasCriticalRecent = chain.entries.some(e =>
    e.severity === 'critical' && e.timestamp > persistenceWindow
  );
  if (hasCriticalRecent) {
    threatBonus += 15;
  }
  
  return { compositeSignals, threatBonus };
}
```


### 5. ForensicPacket

**Purpose:** Immutable forensic record for blocked/tarpitted requests, enabling incident investigation.

**Interface:**
```typescript
interface ForensicPacket {
  id: string;                             // Unique identifier
  timestamp: number;
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  
  // Request data (sanitized)
  headers: Record<string, string>;        // Sensitive values masked
  bodyHash: string;                       // SHA-256 of request body
  bodyPreview?: string;                   // First 500 chars if body is text
  
  // Computed scores
  threatScore: number;
  trustScore: number;
  normalityScore: number;
  fusedScore: number;
  botScore: number;
  entropyScore?: number;
  
  // Signals
  signals: AttackSignal[];
  
  // Context snapshots
  trustProfileSnapshot?: Partial<TrustProfile>;
  attackChainSnapshot?: AttackChainEntry[];
  deviceFingerprint?: string;
  
  // Decision
  action: MitigationAction;
  reason: string;
}
```

**Redis Key:** `asi:forensic:{ip}:{timestamp}`

**Storage Size:** ~800 bytes per packet (compressed JSON)

**TTL:** 7 days

**Collection Limit:** 200 packets maximum (LIFO eviction)

**Sanitization Algorithm:**
```typescript
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey === 'authorization') {
      if (value.startsWith('Bearer ')) {
        sanitized[key] = '[REDACTED:Bearer]';
      } else {
        sanitized[key] = '[REDACTED:Auth]';
      }
    } else if (lowerKey === 'cookie') {
      const cookieCount = (value.match(/=/g) || []).length;
      sanitized[key] = `[REDACTED:${cookieCount}-cookies]`;
    } else if (lowerKey === 'x-api-key') {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

function captureForensicPacket(
  req: InspectRequest,
  result: InspectResult,
  trustProfile: TrustProfile | null,
  attackChain: AttackChain | null,
  fingerprintId: string
): ForensicPacket {
  const bodyStr = JSON.stringify(req.body ?? '');
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const bodyPreview = bodyStr.length > 500 ? bodyStr.substring(0, 500) + '...' : bodyStr;
  
  return {
    id: `fp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: Date.now(),
    ip: req.ip,
    userId: req.userId,
    endpoint: req.endpoint,
    method: req.method,
    headers: sanitizeHeaders(req.headers),
    bodyHash,
    bodyPreview: bodyPreview.length > 0 ? bodyPreview : undefined,
    threatScore: result.threatScore,
    trustScore: result.trustScore ?? 0,
    normalityScore: result.normalityScore,
    fusedScore: result.fusedScore ?? 0,
    botScore: result.botScore ?? 0,
    entropyScore: result.entropyScore,
    signals: result.signals,
    trustProfileSnapshot: trustProfile ? {
      cleanRequestCount: trustProfile.cleanRequestCount,
      attackSignalCount: trustProfile.attackSignalCount,
      trustScore: trustProfile.trustScore,
      recentHighThreat: trustProfile.recentHighThreat,
    } : undefined,
    attackChainSnapshot: attackChain?.entries.slice(-10),
    deviceFingerprint: fingerprintId,
    action: result.action,
    reason: result.reason ?? 'No reason provided',
  };
}
```


## Data Models

### Redis Key Schema

All ASI keys use the `asi:` prefix to isolate from existing `sec:` keys and prevent collision.

```
asi:trust:{ip}              → TrustProfile (JSON, 30d TTL sliding)
asi:session:{ip}            → SessionContext (JSON, 15min TTL sliding)
asi:fp:{fingerprintId}      → DeviceFingerprintRecord (JSON, 90d TTL sliding)
asi:chain:{ip}              → AttackChain (JSON, 30min TTL)
asi:forensic:{ip}:{ts}      → ForensicPacket (JSON, 7d TTL)
asi:phash:{ip}              → Set<string> (payload hashes for credential stuffing, 5min TTL)
asi:dur:{ip}                → List<number> (request duration history, 10min TTL)
asi:geo:{userId}            → JSON {countries: string[], timestamps: number[]} (2h TTL)
asi:rate:{tier}:{key}       → Integer (existing rate limit counter, inherited)
asi:rblk:{tier}:{key}       → Integer (existing rate limit block flag, inherited)

// Existing keys (preserved for backward compatibility)
sec:events                  → List<SecurityEvent JSON> (event log, 24h TTL)
sec:ipblk:{ip}              → String (block reason, variable TTL)
sec:ipreq:{window}:{ip}     → Integer (volumetric counter, 1s/10s/1m TTL)
sec:iperr:{ip}              → Integer (error counter, 10min TTL)
sec:paths:{ip}              → Set<string> (path scanning detection, 1min TTL)
```

### TTL Management Strategy

**Sliding TTLs:**
- `TrustProfile`: Reset to 30 days on each clean request
- `SessionContext`: Reset to 15 minutes on each request
- `DeviceFingerprint`: Reset to 90 days on each request

**Fixed TTLs:**
- `AttackChain`: Hard 30-minute expiry (no reset)
- `ForensicPacket`: Hard 7-day expiry
- `PhashSet`: Hard 5-minute expiry (credential stuffing window)
- `DurationHistory`: Hard 10-minute expiry (timing analysis window)
- `GeoTracking`: Hard 2-hour expiry (geographic anomaly window)

**Storage Protection:**
- Event log: LIFO capped at 500 events
- Forensic packets: LIFO capped at 200 packets
- AttackChain entries: FIFO capped at 50 entries per IP
- SessionContext: FIFO capped at 20 endpoints
- TrustProfile countries: FIFO capped at 10 entries

### Batch Read Optimization

To minimize Redis round-trips, all independent reads are batched into a single `Promise.all()`:

```typescript
async function loadContextData(ip: string, userId: string | undefined, headers: Record<string, string>) {
  const fingerprintId = deriveDeviceFingerprint(headers);
  
  // Single parallel batch read
  const [
    trustProfile,
    sessionContext,
    fingerprintRecord,
    attackChain,
    ipBlocked,
    durationHistory,
    geoData,
  ] = await Promise.all([
    rget<TrustProfile>(`asi:trust:${ip}`),
    rget<SessionContext>(`asi:session:${ip}`),
    rget<DeviceFingerprintRecord>(`asi:fp:${fingerprintId}`),
    rget<AttackChain>(`asi:chain:${ip}`),
    rget<string>(`sec:ipblk:${ip}`),
    rlrange<number>(`asi:dur:${ip}`, 0, 9),
    userId ? rget<{countries: string[]; timestamps: number[]}>(`asi:geo:${userId}`) : Promise.resolve(null),
  ]);
  
  return {
    trustProfile,
    sessionContext,
    fingerprintRecord,
    attackChain,
    ipBlocked,
    durationHistory,
    geoData,
    fingerprintId,
  };
}
```

### Write Operation Budget

To stay within Upstash rate limits and the 8-write-per-request constraint, writes are prioritized:

**Critical writes (always performed, counted toward limit):**
1. Event log append (1 write)
2. IP block set (if auto-blocking, 1 write)
3. Forensic packet store (if blocked/tarpitted, 1 write)
4. Attack chain update (if signals present, 1 write)

**Deferred writes (fire-and-forget, not awaited):**
5. TrustProfile update (if clean request)
6. SessionContext update (always)
7. DeviceFingerprint counter increment (always)
8. Duration history append (if requestDurationMs provided)
9. Geo tracking update (if userId and country code present)

Fire-and-forget writes are launched without `await` and allowed to complete in the background. If they fail, the request still succeeds (graceful degradation).

```typescript
// Fire-and-forget pattern
void (async () => {
  try {
    await rset(`asi:trust:${ip}`, JSON.stringify(updatedProfile), 2592000);
  } catch {
    // Silent failure — non-critical update
  }
})();
```


## Algorithm Design

### 1. Shannon Entropy Calculation

**Purpose:** Detect obfuscated, encoded, or encrypted attack payloads that evade plain-text pattern matching.

**Algorithm:**
```typescript
function calculateShannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  
  // Count character frequencies
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  // Compute Shannon entropy: H = -Σ p(c) * log2(p(c))
  const len = str.length;
  let entropy = 0;
  
  for (const count of Object.values(freq)) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
}

function analyzeEntropy(body: unknown, method: string): {
  entropyScore: number;
  signals: AttackSignal[];
} {
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    return { entropyScore: 0, signals: [] };
  }
  
  const signals: AttackSignal[] = [];
  const bodyStr = JSON.stringify(body ?? '');
  
  // Extract string segments longer than 32 chars
  const segments: string[] = [];
  const extractStrings = (obj: unknown) => {
    if (typeof obj === 'string' && obj.length > 32) {
      segments.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(extractStrings);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(extractStrings);
    }
  };
  extractStrings(body);
  
  let maxEntropy = 0;
  const highEntropySegments: string[] = [];
  
  for (const segment of segments) {
    const entropy = calculateShannonEntropy(segment);
    maxEntropy = Math.max(maxEntropy, entropy);
    
    // High-entropy segment detection
    if (entropy > 5.2 && segment.length > 64) {
      highEntropySegments.push(segment);
      
      // Try to decode as base64
      try {
        const decoded = Buffer.from(segment, 'base64').toString('utf-8');
        // Check decoded content against attack patterns
        if (scanPatterns(decoded, [...XSS, ...SQLI, ...CMDI, ...PATH_TRAV])) {
          signals.push({
            type: 'xss_attempt', // Type determined by which pattern matched
            severity: 'critical',
            confidence: 0.95,
            detail: 'Encoded attack payload detected (base64-wrapped)'
          });
        }
      } catch {
        // Not valid base64 or decoding failed
      }
    }
  }
  
  // Overall payload entropy check
  const overallEntropy = calculateShannonEntropy(bodyStr);
  if (overallEntropy > 6.0 && bodyStr.length > 100) {
    signals.push({
      type: 'anomaly',
      severity: 'medium',
      confidence: 0.80,
      detail: `Extremely high payload entropy: ${overallEntropy.toFixed(2)} bits/char`
    });
  }
  
  // URL parameter entropy (if we're analyzing query strings)
  // This would be called separately with query string input
  
  return { entropyScore: maxEntropy, signals };
}
```

**Entropy Thresholds:**
- `0.0 - 3.0`: Low entropy (repetitive, structured data like JSON)
- `3.0 - 4.5`: Normal entropy (English text, typical form data)
- `4.5 - 5.2`: Moderate-high entropy (mixed content, some encoding)
- `5.2 - 6.0`: High entropy (base64, hex, compressed data)
- `> 6.0`: Extreme entropy (encrypted, random, or deeply nested encoding)

### 2. Bot Score Computation

**Purpose:** Detect bots using behavioral signals beyond User-Agent spoofing.

**Algorithm:**
```typescript
function computeBotScore(
  req: InspectRequest,
  sessionCtx: SessionContext | null
): number {
  let botScore = 0;
  
  const headers = req.headers;
  const ua = req.userAgent.toLowerCase();
  
  // Check for modern browser UA with missing browser-specific headers
  const hasBrowserUA = /chrome|firefox|safari|edge/i.test(req.userAgent);
  const hasSecFetchSite = 'sec-fetch-site' in headers;
  const hasSecFetchMode = 'sec-fetch-mode' in headers;
  const hasSecFetchDest = 'sec-fetch-dest' in headers;
  
  if (hasBrowserUA && !hasSecFetchSite && !hasSecFetchMode && !hasSecFetchDest) {
    botScore += 20; // Modern browser should send Sec-Fetch headers
  }
  
  // Missing standard browser headers
  if (!headers['accept-language']) botScore += 10;
  if (!headers['accept-encoding']) botScore += 10;
  if (headers['accept'] === '*/*' && !headers['accept-language']) botScore += 5;
  
  // Machine-regular timing analysis
  if (sessionCtx && sessionCtx.interRequestIntervals.length >= 10) {
    const intervals = sessionCtx.interRequestIntervals;
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev < 100) {
      botScore += 30; // Extremely regular timing = automation
    }
  }
  
  // Write-only session pattern
  if (sessionCtx && sessionCtx.endpoints.length >= 5) {
    if (sessionCtx.postRequestCount > 0 && sessionCtx.getRequestCount === 0) {
      botScore += 15; // No GET requests at all = automated POST spam
    }
  }
  
  // Missing referer for navigation requests
  if (req.method === 'GET' && !headers['referer'] && !['/', '/api/health'].includes(req.endpoint)) {
    botScore += 5;
  }
  
  // Suspicious header combinations
  if (headers['connection']?.toLowerCase() === 'keep-alive' && 
      !headers['upgrade-insecure-requests'] && 
      hasBrowserUA) {
    botScore += 5; // Browsers typically send upgrade-insecure-requests
  }
  
  return Math.min(100, botScore);
}
```


### 3. Trust Score-Adjusted Threat Calculation

**Purpose:** Reduce false positives by applying reputation-based adjustments to raw threat scores.

**Algorithm:**
```typescript
function computeAdjustedThreatScore(
  rawThreatScore: number,
  trustScore: number,
  fingerprintBonus: number
): number {
  // No adjustment for blocked IPs or already-clean requests
  if (rawThreatScore === 0 || rawThreatScore >= 70) {
    return rawThreatScore;
  }
  
  // Apply trust-based reduction for low-to-medium threats
  let adjustment = 0;
  if (rawThreatScore < 30) {
    // Trust adjustment scales with TrustScore
    adjustment = (trustScore / 100) * 20; // Up to 20 points reduction
  }
  
  // Apply fingerprint bonus
  adjustment += fingerprintBonus;
  
  // Clamp result
  return Math.max(0, Math.min(100, rawThreatScore - adjustment));
}
```

### 4. Fused Score Computation

**Purpose:** Combine all dimensions (threat, trust, normality) into a single risk decision metric.

**Algorithm:**
```typescript
function computeFusedScore(
  threatScore: number,
  trustScore: number,
  normalityScore: number
): number {
  // Normality penalty: how much to add for abnormal requests
  const normalityPenalty = Math.max(0, 50 - normalityScore) * 0.3;
  
  // Fused score formula
  const fusedScore = (threatScore * 0.6) - (trustScore * 0.4) + normalityPenalty;
  
  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, fusedScore));
}

function selectMitigationAction(fusedScore: number): MitigationAction {
  if (fusedScore >= 60) return 'block';
  if (fusedScore >= 40) return 'tarpit';
  if (fusedScore >= 20) return 'throttle';
  return 'allow';
}

function calculateTarpitDelay(fusedScore: number): number {
  // Tarpit delay scales from 5s (fusedScore=40) to 30s (fusedScore=59)
  if (fusedScore < 40) return 0;
  if (fusedScore >= 60) return 0; // Block instead
  
  const range = fusedScore - 40; // 0..19
  return 5000 + (range / 19) * 25000;
}
```

**Decision Matrix:**

| Fused Score | Trust Score | Action    | Typical Scenario                          |
|-------------|-------------|-----------|-------------------------------------------|
| 0-19        | Any         | Allow     | Clean request                             |
| 20-39       | < 50        | Throttle  | Mild anomaly, untrusted IP                |
| 20-39       | >= 70       | Allow     | Known-good user with minor oddity         |
| 40-59       | < 50        | Tarpit    | Suspicious request, not yet trusted       |
| 40-59       | >= 80       | Throttle  | Trusted user with moderate anomaly        |
| 60+         | Any         | Block     | Clear attack signal                       |

### 5. Adaptive Rate Limit Multiplier

**Purpose:** Dynamically adjust rate limits based on reputation to prevent false positives for trusted users.

**Algorithm:**
```typescript
function computeRateLimitMultiplier(trustScore: number): number {
  if (trustScore < 70) return 1.0;        // No bonus for low-trust IPs
  if (trustScore >= 90) return 3.0;       // Highly trusted: 3x limit
  if (trustScore >= 70) return 2.0;       // Trusted: 2x limit
  return 1.0;
}

async function checkAdaptiveRate(
  key: string,
  tier: TierName,
  trustScore: number,
  hasRecentHighThreat: boolean
): Promise<{ allowed: boolean; retryAfter: number }> {
  const t = TIERS[tier];
  
  // Suspend multiplier if recent high threat
  const multiplier = hasRecentHighThreat ? 1.0 : computeRateLimitMultiplier(trustScore);
  const effectiveLimit = Math.floor(t.max * multiplier);
  
  const rk = K.rateWindow(key, tier);
  const bk = K.rateBlock(key, tier);
  
  // Check if blocked
  const blocked = await rget<number>(bk);
  if (blocked) {
    const ttl = await (async () => {
      try { return await getRedis().ttl(bk); } catch { return t.blockSec; }
    })();
    return { allowed: false, retryAfter: ttl > 0 ? ttl : t.blockSec };
  }
  
  // Increment counter
  const count = await rincr(rk, t.windowSec);
  if (count > effectiveLimit) {
    await rset(bk, 1, t.blockSec);
    return { allowed: false, retryAfter: t.blockSec };
  }
  
  return { allowed: true, retryAfter: 0 };
}
```


### 6. Enhanced Normality Score Calculation

**Purpose:** Extend existing normality scoring with behavioral baseline matching.

**Algorithm:**
```typescript
function calculateEnhancedNormalityScore(
  req: InspectRequest,
  signals: AttackSignal[],
  trustProfile: TrustProfile | null,
  sessionCtx: SessionContext | null,
  navigationScore: number
): number {
  // Start with existing normality calculation (from current system)
  let score = 100;
  
  // Deduct for attack signals (existing logic)
  for (const s of signals) {
    if (s.severity === 'critical') score -= 40;
    else if (s.severity === 'high') score -= 25;
    else if (s.severity === 'medium') score -= 15;
    else if (s.severity === 'low') score -= 8;
    else if (s.severity === 'info') score -= 2;
  }
  
  // Deduct for suspicious UA (existing logic)
  const ua = req.userAgent.toLowerCase();
  if (!req.userAgent || req.userAgent.length < 5) score -= 20;
  if (/bot|crawler|spider|scan|test|probe|monitor/i.test(ua) && 
      !/(googlebot|bingbot|slurp|duckduckbot)/i.test(ua)) score -= 10;
  
  // Deduct for unusual methods (existing logic)
  if (!['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(req.method.toUpperCase())) score -= 15;
  
  // Deduct for missing common headers (existing logic)
  if (!req.headers['user-agent']) score -= 10;
  if (req.method !== 'GET' && !req.headers['content-type']) score -= 5;
  
  // Deduct for suspicious headers (existing logic)
  if (req.headers['x-forwarded-for']?.split(',').length > 3) score -= 10;
  if (req.headers['origin'] && !req.headers['origin'].includes(req.headers['host'] ?? '')) score -= 5;
  
  // NEW: Behavioral baseline bonus
  if (trustProfile && matchesBaseline(trustProfile, req)) {
    score = Math.max(score, 85); // Floor at 85 for baseline-matching requests
  }
  
  // NEW: Navigation score bonus
  if (sessionCtx && navigationScore >= 80) {
    score += 15; // Bonus for plausible navigation
  }
  
  // NEW: Human-paced timing bonus
  if (sessionCtx && isHumanPaced(sessionCtx)) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}
```

### 7. Geographic Anomaly Detection

**Purpose:** Detect impossible travel patterns indicating credential theft or distributed attacks.

**Algorithm:**
```typescript
function detectGeographicAnomaly(
  userId: string,
  currentCountry: string,
  geoData: { countries: string[]; timestamps: number[] } | null
): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const now = Date.now();
  
  if (!geoData || geoData.countries.length === 0) {
    return signals; // No historical data yet
  }
  
  // Check for different country within 2-hour window
  const twoHoursAgo = now - 7200000;
  const recentCountries = geoData.countries.filter((_, i) => geoData.timestamps[i] > twoHoursAgo);
  
  if (recentCountries.length > 0 && !recentCountries.includes(currentCountry)) {
    signals.push({
      type: 'anomaly',
      severity: 'medium',
      confidence: 0.85,
      detail: `Geographic anomaly: access from ${currentCountry} after ${recentCountries[0]} within 2h`
    });
  }
  
  // Check for 3+ distinct countries in 1 hour
  const oneHourAgo = now - 3600000;
  const recentHourCountries = new Set(
    geoData.countries.filter((_, i) => geoData.timestamps[i] > oneHourAgo)
  );
  recentHourCountries.add(currentCountry);
  
  if (recentHourCountries.size >= 3) {
    signals.push({
      type: 'anomaly',
      severity: 'high',
      confidence: 0.92,
      detail: `Impossible travel: ${recentHourCountries.size} countries in 1h — possible account takeover`
    });
  }
  
  return signals;
}

function extractCountryCode(headers: Record<string, string>): string | null {
  return headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || null;
}
```


### 8. Extended Pattern Sets

**Purpose:** Detect attack types not covered by the current system.

**Pattern Definitions:**

```typescript
// NoSQL Injection patterns
const NOSQLI: RegExp[] = [
  /\{\s*["\$]?(ne|eq|gt|gte|lt|lte|in|nin|regex|where)\s*:/i,
  /\[\s*\$?(ne|eq|gt|gte|lt|lte|in|nin)\s*\]/i,
  /\$where\s*:/i,
  /\$regex\s*:/i,
  /\{\s*\$gt\s*:\s*['"]{2}\s*\}/i,
  /\{\s*\$ne\s*:\s*null\s*\}/i,
  /\{\s*\$or\s*:\s*\[/i,
  /\{\s*\$and\s*:\s*\[/i,
];

// LDAP Injection patterns
const LDAPI: RegExp[] = [
  /\)\s*\(uid=\*/i,
  /\*\)\s*\(objectClass=\*/i,
  /\)\s*\(\|/i,
  /\)\s*\(&/i,
  /\x00.*\(/i, // Null byte LDAP escape
  /\(\|\(uid=\*\)/i,
  /admin\)\(\|/i,
];

// Server-Side Template Injection patterns
const SSTI: RegExp[] = [
  /\{\{\s*7\s*\*\s*7\s*\}\}/,
  /\$\{\s*7\s*\*\s*7\s*\}/,
  /<%=?\s*7\s*\*\s*7\s*%>/,
  /#\{\s*7\s*\*\s*7\s*\}/,
  /\*\{\s*7\s*\*\s*7\s*\}/,
  /\{\{.*config.*\}\}/i,
  /\{\{.*self.*\}\}/i,
  /__import__\s*\(/i,
  /\{\{.*\[.*\]\s*\}\}/,
];

// Deserialization patterns
const DESER: RegExp[] = [
  /rO0AB/, // Java serialized object (base64 prefix)
  /\xac\xed\x00\x05/, // Java serialization magic bytes
  /O:\d+:"/, // PHP object serialization
  /a:\d+:\{/, // PHP array serialization
  /___PHP_Incomplete_Class/i,
  /ObjectInputStream/i,
  /readObject\s*\(/i,
  /unserialize\s*\(/i,
];

// Open Redirect patterns (for URL parameters)
const OPEN_REDIRECT: RegExp[] = [
  /^https?:\/\//i,  // Absolute URL
  /^\/\//,          // Protocol-relative URL
  /^\\/,            // Backslash (Windows-style)
  /^javascript:/i,
  /^data:/i,
];

const OPEN_REDIRECT_PARAM_NAMES = [
  'redirect', 'url', 'next', 'return', 'callback', 'continue',
  'dest', 'destination', 'goto', 'target', 'redir', 'returnto'
];

function detectOpenRedirect(endpoint: string, query: Record<string, string>): AttackSignal[] {
  const signals: AttackSignal[] = [];
  
  for (const paramName of OPEN_REDIRECT_PARAM_NAMES) {
    const value = query[paramName.toLowerCase()];
    if (value && OPEN_REDIRECT.some(pattern => pattern.test(value))) {
      signals.push({
        type: 'open_redirect',
        severity: 'medium',
        confidence: 0.88,
        detail: `Open redirect attempt in parameter: ${paramName}=${value.substring(0, 50)}`
      });
    }
  }
  
  return signals;
}
```

**Extended Pattern Scanning Function:**

```typescript
function detectAdvancedPayloadSignals(
  body: unknown,
  headers: Record<string, string>,
  endpoint: string
): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const flat = flatten(body);
  const hflat = Object.entries(headers)
    .filter(([k]) => !['authorization','cookie','x-api-key'].includes(k.toLowerCase()))
    .map(([k, v]) => `${k}: ${v}`).join(' ');
  const all = flat + ' ' + hflat;
  
  // NoSQL Injection
  if (scanPatterns(flat, NOSQLI)) {
    signals.push({
      type: 'sql_injection',
      severity: 'critical',
      confidence: 0.91,
      detail: 'NoSQL injection pattern detected'
    });
  }
  
  // LDAP Injection
  if (scanPatterns(flat, LDAPI)) {
    signals.push({
      type: 'anomaly',
      severity: 'high',
      confidence: 0.89,
      detail: 'LDAP injection pattern detected'
    });
  }
  
  // Server-Side Template Injection
  if (scanPatterns(flat, SSTI)) {
    signals.push({
      type: 'anomaly',
      severity: 'high',
      confidence: 0.93,
      detail: 'SSTI pattern detected'
    });
  }
  
  // Deserialization attack
  if (scanPatterns(flat, DESER)) {
    signals.push({
      type: 'anomaly',
      severity: 'critical',
      confidence: 0.94,
      detail: 'Deserialization payload detected'
    });
  }
  
  // Open redirect (parse query string from endpoint)
  const queryStart = endpoint.indexOf('?');
  if (queryStart > -1) {
    const queryStr = endpoint.substring(queryStart + 1);
    const query: Record<string, string> = {};
    queryStr.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) query[key.toLowerCase()] = decodeURIComponent(value);
    });
    signals.push(...detectOpenRedirect(endpoint, query));
  }
  
  return signals;
}
```


### 9. Business Logic Attack Detection

**Purpose:** Detect abuse of application-specific features.

**Algorithm:**

```typescript
async function detectBusinessLogicAttacks(
  req: InspectRequest,
  ip: string
): Promise<AttackSignal[]> {
  const signals: AttackSignal[] = [];
  const { endpoint, body, method } = req;
  const bodyStr = JSON.stringify(body ?? '');
  
  // 1. Credential stuffing detection
  if (endpoint === '/api/auth/login' && method === 'POST') {
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex').substring(0, 16);
    const hashSetKey = `asi:phash:${ip}`;
    
    try {
      const r = getRedis();
      await r.sadd(hashSetKey, bodyHash);
      await r.expire(hashSetKey, 300); // 5min window
      const uniquePayloads = await r.scard(hashSetKey);
      
      if (uniquePayloads > 5) {
        signals.push({
          type: 'credential_stuffing',
          severity: 'high',
          confidence: 0.95,
          detail: `${uniquePayloads} distinct login attempts in 5min — credential stuffing`
        });
      }
    } catch {
      // Redis failure — skip check
    }
  }
  
  // 2. Prompt injection detection
  if (['/api/chat', '/api/generate'].includes(endpoint)) {
    const promptInjectionPatterns = [
      /ignore\s+(previous|prior|all)\s+instructions/i,
      /you\s+are\s+now/i,
      /disregard\s+your/i,
      /system\s*:/i,
      /SYSTEM\s+OVERRIDE/i,
      /forget\s+(everything|all)/i,
      /new\s+instructions/i,
      /##\s*Instructions/i,
    ];
    
    if (promptInjectionPatterns.some(p => p.test(bodyStr))) {
      signals.push({
        type: 'anomaly',
        severity: 'high',
        confidence: 0.90,
        detail: 'Prompt injection attempt detected'
      });
    }
  }
  
  // 3. Excessive AI resource consumption
  const aiEndpoints = ['/api/generate', '/api/research'];
  if (aiEndpoints.includes(endpoint)) {
    const countKey = `asi:aireq:${ip}`;
    try {
      const count = await rincr(countKey, 600); // 10min window
      if (count > 20) {
        signals.push({
          type: 'anomaly',
          severity: 'medium',
          confidence: 0.88,
          detail: `${count} AI requests in 10min — excessive resource consumption`
        });
      }
    } catch {
      // Redis failure — skip check
    }
  }
  
  // 4. Rapid account creation
  if (endpoint === '/api/auth/register') {
    const countKey = `asi:regreq:${ip}`;
    try {
      const count = await rincr(countKey, 1800); // 30min window
      if (count > 3) {
        signals.push({
          type: 'anomaly',
          severity: 'medium',
          confidence: 0.91,
          detail: `${count} registration attempts in 30min — bot registration`
        });
      }
    } catch {
      // Redis failure — skip check
    }
  }
  
  // 5. Bulk link validation (SSRF amplification)
  if (endpoint === '/api/validate/links') {
    try {
      const links = Array.isArray(body) ? body : (body as any)?.links ?? [];
      if (links.length > 50) {
        signals.push({
          type: 'anomaly',
          severity: 'medium',
          confidence: 0.87,
          detail: `${links.length} URLs in validation request — SSRF amplification attempt`
        });
      }
    } catch {
      // Parsing error — skip check
    }
  }
  
  return signals;
}
```

### 10. Protocol and Header Anomaly Detection

**Purpose:** Detect HTTP protocol violations and header manipulation.

**Algorithm:**

```typescript
function detectProtocolAnomalies(
  req: InspectRequest
): AttackSignal[] {
  const signals: AttackSignal[] = [];
  const { headers, method, endpoint, body } = req;
  
  // 1. Missing Content-Type on API POST requests
  const apiEndpoints = ['/api/chat', '/api/generate', '/api/research', '/api/vector'];
  if (['POST', 'PUT', 'PATCH'].includes(method) && apiEndpoints.some(ep => endpoint.startsWith(ep))) {
    const contentType = headers['content-type'];
    if (!contentType) {
      signals.push({
        type: 'anomaly',
        severity: 'low',
        confidence: 0.75,
        detail: 'Missing Content-Type header on API request'
      });
    }
  }
  
  // 2. Content-Length mismatch
  const contentLength = parseInt(headers['content-length'] ?? '0', 10);
  const bodySize = JSON.stringify(body ?? '').length;
  if (contentLength === 0 && bodySize > 0) {
    signals.push({
      type: 'anomaly',
      severity: 'medium',
      confidence: 0.89,
      detail: 'Content-Length: 0 with non-empty body — header manipulation'
    });
  }
  
  // 3. Minimal header set (automated client)
  const accept = headers['accept'];
  const acceptLang = headers['accept-language'];
  const acceptEnc = headers['accept-encoding'];
  if (accept === '*/*' && !acceptLang && !acceptEnc) {
    // Already tracked in bot score, but also emit signal
    signals.push({
      type: 'anomaly',
      severity: 'low',
      confidence: 0.70,
      detail: 'Minimal header set — automated client signature'
    });
  }
  
  // 4. Abnormal header count
  const headerCount = Object.keys(headers).length;
  if (headerCount > 30) {
    signals.push({
      type: 'anomaly',
      severity: 'low',
      confidence: 0.72,
      detail: `${headerCount} headers — header stuffing attempt`
    });
  }
  
  // 5. Transfer-Encoding + Content-Length conflict (HTTP desync)
  if (headers['transfer-encoding'] && headers['content-length']) {
    signals.push({
      type: 'anomaly',
      severity: 'high',
      confidence: 0.96,
      detail: 'TE/CL header conflict — HTTP desync attack pattern'
    });
  }
  
  // 6. Host header mismatch
  const host = headers['host'];
  const expectedHosts = ['localhost', '127.0.0.1', process.env.VERCEL_URL];
  if (host && !expectedHosts.some(h => host.includes(h ?? ''))) {
    signals.push({
      type: 'anomaly',
      severity: 'medium',
      confidence: 0.80,
      detail: `Host header mismatch: ${host} — virtual host poisoning attempt`
    });
  }
  
  return signals;
}
```


### 11. Timing Attack Detection

**Purpose:** Detect slowloris and timing-based attacks.

**Algorithm:**

```typescript
async function detectTimingAttacks(
  req: InspectRequest,
  ip: string
): Promise<AttackSignal[]> {
  const signals: AttackSignal[] = [];
  const { requestDurationMs, endpoint } = req;
  
  if (!requestDurationMs) return signals; // No timing data
  
  // Non-streaming endpoints that should be fast
  const fastEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/verify-otp', '/api/validate'];
  const isNonStreaming = fastEndpoints.some(ep => endpoint.startsWith(ep));
  
  // Store duration history
  const durKey = `asi:dur:${ip}`;
  try {
    const r = getRedis();
    await r.lpush(durKey, requestDurationMs);
    await r.ltrim(durKey, 0, 9); // Keep last 10
    await r.expire(durKey, 600); // 10min TTL
    
    const history = await r.lrange<number>(durKey, 0, 9);
    
    // Single slow request
    if (isNonStreaming && requestDurationMs > 8000) {
      signals.push({
        type: 'slowloris',
        severity: 'medium',
        confidence: 0.82,
        detail: `${requestDurationMs}ms request duration — abnormally slow`
      });
    }
    
    // Pattern: last 5 requests all slow
    if (history.length >= 5 && isNonStreaming) {
      const last5 = history.slice(0, 5);
      if (last5.every(d => d > 5000)) {
        signals.push({
          type: 'slowloris',
          severity: 'high',
          confidence: 0.91,
          detail: 'Persistent slow request pattern — slowloris attack'
        });
      }
    }
    
    // Suspiciously fast auth request
    if (endpoint === '/api/auth/login' && requestDurationMs < 50) {
      signals.push({
        type: 'anomaly',
        severity: 'low',
        confidence: 0.73,
        detail: 'Suspiciously fast auth request — automated credential submission'
      });
    }
  } catch {
    // Redis failure — skip check
  }
  
  return signals;
}
```

### 12. Evasion Pattern Detection

**Purpose:** Detect attackers attempting to game the scoring system.

**Algorithm:**

```typescript
function detectEvasionPattern(trustProfile: TrustProfile | null): {
  isEvasion: boolean;
  signals: AttackSignal[];
} {
  if (!trustProfile) return { isEvasion: false, signals: [] };
  
  const signals: AttackSignal[] = [];
  
  // Check for alternating clean/attack pattern
  // This would require storing a sliding window of ThreatScores per IP
  // For design purposes, we'll track via a simplified heuristic:
  // If highThreatCount >= 5, it means the IP repeatedly triggered high threats
  // despite having a TrustProfile (clean requests in between)
  
  if (trustProfile.highThreatCount >= 5) {
    signals.push({
      type: 'anomaly',
      severity: 'high',
      confidence: 0.90,
      detail: 'Evasion pattern: repeated high-threat resets — attacker gaming reputation'
    });
    return { isEvasion: true, signals };
  }
  
  // Another heuristic: if attackSignalCount > cleanRequestCount
  // (more attacks than clean requests = suspicious)
  if (trustProfile.attackSignalCount > trustProfile.cleanRequestCount) {
    signals.push({
      type: 'anomaly',
      severity: 'medium',
      confidence: 0.85,
      detail: 'Suspicious ratio: more attack signals than clean requests'
    });
    return { isEvasion: true, signals };
  }
  
  return { isEvasion: false, signals };
}
```

## Main Inspection Flow Pseudocode

**Complete inspect() function orchestration:**

```typescript
export async function inspect(req: InspectRequest): Promise<InspectResult> {
  const { ip, userId, endpoint, method, userAgent, headers, body, requestDurationMs } = req;
  const now = Date.now();
  
  return withTimeout(async () => {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: PARALLEL CONTEXT LOADING
    // ═══════════════════════════════════════════════════════════
    
    const fingerprintId = deriveDeviceFingerprint(headers);
    const contextData = await loadContextData(ip, userId, headers);
    
    const {
      trustProfile,
      sessionContext,
      fingerprintRecord,
      attackChain,
      ipBlocked,
      durationHistory,
      geoData,
    } = contextData;
    
    // Quick exit: IP already blocked
    if (ipBlocked) {
      const result: InspectResult = {
        action: 'block',
        threatScore: 100,
        normalityScore: 0,
        severity: 'critical',
        signals: [{ type: 'blocked_ip', severity: 'critical', confidence: 1.0, detail: ipBlocked }],
        blocked: true,
        reason: `Blocked IP: ${ipBlocked}`,
        trustScore: 0,
        fusedScore: 100,
      };
      await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });
      return result;
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 2: SIGNAL DETECTION
    // ═══════════════════════════════════════════════════════════
    
    let signals: AttackSignal[] = [];
    
    // 2.1 Rate limiting (adaptive)
    const tierKey: TierName = endpoint.startsWith('/api/auth') ? 'AUTH'
      : (endpoint.includes('/generate') || endpoint.includes('/vector')) ? 'UPLOAD'
      : 'API';
    const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
    const trustScore = trustProfile ? computeTrustScore(trustProfile) : 50;
    const hasRecentHighThreat = trustProfile?.recentHighThreat ?? false;
    
    const rateOk = await checkAdaptiveRate(rateKey, tierKey, trustScore, hasRecentHighThreat);
    if (!rateOk.allowed) {
      signals.push({
        type: 'rate_limit',
        severity: 'high',
        confidence: 1.0,
        detail: `Rate limit exceeded (${tierKey}), retry in ${rateOk.retryAfter}s`
      });
    }
    
    // 2.2 Volumetric detection
    const [req1s, req10s, req1m] = await Promise.all([
      getIpRequestCount(ip, '1s', 1),
      getIpRequestCount(ip, '10s', 10),
      getIpRequestCount(ip, '1m', 60),
    ]);
    
    if (req1s > 30) {
      signals.push({
        type: 'ddos_flood',
        severity: 'critical',
        confidence: Math.min(0.99, req1s / 60),
        detail: `${req1s} req/s from ${ip}`
      });
    } else if (req1s > 10) {
      signals.push({
        type: 'dos_flood',
        severity: 'high',
        confidence: req1s / 30,
        detail: `${req1s} req/s from ${ip}`
      });
    }
    
    if (req10s > 60) {
      signals.push({
        type: 'dos_flood',
        severity: 'high',
        confidence: Math.min(0.9, req10s / 120),
        detail: `${req10s} req/10s burst`
      });
    }
    
    if (req1m > 200) {
      signals.push({
        type: 'http_flood',
        severity: 'critical',
        confidence: Math.min(0.98, req1m / 400),
        detail: `${req1m} req/min from ${ip}`
      });
    }
    
    // 2.3 Path scanning
    const pathCount = await trackIpPath(ip, endpoint);
    if (pathCount > 30) {
      signals.push({
        type: 'http_flood',
        severity: 'high',
        confidence: Math.min(0.9, pathCount / 60),
        detail: `${pathCount} unique paths in 1min`
      });
    }
    
    // 2.4 Error rate (credential stuffing)
    const errCount = await getIpErrorCount(ip);
    if (errCount >= 8) {
      signals.push({
        type: 'credential_stuffing',
        severity: 'high',
        confidence: Math.min(0.95, errCount / 20),
        detail: `${errCount} errors in 10min`
      });
    }
    
    // 2.5 Payload pattern detection (existing + new patterns)
    signals.push(...detectPayloadSignals(body, headers));
    signals.push(...detectAdvancedPayloadSignals(body, headers, endpoint));
    
    // 2.6 Entropy analysis
    const { entropyScore, signals: entropySignals } = analyzeEntropy(body, method);
    signals.push(...entropySignals);
    
    // 2.7 User-Agent detection
    signals.push(...detectUASignals(userAgent));
    
    // 2.8 Path pattern detection
    signals.push(...detectPathSignals(endpoint));
    
    // 2.9 Bot detection
    const botScore = computeBotScore(req, sessionContext);
    if (botScore >= 50) {
      signals.push({
        type: 'bot_detected',
        severity: botScore >= 80 ? 'high' : 'medium',
        confidence: botScore / 100,
        detail: `Bot score: ${botScore}/100`
      });
    }
    
    // 2.10 Navigation validation
    const navigationScore = sessionContext ? computeNavigationScore(sessionContext, endpoint) : 100;
    if (navigationScore < 50 && sessionContext && sessionContext.endpoints.length > 5) {
      signals.push({
        type: 'anomaly',
        severity: 'medium',
        confidence: 0.80,
        detail: 'Invalid navigation transition'
      });
    }
    
    // 2.11 Business logic attacks
    signals.push(...await detectBusinessLogicAttacks(req, ip));
    
    // 2.12 Protocol anomalies
    signals.push(...detectProtocolAnomalies(req));
    
    // 2.13 Timing attacks
    signals.push(...await detectTimingAttacks(req, ip));
    
    // 2.14 Geographic anomalies
    if (userId && geoData) {
      const currentCountry = extractCountryCode(headers);
      if (currentCountry) {
        signals.push(...detectGeographicAnomaly(userId, currentCountry, geoData));
      }
    }
    
    // 2.15 Attack chain correlation
    const currentChain: AttackChain = attackChain ?? { ip, entries: [] };
    const { compositeSignals, threatBonus } = analyzeAttackChain(currentChain, signals);
    signals.push(...compositeSignals);
    
    // 2.16 Evasion pattern detection
    const { isEvasion, signals: evasionSignals } = detectEvasionPattern(trustProfile);
    signals.push(...evasionSignals);
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 3: SCORE COMPUTATION
    // ═══════════════════════════════════════════════════════════
    
    const rawThreatScore = calcScore(signals) + threatBonus;
    const fingerprintBonus = fingerprintRecord ? computeFingerprintTrustBonus(fingerprintRecord) : 0;
    const adjustedThreatScore = computeAdjustedThreatScore(rawThreatScore, trustScore, fingerprintBonus);
    const normalityScore = calculateEnhancedNormalityScore(req, signals, trustProfile, sessionContext, navigationScore);
    const fusedScore = computeFusedScore(adjustedThreatScore, trustScore, normalityScore);
    const severity = scoreToSeverity(adjustedThreatScore);
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 4: DECISION MAKING
    // ═══════════════════════════════════════════════════════════
    
    let action = selectMitigationAction(fusedScore);
    
    // Bot override: throttle high-confidence bots
    if (botScore >= 80 && trustScore < 90 && action === 'allow') {
      action = 'throttle';
    }
    
    // Auto-block high threats
    if (adjustedThreatScore >= 80) {
      await blockIpRedis(ip, `Auto-blocked: score ${adjustedThreatScore}, ${signals.map(s => s.type).join(',')}`, 1800);
      action = 'block';
    }
    
    const blocked = action === 'block';
    const tarpitMs = action === 'tarpit' ? calculateTarpitDelay(fusedScore) : undefined;
    const topSignal = [...signals].sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])[0];
    const reason = topSignal ? `${topSignal.type}: ${topSignal.detail}` : undefined;
    
    const result: InspectResult = {
      action,
      threatScore: rawThreatScore, // Raw score for backward compatibility
      normalityScore,
      severity,
      signals,
      blocked,
      reason,
      tarpitMs,
      trustScore,
      botScore,
      fusedScore,
      entropyScore,
      fingerprintId,
      attackChainLength: currentChain.entries.length,
    };
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 5: FIRE-AND-FORGET WRITES
    // ═══════════════════════════════════════════════════════════
    
    // Critical writes (awaited, counted toward 8-write budget)
    await logEventRedis({ timestamp: now, ip, userId, endpoint, method, userAgent, ...result });
    
    if (blocked || action === 'tarpit') {
      const forensicPacket = captureForensicPacket(req, result, trustProfile, currentChain, fingerprintId);
      await rpush(`asi:forensic:${ip}:${now}`, JSON.stringify(forensicPacket), 200, 604800);
    }
    
    if (signals.length > 0) {
      const updatedChain: AttackChain = {
        ip,
        entries: [
          ...currentChain.entries.filter(e => e.timestamp > now - 1800000),
          ...signals.map(s => ({ timestamp: now, signalType: s.type, severity: s.severity }))
        ].slice(-50)
      };
      void rset(`asi:chain:${ip}`, JSON.stringify(updatedChain), 1800);
    }
    
    // Fire-and-forget writes (non-critical, deferred)
    void updateDeferredContext(req, result, trustProfile, sessionContext, fingerprintRecord, fingerprintId, userId, headers);
    
    return result;
  }, 4000, {
    // Graceful fallback on timeout
    action: 'allow',
    threatScore: 0,
    normalityScore: 100,
    severity: 'info',
    signals: [],
    blocked: false,
    reason: 'Security check timed out (graceful fallback)',
    trustScore: 50,
    fusedScore: 0,
  });
}

// Fire-and-forget context updates
async function updateDeferredContext(
  req: InspectRequest,
  result: InspectResult,
  trustProfile: TrustProfile | null,
  sessionContext: SessionContext | null,
  fingerprintRecord: DeviceFingerprintRecord | null,
  fingerprintId: string,
  userId: string | undefined,
  headers: Record<string, string>
): Promise<void> {
  const { ip, endpoint, method } = req;
  const now = Date.now();
  
  try {
    // Update TrustProfile if clean request
    if (result.signals.length === 0 && trustProfile) {
      const updated = updateBehavioralBaseline(trustProfile, req);
      updated.cleanRequestCount++;
      updated.lastSeenAt = now;
      updated.trustScore = computeTrustScore(updated);
      await rset(`asi:trust:${ip}`, JSON.stringify(updated), 2592000);
    } else if (result.signals.length === 0 && !trustProfile) {
      // Create new TrustProfile
      const newProfile: TrustProfile = {
        ip,
        createdAt: now,
        lastSeenAt: now,
        cleanRequestCount: 1,
        attackSignalCount: 0,
        endpointFrequencies: { [endpoint]: 1 },
        methodDistribution: { [method]: 1 },
        hourlyActivity: Array(24).fill(0),
        meanInterRequestMs: 0,
        stdDevInterRequestMs: 0,
        meanPayloadSize: 0,
        stdDevPayloadSize: 0,
        trustScore: 50,
        recentHighThreat: false,
        highThreatCount: 0,
        maxTrustScore: 100,
        countries: [],
        countryTimestamps: [],
      };
      newProfile.hourlyActivity[new Date(now).getHours()] = 1;
      await rset(`asi:trust:${ip}`, JSON.stringify(newProfile), 2592000);
    } else if (result.signals.length > 0 && trustProfile) {
      // Update attack counters
      trustProfile.attackSignalCount++;
      if (result.threatScore > 60) {
        trustProfile.recentHighThreat = true;
        trustProfile.lastAttackAt = now;
      }
      await rset(`asi:trust:${ip}`, JSON.stringify(trustProfile), 2592000);
    }
    
    // Update SessionContext
    const updatedSession: SessionContext = sessionContext ?? {
      ip,
      startedAt: now,
      lastRequestAt: now,
      endpoints: [],
      methods: [],
      timestamps: [],
      responseCodes: [],
      interRequestIntervals: [],
      uniqueEndpointCount: 0,
      getRequestCount: 0,
      postRequestCount: 0,
    };
    
    if (sessionContext) {
      const interval = now - sessionContext.lastRequestAt;
      updatedSession.interRequestIntervals = [...sessionContext.interRequestIntervals, interval].slice(-10);
    }
    
    updatedSession.endpoints = [...updatedSession.endpoints, endpoint].slice(-20);
    updatedSession.methods = [...updatedSession.methods, method].slice(-20);
    updatedSession.timestamps = [...updatedSession.timestamps, now].slice(-20);
    updatedSession.lastRequestAt = now;
    updatedSession.uniqueEndpointCount = new Set(updatedSession.endpoints).size;
    if (method === 'GET') updatedSession.getRequestCount++;
    else updatedSession.postRequestCount++;
    
    await rset(`asi:session:${ip}`, JSON.stringify(updatedSession), 900);
    
    // Update DeviceFingerprint
    const updatedFP: DeviceFingerprintRecord = fingerprintRecord ?? {
      fingerprintId,
      createdAt: now,
      lastSeenAt: now,
      cleanRequestCount: 0,
      associatedIPs: [],
    };
    
    if (result.action === 'allow' || result.action === 'throttle') {
      updatedFP.cleanRequestCount++;
    }
    updatedFP.lastSeenAt = now;
    if (!updatedFP.associatedIPs.includes(ip)) {
      updatedFP.associatedIPs = [...updatedFP.associatedIPs, ip].slice(-10);
    }
    
    await rset(`asi:fp:${fingerprintId}`, JSON.stringify(updatedFP), 7776000);
    
    // Update geo tracking
    if (userId) {
      const country = extractCountryCode(headers);
      if (country) {
        const geoKey = `asi:geo:${userId}`;
        const existing = await rget<{countries: string[]; timestamps: number[]}>(geoKey);
        const updated = {
          countries: [...(existing?.countries ?? []), country].slice(-10),
          timestamps: [...(existing?.timestamps ?? []), now].slice(-10),
        };
        await rset(geoKey, JSON.stringify(updated), 7200);
      }
    }
  } catch {
    // Silent failure for fire-and-forget updates
  }
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: TrustProfile Persistence and Loading

*For any* IP address that completes at least 5 clean requests (without attack signals), a TrustProfile SHALL be created in Redis and SHALL be loadable on subsequent requests from that IP, containing endpoint frequencies, method distribution, and hourly activity patterns with all numeric fields within valid ranges [0, ∞).

**Validates: Requirements 1.1, 1.2**

### Property 2: Trust Score Monotonicity with Clean Requests

*For any* TrustProfile, if a clean request (signals.length === 0) is processed and updates the profile, the resulting trustScore SHALL be greater than or equal to the trustScore before the update, unless a recentHighThreat flag or evasion penalty is active.

**Validates: Requirements 1.2, 1.5**

### Property 3: Behavioral Baseline Threshold Guarantee

*For any* request that matches a TrustProfile's BehavioralBaseline (within 2 standard deviations for inter-request interval and payload size), the computed NormalityScore SHALL be at least 85, regardless of other heuristic deductions.

**Validates: Requirements 1.4**

### Property 4: TrustProfile TTL Sliding Window

*For any* TrustProfile that receives a clean request at time T, the Redis TTL SHALL be reset to 30 days from time T, ensuring the profile does not expire while the IP remains active.

**Validates: Requirements 1.6**

### Property 5: SessionContext Navigation Score Validity

*For any* ordered pair of endpoints (prevEndpoint, currentEndpoint) in a SessionContext, the computed NavigationScore SHALL be in the range [0, 100], with valid transitions (present in NAVIGATION_GRAPH) scoring >= 80 and invalid transitions scoring <= 60.

**Validates: Requirements 2.2**

### Property 6: Navigation Bonus Application

*For any* SessionContext showing a linear, human-paced pattern (inter-request intervals 500ms-300s, diverse endpoints, mixed GET/POST), the NormalityScore bonus applied SHALL be up to 15 points, and the final NormalityScore SHALL not exceed 100.

**Validates: Requirements 2.3**

### Property 7: Path Scanning Detection Threshold

*For any* IP that visits more than 20 distinct endpoints within 60 seconds without an existing TrustProfile, an `http_flood` signal with severity `high` SHALL be emitted.

**Validates: Requirements 2.4**

### Property 8: DeviceFingerprint Determinism

*For any* fixed set of request headers (Accept, Accept-Language, Accept-Encoding, User-Agent, Sec-CH-UA), calling deriveDeviceFingerprint() multiple times SHALL always return the same 16-character hex string.

**Validates: Requirements 3.1**

### Property 9: Fingerprint Trust Bonus Application

*For any* DeviceFingerprintRecord with cleanRequestCount >= 20, the FingerprintTrustBonus SHALL be exactly 10 points (subtracted from ThreatScore), and for cleanRequestCount < 20, the bonus SHALL be 0.

**Validates: Requirements 3.3**

### Property 10: Adaptive Rate Limit Multiplier Ordering

*For any* IP, the effective rate limit multiplier SHALL satisfy the ordering: multiplier(trustScore < 70) = 1.0, multiplier(70 <= trustScore < 90) = 2.0, multiplier(trustScore >= 90) = 3.0, and multiplier SHALL be clamped to [1.0, 3.0] regardless of trustScore value.

**Validates: Requirements 4.2, 4.3, 4.5**

### Property 11: Adaptive Threshold Suspension on High Threat

*For any* IP with an elevated AdaptiveThreshold (trustScore >= 70), if any single request produces an attack signal with severity `high` or `critical`, the multiplier SHALL be reset to 1.0 immediately and suspended for 30 minutes.

**Validates: Requirements 4.6**

### Property 12: Shannon Entropy Range Validity

*For any* non-empty string, the calculated Shannon entropy SHALL be in the range [0, log2(|alphabet|)], where |alphabet| is the number of distinct characters. For ASCII text, this upper bound is approximately 6.6 bits/char, and for extended Unicode, approximately 8.0 bits/char.

**Validates: Requirements 5.1**

### Property 13: High-Entropy Segment Flagging

*For any* string segment in a POST/PUT/PATCH request body with length > 64 characters AND Shannon entropy > 5.2 bits/char, the segment SHALL be flagged as high-entropy and added to entropy analysis context.

**Validates: Requirements 5.2**

### Property 14: Encoded Payload Detection Severity Escalation

*For any* high-entropy segment that decodes as valid base64 AND the decoded content matches an existing attack pattern (XSS, SQLi, CMDi, Path Traversal), the emitted signal severity SHALL be at least as high as the raw pattern's severity, with confidence >= 0.90.

**Validates: Requirements 5.3**

### Property 15: Content-Type Validation Signal Emission

*For any* POST/PUT/PATCH request to endpoints `/api/chat`, `/api/generate`, `/api/research`, or `/api/vector` that lacks a `Content-Type` header, an `anomaly` signal with severity `low` SHALL be emitted.

**Validates: Requirements 6.1**

### Property 16: Content-Length Mismatch Detection

*For any* request with `Content-Length: 0` header AND non-empty body (JSON.stringify(body).length > 0), an `anomaly` signal with severity `medium` and detail "Content-Length mismatch" SHALL be emitted.

**Validates: Requirements 6.2**

### Property 17: Slowloris Signal Threshold

*For any* request to a non-streaming endpoint (`/api/auth/*`, `/api/validate/*`) with requestDurationMs > 8000, a `slowloris` signal with severity at least `medium` SHALL be emitted.

**Validates: Requirements 7.2**

### Property 18: Persistent Slowloris Escalation

*For any* IP whose last 5 requests to non-streaming endpoints ALL have requestDurationMs > 5000, a `slowloris` signal with severity `high` SHALL be emitted and ThreatScore SHALL be increased by at least 20 points.

**Validates: Requirements 7.3**

### Property 19: BotScore Range and Signal Emission

*For any* request, the computed BotScore SHALL be in the range [0, 100]. When BotScore >= 50, a `bot_detected` signal with severity `medium` SHALL be emitted. When BotScore >= 80, the signal severity SHALL be `high`.

**Validates: Requirements 8.1, 8.4, 8.5**

### Property 20: Modern Browser Without Sec-Fetch Penalty

*For any* request with a User-Agent containing "Chrome", "Firefox", "Safari", or "Edge" AND missing all three headers (`Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`), the BotScore SHALL be increased by at least 20 points.

**Validates: Requirements 8.2**

### Property 21: Machine-Regular Timing Detection

*For any* SessionContext with 10 or more inter-request intervals where the standard deviation is below 100ms, the BotScore SHALL be increased by at least 30 points with detail "Machine-regular timing".

**Validates: Requirements 8.3**

### Property 22: Credential Stuffing Detection

*For any* IP that sends more than 5 POST requests to `/api/auth/login` with distinct payload hashes (SHA-256 of body) within 5 minutes, a `credential_stuffing` signal with severity `high` and confidence >= 0.95 SHALL be emitted.

**Validates: Requirements 9.1**

### Property 23: Prompt Injection Pattern Matching

*For any* request body to `/api/chat` or `/api/generate` containing the phrases "ignore previous instructions", "you are now", "disregard your", "system:", or "SYSTEM OVERRIDE", an `anomaly` signal with severity `high` and detail "Prompt injection attempt" SHALL be emitted.

**Validates: Requirements 9.2**

### Property 24: Attack Chain Recon-to-Exploit Correlation

*For any* IP whose AttackChain contains a reconnaissance signal (scanner, suspicious_request, http_flood) followed within 10 minutes by a weaponization signal (sql_injection, command_injection, xss_attempt, ssrf_attempt), a composite `anomaly` signal with severity `critical` and detail "Multi-phase attack chain: recon → exploit" SHALL be emitted.

**Validates: Requirements 10.2**

### Property 25: Attack Chain Signal Diversity Bonus

*For any* IP whose AttackChain contains 3 or more distinct attack signal types within 10 minutes, the ThreatScore SHALL be increased by exactly 25 points before the final decision.

**Validates: Requirements 10.3**

### Property 26: TrustScore Computation Formula Exactness

*For any* TrustProfile, the computed TrustScore SHALL equal `clamp(BaseTrust + FingerprintBonus + SessionBonus - PenaltyAccumulated, 0, maxTrustScore)` where BaseTrust is derived from cleanRequestCount, FingerprintBonus from DeviceFingerprint record, and penalties from recentHighThreat and lastAttackAt timing.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 27: FusedScore Computation Formula Exactness

*For any* valid inputs (ThreatScore, TrustScore, NormalityScore), the computed FusedScore SHALL equal `(ThreatScore * 0.6) - (TrustScore * 0.4) + max(0, 50 - NormalityScore) * 0.3`, clamped to [0, 100].

**Validates: Requirements 11.4**

### Property 28: MitigationAction Partition Property

*For any* FusedScore value, the selected MitigationAction SHALL be exactly one of: `allow` (FusedScore < 20), `throttle` (20 <= FusedScore < 40), `tarpit` (40 <= FusedScore < 60), or `block` (FusedScore >= 60), with no overlaps or gaps.

**Validates: Requirements 11.5**

### Property 29: Forensic Packet Sensitive Header Masking

*For any* ForensicPacket captured, the stored headers SHALL have sensitive values masked: `Authorization` → `[REDACTED:Bearer]`, `Cookie` → `[REDACTED:N-cookies]` where N is the cookie count, `X-Api-Key` → `[REDACTED]`, and the original sensitive values SHALL NOT appear in the stored JSON.

**Validates: Requirements 12.3**

### Property 30: Geographic Anomaly 2-Hour Window Detection

*For any* authenticated user (userId present) whose current country code is different from any country code in the TrustProfile within the last 2 hours, an `anomaly` signal with severity `medium` and detail "Geographic anomaly" SHALL be emitted.

**Validates: Requirements 13.2**

### Property 31: Impossible Travel Detection

*For any* userId that appears in 3 or more distinct country codes within 1 hour, an `anomaly` signal with severity `high` and detail "Impossible travel" SHALL be emitted.

**Validates: Requirements 13.3**

### Property 32: NoSQLi Pattern Detection

*For any* request body string matching any NoSQLi pattern (e.g., `{"$ne": null}`, `{$gt: ""}`, `$where:`), a `sql_injection` signal with detail "NoSQL injection pattern" SHALL be emitted.

**Validates: Requirements 14.1**

### Property 33: LDAP Injection Pattern Detection

*For any* request body string matching any LDAP injection pattern (e.g., `)(uid=*)`, `*)(objectClass=*`), an `anomaly` signal with severity `high` and detail "LDAP injection pattern" SHALL be emitted.

**Validates: Requirements 14.2**

### Property 34: SSTI Pattern Detection

*For any* request body string matching any SSTI pattern (e.g., `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`), an `anomaly` signal with severity `high` and detail "SSTI pattern detected" SHALL be emitted.

**Validates: Requirements 14.3**

### Property 35: Deserialization Pattern Detection

*For any* request body string matching any deserialization pattern (e.g., `rO0AB`, `O:`, `\xac\xed\x00\x05`), an `anomaly` signal with severity `critical` and detail "Deserialization payload detected" SHALL be emitted.

**Validates: Requirements 14.4**

### Property 36: Open Redirect Parameter Detection

*For any* URL parameter named `redirect`, `url`, `next`, `callback`, or `return` that contains an absolute URL (e.g., `https://evil.com`, `//evil.com`), an `open_redirect` signal with severity `medium` SHALL be emitted.

**Validates: Requirements 14.5**

### Property 37: Evasion Pattern Detection via High-Threat Resets

*For any* TrustProfile with highThreatCount >= 5 (indicating repeated high-threat resets despite having a profile), an `anomaly` signal with severity `high` and detail "Evasion pattern: repeated high-threat resets" SHALL be emitted.

**Validates: Requirements 15.3**

### Property 38: TrustScore Max Reduction for Evasion

*For any* IP that accumulates 5 or more recentHighThreat flags within 6 hours, the maxTrustScore field in TrustProfile SHALL be permanently reduced to 40 until manual clearance.

**Validates: Requirements 15.4**

### Property 39: InspectResult Field Completeness

*For any* invocation of inspect(), the returned InspectResult SHALL contain all required fields: `action`, `threatScore`, `normalityScore`, `severity`, `signals`, `blocked`, and all new optional fields: `trustScore`, `botScore`, `fusedScore`, `entropyScore`, `fingerprintId`, `attackChainLength`.

**Validates: Requirements 16.1, 16.2**

### Property 40: Batch Redis Read Operation

*For any* invocation of inspect(), all independent Redis read operations (TrustProfile, SessionContext, DeviceFingerprint, AttackChain, IP block status) SHALL be initiated in a single `Promise.all()` call to minimize round-trip latency.

**Validates: Requirements 17.2**

### Property 41: Graceful Timeout Fallback

*For any* invocation of inspect() that exceeds the 4-second timeout, the system SHALL return a graceful fallback result: `action: "allow", threatScore: 0, normalityScore: 100, blocked: false, reason: "Security check timed out"` without throwing an error or blocking the request.

**Validates: Requirements 17.3, 17.6**

### Property 42: Redis Write Budget Compliance

*For any* single inspect() invocation, the total number of awaited Redis write operations (critical writes only) SHALL NOT exceed 8, with non-critical writes deferred as fire-and-forget operations.

**Validates: Requirements 17.4, 17.5**


## Error Handling

### Redis Connection Failures

**Strategy:** Graceful degradation — continue processing with baseline defaults rather than failing requests.

**Implementation:**
```typescript
// All Redis operations wrapped in safe wrappers that return null on failure
async function rget<T>(key: string): Promise<T | null> {
  try {
    return await getRedis().get<T>(key);
  } catch (error) {
    console.error(`[ASI] Redis GET failed for ${key}:`, error);
    return null;
  }
}

async function rset(key: string, val: unknown, exSeconds?: number): Promise<void> {
  try {
    if (exSeconds) await getRedis().set(key, val, { ex: exSeconds });
    else await getRedis().set(key, val);
  } catch (error) {
    console.error(`[ASI] Redis SET failed for ${key}:`, error);
    // Silent failure — non-critical
  }
}
```

**Fallback Behavior:**
- **TrustProfile unavailable** → Use BaseTrust = 50 (neutral), no baseline matching
- **SessionContext unavailable** → NavigationScore = 100 (allow), no timing analysis
- **DeviceFingerprint unavailable** → FingerprintBonus = 0, no fingerprint trust
- **AttackChain unavailable** → No chain correlation, no threat bonus
- **Rate limit check fails** → Allow request (fail open for availability)

### Timeout Protection

**Strategy:** Entire inspection wrapped in 4-second timeout with graceful fallback.

**Implementation:**
```typescript
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>(resolve => setTimeout(() => {
      console.warn(`[ASI] Operation timed out after ${timeoutMs}ms, using fallback`);
      resolve(fallback);
    }, timeoutMs)),
  ]);
}

// Usage in inspect()
return withTimeout(async () => {
  // ... full inspection logic
}, 4000, {
  action: 'allow',
  threatScore: 0,
  normalityScore: 100,
  severity: 'info',
  signals: [],
  blocked: false,
  reason: 'Security check timed out (graceful fallback)',
  trustScore: 50,
  fusedScore: 0,
});
```

### Pattern Matching Errors

**Strategy:** Catch RegExp exceptions and skip failed patterns.

**Implementation:**
```typescript
function scanPatterns(text: string, patterns: RegExp[]): boolean {
  try {
    return patterns.some(p => {
      try {
        return p.test(text);
      } catch {
        // Catastrophic backtracking or malformed regex
        return false;
      }
    });
  } catch {
    return false;
  }
}
```

### JSON Parsing Failures

**Strategy:** Catch parse errors for stored JSON data and treat as missing data.

**Implementation:**
```typescript
async function loadTrustProfile(ip: string): Promise<TrustProfile | null> {
  const raw = await rget<string>(`asi:trust:${ip}`);
  if (!raw) return null;
  
  try {
    return JSON.parse(raw) as TrustProfile;
  } catch (error) {
    console.error(`[ASI] Failed to parse TrustProfile for ${ip}:`, error);
    return null; // Corrupted data — treat as missing
  }
}
```

### Entropy Calculation Edge Cases

**Strategy:** Handle empty strings and single-character inputs gracefully.

**Implementation:**
```typescript
function calculateShannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  if (str.length === 1) return 0; // Single char = no entropy
  
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  const len = str.length;
  let entropy = 0;
  
  for (const count of Object.values(freq)) {
    if (count === 0) continue; // Skip zero counts
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
}
```

### Base64 Decoding Failures

**Strategy:** Catch decoding errors and treat as non-base64 content.

**Implementation:**
```typescript
function tryDecodeBase64(segment: string): string | null {
  try {
    const decoded = Buffer.from(segment, 'base64').toString('utf-8');
    // Verify decoded content is valid UTF-8
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) {
      return null; // Contains control chars = probably not text
    }
    return decoded;
  } catch {
    return null;
  }
}
```

### Storage Quota Exhaustion

**Strategy:** LIFO eviction for bounded collections (event log, forensic packets, attack chains).

**Implementation:**
```typescript
async function rpush(key: string, val: string, maxLen: number, exSeconds: number): Promise<void> {
  try {
    const r = getRedis();
    await r.lpush(key, val);            // Add to front
    await r.ltrim(key, 0, maxLen - 1);  // Keep only maxLen items (evict oldest)
    await r.expire(key, exSeconds);     // Reset TTL
  } catch (error) {
    console.error(`[ASI] Redis RPUSH failed for ${key}:`, error);
  }
}
```

### Geographic Data Unavailable

**Strategy:** Skip geographic anomaly detection if headers are missing.

**Implementation:**
```typescript
function extractCountryCode(headers: Record<string, string>): string | null {
  return headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || null;
}

// In inspect()
if (userId && geoData) {
  const currentCountry = extractCountryCode(headers);
  if (currentCountry) {
    signals.push(...detectGeographicAnomaly(userId, currentCountry, geoData));
  }
  // If no country code, silently skip check
}
```

### Fire-and-Forget Write Failures

**Strategy:** Non-critical updates (TrustProfile, SessionContext, DeviceFingerprint) are fire-and-forget — failures logged but do not affect request outcome.

**Implementation:**
```typescript
// Launch without await
void (async () => {
  try {
    await updateDeferredContext(req, result, trustProfile, sessionContext, fingerprintRecord, fingerprintId, userId, headers);
  } catch (error) {
    console.error('[ASI] Fire-and-forget update failed:', error);
    // Request already completed successfully — failure is non-critical
  }
})();
```
