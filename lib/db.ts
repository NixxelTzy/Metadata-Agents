/**
 * lib/db.ts
 * Database layer menggunakan Upstash Redis.
 * Credentials dibaca dari environment variables.
 * Set UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.
 */
import { Redis } from "@upstash/redis";
import { getRedisConfig, getRedisConfig2 } from "@/lib/config";

// Lazy Redis clients — diinisialisasi saat pertama kali digunakan, bukan saat module di-import.
// Ini mencegah build error di Vercel ketika env vars belum tersedia saat bundling.
let _redis: Redis | null = null;
let _redis2: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    const { url, token } = getRedisConfig();
    _redis = new Redis({ url: url || "https://placeholder.upstash.io", token: token || "placeholder" });
  }
  return _redis;
}

function getRedis2(): Redis {
  if (!_redis2) {
    const config2 = getRedisConfig2();
    _redis2 = new Redis({ url: config2.url || "https://placeholder.upstash.io", token: config2.token || "placeholder" });
  }
  return _redis2;
}

// Shorthand aliases untuk kompatibilitas kode di bawah
const redis = new Proxy({} as Redis, { get: (_, prop) => (getRedis() as any)[prop] });
const redis2 = new Proxy({} as Redis, { get: (_, prop) => (getRedis2() as any)[prop] });

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

// ── Leaderboard & Global Counter ─────────────────────────────────────────────

export interface LeaderboardEntry {
  username: string;
  photoCount: number;
}

export async function recordPhotoProcessing(
  userId: string,
  username: string,
  count: number
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all([
      redis.incrby(`stats:photos:${today}`, count),
      redis.incrby("stats:photos:total", count),
      redis.zincrby("leaderboard:contributors", count, username || "Kreator"),
    ]);
  } catch (err) {
    console.error("recordPhotoProcessing error:", err);
  }
}

export async function getGlobalPhotoStats(): Promise<{
  todayCount: number;
  totalCount: number;
  leaderboard: LeaderboardEntry[];
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [todayRaw, totalRaw, lbRaw] = await Promise.all([
      redis.get<number>(`stats:photos:${today}`).catch(() => 0),
      redis.get<number>("stats:photos:total").catch(() => 0),
      redis.zrange("leaderboard:contributors", 0, 9, { rev: true, withScores: true }).catch(() => []),
    ]);

    const leaderboard: LeaderboardEntry[] = [];
    if (Array.isArray(lbRaw)) {
      for (let i = 0; i < lbRaw.length; i += 2) {
        if (typeof lbRaw[i] === "string" && lbRaw[i + 1] !== undefined) {
          leaderboard.push({
            username: lbRaw[i] as string,
            photoCount: Number(lbRaw[i + 1]) || 0,
          });
        } else if (typeof lbRaw[i] === "object" && lbRaw[i] !== null && "member" in (lbRaw[i] as any)) {
          const item = lbRaw[i] as any;
          leaderboard.push({
            username: item.member,
            photoCount: Number(item.score) || 0,
          });
        }
      }
    }

    return {
      todayCount: Number(todayRaw) || 0,
      totalCount: Number(totalRaw) || 0,
      leaderboard,
    };
  } catch (err) {
    console.error("getGlobalPhotoStats error:", err);
    return { todayCount: 0, totalCount: 0, leaderboard: [] };
  }
}

// ── Metadata Background Jobs & History ───────────────────────────────────────

export interface MetadataJobItem {
  filename: string;
  title?: string;
  keywords?: string[];
  categories?: string[];
  prompt?: string;
  model?: string;
  editorial?: string;
  matureContent?: string;
  illustration?: string;
  error?: string;
}

export interface MetadataJob {
  id: string;
  userId: string;
  username: string;
  platform: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  total: number;
  results: MetadataJobItem[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface MetadataHistoryEntry {
  id: string;
  jobId?: string;
  platform: string;
  photoCount: number;
  createdAt: string;
  items: MetadataJobItem[];
}

export async function saveMetadataJob(job: MetadataJob): Promise<void> {
  try {
    job.updatedAt = new Date().toISOString();
    await redis.set(`job:metadata:${job.id}`, job, { ex: 86400 * 7 }); // 7 days TTL
    await redis.sadd(`jobs:user:${job.userId}`, job.id);
  } catch (err) {
    console.error("saveMetadataJob error:", err);
  }
}

export async function getMetadataJob(jobId: string): Promise<MetadataJob | null> {
  try {
    return await redis.get<MetadataJob>(`job:metadata:${jobId}`);
  } catch (err) {
    console.error("getMetadataJob error:", err);
    return null;
  }
}

export async function saveUserMetadataHistory(
  userId: string,
  entry: MetadataHistoryEntry
): Promise<void> {
  try {
    const key = `history:metadata:${userId}`;
    await redis.lpush(key, JSON.stringify(entry));
    await redis.ltrim(key, 0, 49); // Keep latest 50 history entries
    await redis.expire(key, 86400 * 90); // 90 days TTL
  } catch (err) {
    console.error("saveUserMetadataHistory error:", err);
  }
}

export async function appendPhotoToUserHistory(
  userId: string,
  sessionId: string,
  platform: string,
  item: MetadataJobItem
): Promise<void> {
  try {
    const key = `history:metadata:${userId}`;
    const raw = await redis.lrange(key, 0, 0);
    let topEntry: MetadataHistoryEntry | null = null;
    if (raw && raw.length > 0) {
      topEntry = typeof raw[0] === "string" ? JSON.parse(raw[0]) : raw[0];
    }

    if (topEntry && topEntry.id === sessionId) {
      topEntry.items.push(item);
      topEntry.photoCount = topEntry.items.length;
      await redis.lset(key, 0, JSON.stringify(topEntry));
    } else {
      const newEntry: MetadataHistoryEntry = {
        id: sessionId,
        platform,
        photoCount: 1,
        createdAt: new Date().toISOString(),
        items: [item],
      };
      await redis.lpush(key, JSON.stringify(newEntry));
      await redis.ltrim(key, 0, 49);
      await redis.expire(key, 86400 * 90);
    }
  } catch (err) {
    console.error("appendPhotoToUserHistory error:", err);
  }
}

export async function syncJobToUserHistory(
  userId: string,
  jobId: string,
  platform: string,
  results: MetadataJobItem[]
): Promise<void> {
  try {
    const key = `history:metadata:${userId}`;
    const raw = await redis.lrange(key, 0, 49);
    let foundIdx = -1;
    let entries: MetadataHistoryEntry[] = [];

    if (raw && raw.length > 0) {
      entries = raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
      foundIdx = entries.findIndex((e) => e.id === jobId || e.jobId === jobId);
    }

    const validItems = results.filter((r) => r && (r.title || r.filename));
    if (foundIdx !== -1 && entries[foundIdx]) {
      entries[foundIdx]!.items = validItems;
      entries[foundIdx]!.photoCount = validItems.length;
      await redis.lset(key, foundIdx, JSON.stringify(entries[foundIdx]));
    } else {
      const newEntry: MetadataHistoryEntry = {
        id: jobId,
        jobId,
        platform,
        photoCount: validItems.length,
        createdAt: new Date().toISOString(),
        items: validItems,
      };
      await redis.lpush(key, JSON.stringify(newEntry));
      await redis.ltrim(key, 0, 99);
      await redis.expire(key, 86400 * 90);
    }
  } catch (err) {
    console.error("syncJobToUserHistory error:", err);
  }
}

export async function getUserMetadataHistory(
  userId: string,
  limit = 100
): Promise<MetadataHistoryEntry[]> {
  try {
    const key = `history:metadata:${userId}`;
    const raw = await redis.lrange(key, 0, limit - 1);
    if (!raw || raw.length === 0) return [];
    const parsed = raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item));

    // Deduplicate by entry id / jobId to prevent duplicate cards
    const seen = new Set<string>();
    const deduped: MetadataHistoryEntry[] = [];
    for (const entry of parsed) {
      const idKey = entry.id || entry.jobId;
      if (idKey && !seen.has(idKey)) {
        seen.add(idKey);
        deduped.push(entry);
      } else if (!idKey) {
        deduped.push(entry);
      }
    }
    return deduped;
  } catch (err) {
    console.error("getUserMetadataHistory error:", err);
    return [];
  }
}

export async function deleteUserMetadataHistory(
  userId: string,
  entryId: string
): Promise<void> {
  try {
    const key = `history:metadata:${userId}`;
    const raw = await redis.lrange(key, 0, -1);
    const filtered = raw
      .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
      .filter((e: MetadataHistoryEntry) => e.id !== entryId);
    await redis.del(key);
    for (let i = filtered.length - 1; i >= 0; i--) {
      await redis.lpush(key, JSON.stringify(filtered[i]));
    }
    await redis.expire(key, 86400 * 90);
  } catch (err) {
    console.error("deleteUserMetadataHistory error:", err);
  }
}


