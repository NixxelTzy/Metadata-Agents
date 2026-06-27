import { NextResponse } from "next/server";
import { getDeepSeekApiKey } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = getDeepSeekApiKey();
  const hasKey = key.length > 0;

  return NextResponse.json({
    status: hasKey ? "ok" : "degraded",
    ai: "deepseek",
    keyConfigured: hasKey,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }, { status: hasKey ? 200 : 503 });
}
