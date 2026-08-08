import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";

const { url, token: redisToken } = getRedisConfig();
const redis = new Redis({ url, token: redisToken });
const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface FeatureClosingConfig {
  featureId: string;
  closed: boolean;
  message: string;
  updatedAt: string;
}

export type ClosingConfigMap = Record<string, FeatureClosingConfig>;

/** GET: Public endpoint to get closing status for features */
export async function GET() {
  try {
    const raw = await redis.get("closing:features");
    const data = (raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {}) as ClosingConfigMap;
    return NextResponse.json({ ok: true, closing: data });
  } catch (err) {
    return NextResponse.json({ ok: true, closing: {} });
  }
}

/** POST: Admin endpoint to update feature closing settings */
export async function POST(request: NextRequest) {
  const t = request.cookies.get("auth_token")?.value;
  if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(t);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json() as { closing: ClosingConfigMap };
    if (!body.closing) {
      return NextResponse.json({ error: "Data closing wajib diisi" }, { status: 400 });
    }

    await redis.set("closing:features", JSON.stringify(body.closing));
    return NextResponse.json({ ok: true, message: "Pengaturan Closing Features berhasil disimpan!" });
  } catch (err) {
    console.error("Closing features save error:", err);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan closing" }, { status: 500 });
  }
}
