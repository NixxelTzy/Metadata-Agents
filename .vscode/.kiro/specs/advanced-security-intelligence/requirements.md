# Requirements Document

## Introduction

Upgrade of the existing security monitoring and protection system (`lib/security/core.ts` and `lib/security/index.ts`) into an **Advanced Security Intelligence** engine. The core problem is that the current system treats all requests uniformly using static pattern-matching, causing legitimate user activity to be flagged alongside real attacks. This upgrade introduces behavioral context, session intelligence, adaptive thresholds, and multi-dimensional scoring to achieve near-zero false positives while maximising detection accuracy against real threats.

All code MUST live exclusively in `lib/security/core.ts` and `lib/security/index.ts`. No new files will be created.

## Glossary

- **ASI**: Advanced Security Intelligence — the upgraded engine described in this document.
- **Inspector**: The main `inspect()` function that evaluates every incoming request.
- **TrustProfile**: A Redis-persisted behavioral model representing a known, legitimate identity (IP + optional UserId).
- **SessionContext**: Transient per-session state (sequence of endpoints, timing, method patterns) used for anomaly detection.
- **BehavioralBaseline**: The computed statistical normal for a given TrustProfile (endpoint distribution, inter-request timing, payload entropy range, etc.).
- **TrustScore**: A 0–100 value representing how much the system trusts an identity at this moment. 100 = fully trusted, 0 = blocked.
- **ThreatScore**: A 0–100 value representing the probability that a request is malicious. 0 = clean, 100 = certain attack.
- **NormalityScore**: Existing 0–100 measure of how normal a single request looks in isolation. Preserved for backwards compatibility.
- **FusedScore**: The composite risk decision derived from TrustScore, ThreatScore, and NormalityScore together.
- **DeviceFingerprint**: A deterministic identifier derived from stable, non-PII request attributes (TLS fingerprint approximation, Accept headers, encoding, language, timezone hints).
- **EntropyScore**: A Shannon-entropy measurement of payload or URL content used to detect obfuscated/encoded attacks.
- **AdaptiveThreshold**: A dynamically computed limit that adjusts based on the TrustProfile's historical behavior rather than using fixed global limits.
- **AttackChain**: A sequence of related signals across multiple requests from the same identity within a time window that together indicate a coordinated attack.
- **BusinessLogicSignal**: A signal specific to this application's own routes (auth, generate, chat, research, vector) that detects abuse of application functionality.
- **ForensicPacket**: A rich, immutable record captured at detection time for incident response, containing full request metadata, signals, and the identity's behavioral snapshot.
- **Redis**: Upstash Redis — the shared persistent store across all Vercel serverless instances.
- **Edge**: Vercel Edge Runtime — does NOT support Node.js modules, only `middleware.ts` runs here.

---

## Requirements

### Requirement 1: Behavioral Baseline and Trust Profile

**User Story:** As the website owner, I want the system to learn my normal usage patterns over time so that my own legitimate requests are never flagged as attacks.

#### Acceptance Criteria

1. THE Inspector SHALL build and persist a TrustProfile in Redis for every IP address that successfully completes at least 5 requests without attack signals, storing endpoint visit frequencies, HTTP method distribution, and hourly activity patterns.
2. WHEN a request arrives from an IP with an existing TrustProfile, THE Inspector SHALL load that TrustProfile from Redis and use it to adjust the ThreatScore downward by a TrustScore-weighted factor before making a mitigation decision.
3. WHILE a TrustProfile exists for an identity, THE Inspector SHALL update the BehavioralBaseline incrementally with each new clean request, recalculating mean inter-request interval, mean payload size, and endpoint entropy without replacing historical data.
4. WHEN a request matches the identity's established BehavioralBaseline within two standard deviations for all tracked dimensions, THE Inspector SHALL assign a NormalityScore of at least 85 regardless of generic heuristic deductions.
5. IF a TrustProfile exists and the current request's ThreatScore from raw signal detection is below 30, THEN THE Inspector SHALL reduce the effective ThreatScore by up to 20 points proportional to the TrustScore, preventing false positives for known-good users.
6. THE Inspector SHALL expire TrustProfiles from Redis after 30 days of inactivity using a sliding TTL that resets on each clean request.
7. THE Inspector SHALL store TrustProfiles under isolated Redis keys with a namespace prefix `asi:trust:` to avoid collision with existing `sec:` keys.

---

### Requirement 2: Session Context Tracking

**User Story:** As the website owner, I want the system to understand my browsing session as a sequence of actions so it can distinguish my normal navigation from an attacker's automated scanning.

#### Acceptance Criteria

1. THE Inspector SHALL create a SessionContext entry in Redis when an IP makes its first request, keyed by `asi:session:{ip}`, storing the ordered list of endpoints visited, timestamps, HTTP methods, and response-code hints within the last 15 minutes.
2. WHEN a request is received and a SessionContext exists, THE Inspector SHALL evaluate the transition from the previous endpoint to the current endpoint against a known-valid navigation graph for this application's routes and assign a NavigationScore of 0–100 reflecting how plausible the transition is.
3. WHILE a SessionContext shows a linear, human-paced navigation pattern (inter-request interval between 500ms and 300 seconds, diverse endpoints, mixed GET/POST), THE Inspector SHALL apply a NavigationScore bonus of up to 15 points to the NormalityScore.
4. WHEN an IP visits more than 20 distinct endpoints within 60 seconds and no TrustProfile exists, THE Inspector SHALL classify this as path scanning and emit an `http_flood` signal with severity `high`.
5. IF a SessionContext shows no GET requests and only POST/PUT requests within a session of more than 5 requests, THEN THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Automated write-only session pattern".
6. THE Inspector SHALL expire SessionContext entries from Redis after 15 minutes of inactivity.

---

### Requirement 3: Device Fingerprinting

**User Story:** As the website owner, I want the system to recognise my device across sessions so that my consistent browser is always treated as trusted.

#### Acceptance Criteria

1. THE Inspector SHALL derive a DeviceFingerprint by hashing a stable subset of request headers — `Accept`, `Accept-Language`, `Accept-Encoding`, `User-Agent`, and `Sec-CH-UA` if present — using a SHA-256 truncated to 16 hex characters.
2. WHEN a DeviceFingerprint is computed, THE Inspector SHALL check Redis key `asi:fp:{fingerprint}` for an existing fingerprint record containing its trust level and historical clean-request count.
3. WHILE a DeviceFingerprint has accumulated more than 20 clean requests in its Redis record, THE Inspector SHALL assign a FingerprintTrustBonus of 10 points subtracted from the ThreatScore before the final decision.
4. WHEN a known TrustProfile IP presents a DeviceFingerprint that has never been associated with that IP before, THE Inspector SHALL emit an `anomaly` signal with severity `low` and detail "New device fingerprint for known IP" but SHALL NOT block or throttle.
5. THE Inspector SHALL update the fingerprint record's clean-request count in Redis for every request that results in action `allow` or `throttle`.
6. THE Inspector SHALL expire DeviceFingerprint records from Redis after 90 days using a sliding TTL.

---

### Requirement 4: Adaptive Rate Limiting

**User Story:** As the website owner, I want rate limits to adapt to my usage patterns so that my legitimate bursts of activity (e.g., using the AI chat or research features heavily) are not rate-limited.

#### Acceptance Criteria

1. THE Inspector SHALL maintain separate AdaptiveThreshold values per (IP, tier) combination in Redis, initialised to the existing static TIERS limits (`AUTH`: 10/15min, `API`: 100/1min, `UPLOAD`: 15/1min, `STRICT`: 5/1hr).
2. WHEN a TrustProfile exists for an IP with TrustScore ≥ 70, THE Inspector SHALL apply a multiplier of up to 2.0× to the AdaptiveThreshold for that IP's tier, allowing higher request volume before rate limiting triggers.
3. WHEN a TrustProfile exists for an IP with TrustScore ≥ 90, THE Inspector SHALL apply a multiplier of up to 3.0× to the AdaptiveThreshold, reflecting a fully trusted identity.
4. WHEN an IP without a TrustProfile exceeds the static tier limit, THE Inspector SHALL retain the existing blocking behavior with no multiplier applied.
5. THE Inspector SHALL NOT raise AdaptiveThreshold multipliers above 3.0×, regardless of TrustScore value.
6. IF an IP with elevated AdaptiveThreshold produces an attack signal with severity `high` or `critical` in any single request, THEN THE Inspector SHALL immediately reset that IP's AdaptiveThreshold to the static default and suspend the multiplier for 30 minutes.

---

### Requirement 5: Shannon Entropy Detection for Obfuscated Payloads

**User Story:** As the security system, I want to detect base64, hex-encoded, or otherwise obfuscated attack payloads that evade plain-text pattern matching.

#### Acceptance Criteria

1. THE Inspector SHALL compute a Shannon entropy value for every string segment in the request body longer than 32 characters, using the formula `H = -Σ p(c) * log2(p(c))` over the character distribution.
2. WHEN a string segment has an EntropyScore above 5.2 bits/character AND is longer than 64 characters, THE Inspector SHALL flag it as a high-entropy segment and add it to an entropy analysis context.
3. WHEN a high-entropy segment decodes as valid base64 AND the decoded content matches any existing XSS, SQLi, CMDi, or Path Traversal pattern, THE Inspector SHALL emit a signal of the corresponding type with severity one level higher than the raw pattern would produce, with detail "Encoded attack payload detected".
4. WHEN a URL query string or path parameter segment has EntropyScore above 4.8 bits/character and length over 48 characters, THE Inspector SHALL emit an `anomaly` signal with severity `low` and detail "High entropy URL parameter — possible obfuscation".
5. WHEN the total EntropyScore across all body segments averages above 6.0 bits/character, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Extremely high payload entropy — likely binary or deeply encoded content".
6. THE Inspector SHALL perform entropy analysis only on `POST`, `PUT`, and `PATCH` requests to avoid false positives on GET query parameters from legitimate search inputs.

---

### Requirement 6: Protocol and Header Anomaly Detection

**User Story:** As the security system, I want to detect requests with structurally malformed or inconsistent HTTP headers that indicate automated tools or attack frameworks rather than real browsers.

#### Acceptance Criteria

1. THE Inspector SHALL validate that authenticated API requests to `/api/chat`, `/api/generate`, `/api/research`, and `/api/vector` include a `Content-Type` header matching `application/json` or `multipart/form-data`, and SHALL emit an `anomaly` signal with severity `low` if absent on POST/PUT/PATCH.
2. WHEN a request contains both a `Content-Length: 0` header and a non-empty body, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Content-Length mismatch — header manipulation".
3. WHEN a request to any API route arrives with an `Accept` header of `*/*` only AND no `Accept-Language` header AND no `Accept-Encoding` header, THE Inspector SHALL add 5 points to the ThreatScore with detail "Minimal header set — automated client signature".
4. WHEN a request contains more than 30 distinct HTTP headers, THE Inspector SHALL emit an `anomaly` signal with severity `low` and detail "Abnormal header count — header stuffing attempt".
5. WHEN a request contains a `Transfer-Encoding` header alongside a `Content-Length` header, THE Inspector SHALL emit an `anomaly` signal with severity `high` and detail "TE/CL header conflict — HTTP desync attack pattern".
6. WHEN the `Host` header value does not match the application's expected hostname and the request is not from localhost, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Host header mismatch — virtual host poisoning attempt".
7. THE Inspector SHALL preserve all existing header-based checks (CRLF injection, X-Forwarded-For chain length) and combine them with the new protocol anomaly checks within the same signal collection pass.

---

### Requirement 7: Timing Attack and Slowloris Detection

**User Story:** As the security system, I want to detect attacks that abuse request timing — either by sending requests extremely slowly to exhaust connection resources, or by using precise timing to extract secrets.

#### Acceptance Criteria

1. THE Inspector SHALL accept a `requestDurationMs` field in `InspectRequest` (already declared but unused) and use it for timing analysis when provided.
2. WHEN `requestDurationMs` is provided and exceeds 8000ms for a non-streaming endpoint (`/api/auth`, `/api/validate`), THE Inspector SHALL emit a `slowloris` signal with severity `medium` and detail "Abnormally slow request — possible Slowloris pattern".
3. WHEN an IP's last 5 requests all have `requestDurationMs` above 5000ms on non-streaming endpoints, THE Inspector SHALL escalate the `slowloris` signal to severity `high` and add 20 points to the ThreatScore.
4. THE Inspector SHALL store per-IP request duration history (last 10 values) in Redis under `asi:dur:{ip}` to enable the 5-request pattern check.
5. WHEN `requestDurationMs` is below 50ms for a POST request to `/api/auth/login` or `/api/auth/register`, THE Inspector SHALL emit an `anomaly` signal with severity `low` and detail "Suspiciously fast auth request — automated credential submission".
6. THE Inspector SHALL expire request duration history from Redis after 10 minutes.

---

### Requirement 8: Advanced Bot Detection

**User Story:** As the security system, I want to detect bots that use legitimate browser User-Agents but exhibit non-human behavioral patterns, since sophisticated attackers spoof UA strings.

#### Acceptance Criteria

1. THE Inspector SHALL evaluate a BotScore on a 0–100 scale by aggregating multiple non-UA signals: absence of browser-specific headers (`Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`), missing language headers, exact inter-request timing regularity, and write-only session pattern.
2. WHEN a request has a modern browser User-Agent string (containing "Chrome", "Firefox", "Safari", or "Edge") but is missing all three `Sec-Fetch-*` headers, THE Inspector SHALL add 20 points to the BotScore.
3. WHEN an IP's SessionContext shows inter-request intervals with standard deviation below 100ms over 10 or more consecutive requests, THE Inspector SHALL add 30 points to the BotScore with detail "Machine-regular timing — automated request cadence".
4. WHEN BotScore reaches 50 or above, THE Inspector SHALL emit a `bot_detected` signal with severity `medium` and confidence proportional to BotScore/100.
5. WHEN BotScore reaches 80 or above, THE Inspector SHALL emit a `bot_detected` signal with severity `high` and SHALL apply `throttle` action regardless of TrustScore, unless the IP has TrustScore ≥ 90.
6. THE Inspector SHALL NOT flag bots based on User-Agent alone if other behavioral indicators score below 30, to avoid false positives from API clients intentionally built by the owner.

---

### Requirement 9: Business Logic Attack Detection

**User Story:** As the security system, I want to detect attacks that abuse my application's specific features — such as credential stuffing on the login endpoint, prompt injection on the AI chat, or excessive AI generation requests.

#### Acceptance Criteria

1. WHEN an IP sends more than 5 requests to `/api/auth/login` with distinct payload hashes (different usernames/passwords) within 5 minutes, THE Inspector SHALL emit a `credential_stuffing` signal with severity `high` and confidence 0.95.
2. WHEN the request body to `/api/chat` or `/api/generate` contains patterns matching known prompt injection templates — including phrases like "ignore previous instructions", "you are now", "disregard your", "system:", or "SYSTEM OVERRIDE" — THE Inspector SHALL emit an `anomaly` signal with severity `high` and detail "Prompt injection attempt detected".
3. WHEN an IP sends more than 20 requests to `/api/generate` or `/api/research` within 10 minutes, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Excessive AI resource consumption — possible abuse".
4. WHEN an IP sends more than 3 requests to `/api/auth/register` within 30 minutes, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Rapid account creation — possible bot registration".
5. WHEN a request to `/api/validate/links` contains more than 50 URLs in the payload, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Bulk link validation — possible SSRF amplification attempt".
6. THE Inspector SHALL extract and store payload hashes (SHA-256 of request body, truncated to 16 hex chars) for auth endpoints in Redis under `asi:phash:{ip}` to enable the credential stuffing detection in criterion 1.
7. THE Inspector SHALL expire payload hash sets for auth endpoints after 5 minutes.

---

### Requirement 10: Attack Chain Correlation

**User Story:** As the security system, I want to recognise multi-step attacks where an attacker probes, scans, then escalates — correlating signals across multiple requests to identify coordinated campaigns.

#### Acceptance Criteria

1. THE Inspector SHALL maintain an AttackChain record per IP in Redis under `asi:chain:{ip}`, storing the sequence of signal types, their severities, and timestamps for the last 30 minutes.
2. WHEN an IP's AttackChain shows a "reconnaissance" phase (path scanning or suspicious path signals) followed within 10 minutes by a "weaponisation" phase (SQLi, CMDi, XSS, or SSRF signal), THE Inspector SHALL emit a composite signal of type `anomaly` with severity `critical` and detail "Multi-phase attack chain: recon → exploit".
3. WHEN an IP's AttackChain contains 3 or more distinct attack signal types within 10 minutes, THE Inspector SHALL apply a 25-point bonus to ThreatScore regardless of individual signal scores.
4. WHEN an IP's AttackChain contains any `critical` severity signal within the last 5 minutes, THE Inspector SHALL apply a 15-point persistence bonus to ThreatScore for all subsequent requests from that IP during that window.
5. THE Inspector SHALL expire AttackChain records from Redis after 30 minutes.
6. THE Inspector SHALL NOT trigger chain correlation for IPs with TrustScore ≥ 80, since legitimate users who trigger a false-positive signal would unfairly escalate.

---

### Requirement 11: Reputation Scoring and Trust Score Computation

**User Story:** As the security system, I want a unified, multi-dimensional trust score that combines all behavioral signals, fingerprint history, and session context into a single number driving all decisions.

#### Acceptance Criteria

1. THE Inspector SHALL compute a TrustScore for every request using the formula: `TrustScore = clamp(BaseTrust + FingerprintBonus + SessionBonus - PenaltyAccumulated, 0, 100)`, where BaseTrust is derived from TrustProfile history, FingerprintBonus from DeviceFingerprint record, and PenaltyAccumulated from AttackChain and recent signals.
2. THE Inspector SHALL initialise BaseTrust at 50 for new IPs with no TrustProfile, 70 for IPs with 5–20 clean requests in TrustProfile, and 90 for IPs with more than 20 clean requests with zero attack signals.
3. WHEN a TrustProfile for an IP has received any attack signal in the last 24 hours, THE Inspector SHALL apply a 20-point penalty to BaseTrust for that IP for the duration of those 24 hours.
4. THE Inspector SHALL compute FusedScore as: `FusedScore = (ThreatScore * 0.6) - (TrustScore * 0.4) + NormalityPenalty`, where NormalityPenalty is `max(0, 50 - NormalityScore) * 0.3`.
5. THE Inspector SHALL base the final `MitigationAction` on FusedScore rather than raw ThreatScore: `allow` below 20, `throttle` at 20–39, `tarpit` at 40–59, `block` at 60 and above.
6. THE Inspector SHALL preserve the existing `threatScore` field in `InspectResult` for backward compatibility with the monitor dashboard, setting it to ThreatScore (raw, pre-trust-adjustment).
7. THE Inspector SHALL add a `trustScore` field to `InspectResult` so the monitor dashboard can display it.
8. WHEN computing TrustScore, THE Inspector SHALL clamp the final value to the range [0, 100] using integer arithmetic.

---

### Requirement 12: Forensic Data Collection

**User Story:** As the website owner, I want complete, immutable forensic records of every detected attack so I can investigate incidents and understand exactly what happened.

#### Acceptance Criteria

1. WHEN a request results in action `block` or `tarpit`, THE Inspector SHALL capture a ForensicPacket containing: full request headers (with sensitive values masked), request body hash, all computed scores (ThreatScore, TrustScore, NormalityScore, FusedScore, BotScore, EntropyScore), all signals with confidence values, the TrustProfile snapshot at decision time, and the AttackChain state.
2. THE Inspector SHALL persist ForensicPackets to Redis under key `asi:forensic:{ip}:{timestamp}` with a 7-day TTL.
3. THE Inspector SHALL mask sensitive header values before storing in ForensicPackets: `Authorization` → `[REDACTED:Bearer]`, `Cookie` → `[REDACTED:N-cookies]` (where N is the cookie count), `X-Api-Key` → `[REDACTED]`.
4. THE Inspector SHALL limit total ForensicPackets in Redis to 200 entries by applying the same LIFO eviction pattern used by the existing event log.
5. THE Inspector SHALL export a `getForensicRecords(ip?: string, limit?: number)` function from `lib/security/index.ts` that retrieves ForensicPackets, optionally filtered by IP.
6. THE `getForensicRecords` function SHALL return an empty array rather than throwing when Redis is unavailable.

---

### Requirement 13: Geolocation and Access Pattern Analysis

**User Story:** As the security system, I want to detect when the same user appears to be connecting from multiple countries within an impossibly short time window, indicating credential theft or VPN-based attack coordination.

#### Acceptance Criteria

1. THE Inspector SHALL extract country-code hints from Cloudflare's `CF-IPCountry` header when present, and from `X-Vercel-IP-Country` header as a fallback.
2. WHEN an authenticated request (with `userId`) includes a country-code that is different from the country-code recorded in the identity's TrustProfile within the last 2 hours, THE Inspector SHALL emit an `anomaly` signal with severity `medium` and detail "Geographic anomaly: access from new country within 2h window".
3. WHEN a `userId` is present and more than 3 distinct country-codes appear in requests attributed to that `userId` within 1 hour, THE Inspector SHALL emit an `anomaly` signal with severity `high` and detail "Impossible travel: {N} countries in 1h — possible account takeover".
4. THE Inspector SHALL store the last 10 country-code entries per `userId` in Redis under `asi:geo:{userId}` with a 2-hour TTL.
5. IF the `CF-IPCountry` header is absent and `X-Vercel-IP-Country` is absent, THEN THE Inspector SHALL skip geographic analysis for that request without emitting any signal.
6. THE Inspector SHALL NOT apply geographic penalties to IPs with TrustScore ≥ 90, since the owner may legitimately use a VPN.

---

### Requirement 14: Advanced Payload Pattern Analysis (Extended)

**User Story:** As the security system, I want to detect more attack payload types that the current system misses — including NoSQLi, LDAP injection, template injection, and deserialization attacks.

#### Acceptance Criteria

1. THE Inspector SHALL add a NoSQL injection pattern set and scan all request body strings against it, emitting `sql_injection` signal with detail "NoSQL injection pattern" when matched.
2. THE Inspector SHALL add an LDAP injection pattern set covering sequences like `)(uid=*)(|(uid=`, `*)(objectClass=*`, and null-byte LDAP sequences, emitting `anomaly` signal with severity `high` and detail "LDAP injection pattern detected".
3. THE Inspector SHALL add a Server-Side Template Injection (SSTI) pattern set covering `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`, `#{7*7}`, and `*{7*7}`, emitting `anomaly` signal with severity `high` and detail "SSTI pattern detected".
4. THE Inspector SHALL add a Java/PHP deserialization pattern set covering `rO0AB` (Java serialized object base64 prefix), `O:` (PHP object serialization), and `\xac\xed\x00\x05` (Java magic bytes), emitting `anomaly` signal with severity `critical` and detail "Deserialization payload detected".
5. THE Inspector SHALL add an open redirect pattern set for the URL parameters of `/api` endpoints, detecting values like `//evil.com`, `\evil.com`, and `https://evil.com` in parameters named `redirect`, `url`, `next`, `callback`, or `return`, emitting `open_redirect` signal with severity `medium`.
6. THE Inspector SHALL apply all new pattern sets within the existing `detectPayloadSignals` function to maintain a single code path for payload analysis.

---

### Requirement 15: Intelligent Score Normalization and Anti-Evasion

**User Story:** As the security system, I want to prevent attackers from gaming the scoring system by sending a mix of clean and malicious requests to dilute their ThreatScore average.

#### Acceptance Criteria

1. WHEN a single request generates a ThreatScore above 60, THE Inspector SHALL mark the requesting IP's TrustProfile with a `recentHighThreat` flag in Redis that persists for 60 minutes and prevents TrustScore bonus application during that window.
2. WHEN a TrustProfile's `recentHighThreat` flag is set, THE Inspector SHALL apply zero TrustScore bonus to FusedScore computation for that identity.
3. WHEN an IP's request history shows an alternating pattern of clean requests (ThreatScore < 10) and attack requests (ThreatScore > 50) within a 20-request sliding window, THE Inspector SHALL emit an `anomaly` signal with severity `high` and detail "Evasion pattern: alternating clean/attack requests".
4. WHEN an IP accumulates more than 5 `recentHighThreat` flags within 6 hours (consecutive resets), THE Inspector SHALL permanently reduce that IP's maximum achievable TrustScore to 40 until the TrustProfile is manually cleared.
5. THE Inspector SHALL store the `recentHighThreat` flag and consecutive flag count under `asi:trust:{ip}` as fields within the TrustProfile structure, not as separate Redis keys.
6. THE Inspector SHALL still allow legitimate users to recover their TrustScore after the 60-minute window expires, provided no new high-threat requests are seen.

---

### Requirement 16: Real-Time Monitoring Data Enhancement

**User Story:** As the website owner, I want the monitoring dashboard to show me the new intelligence data — trust scores, bot scores, attack chains, and forensic data — so I can understand the security posture of my system at a glance.

#### Acceptance Criteria

1. THE `InspectResult` interface SHALL be extended with the following optional fields: `trustScore: number`, `botScore: number`, `fusedScore: number`, `entropyScore?: number`, `fingerprintId?: string`, `attackChainLength?: number`.
2. THE `SecurityEvent` interface SHALL be extended to persist all new `InspectResult` fields so they are available in the event log retrieved by `getSecurityEvents()`.
3. THE `getSecurityStats()` function SHALL include new aggregate fields in its return value: `avgTrustScore: number`, `botDetections: number`, `chainAttacks: number`, `promptInjections: number`, `geoAnomalies: number`.
4. WHEN a request is logged to the event log, THE Inspector SHALL include the `trustScore`, `fusedScore`, and `botScore` values in the persisted `SecurityEvent` record.
5. THE `getSecurityStats()` function SHALL remain backward compatible — all existing fields (`total`, `last24h`, `lastHour`, `last10min`, `blocked`, `normalRequests`, `abnormalRequests`, `avgNormality`, `bySeverity`, `byType`, `topIps`, `storageUsed`, `storageMax`, `storagePercent`) SHALL be present in the return value.
6. THE existing `defenceStatus` record exposed by the monitor API SHALL add new entries for each new detection subsystem: `behavioralAnalysis`, `adaptiveRateLimiter`, `entropyAnalyzer`, `botDetector`, `attackChainCorrelator`, `businessLogicGuard`, `forensicCollector`.

---

### Requirement 17: Performance and Resilience

**User Story:** As the website owner, I want the upgraded security system to be as fast as the current one so that legitimate users experience no added latency.

#### Acceptance Criteria

1. THE Inspector SHALL complete all detection logic, including Redis reads for TrustProfile, SessionContext, DeviceFingerprint, and AttackChain, within the existing 4-second graceful timeout.
2. THE Inspector SHALL batch all Redis read operations that are independent of each other into a single `Promise.all()` call to minimise total round-trip latency.
3. WHEN any individual Redis operation within the detection pipeline times out or fails, THE Inspector SHALL continue processing with degraded data (use baseline defaults) rather than failing the entire inspection.
4. THE Inspector SHALL NOT perform more than 8 Redis write operations per single request evaluation to avoid Upstash rate limits on free-tier plans.
5. WHEN the total number of Redis write operations for a request would exceed 8, THE Inspector SHALL batch remaining writes using Redis pipeline or defer non-critical writes (fingerprint count update, session update) using fire-and-forget semantics without awaiting.
6. THE Inspector SHALL preserve the existing graceful fallback: if the entire inspection times out, it returns `action: "allow", threatScore: 0, normalityScore: 100` without blocking the request.
7. THE Inspector SHALL NOT increase the existing per-request Redis storage beyond an additional 512 bytes average per request across all new data structures.
