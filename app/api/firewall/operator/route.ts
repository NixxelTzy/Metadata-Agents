/**
 * /api/firewall/operator — Admin endpoint untuk kontrol firewall
 *
 * Dilindungi dengan FIREWALL_OPERATOR_KEY (header: X-Firewall-Key)
 * AI + manusia bisa menggunakan endpoint ini untuk mengelola firewall.
 *
 * Operasi yang tersedia:
 * - GET  /api/firewall/operator?action=status    — status keseluruhan
 * - GET  /api/firewall/operator?action=alerts    — semua alert
 * - GET  /api/firewall/operator?action=ai-result — hasil analisis AI terakhir
 * - POST /api/firewall/operator { action: "block", ip, reason, duration }
 * - POST /api/firewall/operator { action: "unblock", ip }
 * - POST /api/firewall/operator { action: "set-mode", mode: "strict"|"normal"|"off" }
 * - POST /api/firewall/operator { action: "run-ai" }  — paksa AI analysis sekarang
 * - POST /api/firewall/operator { action: "challenge-all" }
 * - POST /api/firewall/operator { action: "reset-rules" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getFirewallOperatorKey } from "@/lib/config";
import { getFirewallAlerts } from "@/lib/security/defence/firewall";
import {
  runAiFirewallAnalysis,
  getLastAiResult,
  setVerificationMode,
  getVerificationMode,
  setChallengeMode,
  getChallengeMode,
} from "@/lib/security/defence/ai-controller";
import { manualBlockIp, getSecurityStats, getClientIp } from "@/lib/security/core";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

export const runtime = "nodejs";

// ─── Auth middleware ──────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const operatorKey = getFirewallOperatorKey();
  if (!operatorKey) return false; // No key configured = deny all

  const provided = request.headers.get("x-firewall-key")
    ?? request.headers.get("authorization")?.replace("Bearer ", "")
    ?? "";

  return provided === operatorKey;
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

let _r: Redis | null = null;
function getR(): Redis {
  if (_r) return _r;
  const { url, token } = getRedisConfig();
  _r = new Redis({ url, token });
  return _r;
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", code: "INVALID_KEY" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "status";
  const limit  = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    switch (action) {
      case "status": {
        const [stats, vmode, cmode, lastAi] = await Promise.all([
          getSecurityStats(),
          getVerificationMode(),
          getChallengeMode(),
          getLastAiResult(),
        ]);
        return NextResponse.json({
          timestamp: Date.now(),
          verificationMode: vmode,
          challengeMode: cmode,
          stats,
          lastAiAnalysis: lastAi ? {
            riskLevel: lastAi.riskLevel,
            threatSummary: lastAi.threatSummary,
            verificationMode: lastAi.verificationMode,
            decisionsCount: lastAi.decisions.length,
            actionsExecuted: lastAi.autoActionsExecuted,
            timestamp: lastAi.timestamp,
          } : null,
        });
      }

      case "alerts": {
        const alerts = await getFirewallAlerts(limit);
        return NextResponse.json({ alerts, count: alerts.length, timestamp: Date.now() });
      }

      case "ai-result": {
        const result = await getLastAiResult();
        return NextResponse.json(result ?? { error: "No AI analysis available yet" });
      }

      default:
        return NextResponse.json({ error: "Unknown action", validActions: ["status", "alerts", "ai-result"] }, { status: 400 });
    }
  } catch (err) {
    console.error("[Operator GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", code: "INVALID_KEY" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;

  try {
    switch (action) {

      case "block": {
        const ip = body.ip as string;
        const reason = (body.reason as string) ?? "Manual block by operator";
        const duration = (body.duration as number) ?? 86400;
        if (!ip || !/^[\d.a-fA-F:]+$/.test(ip)) {
          return NextResponse.json({ error: "Invalid IP address" }, { status: 400 });
        }
        await manualBlockIp(ip, reason, duration);
        return NextResponse.json({ success: true, message: `IP ${ip} blocked for ${duration}s`, ip, reason });
      }

      case "unblock": {
        const ip = body.ip as string;
        if (!ip) return NextResponse.json({ error: "IP required" }, { status: 400 });
        try {
          await getR().del(`sec:ipblk:${ip}`);
          await getR().del(`fw:block:${ip}`);
          await getR().del(`fw:bypass:${ip}`);
        } catch { /* silent */ }
        return NextResponse.json({ success: true, message: `IP ${ip} unblocked`, ip });
      }

      case "set-mode": {
        const mode = body.mode as "strict" | "normal" | "off";
        if (!["strict", "normal", "off"].includes(mode)) {
          return NextResponse.json({ error: "Invalid mode. Use: strict, normal, off" }, { status: 400 });
        }
        await setVerificationMode(mode);
        return NextResponse.json({ success: true, message: `Verification mode set to: ${mode}`, mode });
      }

      case "challenge-all": {
        await setVerificationMode("strict");
        await setChallengeMode("all");
        return NextResponse.json({ success: true, message: "Challenge-all mode activated. All visitors will be re-verified." });
      }

      case "reset-rules": {
        // Reset AI-controlled settings to defaults
        await Promise.all([
          setVerificationMode("normal"),
          setChallengeMode("new"),
        ]);
        return NextResponse.json({ success: true, message: "Firewall rules reset to defaults" });
      }

      case "run-ai": {
        // Trigger immediate AI analysis
        const result = await runAiFirewallAnalysis();
        return NextResponse.json({
          success: true,
          riskLevel: result.riskLevel,
          threatSummary: result.threatSummary,
          verificationMode: result.verificationMode,
          decisionsCount: result.decisions.length,
          actionsExecuted: result.autoActionsExecuted,
          recommendations: result.recommendations,
        });
      }

      case "bulk-block": {
        const ips = body.ips as string[];
        const reason = (body.reason as string) ?? "Bulk block by operator";
        const duration = (body.duration as number) ?? 86400;
        if (!Array.isArray(ips) || ips.length === 0) {
          return NextResponse.json({ error: "ips array required" }, { status: 400 });
        }
        const blocked: string[] = [];
        for (const ip of ips.slice(0, 100)) {
          if (/^[\d.a-fA-F:]+$/.test(ip)) {
            await manualBlockIp(ip, reason, duration);
            blocked.push(ip);
          }
        }
        return NextResponse.json({ success: true, blocked, count: blocked.length });
      }

      default:
        return NextResponse.json({
          error: "Unknown action",
          validActions: ["block", "unblock", "set-mode", "challenge-all", "reset-rules", "run-ai", "bulk-block"],
        }, { status: 400 });
    }
  } catch (err) {
    console.error("[Operator POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
