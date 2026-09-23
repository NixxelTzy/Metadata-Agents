import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    const { url, token: redisToken } = getRedisConfig();
    _redis = new Redis({ url: url || "https://placeholder.upstash.io", token: redisToken || "placeholder" });
  }
  return _redis;
}
const redis = new Proxy({} as Redis, { get: (_, p) => (getRedis() as any)[p] });

export async function GET() {
  try {
    const raw = await redis.get("closing:features");
    const data = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return NextResponse.json({ ok: true, closing: data });
  } catch {
    return NextResponse.json({ ok: true, closing: {} });
  }
}
