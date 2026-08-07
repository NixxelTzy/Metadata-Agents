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
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return redis.get<User>(`user:email:${email.toLowerCase()}`);
}

export async function getUserById(id: string): Promise<User | null> {
  return redis.get<User>(`user:id:${id}`);
}

export async function createUser(user: User): Promise<void> {
  await redis.set(`user:email:${user.email.toLowerCase()}`, user);
  await redis.set(`user:id:${user.id}`, user);
}

export async function getAllUsers(): Promise<User[]> {
  const keys = await redis.keys("user:email:*");
  if (!keys || keys.length === 0) return [];
  const users = await Promise.all(keys.map((k) => redis.get<User>(k)));
  return users.filter((u): u is User => u !== null);
}

export async function deleteUser(email: string, id: string): Promise<void> {
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
  const activity: UserActivity = {
    userId,
    email,
    lastSeen: new Date().toISOString(),
    currentFeature: feature,
    username,
  };
  // TTL 86400 = 24 hours (so we can show "last seen X days ago" up to a day, not just 2 min)
  // We use a SEPARATE key with long TTL for historical last-seen
  await redis.set(`activity:user:${userId}`, activity, { ex: 86400 * 30 });
  // ALSO store a short-TTL key for "currently online" detection (2 min = 120 sec)
  await redis.set(`online:user:${userId}`, { userId, feature, lastSeen: activity.lastSeen }, { ex: 120 });
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

export async function getAllOnlineUsers(): Promise<Record<string, { feature: string; lastSeen: string }>> {
  const keys = await redis.keys('online:user:*');
  if (!keys || keys.length === 0) return {};
  const result: Record<string, { feature: string; lastSeen: string }> = {};
  await Promise.all(
    keys.map(async (k) => {
      const userId = k.replace('online:user:', '');
      const data = await redis.get<{ feature: string; lastSeen: string }>(k);
      if (data) result[userId] = data;
    })
  );
  return result;
}

