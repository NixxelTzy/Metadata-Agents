/**
 * lib/security/defence/ai-controller.ts
 *
 * AI Firewall Controller — Groq AI mengendalikan seluruh sistem firewall:
 * - Menganalisis serangan yang masuk secara real-time
 * - Memutuskan tindakan: block, tarpit, challenge, adjust rules, unblock
 * - Mengatur threshold rate limiting secara otomatis
 * - Mengelola sistem verifikasi (kapan harus ketat, kapan longgar)
 * - Mengirim ringkasan keputusan ke alert log
 *
 * Key: GROQ_API_KEY_FIREWALL (di .env.local / Vercel env vars)
 */

import { getFirewallAiKey } from "@/lib/config";
import { getFirewallAlerts, type FirewallAlert, type FirewallDecision } from "./firewall";
import { getSecurityStats, manualBlockIp, type AttackSignal } from "@/lib/security/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiDecision {
  action: "block" | "unblock" | "tighten" | "relax" | "monitor" | "challenge_all" | "reset_rules";
  targets?: string[];          // IP addresses affected
  reason: string;
  confidence: number;          // 0–1
  ruleAdjustments?: RuleAdjustment[];
  verificationMode?: "strict" | "normal" | "off";
  durationSec?: number;
}

export interface RuleAdjustment {
  rule: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
}

export interface AiAnalysisResult {
  timestamp: number;
  threatSummary: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  decisions: AiDecision[];
  recommendations: string[];
  verificationMode: "strict" | "normal" | "off";
  autoActionsExecuted: string[];
}

// ─── Groq client (lightweight, no SDK needed) ─────────────────────────────────

async function groqChat(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
  const key = getFirewallAiKey();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.1,       // low temp for consistent security decisions
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "{}";
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous AI Firewall Controller for a web application.
Your job is to analyze security data in real-time and make decisions to protect the system.

You have authority to:
1. Block or unblock IP addresses
2. Tighten or relax firewall rules
3. Set verification mode (strict/normal/off)
4. Recommend rule adjustments
5. Identify attack patterns and campaigns

Always respond with valid JSON matching this structure:
{
  "threatSummary": "brief summary of current threat landscape",
  "riskLevel": "none|low|medium|high|critical",
  "decisions": [
    {
      "action": "block|unblock|tighten|relax|monitor|challenge_all|reset_rules",
      "targets": ["1.2.3.4"],
      "reason": "reason for decision",
      "confidence": 0.95,
      "verificationMode": "strict|normal|off",
      "durationSec": 3600
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "verificationMode": "strict|normal|off"
}

Rules:
- Only block IPs with high confidence (>0.85) to avoid false positives
- If attack volume is high, set verificationMode to "strict"
- If all traffic looks clean, set verificationMode to "normal"  
- Never unblock IPs that are actively attacking
- Be conservative — prefer "monitor" over immediate "block" when unsure
- Respond ONLY with JSON, no other text`;

// ─── Main AI Analysis Function ────────────────────────────────────────────────

/**
 * runAiFirewallAnalysis — Core function.
 * Sends current security state to Groq AI and executes decisions automatically.
 */
export async function runAiFirewallAnalysis(): Promise<AiAnalysisResult> {
  const now = Date.now();
  const autoActions: string[] = [];

  // Gather all security data
  const [stats, alerts] = await Promise.all([
    getSecurityStats(),
    getFirewallAlerts(50),
  ]);

  // Build context for AI
  const recentAlerts = alerts.slice(0, 20).map(a => ({
    ip: a.ip,
    category: a.category,
    threatLevel: a.threatLevel,
    decision: a.decision,
    detail: a.detail,
    time: new Date(a.timestamp).toISOString(),
  }));

  const topAttackIps = stats.topIps.slice(0, 10);
  const attackTypes = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  const userPrompt = `Current Security State (as of ${new Date(now).toISOString()}):

STATS:
- Total requests (24h): ${stats.last24h}
- Last hour: ${stats.lastHour}
- Last 10min: ${stats.last10min}
- Blocked: ${stats.blocked}
- Bot detections: ${stats.botDetections ?? 0}
- Chain attacks: ${stats.chainAttacks ?? 0}
- Prompt injections: ${stats.promptInjections ?? 0}
- Avg trust score: ${stats.avgTrustScore ?? 50}
- Normal requests: ${stats.normalRequests}
- Abnormal requests: ${stats.abnormalRequests}

TOP ATTACKING IPs:
${topAttackIps.map(ip => `- ${ip.ip}: ${ip.count} hits`).join("\n") || "None"}

ATTACK TYPES:
${attackTypes.map(a => `- ${a.type}: ${a.count}x`).join("\n") || "None"}

RECENT FIREWALL ALERTS (last 20):
${recentAlerts.map(a => `[${a.time}] ${a.ip} | ${a.category} | ${a.threatLevel} | ${a.detail}`).join("\n") || "None"}

Based on this data, analyze the threat landscape and provide your decisions.`;

  let aiResponse: AiAnalysisResult;

  try {
    const rawResponse = await groqChat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    const parsed = JSON.parse(rawResponse) as {
      threatSummary?: string;
      riskLevel?: string;
      decisions?: AiDecision[];
      recommendations?: string[];
      verificationMode?: "strict" | "normal" | "off";
    };

    // Execute AI decisions automatically
    for (const decision of (parsed.decisions ?? [])) {
      const executed = await executeDecision(decision);
      if (executed) autoActions.push(`${decision.action}: ${decision.reason}`);
    }

    aiResponse = {
      timestamp: now,
      threatSummary: parsed.threatSummary ?? "Analysis complete",
      riskLevel: (parsed.riskLevel ?? "none") as AiAnalysisResult["riskLevel"],
      decisions: parsed.decisions ?? [],
      recommendations: parsed.recommendations ?? [],
      verificationMode: parsed.verificationMode ?? "normal",
      autoActionsExecuted: autoActions,
    };

  } catch (err) {
    console.error("[AI-Controller] Analysis failed:", err);
    // Fallback: safe defaults
    aiResponse = {
      timestamp: now,
      threatSummary: "AI analysis unavailable — safe mode active",
      riskLevel: "low",
      decisions: [],
      recommendations: ["Monitor manually until AI analysis recovers"],
      verificationMode: "normal",
      autoActionsExecuted: [],
    };
  }

  // Persist result to Redis for dashboard
  await persistAiResult(aiResponse);
  console.log(`[AI-Controller] Analysis done. Risk: ${aiResponse.riskLevel} | Actions: ${autoActions.length} | Mode: ${aiResponse.verificationMode}`);

  return aiResponse;
}

// ─── Execute a single AI decision ────────────────────────────────────────────

async function executeDecision(decision: AiDecision): Promise<boolean> {
  try {
    switch (decision.action) {
      case "block": {
        if (!decision.targets?.length) return false;
        if (decision.confidence < 0.85) {
          console.log(`[AI-Controller] Skipping block (confidence too low: ${decision.confidence})`);
          return false;
        }
        for (const ip of decision.targets) {
          await manualBlockIp(ip, `AI-Controller: ${decision.reason}`, decision.durationSec ?? 3600);
          console.log(`[AI-Controller] Blocked IP: ${ip} — ${decision.reason}`);
        }
        return true;
      }

      case "tighten": {
        await setVerificationMode("strict");
        console.log(`[AI-Controller] Tightened verification — ${decision.reason}`);
        return true;
      }

      case "relax": {
        await setVerificationMode("normal");
        console.log(`[AI-Controller] Relaxed verification — ${decision.reason}`);
        return true;
      }

      case "challenge_all": {
        await setVerificationMode("strict");
        await setChallengeMode("all");
        console.log(`[AI-Controller] Challenge-all mode activated — ${decision.reason}`);
        return true;
      }

      case "monitor": {
        // Log but don't auto-block
        console.log(`[AI-Controller] Monitoring mode — ${decision.reason} (targets: ${decision.targets?.join(", ") ?? "all"})`);
        return true;
      }

      default:
        return false;
    }
  } catch (err) {
    console.error(`[AI-Controller] Failed to execute ${decision.action}:`, err);
    return false;
  }
}

// ─── Runtime state helpers (stored in Redis) ─────────────────────────────────

import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

let _r: Redis | null = null;
function R(): Redis {
  if (_r) return _r;
  const { url, token } = getRedisConfig();
  _r = new Redis({ url, token });
  return _r;
}

const AI_KEYS = {
  verificationMode: "fw:ai:vmode",
  challengeMode:    "fw:ai:cmode",
  lastResult:       "fw:ai:last",
  schedule:         "fw:ai:schedule",
};

export async function setVerificationMode(mode: "strict" | "normal" | "off"): Promise<void> {
  try { await R().set(AI_KEYS.verificationMode, mode, { ex: 86400 }); } catch { /* silent */ }
}

export async function getVerificationMode(): Promise<"strict" | "normal" | "off"> {
  try {
    const v = await R().get<string>(AI_KEYS.verificationMode);
    return (v as "strict" | "normal" | "off") ?? "normal";
  } catch { return "normal"; }
}

export async function setChallengeMode(mode: "all" | "new" | "off"): Promise<void> {
  try { await R().set(AI_KEYS.challengeMode, mode, { ex: 3600 }); } catch { /* silent */ }
}

export async function getChallengeMode(): Promise<"all" | "new" | "off"> {
  try {
    const v = await R().get<string>(AI_KEYS.challengeMode);
    return (v as "all" | "new" | "off") ?? "new";
  } catch { return "new"; }
}

async function persistAiResult(result: AiAnalysisResult): Promise<void> {
  try { await R().set(AI_KEYS.lastResult, result, { ex: 3600 }); } catch { /* silent */ }
}

export async function getLastAiResult(): Promise<AiAnalysisResult | null> {
  try {
    const v = await R().get<AiAnalysisResult>(AI_KEYS.lastResult);
    return v ?? null;
  } catch { return null; }
}
