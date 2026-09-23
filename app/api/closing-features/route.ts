import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });

export async function GET() {
  try {
    const raw = await redis.get("closing:features");
    const data = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return NextResponse.json({ ok: true, closing: data });
  } catch {
    return NextResponse.json({ ok: true, closing: {} });
  }
}
