/**
 * lib/db.ts
 * Database layer menggunakan Upstash Redis.
 * Credentials dibaca dari environment variables.
 * Set UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.
 */
import { Redis } from "@upstash/redis";
import { getRedisConfig, getRedisConfig2 } from "@/lib/config";

const { url, token } = getRedisConfig();
const redis = new Redis({ url, token });

// Redis #2 Client (untuk Storage / Feedback / dll)
const config2 = getRedisConfig2();
const redis2 = new Redis({ url: config2.url, token: config2.token });

// ── User ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: "user" | "premium" | "admin";
  createdAt: string;
  passwordRaw?: string;
  recipientId?: string; // Dedicated Recipient ID, e.g. REC-892F1A
  premiumExpiresAt?: string; // ISO string when premium expires
  premiumPlan?: "7days" | "30days" | "1year" | "custom" | string;
  premiumGrantedAt?: string;
  premiumGrantedBy?: string; // e.g. "wa_bot", "admin_panel"
}

export function generateRecipientId(userIdOrEmail: string): string {
  const hash = Math.abs(
    userIdOrEmail.split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  ).toString(36).toUpperCase().padStart(6, "X").slice(0, 6);
  return `REC-${hash}`;
}

export async function sendUserInAppNotification(
  user: User,
  title: string,
  body: string,
  reason?: string
): Promise<void> {
  try {
    const msg = {
      id: `botmsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "message",
      title,
      body,
      reason: reason || "Pemberitahuan Sistem Otomatis",
      targetUserId: user.id,
      targetEmail: user.email.toLowerCase(),
      targetUsername: user.username,
      sentAt: new Date().toISOString(),
      sentByEmail: "premium@stockai.studio",
      read: false,
    };

    const keys = [
      `adminmsg:user:${user.id}`,
      `adminmsg:user:${user.email.toLowerCase()}`,
      `adminmsg:user:${user.username.toLowerCase()}`,
    ];
    if (user.recipientId) {
      keys.push(`adminmsg:user:${user.recipientId.toUpperCase()}`);
    }

    for (const key of keys) {
      await redis.lpush(key, JSON.stringify(msg));
      await redis.ltrim(key, 0, 49);
      await redis.expire(key, 86400 * 30);
    }
  } catch (err) {
    console.error("sendUserInAppNotification error:", err);
  }
}

export async function checkAndExpireUserPremium(user: User): Promise<User> {
  // Admin is never expired
  if (user.role === "admin" || user.email.toLowerCase() === "nixxeltzy@gmail.com") {
    return user;
  }

  if (user.role === "premium" && user.premiumExpiresAt) {
    const now = new Date();
    const expiry = new Date(user.premiumExpiresAt);

    if (now >= expiry) {
      // Demote to regular user
      user.role = "user";
      const oldPlan = user.premiumPlan || "Premium";
      user.premiumPlan = undefined;
      user.premiumExpiresAt = undefined;

      await createUser(user);

      // Send in-app notification to user
      await sendUserInAppNotification(
        user,
        "Akses Premium Anda Telah Berakhir",
        `Masa aktif langganan ${oldPlan} Anda telah selesai pada ${expiry.toLocaleString("id-ID")}. Akun Anda telah kembali ke paket reguler (200k token/hari). Anda dapat memperpanjang paket kapan saja melalui menu Akses Premium.`,
        "Masa Berlaku Langganan Habis"
      );

      // Log activity event
      await appendActivityEvent(
        user.id,
        user.email,
        user.username,
        "premium_expired",
        `Masa aktif paket ${oldPlan} telah berakhir. Role dikembalikan ke user.`
      );
    }
  }
  return user;
}

export async function checkAllUsersPremiumExpiry(): Promise<{ expiredCount: number; expiredUsers: string[] }> {
  try {
    const allUsers = await getAllUsers();
    let expiredCount = 0;
    const expiredUsers: string[] = [];

    for (const u of allUsers) {
      if (u.role === "premium" && u.premiumExpiresAt) {
        const now = new Date();
        const expiry = new Date(u.premiumExpiresAt);
        if (now >= expiry) {
          await checkAndExpireUserPremium(u);
          expiredCount++;
          expiredUsers.push(u.email);
        }
      }
    }
    return { expiredCount, expiredUsers };
  } catch (err) {
    console.error("checkAllUsersPremiumExpiry error:", err);
    return { expiredCount: 0, expiredUsers: [] };
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const u = await redis.get<User>(`user:email:${email.toLowerCase()}`);
  if (u) {
    if (u.email.toLowerCase() === "nixxeltzy@gmail.com") {
      u.role = "admin";
    }
    if (!u.recipientId) {
      u.recipientId = generateRecipientId(u.id || u.email);
      await redis.set(`user:email:${email.toLowerCase()}`, u).catch(() => {});
    }
  }
  return u;
}

export async function getUserById(id: string): Promise<User | null> {
  const u = await redis.get<User>(`user:id:${id}`);
  if (u) {
    if (u.email.toLowerCase() === "nixxeltzy@gmail.com") {
      u.role = "admin";
    }
    if (!u.recipientId) {
      u.recipientId = generateRecipientId(u.id || u.email);
      await redis.set(`user:id:${id}`, u).catch(() => {});
    }
  }
  return u;
}

export async function getUserByRecipientId(recId: string): Promise<User | null> {
  const cleanRec = recId.toUpperCase().trim();
  const byRecKey = await redis.get<User>(`user:recipient:${cleanRec}`);
  if (byRecKey) {
    if (byRecKey.email.toLowerCase() === "nixxeltzy@gmail.com") byRecKey.role = "admin";
    return byRecKey;
  }

  const all = await getAllUsers();
  const found = all.find((u) => u.recipientId?.toUpperCase() === cleanRec) ?? null;
  if (found && found.email.toLowerCase() === "nixxeltzy@gmail.com") found.role = "admin";
  return found;
}

export async function createUser(user: User): Promise<void> {
  if (user.email.toLowerCase() === "nixxeltzy@gmail.com") {
    user.role = "admin";
  }
  if (!user.recipientId) {
    user.recipientId = generateRecipientId(user.id || user.email);
  }
  await redis.set(`user:email:${user.email.toLowerCase()}`, user);
  await redis.set(`user:id:${user.id}`, user);
  await redis.set(`user:recipient:${user.recipientId.toUpperCase()}`, user);
}

export async function getAllUsers(): Promise<User[]> {
  const keys = await redis.keys("user:email:*");
  if (!keys || keys.length === 0) return [];
  const users = await Promise.all(keys.map((k) => redis.get<User>(k)));
  const validUsers: User[] = [];

  for (const u of users) {
    if (!u) continue;
    if (!u.recipientId) {
      u.recipientId = generateRecipientId(u.id || u.email);
      await redis.set(`user:email:${u.email.toLowerCase()}`, u).catch(() => {});
      await redis.set(`user:id:${u.id}`, u).catch(() => {});
      await redis.set(`user:recipient:${u.recipientId.toUpperCase()}`, u).catch(() => {});
    }
    validUsers.push(u);
  }
  return validUsers;
}

export async function deleteUser(email: string, id: string): Promise<void> {
  const u = await getUserByEmail(email);
  if (u?.recipientId) {
    await redis.del(`user:recipient:${u.recipientId.toUpperCase()}`);
  }
  await redis.del(`user:email:${email.toLowerCase()}`);
  await redis.del(`user:id:${id}`);
}

// ── OTP ───────────────────────────────────────────────────────────────────────

export interface OtpRecord {
  email: string;
  code: string;
  expiresAt: string;
  used: boolean;
}

export async function saveOtp(record: OtpRecord): Promise<void> {
  await redis.set(`otp:${record.email.toLowerCase()}`, record, { ex: 900 });
}

export async function getOtpByEmail(email: string): Promise<OtpRecord | null> {
  return redis.get<OtpRecord>(`otp:${email.toLowerCase()}`);
}

export async function markOtpUsed(email: string): Promise<void> {
  const record = await getOtpByEmail(email);
  if (record) {
    await redis.set(`otp:${email.toLowerCase()}`, { ...record, used: true }, { ex: 60 });
  }
}

// ── Bug & Feature Reports ───────────────────────────────────────────────────

export interface BugReport {
  id: string;
  userId: string;
  email: string;
  username: string;
  type: "bug" | "feature" | "other";
  message: string;
  createdAt: string;
}

export async function createReport(report: BugReport): Promise<void> {
  await redis2.set(`report:id:${report.id}`, report);
}

export async function getAllReports(): Promise<BugReport[]> {
  const keys = await redis2.keys("report:id:*");
  if (!keys || keys.length === 0) return [];
  const reports = await Promise.all(keys.map((k) => redis2.get<BugReport>(k)));
  return reports
    .filter((r): r is BugReport => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getReportsByUserId(userId: string): Promise<BugReport[]> {
  const all = await getAllReports();
  return all.filter((r) => r.userId === userId);
}

// ── User Activity ─────────────────────────────────────────────────────────────

export interface UserActivity {
  userId: string;
  email: string;
  username: string;
  lastSeen: string; // ISO date string
  currentFeature: string; // e.g. "metadata", "upscale", "motion"
}

// ── Activity Event Log (Granular) ─────────────────────────────────────────────

export interface ActivityEvent {
  id: string;          // unique event id
  userId: string;
  email: string;
  username: string;
  action: string;      // e.g. "metadata_upload", "upscale", "login"
  detail: string;      // human-readable detail, e.g. "Upload 24 foto di Metadata"
  timestamp: string;   // ISO date string
}

/** Append a new activity event to user's event log (max 200 events per user, 90-day TTL) */
export async function appendActivityEvent(
  userId: string,
  email: string,
  username: string,
  action: string,
  detail: string
): Promise<void> {
  const event: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    email,
    username,
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
  const key = `actlog:user:${userId}`;
  await redis.lpush(key, JSON.stringify(event));
  await redis.ltrim(key, 0, 199);    // keep max 200 events
  await redis.expire(key, 86400 * 90); // 90 days TTL
}

/** Get activity events for a specific user (newest first) */
export async function getUserActivityEvents(userId: string, limit = 100): Promise<ActivityEvent[]> {
  const raw = await redis.lrange(`actlog:user:${userId}`, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r) as ActivityEvent);
}

/** Get ALL activity events across all users, sorted newest-first */
export async function getAllActivityEvents(limit = 500): Promise<ActivityEvent[]> {
  const keys = await redis.keys("actlog:user:*");
  if (!keys || keys.length === 0) return [];
  const allRaw = await Promise.all(
    keys.map((k) => redis.lrange(k, 0, 99))
  );
  const events: ActivityEvent[] = [];
  for (const rawList of allRaw) {
    for (const r of rawList) {
      try {
        events.push(typeof r === "string" ? JSON.parse(r) : (r as ActivityEvent));
      } catch { /* skip bad records */ }
    }
  }
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}

export async function updateUserActivity(
  userId: string,
  email: string,
  username: string,
  feature: string
): Promise<void> {
  const now = new Date().toISOString();
  const activity: UserActivity = {
    userId,
    email,
    lastSeen: now,
    currentFeature: feature,
    username,
  };
  const onlineData = { userId, email, username, feature, lastSeen: now, isOnline: true };

  // Activity record: 30-day TTL (long-term)
  await redis.set(`activity:user:${userId}`, activity, { ex: 86400 * 30 });
  if (email) await redis.set(`activity:user:${email.toLowerCase()}`, activity, { ex: 86400 * 30 });

  // Online status: 20s TTL — if no ping for 20s, key expires and user is offline
  // Threshold set tight: ping is every 5s, so 20s = 4 missed pings before offline
  await redis.set(`online:user:${userId}`, onlineData, { ex: 20 });
  if (email) await redis.set(`online:user:${email.toLowerCase()}`, onlineData, { ex: 20 });
  if (username) await redis.set(`online:user:${username.toLowerCase()}`, onlineData, { ex: 20 });
}

export async function getUserActivity(userId: string): Promise<UserActivity | null> {
  return redis.get<UserActivity>(`activity:user:${userId}`);
}

export async function getOnlineStatus(userId: string): Promise<{ feature: string; lastSeen: string } | null> {
  return redis.get<{ feature: string; lastSeen: string }>(`online:user:${userId}`);
}

export async function getAllUserActivities(): Promise<UserActivity[]> {
  const keys = await redis.keys('activity:user:*');
  if (!keys || keys.length === 0) return [];
  const activities = await Promise.all(keys.map((k) => redis.get<UserActivity>(k)));
  return activities.filter((a): a is UserActivity => a !== null);
}

export async function getAllOnlineUsers(): Promise<Record<string, { feature: string; lastSeen: string; userId?: string; email?: string; username?: string; isOnline?: boolean }>> {
  const result: Record<string, { feature: string; lastSeen: string; userId?: string; email?: string; username?: string; isOnline?: boolean }> = {};

  // Use SCAN instead of KEYS to avoid blocking Redis on large datasets
  let cursor = 0;
  const allKeys: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "online:user:*", count: 100 }).catch(() => ["0", []] as [string, string[]]);
    cursor = parseInt(String(nextCursor), 10) || 0;
    allKeys.push(...(keys as string[]));
  } while (cursor !== 0);

  if (allKeys.length === 0) return result;

  // Batch fetch all values in parallel
  await Promise.all(
    allKeys.map(async (k) => {
      const keyId = k.replace("online:user:", "");
      const data = await redis.get<{ feature: string; lastSeen: string; userId?: string; email?: string; username?: string; isOnline?: boolean }>(k).catch(() => null);
      if (data) result[keyId] = { ...data, isOnline: true };
    })
  );

  return result;
}

