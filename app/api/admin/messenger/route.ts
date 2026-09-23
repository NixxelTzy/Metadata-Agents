import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers, getAllUserActivities, getAllOnlineUsers, generateRecipientId, appendActivityEvent } from "@/lib/db";
import { sendAiEmailReply } from "@/lib/mailer";
import { callGroq } from "@/lib/groq";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface AdminMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  targetUserId: string | "all";
  targetEmail: string | "all";
  targetUsername: string | "all";
  sentAt: string;
  sentByEmail: string;
  read: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  tags: string[];
  usageCount: number;
}

const BUILTIN_TEMPLATES: MessageTemplate[] = [
  {
    id: "builtin-1",
    name: "🎉 Bonus Token & Kuota Harian",
    type: "message",
    title: "🎉 Selamat! Kuota Token Tambahan dari Admin",
    body: "Yth. Pengguna NixelStudio, Admin telah menambahkan kuota token harian ekstra ke akun Anda. Selamat berkarya!",
    tags: ["bonus", "token", "reward"],
    usageCount: 12,
  },
  {
    id: "builtin-2",
    name: "⚠️ Pembaruan Sistem & Maintenance Web",
    type: "refresh",
    title: "⚠️ Pembaruan Sistem — Mohon Muat Ulang Web",
    body: "Sistem telah diperbarui ke versi terbaru dengan peningkatan performa & fitur baru. Silakan klik 'Perbarui Sekarang' untuk memuat ulang peramban Anda.",
    tags: ["system", "update", "refresh"],
    usageCount: 28,
  },
  {
    id: "builtin-3",
    name: "🚫 Pemblokiran Akun & Kepatuhan Keamanan",
    type: "block",
    title: "🚫 Pembatasan Akses Akun Sementara",
    body: "Kami mendeteksi aktivitas yang memerlukan audit keamanan pada akun Anda. Akun dibatasi sementara untuk menjamin integritas platform. Anda dapat mengajukan banding langsung di layar ini.",
    reason: "Audit Kepatuhan Aturan Keamanan & Batasan Sistem",
    tags: ["block", "security", "audit"],
    usageCount: 5,
  },
  {
    id: "builtin-4",
    name: "📢 Pengumuman Resmi NixelStudio Admin",
    type: "message",
    title: "📢 Pengumuman Penting dari Tim Pengembang",
    body: "Salam dari NixelStudio Studio! Kami telah meluncurkan peningkatan infrastruktur AI untuk memproses tugas gambar & video lebih cepat 2x lipat.",
    tags: ["announcement", "info"],
    usageCount: 19,
  },
  {
    id: "builtin-5",
    name: "⚡ Fitur Baru & Peningkatan Akses AI",
    type: "message",
    title: "⚡ Peningkatan Fitur AI Platform Terbaru",
    body: "Nikmati akses ke model AI terbaru kami dengan akurasi lebih tinggi dan waktu render lebih cepat. Coba sekarang!",
    tags: ["features", "ai", "new"],
    usageCount: 34,
  },
];

const TEMPLATES_KEY = "admin:message_templates";

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * MASTER CONSOLIDATED ADMIN MESSENGER & SECURITY ENGINE
 * Single Comprehensive Master Route for All Admin Communications, Security & Control.
 * ═════════════════════════════════════════════════════════════════════════════
 */

// ── GET: Sent Logs, Online Presence, Templates, Analytics ────────────────────
export async function GET(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Admin Access Required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "sentlog";

  try {
    // ── VIEW: TEMPLATES ──────────────────────────────────────────────────────
    if (view === "templates") {
      const customRaw = await redis.get<MessageTemplate[]>(TEMPLATES_KEY).catch(() => []);
      const combined = [...BUILTIN_TEMPLATES, ...(customRaw ?? [])];
      return NextResponse.json({ templates: combined });
    }

    // ── VIEW: PRESENCE ───────────────────────────────────────────────────────
    if (view === "presence") {
      const [users, activities, onlineUsers] = await Promise.all([
        getAllUsers(),
        getAllUserActivities(),
        getAllOnlineUsers(),
      ]);

      const activityMap: Record<string, { lastSeen: string; currentFeature: string }> = {};
      for (const a of activities) {
        activityMap[a.userId] = { lastSeen: a.lastSeen, currentFeature: a.currentFeature };
      }

      const formatted = users.map((u) => {
        const act = activityMap[u.id] || (u.email ? activityMap[u.email.toLowerCase()] : undefined);
        const onlineData = (onlineUsers[u.id] || (u.email ? onlineUsers[u.email.toLowerCase()] : undefined) || (u.username ? onlineUsers[u.username.toLowerCase()] : undefined)) as { lastPing?: string; isOnline?: boolean; path?: string; lastSeen?: string; feature?: string } | undefined;

        let secondsAgo: number | null = null;
        const pingTime = onlineData?.lastPing || onlineData?.lastSeen || act?.lastSeen;
        if (pingTime) {
          secondsAgo = Math.max(0, Math.floor((Date.now() - new Date(pingTime).getTime()) / 1000));
        }

        // isOnline: key still exists in Redis (TTL 20s) AND last ping within 20s
        // If onlineData exists, the Redis key hasn't expired yet → user is online
        const isOnline = !!onlineData && (secondsAgo === null || secondsAgo <= 20);

        return {
          id: u.id,
          email: u.email,
          username: u.username,
          recipientId: u.recipientId ?? generateRecipientId(u.id || u.email),
          role: u.role ?? "user",
          createdAt: u.createdAt,
          passwordRaw: u.passwordRaw || null,
          passwordHash: u.passwordHash || "",
          isOnline,
          lastSeen: pingTime || u.createdAt,
          secondsAgo,
          activePath: onlineData?.path || onlineData?.feature || act?.currentFeature || null,
        };
      });

      return NextResponse.json({ users: formatted });
    }

    // ── VIEW: ANALYTICS & STATS ──────────────────────────────────────────────
    if (view === "stats") {
      const [rawSentLog, rawBroadcast, users] = await Promise.all([
        redis.lrange("adminmsg:sentlog", 0, 499).catch(() => []),
        redis.lrange("adminmsg:broadcast", 0, 199).catch(() => []),
        getAllUsers(),
      ]);

      const sentLog = rawSentLog.map((r) => typeof r === "string" ? JSON.parse(r) : r) as AdminMessage[];
      const broadcast = rawBroadcast.map((r) => typeof r === "string" ? JSON.parse(r) : r) as AdminMessage[];

      const totalSent = sentLog.length;
      const totalBroadcast = broadcast.length;
      const blockCount = sentLog.filter((m) => m.type === "block").length;
      const refreshCount = sentLog.filter((m) => m.type === "refresh").length;

      return NextResponse.json({
        stats: {
          totalSent,
          totalBroadcast,
          blockCount,
          refreshCount,
          userCount: users.length,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // Default: Return Sent Logs
    const raw = await redis.lrange("adminmsg:sentlog", 0, 199);
    const messages = raw.map((r) =>
      typeof r === "string" ? JSON.parse(r) : r
    ) as AdminMessage[];

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Master Admin Messenger GET error:", err);
    return NextResponse.json({ error: "Gagal mengambil data" }, { status: 500 });
  }
}

// ── POST: Actions (Send, Unblock, Block, Boost, Warning, Delete, Template Save) ──
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Admin Access Required" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action?: "send" | "unblock" | "block" | "boost_tokens" | "send_warning" | "delete_message" | "template_save" | "template_delete";
      messageId?: string;
      templateId?: string;
      template?: Partial<MessageTemplate>;
      type?: "message" | "refresh" | "block";
      title?: string;
      body?: string;
      reason?: string;
      targetUserId?: string | "all";
      targetEmail?: string | "all";
      targetUsername?: string | "all";
    };

    const action = body.action || "send";

    // ── TEMPLATE SAVE ────────────────────────────────────────────────────────
    if (action === "template_save") {
      if (!body.template?.name || !body.template?.title || !body.template?.body) {
        return NextResponse.json({ error: "Nama, judul, dan isi template wajib diisi" }, { status: 400 });
      }
      const existing = (await redis.get<MessageTemplate[]>(TEMPLATES_KEY)) ?? [];
      const newTpl: MessageTemplate = {
        id: `tpl-${Date.now()}`,
        name: body.template.name,
        type: body.template.type ?? "message",
        title: body.template.title,
        body: body.template.body,
        reason: body.template.reason,
        tags: body.template.tags ?? ["custom"],
        usageCount: 0,
      };
      await redis.set(TEMPLATES_KEY, [...existing, newTpl]);
      return NextResponse.json({ ok: true, template: newTpl });
    }

    // ── TEMPLATE DELETE ──────────────────────────────────────────────────────
    if (action === "template_delete") {
      if (!body.templateId) return NextResponse.json({ error: "templateId wajib diisi" }, { status: 400 });
      const existing = (await redis.get<MessageTemplate[]>(TEMPLATES_KEY)) ?? [];
      await redis.set(TEMPLATES_KEY, existing.filter((t) => t.id !== body.templateId));
      return NextResponse.json({ ok: true });
    }

    // ── UNBLOCK USER ─────────────────────────────────────────────────────────
    if (action === "unblock") {
      const rawTargetId = body.targetUserId?.trim() || payload.userId;
      const allUsers = await getAllUsers();
      const targetUser = allUsers.find((u) =>
        u.id === rawTargetId ||
        u.email.toLowerCase() === rawTargetId.toLowerCase() ||
        u.username.toLowerCase() === rawTargetId.toLowerCase() ||
        (u.recipientId && u.recipientId.toUpperCase() === rawTargetId.toUpperCase())
      );

      const targetId = targetUser?.id || rawTargetId;
      const targetEmail = targetUser?.email.toLowerCase() || rawTargetId.toLowerCase();
      const targetUsername = targetUser?.username.toLowerCase() || targetEmail;

      const userKeys = [
        `adminmsg:user:${targetId}`,
        `adminmsg:user:${targetEmail}`,
        `adminmsg:user:${targetUsername}`,
      ];
      if (targetUser?.recipientId) {
        userKeys.push(`adminmsg:user:${targetUser.recipientId.toUpperCase()}`);
      }

      let removedCount = 0;

      for (const key of userKeys) {
        const raw = await redis.lrange(key, 0, 99).catch(() => []);
        const nonBlockMessages: string[] = [];

        for (const r of raw) {
          try {
            const msg = typeof r === "string" ? JSON.parse(r) : r;
            if (msg?.type !== "block") {
              nonBlockMessages.push(typeof r === "string" ? r : JSON.stringify(r));
            } else {
              removedCount++;
            }
          } catch { /* skip */ }
        }

        await redis.del(key);
        if (nonBlockMessages.length > 0) {
          for (const m of nonBlockMessages.reverse()) {
            await redis.rpush(key, m);
          }
          await redis.expire(key, 86400 * 7);
        }
      }

      // Also clean broadcast
      const broadcastRaw = await redis.lrange("adminmsg:broadcast", 0, 199).catch(() => []);
      const filteredBroadcast: string[] = [];
      for (const r of broadcastRaw) {
        try {
          const msg = typeof r === "string" ? JSON.parse(r) : r;
          if (msg?.type !== "block") {
            filteredBroadcast.push(typeof r === "string" ? r : JSON.stringify(r));
          } else {
            removedCount++;
          }
        } catch { /* skip */ }
      }

      await redis.del("adminmsg:broadcast");
      if (filteredBroadcast.length > 0) {
        for (const m of filteredBroadcast.reverse()) {
          await redis.rpush("adminmsg:broadcast", m);
        }
        await redis.expire("adminmsg:broadcast", 86400 * 7);
      }

      // ── FIX: Send unblock confirmation message to user ──
      const unblockMsg = {
        id: `unblock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "✅ Akses Akun Anda Telah Dipulihkan",
        body: `Halo${targetUser?.username ? ` ${targetUser.username}` : ""}, akun Anda telah dibuka dari pembatasan oleh Admin NixelStudio. Anda kini dapat menggunakan seluruh fitur platform kembali. Terima kasih atas kesabaran Anda.`,
        targetUserId: targetId,
        targetEmail: targetEmail,
        targetUsername: targetUsername,
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };
      for (const key of userKeys) {
        await redis.lpush(key, JSON.stringify(unblockMsg));
        await redis.ltrim(key, 0, 49);
        await redis.expire(key, 86400 * 7);
      }

      // ── Set realtime unblock signal — client polls this key ──
      // When user fetches inbox and sees this key, they are immediately unblocked
      await redis.set(`adminmsg:unblocked:${targetId}`, Date.now(), { ex: 300 }); // 5min signal
      if (targetEmail) await redis.set(`adminmsg:unblocked:${targetEmail}`, Date.now(), { ex: 300 });

      return NextResponse.json({
        ok: true,
        message: `✅ Akun ${targetUser?.username ?? targetId} berhasil dibuka dari pemblokiran!`,
        removedCount,
      });
    }

    // ── BLOCK USER ───────────────────────────────────────────────────────────
    if (action === "block") {
      const targetId = body.targetUserId?.trim();
      if (!targetId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });

      const blockReason = body.reason || "Kepatuhan aturan sistem & keamanan platform";
      const aiRes = await callGroq([
        { role: "system", content: "You are NixelStudio Admin AI. Write a firm but respectful account restriction notice in Indonesian (80-100 words)." },
        { role: "user", content: `User ID: ${targetId}. Reason: ${blockReason}` },
      ], { temperature: 0.3, max_tokens: 300 });

      // Resolve all keys for this user (same logic as unblock)
      const allUsers = await getAllUsers();
      const targetUser = allUsers.find((u) =>
        u.id === targetId ||
        u.email.toLowerCase() === targetId.toLowerCase() ||
        u.username.toLowerCase() === targetId.toLowerCase() ||
        (u.recipientId && u.recipientId.toUpperCase() === targetId.toUpperCase())
      );

      const resolvedId = targetUser?.id || targetId;
      const resolvedEmail = targetUser?.email.toLowerCase() || (targetId.includes("@") ? targetId.toLowerCase() : "");
      const resolvedUsername = targetUser?.username.toLowerCase() || "";

      const blockMsg = {
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "block",
        title: "🚫 Akses Akun Dibatasi Sementara",
        body: aiRes.text.trim(),
        reason: blockReason,
        targetUserId: resolvedId,
        targetEmail: resolvedEmail || body.targetEmail || "user",
        targetUsername: resolvedUsername || body.targetUsername || "user",
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };

      // Push to ALL keys so user always sees block regardless of how they fetch
      const blockKeys = new Set<string>();
      blockKeys.add(`adminmsg:user:${resolvedId}`);
      if (resolvedEmail) blockKeys.add(`adminmsg:user:${resolvedEmail}`);
      if (resolvedUsername) blockKeys.add(`adminmsg:user:${resolvedUsername}`);
      if (targetUser?.recipientId) blockKeys.add(`adminmsg:user:${targetUser.recipientId.toUpperCase()}`);
      if (body.targetEmail && body.targetEmail !== "user") blockKeys.add(`adminmsg:user:${body.targetEmail.toLowerCase()}`);
      if (body.targetUsername && body.targetUsername !== "user") blockKeys.add(`adminmsg:user:${body.targetUsername.toLowerCase()}`);

      for (const key of Array.from(blockKeys)) {
        await redis.lpush(key, JSON.stringify(blockMsg));
        await redis.ltrim(key, 0, 49);
        await redis.expire(key, 86400 * 7);
      }

      return NextResponse.json({ ok: true, message: `✅ User ${targetUser?.username ?? targetId} berhasil diblokir.` });
    }

    // ── BOOST TOKENS ─────────────────────────────────────────────────────────
    if (action === "boost_tokens") {
      const targetId = body.targetUserId?.trim();
      if (!targetId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });

      const boostMsg = {
        id: `boost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "⚡ Kuota Token Anda Telah Di-Boost!",
        body: "Selamat! Kuota token harian Anda telah ditingkatkan oleh Admin NixelStudio.",
        targetUserId: targetId,
        targetEmail: body.targetEmail || "user",
        targetUsername: body.targetUsername || "user",
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };

      await redis.lpush(`adminmsg:user:${targetId}`, JSON.stringify(boostMsg));
      await redis.ltrim(`adminmsg:user:${targetId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetId}`, 86400 * 7);

      return NextResponse.json({ ok: true, message: `✅ Token boost untuk ${targetId} berhasil diberikan.` });
    }

    // ── SEND WARNING ─────────────────────────────────────────────────────────
    if (action === "send_warning") {
      const targetId = body.targetUserId?.trim();
      if (!targetId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });

      const warnMsg = {
        id: `warn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "message",
        title: "⚠️ Peringatan Sistem — Harap Diperhatikan",
        body: body.body || "Aktivitas mencurigakan terdeteksi pada akun Anda. Harap patuhi aturan layanan platform.",
        targetUserId: targetId,
        targetEmail: body.targetEmail || "user",
        targetUsername: body.targetUsername || "user",
        sentAt: new Date().toISOString(),
        sentByEmail: ADMIN_EMAIL,
        read: false,
      };

      await redis.lpush(`adminmsg:user:${targetId}`, JSON.stringify(warnMsg));
      await redis.ltrim(`adminmsg:user:${targetId}`, 0, 49);
      await redis.expire(`adminmsg:user:${targetId}`, 86400 * 7);

      return NextResponse.json({ ok: true, message: `✅ Peringatan terkirim ke ${targetId}.` });
    }

    // ── DELETE SPECIFIC MESSAGE ──────────────────────────────────────────────
    if (action === "delete_message") {
      if (!body.messageId) {
        return NextResponse.json({ error: "messageId wajib diisi" }, { status: 400 });
      }

      const targetMsgId = body.messageId.trim();

      const sentLogRaw = await redis.lrange("adminmsg:sentlog", 0, 499).catch(() => []);
      const updatedSentLog = sentLogRaw.filter((r) => {
        try {
          const m = typeof r === "string" ? JSON.parse(r) : r;
          return m.id !== targetMsgId;
        } catch { return true; }
      });
      await redis.del("adminmsg:sentlog");
      if (updatedSentLog.length > 0) {
        for (const m of updatedSentLog.reverse()) {
          await redis.rpush("adminmsg:sentlog", typeof m === "string" ? m : JSON.stringify(m));
        }
      }

      const broadcastRaw = await redis.lrange("adminmsg:broadcast", 0, 199).catch(() => []);
      const updatedBroadcast = broadcastRaw.filter((r) => {
        try {
          const m = typeof r === "string" ? JSON.parse(r) : r;
          return m.id !== targetMsgId;
        } catch { return true; }
      });
      await redis.del("adminmsg:broadcast");
      if (updatedBroadcast.length > 0) {
        for (const m of updatedBroadcast.reverse()) {
          await redis.rpush("adminmsg:broadcast", typeof m === "string" ? m : JSON.stringify(m));
        }
      }

      return NextResponse.json({ ok: true, message: `✅ Pesan ${targetMsgId} berhasil dihapus!` });
    }

    // ── SEND MESSAGE (DEFAULT) ───────────────────────────────────────────────
    if (!body.type || !body.title || !body.body) {
      return NextResponse.json({ error: "Tipe, judul, dan isi pesan wajib diisi" }, { status: 400 });
    }

    const rawTargetId = String(body.targetUserId ?? "").trim();
    const isAll = rawTargetId === "all" || rawTargetId === "";

    const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isAll) {
      const msg: AdminMessage = {
        id: msgId,
        type: body.type,
        title: body.title.trim(),
        body: body.body.trim(),
        reason: body.reason?.trim(),
        targetUserId: "all",
        targetEmail: "all",
        targetUsername: "all",
        sentAt: new Date().toISOString(),
        sentByEmail: payload.email,
        read: false,
      };

      await redis.lpush("adminmsg:broadcast", JSON.stringify(msg));
      await redis.ltrim("adminmsg:broadcast", 0, 199);
      await redis.expire("adminmsg:broadcast", 86400 * 7);

      await redis.lpush("adminmsg:sentlog", JSON.stringify(msg));
      await redis.ltrim("adminmsg:sentlog", 0, 499);
      await redis.expire("adminmsg:sentlog", 86400 * 30);

      return NextResponse.json({ ok: true, messageId: msg.id, mode: "broadcast" });
    }

    // Targeted message
    const allUsers = await getAllUsers();
    const cleanRawTarget = rawTargetId.trim();

    const targetUser = allUsers.find((u) =>
      u.id === cleanRawTarget ||
      u.email.toLowerCase() === cleanRawTarget.toLowerCase() ||
      u.username.toLowerCase() === cleanRawTarget.toLowerCase() ||
      (u.recipientId && u.recipientId.toUpperCase() === cleanRawTarget.toUpperCase())
    );

    const finalUserId = targetUser?.id || (body.targetUserId && body.targetUserId !== "all" ? body.targetUserId : cleanRawTarget);
    const finalEmail = targetUser?.email.toLowerCase() || (body.targetEmail && body.targetEmail !== "all" ? body.targetEmail.toLowerCase().trim() : (cleanRawTarget.includes("@") ? cleanRawTarget.toLowerCase() : cleanRawTarget));
    const finalUsername = targetUser?.username.toLowerCase() || (body.targetUsername && body.targetUsername !== "all" ? body.targetUsername.toLowerCase().trim() : finalEmail);
    const finalRecId = targetUser?.recipientId?.toUpperCase() || (cleanRawTarget.startsWith("REC-") ? cleanRawTarget.toUpperCase() : undefined);

    const msg: AdminMessage = {
      id: msgId,
      type: body.type,
      title: body.title.trim(),
      body: body.body.trim(),
      reason: body.reason?.trim(),
      targetUserId: finalUserId,
      targetEmail: finalEmail,
      targetUsername: finalUsername,
      sentAt: new Date().toISOString(),
      sentByEmail: payload.email,
      read: false,
    };

    const keysSet = new Set<string>();
    // ── STRICT: Only write to userId key — prevents message leaking to other users
    // Email and username are NOT unique enough to use as delivery keys
    if (finalUserId && finalUserId !== "all") {
      keysSet.add(`adminmsg:user:${finalUserId}`);
    }
    // Fallback: if no userId resolved, use email as secondary key only
    if (keysSet.size === 0 && finalEmail && finalEmail !== "all") {
      keysSet.add(`adminmsg:user:${finalEmail}`);
    }

    for (const k of Array.from(keysSet)) {
      await redis.lpush(k, JSON.stringify(msg));
      await redis.ltrim(k, 0, 49);
      await redis.expire(k, 86400 * 7);
    }

    await redis.lpush("adminmsg:sentlog", JSON.stringify(msg));
    await redis.ltrim("adminmsg:sentlog", 0, 499);
    await redis.expire("adminmsg:sentlog", 86400 * 30);

    return NextResponse.json({
      ok: true,
      messageId: msg.id,
      mode: "targeted",
      sentTo: { id: finalUserId, email: finalEmail, username: finalUsername },
    });
  } catch (err) {
    console.error("Master Admin Messenger POST error:", err);
    return NextResponse.json({ error: "Gagal memproses permintaan admin" }, { status: 500 });
  }
}
