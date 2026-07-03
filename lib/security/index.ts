/**
 * lib/security/index.ts — re-exports dari unified security core (Redis-backed)
 * Updated: Advanced Security Intelligence (ASI) exports added
 */
export {
  inspect,
  getClientIp,
  recordIpError,
  manualBlockIp,
  sanitizeString,
  sanitizeEmail,
  validatePassword,
  getSecurityEvents,
  getSecurityStats,
  // ASI new exports (Req 12.5)
  getForensicRecords,
} from "./core";

export type {
  AttackType,
  Severity,
  MitigationAction,
  AttackSignal,
  SecurityEvent,
  InspectRequest,
  InspectResult,
  // ASI new types
  TrustProfile,
  SessionContext,
  DeviceFingerprintRecord,
  AttackChain,
  AttackChainEntry,
  ForensicPacket,
} from "./core";
