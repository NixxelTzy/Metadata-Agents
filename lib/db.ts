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
  role: "user" | "premium";
  createdAt: string;
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
