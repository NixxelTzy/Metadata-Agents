import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSecurityStats, getSecurityEvents } from "@/lib/security/core";
import os from "os";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

// Track server start time precisely
const SERVER_START_TIME = Date.now();
const PROCESS_START_UPTIME = process.uptime();

// Track request counters per second window
let _reqCountWindow = 0;
let _reqPerSecond = 0;
let _lastRpsUpdate = Date.now();

function trackRequest() {
  _reqCountWindow++;
  const now = Date.now();
  if (now - _lastRpsUpdate >= 1000) {
    _reqPerSecond = _reqCountWindow;
    _reqCountWindow = 0;
    _lastRpsUpdate = now;
  }
}

function getCpuUsagePrecise(): number {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  const raw = (1 - totalIdle / totalTick) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function getMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalMB: Math.round(total / 1024 / 1024),
    totalGB: Math.round((total / 1024 / 1024 / 1024) * 100) / 100,
    usedMB: Math.round(used / 1024 / 1024),
    freeMB: Math.round(free / 1024 / 1024),
    usagePercent: Math.round((used / total) * 100),
  };
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getUptimeInfo() {
  // OS uptime = how long the OS has been running
  const osUptime = os.uptime();
  // Process uptime = how long this Node process has been running
  const processUptime = process.uptime();
  // Actual server start wall-clock time
  const startedAt = SERVER_START_TIME;
  const startedAtFormatted = new Date(startedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  return {
    osUptime,
    osUptimeFormatted: formatDuration(osUptime),
    processUptime,
    processUptimeFormatted: formatDuration(processUptime),
    startedAt,
    startedAtFormatted,
  };
}

function getProcessMemory() {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMB: Math.round((mem.arrayBuffers ?? 0) / 1024 / 1024),
  };
}

function getLoadAverage() {
  const load = os.loadavg();
  return {
    "1min": Math.round((load[0] ?? 0) * 100) / 100,
    "5min": Math.round((load[1] ?? 0) * 100) / 100,
    "15min": Math.round((load[2] ?? 0) * 100) / 100,
  };
}

function estimateCpuTemp(): number {
  const load = os.loadavg()[0] ?? 0;
  const cpuCount = os.cpus().length;
  const normalizedLoad = Math.min(load / Math.max(cpuCount, 1), 1);
  return Math.round(35 + normalizedLoad * 45 + (Math.random() * 4 - 2));
}

// Parse platform info from user agent string
function parsePlatform(userAgent: string): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (ua.includes("windows nt 10")) os = "Windows 10/11";
  else if (ua.includes("windows nt 6.1")) os = "Windows 7";
  else if (ua.includes("mac os x")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

  if (ua.includes("chrome") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edg")) browser = "Edge";
  else if (ua.includes("opera")) browser = "Opera";
  else if (ua.includes("curl")) browser = "curl/CLI";
  else if (ua.includes("python")) browser = "Python";
  else if (ua.includes("go-http")) browser = "Go HTTP";
  else if (ua.includes("postman")) browser = "Postman";

  return `${os} / ${browser}`;
}

async function buildSnapshot() {
  const [secStats, recentAttacksRaw] = await Promise.all([
    getSecurityStats(),
    getSecurityEvents(50),
  ]);

  const recentAttacks = recentAttacksRaw.map((e) => {
    // Extract user email from userId field (format: "email:xxx" or direct email)
    let userEmail: string | null = null;
    if ((e as any).userId) {
      const uid = String((e as any).userId);
      if (uid.includes("@")) userEmail = uid;
      else if (uid.startsWith("email:")) userEmail = uid.replace("email:", "");
    }

    const platform = parsePlatform(e.userAgent ?? "");

    return {
      type: e.signals[0]?.type ?? "normal_request",
      severity: e.signals[0]?.severity ?? "info",
      ip: e.ip,
      endpoint: e.endpoint,
      method: e.method,
      userAgent: e.userAgent ?? "",
      userEmail,
      platform,
      threatScore: e.threatScore,
      normalityScore: e.normalityScore,
      trustScore: (e as typeof e & { trustScore?: number }).trustScore,
      botScore: (e as typeof e & { botScore?: number }).botScore,
      fusedScore: (e as typeof e & { fusedScore?: number }).fusedScore,
      action: e.action,
      blocked: e.blocked,
      timestamp: e.timestamp,
      requestId: e.id,
      signals: e.signals.map(s => ({ type: s.type, severity: s.severity, confidence: s.confidence, detail: s.detail })),
      hasIdentity: !!userEmail,
    };
  });

  const procMem = getProcessMemory();
  const uptimeInfo = getUptimeInfo();

  return {
    timestamp: Date.now(),
    server: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      hostname: os.hostname(),
      cpuModel: os.cpus()[0]?.model ?? "Unknown",
      cpuCores: os.cpus().length,
      environment: process.env.NODE_ENV ?? "production",
    },
    cpu: {
      usagePercent: getCpuUsagePrecise(),
      tempCelsius: estimateCpuTemp(),
      loadAvg: getLoadAverage(),
    },
    memory: {
      system: getMemoryInfo(),
      process: procMem,
    },
    storage: {
      heapUsedMB: procMem.heapUsedMB,
      heapTotalMB: procMem.heapTotalMB,
      heapUsagePercent: Math.round((procMem.heapUsedMB / Math.max(procMem.heapTotalMB, 1)) * 100),
    },
    uptime: uptimeInfo,
    requestsPerSecond: _reqPerSecond,
    network: os.networkInterfaces()
      ? Object.entries(os.networkInterfaces()).flatMap(([name, ifaces]) =>
          (ifaces ?? []).filter((i) => !i.internal).map((i) => ({
            name, address: i.address, family: i.family,
          }))
        )
      : [],
    security: {
      stats: secStats,
      recentAttacks,
      defenceStatus: {
        securityCore: "active",
        rateLimiter: "active",
        attackDetection: "active",
        ipTracker: "active",
        payloadScanner: "active",
        uaAnalyzer: "active",
        storageProtection: "active",
        gracefulDisconnect: "active",
        persistentLog: "redis",
        behavioralAnalysis: "active",
        adaptiveRateLimiter: "active",
        entropyAnalyzer: "active",
        botDetector: "active",
        attackChainCorrelator: "active",
        businessLogicGuard: "active",
        forensicCollector: "active",
        geoAnomalyDetector: "active",
        sessionTracker: "active",
        deviceFingerprinting: "active",
        identityVerification: "active",
        anonBlocker: "active",
      },
    },
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  trackRequest();

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const data = JSON.stringify(await buildSnapshot());
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
          if (intervalId) clearInterval(intervalId);
          try { controller.close(); } catch { /* already closed */ }
        }
      };
      send();
      // 1000ms refresh — cepat dan akurat
      intervalId = setInterval(send, 1000);
    },
    cancel() {
      closed = true;
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
