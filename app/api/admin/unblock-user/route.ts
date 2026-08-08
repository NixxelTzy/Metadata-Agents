import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers } from "@/lib/db";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

/**
 * POST /api/admin/unblock-user
 * Admin-only: Remove all block messages for a specific user (or self).
 * Body: { targetUserId?: string } — if omitted, removes own block messages.
 */
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  try {
    const body = await request.json() as { targetUserId?: string };

    // Resolve target user — default to the admin themselves (for testing)
    const rawTargetId = body.targetUserId?.trim() || payload.userId;

    const allUsers = await getAllUsers();
    const targetUser = allUsers.find((u) =>
      u.id === rawTargetId ||
      u.email.toLowerCase() === rawTargetId.toLowerCase() ||
      u.username.toLowerCase() === rawTargetId.toLowerCase()
    );

    if (!targetUser) {
      return NextResponse.json({ error: `User "${rawTargetId}" tidak ditemukan` }, { status: 404 });
    }

    // All Redis keys that hold messages for this user
    const userKeys = [
      `adminmsg:user:${targetUser.id}`,
      `adminmsg:user:${targetUser.email.toLowerCase()}`,
      `adminmsg:user:${targetUser.username.toLowerCase()}`,
    ];
    if (targetUser.recipientId) {
      userKeys.push(`adminmsg:user:${targetUser.recipientId.toUpperCase()}`);
    }

    let totalRemoved = 0;

    for (const key of userKeys) {
      const raw = await redis.lrange(key, 0, 99).catch(() => []);
      const nonBlockMessages: string[] = [];

      for (const r of raw) {
        try {
          const msg = typeof r === "string" ? JSON.parse(r) : r;
          if (msg?.type !== "block") {
            nonBlockMessages.push(typeof r === "string" ? r : JSON.stringify(r));
          } else {
            totalRemoved++;
          }
        } catch { /* skip corrupted */ }
      }

      // Rebuild the list without block messages
      await redis.del(key);
      if (nonBlockMessages.length > 0) {
        // rpush to preserve original order (latest last, lrange reads latest first)
        for (const m of nonBlockMessages.reverse()) {
          await redis.rpush(key, m);
        }
        await redis.expire(key, 86400 * 7);
      }
    }

    // Also clean from broadcast key — remove block messages targeting this user
    const broadcastRaw = await redis.lrange("adminmsg:broadcast", 0, 199).catch(() => []);
    const filteredBroadcast: string[] = [];
    for (const r of broadcastRaw) {
      try {
        const msg = typeof r === "string" ? JSON.parse(r) : r;
        if (msg?.type !== "block") {
          filteredBroadcast.push(typeof r === "string" ? r : JSON.stringify(r));
        } else {
          totalRemoved++;
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

    return NextResponse.json({
      ok: true,
      message: `✅ Blokir berhasil dilepas untuk ${targetUser.username} (${targetUser.email}). ${totalRemoved} pesan blokir dihapus.`,
      unblocked: { id: targetUser.id, email: targetUser.email, username: targetUser.username },
      removedCount: totalRemoved,
    });
  } catch (err) {
    console.error("Unblock user error:", err);
    return NextResponse.json({ error: "Gagal melepas blokir" }, { status: 500 });
  }
}
