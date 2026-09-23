# Implementation Plan: Advanced Security Intelligence

## Overview

This implementation plan upgrades the existing security monitoring system in `lib/security/core.ts` and `lib/security/index.ts` into an Advanced Security Intelligence (ASI) engine. The upgrade introduces behavioral context, multi-dimensional scoring, session intelligence, and adaptive thresholds to achieve near-zero false positives while maximizing detection accuracy against real threats.

All code implementation will be contained exclusively in:
- `lib/security/core.ts` — Core detection logic, data structures, algorithms
- `lib/security/index.ts` — Public API exports and utility functions

Target implementation: 4000+ lines of comprehensive security logic with 17 major capability areas.

## Tasks

- [x] 1. Foundation: Core Infrastructure and Type System
  - [x] 1.1 Extend TypeScript interfaces for new data structures
    - Add `TrustProfile`, `SessionContext`, `DeviceFingerprint`, `AttackChain`, `ForensicPacket` interfaces
    - Extend `InspectResult` with `trustScore`, `botScore`, `fusedScore`, `entropyScore`, `fingerprintId`, `attackChainLength`
    - Extend `SecurityEvent` to include all new fields for persistence
    - Update `AttackType` union to include new types: `credential_stuffing`, `bot_detected`, `open_redirect`
    - _Requirements: 1.1, 2.1, 3.1, 10.1, 11.7, 12.1, 16.1_

  - [x] 1.2 Implement Redis helper functions for batch operations
    - Add `rbatchGet()` function for parallel Redis reads using `Promise.all()`
    - Add fire-and-forget write wrapper `rsetAsync()` for non-critical updates
    - Add `rsadd()`, `rsmembers()` for set operations (payload hash tracking)
    - Add `rhgetall()` for hash operations (future optimization)
    - _Requirements: 17.2, 17.5_

  - [x] 1.3 Implement utility functions for cryptographic operations
    - Add `deriveDeviceFingerprint()` function using SHA-256 hash of stable headers
    - Add `hashPayload()` function for credential stuffing detection
    - Add `sanitizeHeaders()` function for forensic data masking
    - _Requirements: 3.1, 9.6, 12.3_

  - [x] 1.4 Create batch context loader function
    - Implement `loadContextData()` to parallel-load all Redis contexts (TrustProfile, SessionContext, DeviceFingerprint, AttackChain, GeoData)
    - Ensure graceful degradation when Redis operations fail
    - Return structured context object with all loaded data
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 2. Behavioral Baseline and Trust Profile System
  - [x] 2.1 Implement TrustProfile CRUD operations
    - Create `loadTrustProfile()` function to read from `asi:trust:{ip}` Redis key
    - Create `initializeTrustProfile()` for new IPs
    - Create `updateTrustProfile()` fire-and-forget writer with 30-day sliding TTL
    - Handle JSON serialization/deserialization with error boundaries
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Implement behavioral baseline tracking
    - Create `updateBehavioralBaseline()` to incrementally update endpoint frequencies, method distribution, hourly activity
    - Compute mean and standard deviation for inter-request intervals and payload sizes
    - Use incremental statistics algorithms (Welford's method) to avoid storing full history
    - _Requirements: 1.3_

  - [x] 2.3 Implement TrustScore computation
    - Create `computeTrustScore()` using BaseTrust tier logic (50/70/90 based on clean request count)
    - Apply 20-point penalty for `recentHighThreat` flag and 24h attack penalty
    - Clamp final score to `[0, maxTrustScore]` range
    - Return BaseTrust only — FingerprintBonus and SessionBonus added during FusedScore computation
    - _Requirements: 11.1, 11.2, 11.3, 11.8_

  - [x] 2.4 Implement TrustProfile baseline matching
    - Create `matchesBaseline()` function comparing request against stored statistical profile
    - Use z-score calculation (2 standard deviation threshold) for inter-request intervals and payload sizes
    - Return NormalityScore floor of 85 for requests within baseline
    - _Requirements: 1.4_

  - [x]* 2.5 Write unit tests for TrustProfile and TrustScore computation
    - Test TrustScore initialisation at 50 for new IPs, 70 for 5–19 clean requests, 90 for 20+
    - Test penalty application for recentHighThreat and 24h attack window
    - Test maxTrustScore cap for evasion pattern detection
    - _Requirements: 11.2, 11.3, 15.4_

- [x] 3. Session Context Tracking and Navigation Analysis
  - [x] 3.1 Implement SessionContext CRUD operations
    - Create `loadSessionContext()` to read from `asi:session:{ip}` with 15-minute TTL
    - Create `initializeSessionContext()` for new sessions
    - Create `updateSessionContext()` fire-and-forget writer appending endpoint, method, timestamp
    - Cap `endpoints` and related arrays at 20 entries using FIFO eviction
    - _Requirements: 2.1, 2.6_

  - [x] 3.2 Implement navigation graph and NavigationScore computation
    - Define the `NAVIGATION_GRAPH` constant mapping each application route to its valid next routes
    - Create `computeNavigationScore()` assigning 100/80/60/30 points based on transition validity
    - Emit NavigationScore bonus of up to 15 points for human-paced diverse sessions
    - _Requirements: 2.2, 2.3_

  - [x] 3.3 Implement path scanning and write-only session detection
    - Detect `>20 distinct endpoints within 60 seconds` with no TrustProfile → emit `http_flood` high
    - Detect write-only session (no GET in >5 requests) → emit `anomaly` medium
    - Track `uniqueEndpointCount`, `getRequestCount`, `postRequestCount` in SessionContext
    - _Requirements: 2.4, 2.5_

  - [x]* 3.4 Write unit tests for session navigation detection
    - Test NavigationScore values for valid, same-group, API-to-API, and invalid transitions
    - Test path scanning threshold trigger and write-only session detection
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [x] 4. Device Fingerprinting
  - [x] 4.1 Implement device fingerprint derivation and storage
    - Build fingerprint from `Accept`, `Accept-Language`, `Accept-Encoding`, `User-Agent`, `Sec-CH-UA` headers
    - Normalize headers (lowercase, trim, sort) before hashing
    - Persist `DeviceFingerprintRecord` under `asi:fp:{fingerprint}` with 90-day sliding TTL
    - _Requirements: 3.1, 3.2, 3.6_

  - [x] 4.2 Implement fingerprint trust bonus and anomaly signaling
    - Create `computeFingerprintTrustBonus()` returning 10-point bonus when `cleanRequestCount >= 20`
    - Emit `anomaly` low signal when known TrustProfile IP presents a new fingerprint
    - Update fingerprint `cleanRequestCount` for every `allow` or `throttle` action
    - _Requirements: 3.3, 3.4, 3.5_

  - [x]* 4.3 Write unit tests for device fingerprinting
    - Test deterministic fingerprint generation for identical headers
    - Test FingerprintTrustBonus threshold at exactly 20 clean requests
    - Test new-fingerprint anomaly signal for known IP
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 5. Checkpoint — Core Infrastructure Complete
  - Ensure all tests pass. Verify that TrustProfile, SessionContext, DeviceFingerprint are all read and written correctly in an isolated Redis test. Ask the user if questions arise before continuing.

- [x] 6. Adaptive Rate Limiting
  - [x] 6.1 Implement trust-based adaptive threshold computation
    - Extend existing rate limiting to support per-IP multipliers stored alongside TrustProfile
    - Apply 2.0× multiplier for TrustScore ≥ 70 and 3.0× for TrustScore ≥ 90
    - Enforce hard cap of 3.0× regardless of TrustScore value
    - No multiplier applied for IPs without a TrustProfile
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 Implement adaptive threshold penalty on high-threat signal
    - When a high/critical severity signal is detected for an IP with elevated threshold, immediately reset multiplier to 1.0×
    - Store multiplier suspension timestamp under `asi:trust:{ip}` and block multiplier for 30 minutes
    - _Requirements: 4.6_

  - [x]* 6.3 Write unit tests for adaptive rate limiting
    - Test static tier limits for IPs without TrustProfile
    - Test 2.0× multiplier for TrustScore = 70, 3.0× for TrustScore = 90
    - Test multiplier cap at 3.0× even for TrustScore = 100
    - Test multiplier reset and 30-minute suspension after high-severity signal
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 7. Shannon Entropy Detection for Obfuscated Payloads
  - [x] 7.1 Implement Shannon entropy calculation
    - Create `calculateShannonEntropy()` function using formula `H = -Σ p(c) * log2(p(c))`
    - Compute character frequency distribution and entropy for any string input
    - Return entropy value in bits/character
    - _Requirements: 5.1_

  - [x] 7.2 Implement payload entropy analysis
    - Create `analyzeEntropy()` extracting string segments >32 chars from request body
    - Flag segments with entropy >5.2 bits/char and length >64 chars as high-entropy
    - Attempt base64 decoding on high-entropy segments and re-scan for attack patterns
    - Emit appropriate signal (XSS, SQLi, CMDi, etc.) with elevated severity for encoded attacks
    - _Requirements: 5.2, 5.3_

  - [x] 7.3 Implement URL and overall payload entropy checks
    - Check URL query parameters and path segments for entropy >4.8 bits/char and length >48 chars
    - Emit `anomaly` low for high-entropy URL parameters
    - Check overall body entropy and emit `anomaly` medium when average entropy >6.0 bits/char
    - Only perform entropy analysis for POST, PUT, PATCH requests
    - _Requirements: 5.4, 5.5, 5.6_

  - [x]* 7.4 Write unit tests for entropy detection
    - Test `calculateShannonEntropy()` against known values (e.g., uniform string = log2(alphabet), natural text ≈ 4.0–4.5)
    - Test that base64-encoded XSS payload triggers elevated severity signal
    - Test that GET requests are excluded from entropy analysis
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [x] 8. Protocol and Header Anomaly Detection
  - [x] 8.1 Implement API route Content-Type validation
    - Validate `Content-Type` header on POST/PUT/PATCH to `/api/chat`, `/api/generate`, `/api/research`, `/api/vector`
    - Emit `anomaly` low when `application/json` or `multipart/form-data` is missing
    - _Requirements: 6.1_

  - [x] 8.2 Implement Content-Length mismatch and header stuffing detection
    - Detect `Content-Length: 0` with non-empty body → emit `anomaly` medium
    - Detect `>30 distinct headers` → emit `anomaly` low
    - Detect `Transfer-Encoding` + `Content-Length` combination → emit `anomaly` high (HTTP desync)
    - _Requirements: 6.2, 6.4, 6.5_

  - [x] 8.3 Implement minimal header set and Host header checks
    - Detect `Accept: */*` only with no `Accept-Language` or `Accept-Encoding` → add 5 points to ThreatScore
    - Detect Host header mismatch against expected application hostname → emit `anomaly` medium
    - Preserve existing CRLF injection and X-Forwarded-For chain length checks
    - _Requirements: 6.3, 6.6, 6.7_

  - [x]* 8.4 Write unit tests for protocol and header anomaly detection
    - Test Content-Type validation for each monitored API route
    - Test Content-Length mismatch detection
    - Test Transfer-Encoding + Content-Length conflict
    - Test Host header mismatch with localhost exclusion
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 9. Timing Attack and Slowloris Detection
  - [x] 9.1 Implement request duration history tracking
    - Store per-IP request duration history (last 10 values) in Redis under `asi:dur:{ip}`
    - Expire duration history after 10 minutes
    - Accept `requestDurationMs` from `InspectRequest` input (already declared in existing interface)
    - _Requirements: 7.1, 7.4, 7.6_

  - [x] 9.2 Implement Slowloris detection and timing anomaly signals
    - Emit `slowloris` medium when `requestDurationMs > 8000ms` on non-streaming endpoints
    - Escalate to `slowloris` high with +20 ThreatScore when all last 5 requests exceed 5000ms
    - Emit `anomaly` low when `requestDurationMs < 50ms` for POST to `/api/auth/login` or `/api/auth/register`
    - _Requirements: 7.2, 7.3, 7.5_

  - [x]* 9.3 Write unit tests for timing attack detection
    - Test Slowloris signal emission at 8001ms threshold
    - Test escalation to high severity when 5 consecutive slow requests detected
    - Test suspiciously fast auth request detection below 50ms
    - _Requirements: 7.2, 7.3, 7.5_

- [x] 10. Checkpoint — Detection Engines Phase 1 Complete
  - Ensure all tests pass. Verify entropy, header anomaly, and timing checks emit expected signals for representative inputs. Ask the user if questions arise before continuing.

- [x] 11. Advanced Bot Detection
  - [x] 11.1 Implement BotScore accumulator
    - Create `computeBotScore()` accumulating evidence from multiple non-UA signals
    - Add 20 points for modern browser UA string missing all three `Sec-Fetch-*` headers
    - Add points for missing language headers, write-only session pattern
    - Return composite BotScore from 0–100
    - _Requirements: 8.1, 8.2_

  - [x] 11.2 Implement machine-regular timing detection
    - Compute standard deviation of `interRequestIntervals` in SessionContext
    - When ≥10 consecutive requests have timing stddev <100ms, add 30 points to BotScore
    - Include timing-regularity detail in BotScore computation output
    - _Requirements: 8.3_

  - [x] 11.3 Implement bot signal emission and action enforcement
    - Emit `bot_detected` medium with confidence `BotScore/100` when BotScore ≥ 50
    - Emit `bot_detected` high and enforce `throttle` action when BotScore ≥ 80
    - Exception: IPs with TrustScore ≥ 90 are exempt from forced throttle at BotScore ≥ 80
    - Do NOT flag based on User-Agent alone when other behavioral signals total <30
    - _Requirements: 8.4, 8.5, 8.6_

  - [x]* 11.4 Write unit tests for bot detection
    - Test BotScore of 20 for modern-UA request missing Sec-Fetch headers
    - Test BotScore escalation with machine-regular timing (stddev < 100ms)
    - Test bot throttle exemption for TrustScore ≥ 90
    - Test that UA-only match with behavioral score <30 does not flag
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

- [x] 12. Business Logic Attack Detection
  - [x] 12.1 Implement credential stuffing detection
    - Store SHA-256 payload hashes (body truncated to 16 hex chars) per IP under `asi:phash:{ip}` as a Redis set
    - Expire payload hash sets after 5 minutes
    - Emit `credential_stuffing` high with confidence 0.95 when >5 distinct payload hashes hit `/api/auth/login` in 5 minutes
    - _Requirements: 9.1, 9.6, 9.7_

  - [x] 12.2 Implement prompt injection detection
    - Define `PROMPT_INJECTION_PATTERNS` constant with phrases: "ignore previous instructions", "you are now", "disregard your", "system:", "SYSTEM OVERRIDE"
    - Scan request body strings for these patterns on `/api/chat` and `/api/generate` routes
    - Emit `anomaly` high with detail "Prompt injection attempt detected"
    - _Requirements: 9.2_

  - [x] 12.3 Implement AI resource abuse and rapid registration detection
    - Emit `anomaly` medium for >20 requests to `/api/generate` or `/api/research` within 10 minutes
    - Emit `anomaly` medium for >3 requests to `/api/auth/register` within 30 minutes
    - Track request counts using existing `sec:ipreq:` counters with appropriate TTLs
    - _Requirements: 9.3, 9.4_

  - [x] 12.4 Implement bulk link validation / SSRF amplification detection
    - Parse request body for `/api/validate/links` and count URL entries
    - Emit `anomaly` medium with detail "Bulk link validation — possible SSRF amplification attempt" when count >50
    - _Requirements: 9.5_

  - [x]* 12.5 Write unit tests for business logic attack detection
    - Test credential stuffing trigger at exactly 6 distinct payload hashes
    - Test prompt injection pattern matching (case-sensitive and insensitive variants)
    - Test SSRF amplification detection at 51 URLs in payload
    - _Requirements: 9.1, 9.2, 9.5_

- [x] 13. Attack Chain Correlation
  - [x] 13.1 Implement AttackChain CRUD operations
    - Create `loadAttackChain()` reading from `asi:chain:{ip}` with 30-minute fixed TTL
    - Create `updateAttackChain()` appending new signal entries
    - Cap chain entries at 50 using FIFO eviction
    - Prune entries older than 30 minutes on each load
    - _Requirements: 10.1, 10.5_

  - [x] 13.2 Implement reconnaissance → weaponization chain detection
    - Define recon signal types: `scanner`, `suspicious_request`, `http_flood`
    - Define weapon signal types: `sql_injection`, `command_injection`, `xss_attempt`, `ssrf_attempt`
    - Detect recon phase followed by weapon phase within 10-minute window
    - Emit `anomaly` critical "Multi-phase attack chain: recon → exploit" composite signal
    - _Requirements: 10.2_

  - [x] 13.3 Implement signal diversity and persistence bonuses
    - Add 25-point ThreatScore bonus when ≥3 distinct attack signal types appear in 10-minute window
    - Add 15-point persistence bonus for all requests when any `critical` signal occurred in last 5 minutes
    - Skip chain correlation entirely for IPs with TrustScore ≥ 80
    - _Requirements: 10.3, 10.4, 10.6_

  - [x]* 13.4 Write unit tests for attack chain correlation
    - Test recon → exploit detection when both phases occur within 10 minutes
    - Test that no composite signal emitted when phases are >10 minutes apart
    - Test 25-point bonus for 3+ distinct signal types
    - Test chain correlation skip for TrustScore ≥ 80
    - _Requirements: 10.2, 10.3, 10.6_

- [x] 14. Checkpoint — Detection Engines Phase 2 Complete
  - Ensure all tests pass. Run the full test suite for business logic and attack chain detection. Ask the user if questions arise before continuing.

- [x] 15. Reputation Scoring and FusedScore Computation
  - [x] 15.1 Implement full TrustScore computation pipeline
    - Combine BaseTrust (from TrustProfile) + FingerprintBonus (from DeviceFingerprint) + SessionBonus (from NavigationScore)
    - Apply PenaltyAccumulated from AttackChain signals and recent attack history
    - Clamp final TrustScore to `[0, 100]` using integer arithmetic
    - _Requirements: 11.1, 11.8_

  - [x] 15.2 Implement FusedScore computation and MitigationAction selector
    - Compute `FusedScore = (ThreatScore * 0.6) - (TrustScore * 0.4) + NormalityPenalty`
    - Compute `NormalityPenalty = max(0, 50 - NormalityScore) * 0.3`
    - Map FusedScore to action: `allow` <20, `throttle` 20–39, `tarpit` 40–59, `block` ≥60
    - Preserve raw ThreatScore in `InspectResult.threatScore` for backward compatibility
    - _Requirements: 11.4, 11.5, 11.6, 11.7_

  - [x] 15.3 Implement TrustScore-based ThreatScore adjustment
    - When TrustProfile exists and raw ThreatScore <30, reduce effective ThreatScore by up to 20 points proportional to TrustScore
    - Apply 2.0× / 3.0× adaptive rate limit multipliers based on TrustScore tiers
    - _Requirements: 1.2, 1.5, 4.2, 4.3_

  - [x]* 15.4 Write unit tests for FusedScore computation
    - Test FusedScore boundary values: below 20 → allow, at 20 → throttle, at 60 → block
    - Test NormalityPenalty computation at NormalityScore = 0, 50, 100
    - Test TrustScore reduces effective ThreatScore by correct proportional amount
    - _Requirements: 11.4, 11.5_

- [x] 16. Forensic Data Collection
  - [x] 16.1 Implement ForensicPacket capture and storage
    - Create `captureForensicPacket()` function collecting all scores, signals, snapshots
    - Mask `Authorization`, `Cookie`, `X-Api-Key` headers per masking rules
    - Generate unique ID using `fp_{timestamp}_{randomHex}`
    - Store under `asi:forensic:{ip}:{timestamp}` with 7-day TTL
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 16.2 Implement forensic packet eviction and body hash
    - Apply LIFO eviction capping total ForensicPackets at 200 entries (same pattern as event log)
    - Compute `bodyHash` as SHA-256 of request body
    - Include first 500 chars as `bodyPreview` for text bodies
    - _Requirements: 12.4_

  - [x] 16.3 Export `getForensicRecords()` from `lib/security/index.ts`
    - Accept optional `ip` filter and `limit` parameters
    - Retrieve ForensicPackets from Redis using pattern-matched key scan
    - Return empty array (not throw) when Redis is unavailable
    - _Requirements: 12.5, 12.6_

  - [x]* 16.4 Write unit tests for forensic packet collection
    - Test header sanitization for Authorization, Cookie, X-Api-Key
    - Test that ForensicPackets are only created for block/tarpit actions
    - Test LIFO eviction at exactly 201 packets
    - _Requirements: 12.1, 12.3, 12.4_

- [x] 17. Geolocation and Access Pattern Analysis
  - [x] 17.1 Implement country code extraction and tracking
    - Extract country code from `CF-IPCountry` header (Cloudflare) or fallback to `X-Vercel-IP-Country`
    - Store last 10 country codes per `userId` in `asi:geo:{userId}` with 2-hour TTL
    - Skip geographic analysis entirely when no country headers present
    - _Requirements: 13.1, 13.4, 13.5_

  - [x] 17.2 Implement geographic anomaly detection
    - Emit `anomaly` medium when authenticated user accesses from new country within 2-hour window
    - Emit `anomaly` high "Impossible travel" when ≥3 distinct countries appear for same `userId` in 1 hour
    - Skip analysis for IPs with TrustScore ≥ 90 (legitimate VPN usage)
    - _Requirements: 13.2, 13.3, 13.6_

  - [x]* 17.3 Write unit tests for geolocation anomaly detection
    - Test 2-hour window new-country detection
    - Test impossible travel at exactly 3 countries in 1 hour
    - Test geographic analysis skip when no headers present
    - Test TrustScore ≥ 90 exemption
    - _Requirements: 13.2, 13.3, 13.5, 13.6_

- [x] 18. Advanced Payload Pattern Analysis (Extended)
  - [x] 18.1 Add NoSQL and LDAP injection pattern sets
    - Define `NOSQL_PATTERNS` covering MongoDB injection: `$ne`, `$gt`, `$where`, `'; return true; var foo = '`
    - Define `LDAP_PATTERNS` covering sequences: `)(uid=*)(|(uid=`, `*)(objectClass=*`, null-byte LDAP escape sequences
    - Emit `sql_injection` with detail "NoSQL injection pattern" for NoSQL matches
    - Emit `anomaly` high with detail "LDAP injection pattern detected" for LDAP matches
    - _Requirements: 14.1, 14.2_

  - [x] 18.2 Add SSTI and deserialization pattern sets
    - Define `SSTI_PATTERNS` covering template engines: `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`, `#{7*7}`, `*{7*7}`
    - Define `DESERIALIZATION_PATTERNS`: `rO0AB` (Java base64), `O:` (PHP), `\xac\xed\x00\x05` (Java magic bytes)
    - Emit `anomaly` high with detail "SSTI pattern detected" for SSTI matches
    - Emit `anomaly` critical with detail "Deserialization payload detected" for deserialization matches
    - _Requirements: 14.3, 14.4_

  - [x] 18.3 Add open redirect detection
    - Define `OPEN_REDIRECT_PARAMS` array: `['redirect', 'url', 'next', 'callback', 'return']`
    - Scan URL query parameters for these names containing `//evil.com`, `\evil.com`, `https://evil.com` patterns
    - Emit `open_redirect` medium signal when matched
    - _Requirements: 14.5_

  - [x] 18.4 Integrate all new patterns into `detectPayloadSignals()`
    - Extend existing pattern scanning to include NoSQL, LDAP, SSTI, Deserialization, and Open Redirect checks
    - Maintain single code path for payload analysis (no separate functions)
    - _Requirements: 14.6_

  - [x]* 18.5 Write unit tests for extended payload patterns
    - Test NoSQL pattern detection with `$ne` and `$where` operators
    - Test SSTI pattern detection with multiple template syntaxes
    - Test deserialization pattern detection for Java and PHP serialization
    - Test open redirect detection in query parameters
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 19. Checkpoint — All Detection Engines Complete
  - Ensure all tests pass. Verify that all new detection engines (geolocation, extended payload patterns) emit expected signals. Ask the user if questions arise before continuing.

- [x] 20. Anti-Evasion Mechanisms
  - [x] 20.1 Implement `recentHighThreat` flag management
    - Set `recentHighThreat = true` in TrustProfile when single request generates ThreatScore >60
    - Store flag in `asi:trust:{ip}` with 60-minute expiry via separate tracking field
    - Zero out TrustScore bonus during FusedScore computation when flag is active
    - _Requirements: 15.1, 15.2_

  - [x] 20.2 Implement evasion pattern detection
    - Maintain sliding 20-request window per IP tracking clean vs. attack requests
    - Detect alternating pattern of clean (<10) and attack (>50) ThreatScore requests
    - Emit `anomaly` high with detail "Evasion pattern: alternating clean/attack requests"
    - _Requirements: 15.3_

  - [x] 20.3 Implement permanent TrustScore cap for repeat offenders
    - Count consecutive `recentHighThreat` flag sets (stored in `highThreatCount` field)
    - When count ≥5 within 6 hours, reduce `maxTrustScore` to 40 permanently until manual intervention
    - Allow TrustScore recovery after 60 minutes if no new high-threat requests occur
    - _Requirements: 15.4, 15.5, 15.6_

  - [x]* 20.4 Write unit tests for anti-evasion mechanisms
    - Test `recentHighThreat` flag set at ThreatScore = 61
    - Test TrustScore bonus zeroed when flag is active
    - Test alternating pattern detection with 20-request window
    - Test maxTrustScore reduction to 40 after 5 consecutive flags
    - _Requirements: 15.1, 15.3, 15.4_

- [x] 21. Monitoring Dashboard Integration
  - [x] 21.1 Extend `InspectResult` interface with new fields
    - Add `trustScore`, `botScore`, `fusedScore`, `entropyScore`, `fingerprintId`, `attackChainLength` to interface
    - Ensure all fields are populated by the main `inspect()` function before returning result
    - _Requirements: 16.1_

  - [x] 21.2 Extend `SecurityEvent` interface for persistence
    - Add all new `InspectResult` fields to `SecurityEvent` interface
    - Update event log writer to persist all fields to Redis
    - _Requirements: 16.2, 16.4_

  - [x] 21.3 Extend `getSecurityStats()` with new aggregate metrics
    - Add `avgTrustScore`, `botDetections`, `chainAttacks`, `promptInjections`, `geoAnomalies` to return type
    - Compute aggregates by scanning event log for new signal types
    - Maintain backward compatibility — keep all existing stats fields
    - _Requirements: 16.3, 16.5_

  - [x] 21.4 Add new subsystem status entries to `defenceStatus`
    - Add entries: `behavioralAnalysis`, `adaptiveRateLimiter`, `entropyAnalyzer`, `botDetector`, `attackChainCorrelator`, `businessLogicGuard`, `forensicCollector`
    - Each entry should report "active" status and subsystem-specific metadata
    - _Requirements: 16.6_

- [x] 22. Integrate All Subsystems into Main `inspect()` Function
  - [x] 22.1 Rewrite Phase 1: parallel Redis context loading
    - Replace sequential Redis reads with single `Promise.all()` batch loading all contexts
    - Load: TrustProfile, SessionContext, DeviceFingerprint, AttackChain, DurationHistory, GeoData
    - Ensure graceful null-fallback for each context when Redis fails
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 22.2 Wire Phase 2: orchestrate all detection engines
    - Call all detection engines in sequence after context load
    - Collect signals from: payload patterns, entropy analysis, protocol anomaly, timing, bot detection, navigation, business logic, geo anomaly
    - Pass all contexts (TrustProfile, SessionContext, AttackChain) into each engine
    - _Requirements: 17.1_

  - [x] 22.3 Wire Phase 3: unified score computation
    - Compute BotScore → TrustScore → NormalityScore → FusedScore in order
    - Apply adaptive threshold multiplier to rate limiter decision
    - Determine final MitigationAction from FusedScore
    - _Requirements: 11.4, 11.5, 11.6_

  - [x] 22.4 Wire Phase 4: decision, forensics, and fire-and-forget writes
    - Trigger `captureForensicPacket()` for block/tarpit actions
    - Update AttackChain with new signals
    - Launch all context update writes as fire-and-forget (TrustProfile, SessionContext, Fingerprint, Duration, Geo)
    - Enforce 8-write budget: prioritize event log, auto-block, forensic packet, attack chain
    - _Requirements: 17.4, 17.5_

  - [x]* 22.5 Write integration tests for the full `inspect()` pipeline
    - Test that a trusted IP with clean history results in `action: allow` despite triggering a low-severity signal
    - Test that an unknown IP with credential stuffing attack results in `action: block`
    - Test graceful timeout fallback returns `action: allow, threatScore: 0, normalityScore: 100`
    - _Requirements: 17.1, 17.3, 17.6_

- [x] 23. Performance Optimization and Final Resilience
  - [x] 23.1 Implement Redis write budget enforcement
    - Audit all write operations and classify as critical (event log, auto-block, forensic, chain) vs. deferred (TrustProfile, SessionContext, Fingerprint, Duration, Geo)
    - Ensure critical writes are awaited; deferred writes use fire-and-forget with `void (async () => {...})()`
    - Verify write count stays at or below 8 per request
    - _Requirements: 17.4, 17.5_

  - [x] 23.2 Implement graceful timeout fallback
    - Wrap entire `inspect()` logic in `Promise.race()` with 4-second timeout
    - Return `{ action: "allow", threatScore: 0, normalityScore: 100, signals: [] }` on timeout
    - Preserve existing fallback shape for backward compatibility with caller code
    - _Requirements: 17.6_

  - [x] 23.3 Add storage budget validation
    - Profile average per-request Redis storage increase across new data structures
    - Verify TrustProfile (~400B), SessionContext (~300B), DeviceFingerprint (~120B), AttackChain (~200B) stay within 512B average additional overhead per request
    - Compress large JSON values if necessary (e.g., TrustProfile endpointFrequencies pruning)
    - _Requirements: 17.7_

  - [x]* 23.4 Write unit tests for performance and resilience
    - Test that Redis failures in any subsystem do not throw or block the response
    - Test that inspection completes within 4 seconds under simulated Redis latency
    - Test that write count per request does not exceed 8
    - _Requirements: 17.1, 17.3, 17.4_

- [x] 24. Final Checkpoint — All Systems Integrated
  - Ensure all tests pass. Verify the complete ASI engine works end-to-end with real Redis operations. Run TypeScript compiler check to confirm no type errors in `lib/security/core.ts` and `lib/security/index.ts`. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements clauses for full traceability back to requirements.md
- All code MUST remain in `lib/security/core.ts` and `lib/security/index.ts` — no new files
- Checkpoints (tasks 5, 10, 14, 19, 24) validate incremental progress before proceeding
- Fire-and-forget writes use `void (async () => { try { ... } catch {} })()` pattern
- All Redis keys in the `asi:` namespace are isolated from existing `sec:` keys
- Backward compatibility: existing `inspect()` signature, `threatScore` field, and all `getSecurityStats()` fields must remain unchanged
- The design document in design.md contains detailed algorithms, interface definitions, and architecture diagrams — refer to it during implementation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "4.2", "6.1"] },
    { "id": 3, "tasks": ["2.5", "3.4", "4.3", "6.2", "7.1", "9.1"] },
    { "id": 4, "tasks": ["6.3", "7.2", "8.1", "8.2", "8.3", "9.2", "11.1", "12.1", "13.1", "17.1"] },
    { "id": 5, "tasks": ["7.3", "7.4", "8.4", "9.3", "11.2", "12.2", "12.3", "12.4", "13.2", "17.2", "18.1", "18.2", "18.3"] },
    { "id": 6, "tasks": ["11.3", "11.4", "12.5", "13.3", "13.4", "15.1", "17.3", "18.4"] },
    { "id": 7, "tasks": ["15.2", "15.3", "16.1", "18.5"] },
    { "id": 8, "tasks": ["15.4", "16.2", "16.3", "20.1", "21.1"] },
    { "id": 9, "tasks": ["16.4", "20.2", "21.2", "21.3"] },
    { "id": 10, "tasks": ["20.3", "21.4", "22.1"] },
    { "id": 11, "tasks": ["20.4", "22.2"] },
    { "id": 12, "tasks": ["22.3"] },
    { "id": 13, "tasks": ["22.4", "23.1", "23.2", "23.3"] },
    { "id": 14, "tasks": ["22.5", "23.4"] }
  ]
}
```
