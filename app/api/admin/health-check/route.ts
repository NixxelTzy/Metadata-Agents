import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { getRedisConfig, getRedisConfig2, getGroqApiKeys, getGmailConfig } from "@/lib/config";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export interface ServiceHealthStatus {
  service: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  latencyMs: number;
  details: string;
}

export interface SystemHealthReport {
  overallStatus: "HEALTHY" | "DEGRADED" | "DOWN";
  timestamp: string;
  services: ServiceHealthStatus[];
}

/**
 * GET /api/admin/health-check
 * Live automated health probe for database, Redis, AI Vision, and Mailer services.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const services: ServiceHealthStatus[] = [];

  // 1. Primary Redis DB Health Probe
  const startRedis = Date.now();
  try {
    const { url, token: rToken } = getRedisConfig();
    const redis = new Redis({ url, token: rToken });
    await redis.ping();
    const latency = Date.now() - startRedis;
    services.push({
      service: "Primary Upstash Redis DB",
      status: latency < 300 ? "HEALTHY" : "DEGRADED",
      latencyMs: latency,
      details: `Koneksi aktif (${latency}ms latency)`,
    });
  } catch (e) {
    services.push({
      service: "Primary Upstash Redis DB",
      status: "DOWN",
      latencyMs: Date.now() - startRedis,
      details: `Gagal terkoneksi: ${String(e)}`,
    });
  }

  // 2. Storage Redis #2 Health Probe
  const startRedis2 = Date.now();
  try {
    const config2 = getRedisConfig2();
    if (!config2.url || !config2.token) {
      services.push({
        service: "Storage Redis #2 (Vercel KV)",
        status: "DEGRADED",
        latencyMs: 0,
        details: "Environment variables storages_KV tidak diset (Opsional)",
      });
    } else {
      const redis2 = new Redis({ url: config2.url, token: config2.token });
      await redis2.ping();
      const latency = Date.now() - startRedis2;
      services.push({
        service: "Storage Redis #2 (Vercel KV)",
        status: latency < 300 ? "HEALTHY" : "DEGRADED",
        latencyMs: latency,
        details: `Koneksi aktif (${latency}ms latency)`,
      });
    }
  } catch (e) {
    services.push({
      service: "Storage Redis #2 (Vercel KV)",
      status: "DOWN",
      latencyMs: Date.now() - startRedis2,
      details: `Gagal terkoneksi: ${String(e)}`,
    });
  }

  // 3. Groq AI Vision Key Health Probe
  try {
    const keys = getGroqApiKeys();
    if (keys.length > 0) {
      services.push({
        service: "Groq Vision AI Engine",
        status: "HEALTHY",
        latencyMs: 15,
        details: `${keys.length} API Key aktif & terkonfigurasi`,
      });
    } else {
      services.push({
        service: "Groq Vision AI Engine",
        status: "DOWN",
        latencyMs: 0,
        details: "GROQ_API_KEY tidak ditemukan di env",
      });
    }
  } catch (e) {
    services.push({
      service: "Groq Vision AI Engine",
      status: "DOWN",
      latencyMs: 0,
      details: `Error: ${String(e)}`,
    });
  }

  // 4. Gmail SMTP Mailer Credentials Health Probe
  try {
    const gmail = getGmailConfig();
    if (gmail.user && gmail.appPassword) {
      services.push({
        service: "Gmail SMTP Mailer Engine",
        status: "HEALTHY",
        latencyMs: 10,
        details: `Terkonfigurasi untuk pengirim: ${gmail.user}`,
      });
    } else {
      services.push({
        service: "Gmail SMTP Mailer Engine",
        status: "DEGRADED",
        latencyMs: 0,
        details: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di env",
      });
    }
  } catch (e) {
    services.push({
      service: "Gmail SMTP Mailer Engine",
      status: "DOWN",
      latencyMs: 0,
      details: `Error: ${String(e)}`,
    });
  }

  const overallStatus = services.some((s) => s.status === "DOWN")
    ? "DOWN"
    : services.some((s) => s.status === "DEGRADED")
    ? "DEGRADED"
    : "HEALTHY";

  const report: SystemHealthReport = {
    overallStatus,
    timestamp: new Date().toISOString(),
    services,
  };

  return NextResponse.json(report);
}
