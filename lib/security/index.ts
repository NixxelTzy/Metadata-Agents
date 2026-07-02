/**
 * lib/security/index.ts — re-exports dari unified security core (Redis-backed)
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
} from "./core";

export type {
  AttackType,
  Severity,
  MitigationAction,
  AttackSignal,
  SecurityEvent,
  InspectRequest,
  InspectResult,
} from "./core";
