/**
 * lib/db.ts
 * Database layer menggunakan Upstash Redis.
 * Credentials dibaca dari environment variables.
 * Set UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Vercel.
 */
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token } = getRedisConfig();
const redis = new Redis({ url, token });

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
  await redis.set(`report:id:${report.id}`, report);
}

export async function getAllReports(): Promise<BugReport[]> {
  const keys = await redis.keys("report:id:*");
  if (!keys || keys.length === 0) return [];
  const reports = await Promise.all(keys.map((k) => redis.get<BugReport>(k)));
  return reports
    .filter((r): r is BugReport => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getReportsByUserId(userId: string): Promise<BugReport[]> {
  const all = await getAllReports();
  return all.filter((r) => r.userId === userId);
}
