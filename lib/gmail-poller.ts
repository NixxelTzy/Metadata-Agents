/**
 * lib/gmail-poller.ts
 * Background Autonomous Email Worker.
 * Automatically checks and processes pending inbound email requests from users,
 * classifies user intent via Groq AI, executes unblock/token boost in Redis,
 * and sends email responses via Gmail SMTP.
 * 
 * Runs automatically on server requests with built-in throttle (no manual UI needed).
 */

import { processInboundEmailWithAi, type InboundEmailPayload } from "@/lib/email-ai-worker";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

let lastPolled = 0;
const THROTTLE_MS = 15000; // Poll at most once every 15 seconds

/**
 * Autonomous Background Engine Runner.
 * Triggered automatically by server endpoints (e.g. heartbeat or inbox API).
 * Checks the Redis queue `emailai:queue` for incoming emails sent by users,
 * processes them via Groq AI, executes database unblock actions, and dispatches email replies.
 */
export async function triggerAutonomousEmailPoller(): Promise<void> {
  const now = Date.now();
  if (now - lastPolled < THROTTLE_MS) return;
  lastPolled = now;

  try {
    // Pop any queued inbound email from Redis queue
    const queuedRaw = await redis.rpop("emailai:queue");
    if (!queuedRaw) return;

    const payload: InboundEmailPayload = typeof queuedRaw === "string" ? JSON.parse(queuedRaw) : queuedRaw;

    console.log(`[AutonomousEmailWorker] Processing email automatically from ${payload.fromEmail}...`);
    const result = await processInboundEmailWithAi(payload);
    console.log(`[AutonomousEmailWorker] ✅ Auto-Processed: ${result.fromEmail} | Intent: ${result.intent} | Action: ${result.actionTaken}`);
  } catch (err) {
    console.error("[AutonomousEmailWorker] Poller error:", err);
  }
}
