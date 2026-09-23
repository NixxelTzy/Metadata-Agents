/**
 * lib/ai-agent.ts
 * Autonomous AI Support & Security Agent for NixelStudio.
 * Automatically processes user messages, generates context-aware replies,
 * dispatches emails via Gmail SMTP, and handles autonomous unblock appeals.
 */

import { callGroq } from "@/lib/groq";
import { sendAiEmailReply } from "@/lib/mailer";
import { appendActivityEvent } from "@/lib/db";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

export interface ProcessSupportInput {
  userId: string;
  username: string;
  email: string;
  category: "bug" | "feature" | "other" | "appeal";
  userMessage: string;
}

export interface ProcessSupportResult {
  aiReplyText: string;
  emailSent: boolean;
  inAppDelivered: boolean;
  unblocked?: boolean;
}

/**
 * Autonomous AI Engine: Processes user feedback or unblock appeal,
 * generates a smart response, sends an email, delivers an in-app message,
 * and handles automatic unblocking if applicable.
 */
export async function processAutonomousAiSupport(input: ProcessSupportInput): Promise<ProcessSupportResult> {
  const { userId, username, email, category, userMessage } = input;

  let systemPrompt = "";
  if (category === "appeal") {
    systemPrompt = `You are NixelStudio's Autonomous AI Security & Compliance Officer.
The user "${username}" (${email}) was blocked and is submitting an unblock appeal.
Analyze their statement: "${userMessage}".
Write a professional, understanding, and encouraging decision response in Indonesian.
If their appeal is reasonable and polite, grant their unblock request with guidelines for proper usage.
Keep your response structured, helpful, and concise (120–160 words).`;
  } else {
    systemPrompt = `You are NixelStudio's Senior Autonomous Support Engineer.
The user "${username}" (${email}) submitted a "${category}" report: "${userMessage}".
Write a warm, intelligent, and highly relevant technical support response in Indonesian.
Address their concern directly, outline troubleshooting or status updates, and close warmly.
Keep it structured and concise (100–140 words).`;
  }

  // 1. Generate Intelligent AI Response
  const aiRes = await callGroq([
    { role: "system", content: systemPrompt },
    { role: "user", content: `User: ${username} (${email})\nCategory: ${category}\nMessage: ${userMessage}` },
  ], {
    temperature: 0.5,
    max_tokens: 600,
    vision: false,
  });

  const aiReplyText = aiRes.text.trim();
  let unblocked = false;

  // 2. If it's an unblock appeal, autonomously clear block messages from all user keys
  if (category === "appeal") {
    const keysToClean = [
      `adminmsg:user:${userId}`,
      `adminmsg:user:${email.toLowerCase()}`,
      `adminmsg:user:${username.toLowerCase()}`,
    ];

    for (const key of keysToClean) {
      const items = await redis.lrange(key, 0, -1).catch(() => []);
      const cleaned = items.filter((item) => {
        try {
          const parsed = typeof item === "string" ? JSON.parse(item) : item;
          return parsed.type !== "block";
        } catch {
          return true;
        }
      });
      await redis.del(key);
      if (cleaned.length > 0) {
        for (const item of cleaned.reverse()) {
          await redis.lpush(key, typeof item === "string" ? item : JSON.stringify(item));
        }
      }
    }

    // Clean broadcast key as well
    const broadcastItems = await redis.lrange("adminmsg:broadcast", 0, -1).catch(() => []);
    const cleanedBroadcast = broadcastItems.filter((item) => {
      try {
        const parsed = typeof item === "string" ? JSON.parse(item) : item;
        return parsed.type !== "block";
      } catch {
        return true;
      }
    });
    await redis.del("adminmsg:broadcast");
    if (cleanedBroadcast.length > 0) {
      for (const item of cleanedBroadcast.reverse()) {
        await redis.rpush("adminmsg:broadcast", typeof item === "string" ? item : JSON.stringify(item));
      }
    }

    unblocked = true;
  }

  // 3. Deliver In-App Response to User's Inbox
  const inAppMsg = {
    id: `ai-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "message",
    title: category === "appeal" ? "🟢 [AI Security] Banding Disetujui & Akun Di-unblock" : "🤖 [AI Support] Balasan Otomatis Laporan Anda",
    body: aiReplyText,
    targetUserId: userId,
    targetEmail: email,
    targetUsername: username,
    sentAt: new Date().toISOString(),
    sentByEmail: "autonomous-ai@nixelstudio.com",
    read: false,
  };

  await redis.lpush(`adminmsg:user:${userId}`, JSON.stringify(inAppMsg));
  await redis.ltrim(`adminmsg:user:${userId}`, 0, 49);
  await redis.expire(`adminmsg:user:${userId}`, 86400 * 7);

  // 4. Send Email via Gmail SMTP
  const emailSent = await sendAiEmailReply({
    toEmail: email,
    toUsername: username,
    subject: category === "appeal"
      ? `🟢 [NixelStudio AI] Banding Disetujui — Akun Anda Telah Di-unblock`
      : `💬 [NixelStudio AI Support] Balasan Otomatis Laporan Anda`,
    aiMessage: aiReplyText,
    replyType: category === "appeal" ? "general" : "support_reply",
  });

  // 5. Append Global Activity Log
  void appendActivityEvent(
    userId,
    email,
    username,
    "ai_autonomous_support",
    `🤖 AI Otonom memproses ${category}: "${userMessage.slice(0, 40)}..." · Email: ${emailSent ? "Terkirim" : "Gagal"} · Unblocked: ${unblocked}`
  );

  return {
    aiReplyText,
    emailSent,
    inAppDelivered: true,
    unblocked,
  };
}
