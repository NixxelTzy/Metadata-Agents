/**
 * /api/firewall/verify — Challenge verification endpoint
 *
 * Client submits challenge token from the FirewallGate component.
 * On success, IP receives a 12h bypass token stored in Redis.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/security/core";
import {
  verifyChallengeToken,
  generateChallengeToken,
  hasValidBypass,
  evaluate,
  type FirewallContext,
} from "@/lib/security/defence/firewall";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json() as {
      token?: string;
      phase?: string;
      browserFingerprint?: string;
      timings?: number[];
      screenW?: number;
      screenH?: number;
      colorDepth?: number;
      timezone?: string;
      plugins?: number;
      touchPoints?: number;
    };

    const { token, phase, browserFingerprint, timings, screenW, screenH, colorDepth, timezone, plugins, touchPoints } = body;

    // Phase 1: Request a new challenge token
    if (phase === "init" || !token) {
      // Check if already bypassed
      const bypass = await hasValidBypass(ip);
      if (bypass) {
        return NextResponse.json({ status: "bypass", message: "Already verified" });
      }

      const newToken = await generateChallengeToken(ip);

      // Run silent background ASI inspection on this verification request
      const fwCtx: FirewallContext = {
        ip,
        endpoint: "/api/firewall/verify",
        method: "POST",
        userAgent: headersObj["user-agent"] ?? "",
        headers: headersObj,
        body,
      };
      const fwResult = await evaluate(fwCtx);

      if (fwResult.decision === "block") {
        return NextResponse.json(
          { status: "blocked", reason: fwResult.reason },
          { status: 403 }
        );
      }

      return NextResponse.json({ status: "challenge", token: newToken });
    }

    // Phase 2: Verify submitted token
    if (!token) {
      return NextResponse.json({ status: "error", reason: "No token provided" }, { status: 400 });
    }

    // Analyze browser signals for bot detection
    const isBotLike = analyzeBrowserSignals({ timings, screenW, screenH, colorDepth, timezone, plugins, touchPoints });

    if (isBotLike) {
      return NextResponse.json(
        { status: "failed", reason: "Automated client detected — verification failed" },
        { status: 403 }
      );
    }

    const result = await verifyChallengeToken(token, ip, browserFingerprint);

    if (!result.valid) {
      return NextResponse.json({ status: "failed", reason: result.reason }, { status: 403 });
    }

    // Set HTTP-only cookie for bypass (12h)
    const response = NextResponse.json({ status: "passed", message: "Verification successful" });
    response.cookies.set("fw_bypass", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 43200, // 12h
      path: "/",
    });

    return response;

  } catch (err) {
    console.error("[Firewall Verify] Error:", err);
    return NextResponse.json({ status: "error", reason: "Verification failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  const bypass = await hasValidBypass(ip);

  // Also return AI-controlled state
  let verificationMode: "strict" | "normal" | "off" = "normal";
  let riskLevel = "none";
  let forceReVerify = false;

  try {
    const { getVerificationMode, getLastAiResult } = await import("@/lib/security/defence/ai-controller");
    verificationMode = await getVerificationMode();
    const aiResult = await getLastAiResult();
    if (aiResult) {
      riskLevel = aiResult.riskLevel;
      // In strict mode, non-bypassed clients must re-verify
      forceReVerify = verificationMode === "strict" && !bypass;
    }
  } catch { /* silent — AI controller optional */ }

  return NextResponse.json({ verified: bypass, verificationMode, riskLevel, forceReVerify });
}

// ── Browser signal analysis (anti-bot) ──────────────────────────────────────

interface BrowserSignals {
  timings?: number[];
  screenW?: number;
  screenH?: number;
  colorDepth?: number;
  timezone?: string;
  plugins?: number;
  touchPoints?: number;
}

function analyzeBrowserSignals(signals: BrowserSignals): boolean {
  const botIndicators: string[] = [];

  // Machine-regular timing (std dev < 10ms over 5+ measurements)
  if (signals.timings && signals.timings.length >= 5) {
    const mean = signals.timings.reduce((a, b) => a + b, 0) / signals.timings.length;
    const variance = signals.timings.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / signals.timings.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 5) botIndicators.push("machine-regular timing");
  }

  // Impossible screen dimensions
  if (signals.screenW !== undefined && signals.screenH !== undefined) {
    if (signals.screenW === 0 && signals.screenH === 0) botIndicators.push("zero screen dimensions");
    if (signals.screenW > 8192 || signals.screenH > 8192) botIndicators.push("impossible screen size");
  }

  // Headless browser indicators
  if (signals.colorDepth !== undefined && signals.colorDepth < 8) botIndicators.push("very low color depth");

  // Score: bot if 2+ strong indicators
  return botIndicators.length >= 2;
}
