import { NextResponse } from "next/server";
import { getGroqApiKey } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = getGroqApiKey();
  const hasKey = key.length > 0;

  return NextResponse.json({
    status: hasKey ? "ok" : "degraded",
    ai: "groq",
    keyConfigured: hasKey,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }, { status: hasKey ? 200 : 503 });
}
