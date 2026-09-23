import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import { getAllUsers } from "@/lib/db";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface ReadReceiptItem {
  messageId: string;
  readCount: number;
  totalRecipients: number;
  readRatePct: number;
  readers: {
    userId: string;
    email: string;
    username: string;
    readAt?: string;
  }[];
}

/**
 * GET /api/admin/read-receipts
 * Returns read receipts and delivery analytics for sent admin messages.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await getAllUsers();
    const sentRaw = await redis.lrange("adminmsg:sentlog", 0, 49).catch(() => []);

    const receipts: Record<string, ReadReceiptItem> = {};

    for (const item of sentRaw) {
      try {
        const msg = typeof item === "string" ? JSON.parse(item) : item;
        if (!msg || !msg.id) continue;

        const readersList: ReadReceiptItem["readers"] = [];

        // Check seen set for every registered user
        for (const user of users) {
          const seenKey = `adminmsg:seen:${user.id}`;
          const isSeen = await redis.sismember(seenKey, msg.id).catch(() => 0);
          if (isSeen) {
            readersList.push({
              userId: user.id,
              email: user.email,
              username: user.username,
            });
          }
        }

        const totalUsers = users.filter((u) => u.role !== "admin").length || 1;
        const readCount = readersList.length;
        const readRatePct = Math.round((readCount / totalUsers) * 100);

        receipts[msg.id] = {
          messageId: msg.id,
          readCount,
          totalRecipients: totalUsers,
          readRatePct,
          readers: readersList,
        };
      } catch { /* skip */ }
    }

    return NextResponse.json({ receipts });
  } catch (error) {
    console.error("Read receipts error:", error);
    return NextResponse.json({ error: "Gagal mengambil data tanda terima dibaca" }, { status: 500 });
  }
}
