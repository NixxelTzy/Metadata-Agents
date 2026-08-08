import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface DebugKeyInfo {
  key: string;
  exists: boolean;
  count: number;
  items: unknown[];
}

export interface DebugUserInfo {
  userId: string;
  email: string;
  username: string;
  seenIds: string[];
  userKeys: DebugKeyInfo[];
  broadcastKey: DebugKeyInfo;
  sentlogKey: DebugKeyInfo;
  resolvedMessages: {
    id: string;
    type: string;
    title: string;
    targetUserId: string;
    targetEmail: string;
    targetUsername: string;
    sentAt: string;
    matchReason: string;
    skippedBySeen: boolean;
  }[];
  errors: string[];
}

/**
 * GET /api/admin/inbox-debug?userId=xxx&email=xxx&username=xxx
 * Admin-only: Full Redis diagnostic for a specific user's inbox state.
 */
export async function GET(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId") ?? "";
  const targetEmail = (searchParams.get("email") ?? "").toLowerCase();
  const targetUsername = (searchParams.get("username") ?? "").toLowerCase();

  if (!targetUserId && !targetEmail && !targetUsername) {
    return NextResponse.json({ error: "Harap sertakan userId, email, atau username sebagai query param" }, { status: 400 });
  }

  const errors: string[] = [];
  const result: DebugUserInfo = {
    userId: targetUserId,
    email: targetEmail,
    username: targetUsername,
    seenIds: [],
    userKeys: [],
    broadcastKey: { key: "adminmsg:broadcast", exists: false, count: 0, items: [] },
    sentlogKey: { key: "adminmsg:sentlog", exists: false, count: 0, items: [] },
    resolvedMessages: [],
    errors,
  };

  try {
    // 1. Read seen set
    const seenKey = targetUserId ? `adminmsg:seen:${targetUserId}` : `adminmsg:seen:${targetEmail}`;
    const seenRaw = await redis.smembers(seenKey).catch(() => []);
    result.seenIds = seenRaw as string[];
    const seen = new Set(result.seenIds);

    // 2. Read per-user keys
    const userKeyNames: string[] = [];
    if (targetUserId) userKeyNames.push(`adminmsg:user:${targetUserId}`);
    if (targetEmail) userKeyNames.push(`adminmsg:user:${targetEmail}`);
    if (targetUsername) userKeyNames.push(`adminmsg:user:${targetUsername}`);

    for (const key of userKeyNames) {
      try {
        const items = await redis.lrange(key, 0, 49);
        result.userKeys.push({
          key,
          exists: items.length > 0,
          count: items.length,
          items: items.map((r) => { try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return r; } }),
        });
      } catch (e) {
        errors.push(`Gagal baca key "${key}": ${String(e)}`);
        result.userKeys.push({ key, exists: false, count: 0, items: [] });
      }
    }

    // 3. Read broadcast key
    try {
      const bcast = await redis.lrange("adminmsg:broadcast", 0, 49);
      result.broadcastKey = {
        key: "adminmsg:broadcast",
        exists: bcast.length > 0,
        count: bcast.length,
        items: bcast.map((r) => { try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return r; } }),
      };
    } catch (e) {
      errors.push(`Gagal baca adminmsg:broadcast: ${String(e)}`);
    }

    // 4. Read sentlog key
    try {
      const slog = await redis.lrange("adminmsg:sentlog", 0, 99);
      result.sentlogKey = {
        key: "adminmsg:sentlog",
        exists: slog.length > 0,
        count: slog.length,
        items: slog.map((r) => { try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return r; } }),
      };
    } catch (e) {
      errors.push(`Gagal baca adminmsg:sentlog: ${String(e)}`);
    }

    // 5. Simulate message resolution for this user
    const allRawLists = [
      ...result.userKeys.flatMap((k) => k.items),
      ...result.broadcastKey.items,
      ...result.sentlogKey.items,
    ];

    const msgMap = new Map<string, typeof result.resolvedMessages[0]>();
    for (const raw of allRawLists) {
      try {
        const msg = raw as {
          id: string; type: string; title: string;
          targetUserId: string; targetEmail: string; targetUsername: string;
          sentAt: string; sentByEmail: string;
        };
        if (!msg?.id || !msg?.type || !msg?.title) continue;

        const isBroadcast = msg.targetUserId === "all" || msg.targetEmail === "all" || msg.targetUsername === "all";
        const isForMe =
          (targetUserId && String(msg.targetUserId) === String(targetUserId)) ||
          (targetEmail && msg.targetEmail?.toLowerCase() === targetEmail) ||
          (targetUsername && msg.targetUsername?.toLowerCase() === targetUsername);

        let matchReason = "";
        if (isBroadcast) matchReason = "broadcast (all)";
        else if (targetUserId && String(msg.targetUserId) === String(targetUserId)) matchReason = `userId match (${targetUserId})`;
        else if (targetEmail && msg.targetEmail?.toLowerCase() === targetEmail) matchReason = `email match (${targetEmail})`;
        else if (targetUsername && msg.targetUsername?.toLowerCase() === targetUsername) matchReason = `username match (${targetUsername})`;

        if (!isBroadcast && !isForMe) continue;

        const skippedBySeen = msg.type === "message" && seen.has(msg.id);

        if (!msgMap.has(msg.id)) {
          msgMap.set(msg.id, {
            id: msg.id,
            type: msg.type,
            title: msg.title,
            targetUserId: msg.targetUserId,
            targetEmail: msg.targetEmail,
            targetUsername: msg.targetUsername,
            sentAt: msg.sentAt,
            matchReason,
            skippedBySeen,
          });
        }
      } catch (e) {
        errors.push(`Gagal parse pesan: ${String(e)}`);
      }
    }

    result.resolvedMessages = Array.from(msgMap.values()).sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );

  } catch (e) {
    errors.push(`Error utama: ${String(e)}`);
  }

  return NextResponse.json(result);
}
