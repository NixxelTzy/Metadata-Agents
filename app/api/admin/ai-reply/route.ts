import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { callGroq } from "@/lib/groq";
import { sendAiEmailReply } from "@/lib/mailer";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      toEmail: string;
      toUsername: string;
      targetUserId?: string;
      actionType: "draft_message" | "block_reason" | "reply_user";
      userMessage?: string;
      customPrompt?: string;
    };

    const { toEmail, toUsername, actionType, userMessage, customPrompt, targetUserId } = body;
    if (!toEmail || !actionType) {
      return NextResponse.json({ error: "Parameters toEmail and actionType are required" }, { status: 400 });
    }

    let systemPrompt = "";
    let userPromptText = "";

    if (actionType === "block_reason") {
      systemPrompt = `You are NixelStudio's AI Security & Compliance Officer.
Write a clear, professional, respectful, and coherent explanation in Indonesian for an account block or restriction.
Explain the compliance rules clearly, outline next steps for account restoration, and maintain an encouraging and professional tone. Do not use generic corporate jargon. Keep it concise (120-180 words).`;
      userPromptText = `User: ${toUsername} (${toEmail})\nContext: Account block or safety restriction.\nInstructions/Details: ${customPrompt || "System security compliance audit"}`;
    } else if (actionType === "reply_user") {
      systemPrompt = `You are NixelStudio's Lead AI Support Representative.
Write a friendly, intelligent, and highly relevant response in Indonesian addressing the user's feedback, question, or bug report.
Acknowledge their concern directly, provide actionable solutions or updates, and close warmly. Keep it concise (100-150 words).`;
      userPromptText = `User: ${toUsername} (${toEmail})\nUser's Message: ${userMessage || "N/A"}\nAdditional Instructions: ${customPrompt || "Provide helpful technical support"}`;
    } else {
      systemPrompt = `You are NixelStudio's Official Assistant.
Draft a clear, engaging, and professional message in Indonesian for the user. Keep it natural, structured, and helpful.`;
      userPromptText = `Recipient: ${toUsername} (${toEmail})\nTopic: ${customPrompt || "General Platform Announcement"}`;
    }

    const aiRes = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptText },
    ], {
      temperature: 0.5,
      max_tokens: 1024,
      vision: false,
    });

    const generatedText = aiRes.text.trim();

    // 1. Send Email to User
    const emailSubject = actionType === "block_reason"
      ? `🚫 [NixelStudio] Pemberitahuan Status Akun (${toUsername})`
      : actionType === "reply_user"
      ? `💬 [NixelStudio] Balasan Laporan / Pertanyaan Anda`
      : `📢 [NixelStudio] Pesan dari Tim Support`;

    const emailSent = await sendAiEmailReply({
      toEmail,
      toUsername,
      subject: emailSubject,
      aiMessage: generatedText,
      replyType: actionType === "block_reason" ? "block_notice" : "support_reply",
    });

    // 2. Also send as In-App Message if targetUserId is present
    if (targetUserId && targetUserId !== "all") {
      const inAppMsg = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: actionType === "block_reason" ? "block" : "message",
        title: actionType === "block_reason" ? "🚫 Pemblokiran Akun" : "🤖 Balasan AI Support",
        body: generatedText,
        reason: actionType === "block_reason" ? (customPrompt || "Peraturan Keamanan & Sistem Compliance") : undefined,
        targetUserId,
        targetEmail: toEmail,
        targetUsername: toUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: "ai-assistant@nixelstudio.com",
        read: false,
      };

      const key = `adminmsg:user:${targetUserId}`;
      await redis.lpush(key, JSON.stringify(inAppMsg));
      await redis.ltrim(key, 0, 49);
      await redis.expire(key, 86400 * 7);

      await redis.lpush("adminmsg:sentlog", JSON.stringify(inAppMsg));
      await redis.ltrim("adminmsg:sentlog", 0, 499);
    }

    return NextResponse.json({
      ok: true,
      generatedText,
      emailSent,
      modelUsed: aiRes.modelUsed,
    });
  } catch (err) {
    console.error("AI Reply route error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memproses AI Auto-Reply" }, { status: 500 });
  }
}
