import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllUsers } from "@/lib/db";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { appendActivityEvent } from "@/lib/db";
import { sendAiEmailReply } from "@/lib/mailer";
import { callGroq } from "@/lib/groq";

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
      targetUserId: string;
      targetEmail: string;
      targetUsername: string;
      action: "unblock" | "block" | "boost_tokens" | "send_warning";
      reason?: string;
    };

    const { targetUserId, targetEmail, targetUsername, action, reason } = body;
    if (!targetUserId || !action) {
      return NextResponse.json({ error: "targetUserId and action required" }, { status: 400 });
    }

    let actionResult = "";
    let aiNotificationText = "";

    if (action === "unblock") {
      // ── Clear all block messages from user's Redis inbox ──
      const key = `adminmsg:user:${targetUserId}`;
      const items = await redis.lrange(key, 0, -1);
      const cleaned = items.filter((item) => {
        try {
          const p = typeof item === "string" ? JSON.parse(item) : item;
          return p.type !== "block";
        } catch { return true; }
      });
      await redis.del(key);
      for (const item of cleaned.reverse()) {
        await redis.lpush(key, typeof item === "string" ? item : JSON.stringify(item));
      }

      // ── Generate AI notification message ──
      const aiRes = await callGroq([
        { role: "system", content: "You are NixelStudio Admin AI. Write a warm, short unblock confirmation in Indonesian (60-80 words). Tell the user their account has been fully restored by admin." },
        { role: "user", content: `User: ${targetUsername} (${targetEmail}). Reason for unblock: ${reason || "Manual admin review completed."}` },
      ], { temperature: 0.4, max_tokens: 200 });

      aiNotificationText = aiRes.text.trim();

      // ── Send in-app unblock confirmation ──
      const inAppMsg = {
        id: `unblock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "🟢 Akun Anda Telah Di-unblock oleh Admin",
        body: aiNotificationText,
        targetUserId,
        targetEmail,
        targetUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };
      await redis.lpush(`adminmsg:user:${targetUserId}`, JSON.stringify(inAppMsg));
      await redis.ltrim(`adminmsg:user:${targetUserId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetUserId}`, 86400 * 7);

      // ── Email notification ──
      await sendAiEmailReply({
        toEmail: targetEmail,
        toUsername: targetUsername,
        subject: "🟢 [NixelStudio] Akun Anda Telah Dipulihkan",
        aiMessage: aiNotificationText,
        replyType: "general",
      });

      actionResult = `✅ User ${targetUsername} berhasil di-unblock. Notifikasi In-App + Email terkirim.`;

    } else if (action === "block") {
      // ── Send block message ──
      const blockReason = reason || "Kepatuhan aturan sistem & keamanan platform";
      const aiRes = await callGroq([
        { role: "system", content: "You are NixelStudio Admin AI. Write a firm but respectful account restriction notice in Indonesian (80-100 words). Explain this is a security compliance measure." },
        { role: "user", content: `User: ${targetUsername} (${targetEmail}). Reason: ${blockReason}` },
      ], { temperature: 0.3, max_tokens: 300 });

      aiNotificationText = aiRes.text.trim();

      const blockMsg = {
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "block",
        title: "🚫 Akses Akun Dibatasi Sementara",
        body: aiNotificationText,
        reason: blockReason,
        targetUserId,
        targetEmail,
        targetUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };
      await redis.lpush(`adminmsg:user:${targetUserId}`, JSON.stringify(blockMsg));
      await redis.ltrim(`adminmsg:user:${targetUserId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetUserId}`, 86400 * 7);

      await sendAiEmailReply({
        toEmail: targetEmail,
        toUsername: targetUsername,
        subject: "🚫 [NixelStudio] Pemberitahuan Pembatasan Akses Akun",
        aiMessage: aiNotificationText,
        replyType: "block_notice",
      });

      actionResult = `✅ User ${targetUsername} berhasil diblokir. Notifikasi In-App + Email terkirim.`;

    } else if (action === "boost_tokens") {
      // ── Log token boost event ──
      const aiRes = await callGroq([
        { role: "system", content: "Write a short, enthusiastic Indonesian message (50-70 words) confirming admin has boosted the user's daily token/quota limit." },
        { role: "user", content: `User: ${targetUsername} (${targetEmail}). Boost granted by admin.` },
      ], { temperature: 0.5, max_tokens: 200 });
      aiNotificationText = aiRes.text.trim();

      const boostMsg = {
        id: `boost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "⚡ Kuota Token Anda Telah Di-Boost oleh Admin!",
        body: aiNotificationText,
        targetUserId,
        targetEmail,
        targetUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };
      await redis.lpush(`adminmsg:user:${targetUserId}`, JSON.stringify(boostMsg));
      await redis.ltrim(`adminmsg:user:${targetUserId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetUserId}`, 86400 * 7);

      await sendAiEmailReply({
        toEmail: targetEmail,
        toUsername: targetUsername,
        subject: "⚡ [NixelStudio] Kuota Token Anda Ditingkatkan!",
        aiMessage: aiNotificationText,
        replyType: "general",
      });

      actionResult = `✅ Token boost untuk ${targetUsername} berhasil diberikan.`;

    } else if (action === "send_warning") {
      const warningReason = reason || "Aktivitas yang mencurigakan terdeteksi oleh sistem";
      const aiRes = await callGroq([
        { role: "system", content: "Write a formal warning notice in Indonesian (80-100 words). Firm but helpful — give the user clear guidance on proper behavior." },
        { role: "user", content: `User: ${targetUsername} (${targetEmail}). Warning reason: ${warningReason}` },
      ], { temperature: 0.3, max_tokens: 300 });
      aiNotificationText = aiRes.text.trim();

      const warnMsg = {
        id: `warn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "⚠️ Peringatan Sistem — Harap Diperhatikan",
        body: aiNotificationText,
        targetUserId,
        targetEmail,
        targetUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };
      await redis.lpush(`adminmsg:user:${targetUserId}`, JSON.stringify(warnMsg));
      await redis.ltrim(`adminmsg:user:${targetUserId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetUserId}`, 86400 * 7);

      actionResult = `✅ Peringatan terkirim ke ${targetUsername}.`;
    }

    // ── Global audit log ──
    void appendActivityEvent(
      payload.userId, payload.email, payload.username,
      "admin_action",
      `Admin [${action.toUpperCase()}] → ${targetUsername} (${targetEmail}) · ${actionResult}`
    );

    return NextResponse.json({ ok: true, actionResult, aiNotificationText });
  } catch (err) {
    console.error("Admin user control error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
