import { NextRequest, NextResponse } from "next/server";
import { processInboundEmailWithAi } from "@/lib/email-ai-worker";

// Webhook secret shared with your email relay (Zapier, Make, or custom IMAP poller)
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET ?? "nixelstudio-email-webhook-2026";

/**
 * POST /api/webhooks/inbound-email
 * 
 * Receives parsed inbound email payloads from an external email relay
 * (Zapier / Make / custom IMAP worker / Mailgun Inbound / Gmail Push).
 * Runs the full Autonomous AI Email Worker pipeline automatically.
 * 
 * Expected body:
 * {
 *   secret: string,       // must match WEBHOOK_SECRET
 *   fromEmail: string,
 *   fromName: string,
 *   subject: string,
 *   body: string,
 *   timestamp?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      secret?: string;
      fromEmail?: string;
      fromName?: string;
      subject?: string;
      body?: string;
      timestamp?: string;
    };

    // 1. Verify webhook secret
    if (body.secret !== WEBHOOK_SECRET) {
      console.warn("[InboundEmailWebhook] Unauthorized webhook attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate required fields
    if (!body.fromEmail || !body.subject || !body.body) {
      return NextResponse.json({ error: "Missing required fields: fromEmail, subject, body" }, { status: 400 });
    }

    // 3. Run Autonomous AI Engine (non-blocking — respond fast, process async)
    const processingPromise = processInboundEmailWithAi({
      fromEmail: body.fromEmail.toLowerCase().trim(),
      fromName: body.fromName ?? body.fromEmail.split("@")[0],
      subject: body.subject.trim(),
      body: body.body.trim(),
      timestamp: body.timestamp ?? new Date().toISOString(),
    });

    // Fire and forget for instant webhook response
    processingPromise.then((result) => {
      console.log(`[InboundEmailWebhook] ✅ AI Processed: ${result.fromEmail} | Intent: ${result.intent} | Action: ${result.actionTaken}`);
    }).catch((err) => {
      console.error("[InboundEmailWebhook] ❌ Processing error:", err);
    });

    // Return 200 immediately so email relay doesn't retry
    return NextResponse.json({
      ok: true,
      message: "Email received. Autonomous AI Agent is processing your request.",
      queued: true,
    });

  } catch (err) {
    console.error("[InboundEmailWebhook] Parse error:", err);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}

/** GET: Health check for webhook endpoint */
export async function GET() {
  return NextResponse.json({
    status: "active",
    agent: "NixelStudio Autonomous Email AI Worker",
    version: "2.0.0",
    capabilities: [
      "intent_classification",
      "auto_unblock",
      "token_boost",
      "ai_email_reply",
      "in_app_notification",
      "activity_logging",
    ],
    timestamp: new Date().toISOString(),
  });
}
