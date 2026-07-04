/**
 * /api/firewall/ai-tick — AI analysis endpoint
 *
 * Trigger options (Vercel Hobby plan — no sub-daily cron):
 * 1. Vercel Cron: once per day at 02:00 UTC (vercel.json: "0 2 * * *")
 * 2. Lazy trigger: auto-fired by emitAlert() when attack threshold reached
 * 3. Manual: POST /api/firewall/operator { action: "run-ai" }
 */

import { NextRequest, NextResponse } from "next/server";
import { runAiFirewallAnalysis } from "@/lib/security/defence/ai-controller";
import { getFirewallOperatorKey } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function max duration

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret   = process.env.CRON_SECRET ?? "";
  const operatorKey  = getFirewallOperatorKey();
  const authHeader   = request.headers.get("authorization") ?? "";
  const fwKeyHeader  = request.headers.get("x-firewall-key") ?? "";

  const isCron       = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isOperator   = operatorKey && fwKeyHeader === operatorKey;

  if (!isCron && !isOperator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAiFirewallAnalysis();
    return NextResponse.json({
      ok: true,
      riskLevel: result.riskLevel,
      verificationMode: result.verificationMode,
      actionsExecuted: result.autoActionsExecuted,
      recommendationsCount: result.recommendations.length,
      timestamp: result.timestamp,
    });
  } catch (err) {
    console.error("[AI-Tick] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// Allow POST too (for manual triggers)
export { GET as POST };
