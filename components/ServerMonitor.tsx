"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Activity, Triangle, Shield, BarChart3, AlertTriangle, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonitorData {
  timestamp: number;
  server: { platform: string; arch: string; nodeVersion: string; hostname: string; cpuModel: string; cpuCores: number; environment: string };
  cpu: { usagePercent: number; tempCelsius: number; loadAvg: { "1min": number; "5min": number; "15min": number } };
  memory: {
    system: { totalMB: number; usedMB: number; freeMB: number; usagePercent: number };
    process: { heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number };
  };
  storage: { heapUsedMB: number; heapTotalMB: number; heapUsagePercent: number };
  uptime: { uptime: number; formatted: string };
  network: { name: string; address: string; family: string }[];
  security: {
    stats: { total: number; bySeverity: Record<string, number>; byType: Record<string, number>; last24h: number; lastHour: number; last10min: number; blocked: number; normalRequests: number; abnormalRequests: number; avgNormality: number; topIps: { ip: string; count: number }[]; storageUsed: number; storageMax: number; storagePercent: number; avgTrustScore?: number; botDetections?: number; chainAttacks?: number; promptInjections?: number; geoAnomalies?: number };
    recentAttacks: { type: string; severity: string; ip: string; endpoint: string; method: string; threatScore: number; normalityScore: number; trustScore?: number; botScore?: number; fusedScore?: number; action: string; blocked: boolean; timestamp: number; requestId: string; userEmail?: string; userAgent?: string; platform?: string; reason?: string; blockedReason?: string; signals: { type: string; severity: string; confidence: number; detail: string }[] }[];
    defenceStatus: Record<string, string>;
  };
}

interface VercelData {
  timestamp: number;
  project: { id: string; name: string; framework: string; nodeVersion: string; productionUrl: string | null; createdAt: number; updatedAt: number } | null;
  deployments: { uid: string; name: string; url: string; state: string; target: string; createdAt: number; ready: number | null }[];
  latestDeployment: { uid: string; url: string; state: string; target: string; createdAt: number } | null;
  stats: { total: number; ready: number; error: number; building: number };
  error?: string;
}

// ── SSE hook dengan exponential backoff ───────────────────────────────────────

const SSE_INITIAL_DELAY = 1_000;
const SSE_MAX_DELAY = 30_000;
const SSE_MAX_ATTEMPTS = 10;

function useSse(url: string) {
  const [data, setData] = useState<MonitorData | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<string>("");
  const [failed, setFailed] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const delayRef = useRef(SSE_INITIAL_DELAY);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const closeEs = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  };

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    closeEs();

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setReconnectStatus("");
      setFailed(false);
      attemptRef.current = 0;
      delayRef.current = SSE_INITIAL_DELAY;
    };

    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try { setData(JSON.parse(e.data as string) as MonitorData); } catch { /* ignore */ }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      closeEs();

      attemptRef.current += 1;
      const attempt = attemptRef.current;

      if (attempt > SSE_MAX_ATTEMPTS) {
        setFailed(true);
        setReconnectStatus(`Koneksi gagal setelah ${SSE_MAX_ATTEMPTS} percobaan. Klik tombol di bawah untuk mencoba lagi.`);
        return;
      }

      const delay = Math.min(SSE_INITIAL_DELAY * Math.pow(2, attempt - 1), SSE_MAX_DELAY);
      delayRef.current = delay;
      setReconnectStatus(`Reconnecting... (attempt ${attempt}/${SSE_MAX_ATTEMPTS})`);

      clearTimer();
      timerRef.current = setTimeout(connect, delay);
    };
  }, [url]);

  const manualRetry = useCallback(() => {
    attemptRef.current = 0;
    delayRef.current = SSE_INITIAL_DELAY;
    setFailed(false);
    setReconnectStatus("");
    clearTimer();
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimer();
      closeEs();
    };
  }, [connect]);

  return { data, connected, reconnectStatus, failed, manualRetry };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GlassOverlay({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(229,231,235,1)",
          borderRadius: 16,
          padding: "22px 20px",
          boxShadow: "0 10px 32px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>{title}</div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {message}
        </div>
      </div>
    </div>
  );
}


function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="mon-bar">
      <div className="mon-bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={`mon-dot ${status === "active" || status === "READY" ? "mon-dot--green" : "mon-dot--red"}`} />;
}

function severityColor(s: string) {
  if (s === "critical") return "#ef4444";
  if (s === "error")    return "#f97316";
  if (s === "warn")     return "#eab308";
  return "#6b7280";
}

function stateColor(s: string) {
  if (s === "READY")    return "#16a34a";
  if (s === "ERROR")    return "#dc2626";
  if (s === "BUILDING") return "#d97706";
  return "#6b7280";
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── Stats Tab Component ────────────────────────────────────────────────────────

type ActivityEvent = { userId: string; email: string; feature: string; timestamp: string };

function StatsTab({
  statsPeriod, setStatsPeriod, activityEvents, statsLoading, onRefresh,
}: {
  statsPeriod: "1d" | "7d" | "30d";
  setStatsPeriod: (p: "1d" | "7d" | "30d") => void;
  activityEvents: ActivityEvent[];
  statsLoading: boolean;
  onRefresh: () => void;
}) {
  const msMap = { "1d": 86400000, "7d": 7 * 86400000, "30d": 30 * 86400000 };
  const cutoff = Date.now() - msMap[statsPeriod];
  const filtered = activityEvents.filter(e => new Date(e.timestamp).getTime() >= cutoff);

  // Build day buckets based on period
  const numDays = statsPeriod === "1d" ? 24 : statsPeriod === "7d" ? 7 : 30;
  const buckets: { label: string; count: number }[] = [];

  if (statsPeriod === "1d") {
    for (let h = 0; h < 24; h++) {
      const start = new Date(); start.setHours(h, 0, 0, 0);
      const end   = new Date(); end.setHours(h, 59, 59, 999);
      const cnt = filtered.filter(e => { const t = new Date(e.timestamp).getTime(); return t >= start.getTime() && t <= end.getTime(); }).length;
      buckets.push({ label: `${String(h).padStart(2,"0")}`, count: cnt });
    }
  } else {
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const nextD = new Date(d); nextD.setDate(d.getDate() + 1);
      const cnt = filtered.filter(e => { const t = new Date(e.timestamp).getTime(); return t >= d.getTime() && t < nextD.getTime(); }).length;
      buckets.push({ label: `${d.getDate()}/${d.getMonth()+1}`, count: cnt });
    }
  }

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const uniqueUsers = new Set(filtered.map(e => e.userId)).size;
  const featureMap: Record<string, number> = {};
  filtered.forEach(e => { featureMap[e.feature] = (featureMap[e.feature] ?? 0) + 1; });
  const topFeature = Object.entries(featureMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? "—";

  // Build SVG line path
  const W = 260; const H = 60;
  const pts = buckets.map((b, i) => {
    const x = buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W;
    const y = H - (b.count / maxCount) * (H - 6);
    return { x, y, ...b };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = pts.length > 0
    ? `${pathD} L ${pts[pts.length-1]!.x.toFixed(1)} ${H} L ${pts[0]!.x.toFixed(1)} ${H} Z`
    : "";

  // Show label only for a few points
  const labelStep = Math.max(1, Math.floor(buckets.length / 6));

  return (
    <>
      {/* Chart section */}
      <div className="mon-section">
        <div className="mon-section__title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11 }}>Usage</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["1d","7d","30d"] as const).map(p => (
              <button key={p} type="button" onClick={() => setStatsPeriod(p)}
                style={{
                  padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: statsPeriod === p ? "#0ea5e9" : "rgba(14,165,233,0.08)",
                  color: statsPeriod === p ? "#fff" : "rgba(148,197,253,0.6)",
                  fontSize: 10, fontWeight: 700, fontFamily: "inherit", transition: "all 0.12s",
                }}>
                {p === "1d" ? "1H" : p === "7d" ? "7H" : "30H"}
              </button>
            ))}
            <button type="button" onClick={onRefresh}
              style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(14,165,233,0.15)", background: "transparent", color: "rgba(56,189,248,0.6)", fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>
              ↺
            </button>
          </div>
        </div>

        {statsLoading ? (
          <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(148,197,253,0.4)", fontSize: 11 }}>Memuat...</div>
        ) : filtered.length === 0 ? (
          <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(148,197,253,0.3)", fontSize: 11 }}>Belum ada data</div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* Peak value label */}
            <div style={{ position: "absolute", top: 0, right: 0, fontSize: 9, color: "#38bdf8", fontFamily: "monospace", fontWeight: 700 }}>
              peak {maxCount}
            </div>

            <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" style={{ display: "block", overflow: "visible" }}>
              <defs>
                <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Horizontal guide lines */}
              {[0, 0.5, 1].map((r, i) => (
                <line key={i}
                  x1="0" y1={6 + (1 - r) * (H - 6)}
                  x2={W} y2={6 + (1 - r) * (H - 6)}
                  stroke="rgba(14,165,233,0.07)" strokeWidth="0.5" strokeDasharray="3 3"
                />
              ))}

              {/* Area fill */}
              <path d={areaD} fill="url(#lineAreaGrad)" />

              {/* Line */}
              <path d={pathD} fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

              {/* Dots only at non-zero points */}
              {pts.filter(p => p.count > 0).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#0ea5e9" stroke="#000814" strokeWidth="1" />
              ))}

              {/* X-axis labels */}
              {pts.map((p, i) => i % labelStep === 0 && (
                <text key={i} x={p.x} y={H + 14} textAnchor="middle" fontSize="7" fill="rgba(148,197,253,0.4)">
                  {p.label}
                </text>
              ))}
            </svg>

            {/* Mini summary below chart */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(148,197,253,0.4)", marginTop: 2, fontFamily: "monospace" }}>
              <span>{filtered.length} events</span>
              <span>{uniqueUsers} users</span>
              <span>top: {topFeature}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats 2x2 grid */}
      <div className="mon-section">
        <div className="mon-section__title" style={{ fontSize: 11 }}>Statistik</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "Events", val: filtered.length, color: "#0ea5e9" },
            { label: "Users", val: uniqueUsers, color: "#38bdf8" },
            { label: "Top Feature", val: topFeature, color: "#93c5fd" },
            { label: "Period", val: statsPeriod === "1d" ? "24 jam" : statsPeriod === "7d" ? "7 hari" : "30 hari", color: "#bfdbfe" },
          ].map(s => (
            <div key={s.label} style={{
              padding: "8px 10px", borderRadius: 7,
              background: "rgba(14,165,233,0.05)", border: "1px solid rgba(14,165,233,0.1)",
            }}>
              <div style={{ fontSize: 9, color: "rgba(148,197,253,0.45)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: "monospace", lineHeight: 1 }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Realtime feed */}
      <div className="mon-section">
        <div className="mon-section__title" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#0ea5e9", display: "inline-block", animation: "mon-live 1.5s ease-in-out infinite" }} />
          Live Activity
        </div>
        {activityEvents.length === 0 ? (
          <div className="mon-empty" style={{ padding: "14px 0" }}>Belum ada aktivitas.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activityEvents.slice(0, 10).map((e, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 8px", borderRadius: 6,
                background: i === 0 ? "rgba(14,165,233,0.07)" : "transparent",
                gap: 8,
              }}>
                <span style={{ fontSize: 10, color: "#93c5fd", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.email?.split("@")[0] ?? e.userId?.slice(0,10)}
                </span>
                <span style={{
                  padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: "rgba(14,165,233,0.1)", color: "#38bdf8",
                  border: "1px solid rgba(14,165,233,0.18)", flexShrink: 0,
                }}>{e.feature}</span>
                <span style={{ fontSize: 9, color: "rgba(148,197,253,0.35)", fontFamily: "monospace", flexShrink: 0 }}>
                  {new Date(e.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = "overview" | "vercel" | "security" | "attacks" | "stats";

export default function ServerMonitor() {
  const { data, connected, reconnectStatus, failed, manualRetry } = useSse("/api/monitor");

  const [vercel, setVercel] = useState<VercelData | null>(null);
  const [vercelLoading, setVercelLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const vercelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stats tab state ──────────────────────────────────────────────────────
  const [statsPeriod, setStatsPeriod] = useState<"1d" | "7d" | "30d">("7d");
  const [activityEvents, setActivityEvents] = useState<{userId: string; email: string; feature: string; timestamp: string}[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVercel = useCallback(async () => {
    setVercelLoading(true);
    try {
      const res = await fetch("/api/monitor/vercel");
      setVercel(await res.json() as VercelData);
    } catch {
      setVercel({ timestamp: Date.now(), project: null, deployments: [], latestDeployment: null, stats: { total: 0, ready: 0, error: 0, building: 0 }, error: "Gagal memuat data Vercel" });
    } finally {
      setVercelLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVercel();
    vercelIntervalRef.current = setInterval(fetchVercel, 30_000);
    return () => { if (vercelIntervalRef.current) clearInterval(vercelIntervalRef.current); };
  }, [fetchVercel]);

  // ── Stats: fetch activity when tab === "stats" ────────────────────────────
  const fetchActivity = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/activity");
      if (res.ok) {
        const d = await res.json() as { events?: typeof activityEvents };
        if (d.events) setActivityEvents(d.events);
      }
    } catch { /* silent */ }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab !== "stats") return;
    fetchActivity();
    statsIntervalRef.current = setInterval(fetchActivity, 5_000);
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, [tab, fetchActivity]);

  // Loading / error state
  if (!data) {
    return (
      <div className="mon-panel">
        <div className="mon-loading">
          <span className="mon-spinner" />
          <span>{reconnectStatus || "Menghubungkan ke server..."}</span>
          {failed && (
            <button type="button" className="btn btn--small" style={{ marginTop: 12 }} onClick={manualRetry}>
              ↺ Coba Lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  const cpuColor  = data.cpu.usagePercent > 80 ? "#ef4444" : data.cpu.usagePercent > 60 ? "#f97316" : "#22c55e";
  const memColor  = data.memory.system.usagePercent > 85 ? "#ef4444" : data.memory.system.usagePercent > 65 ? "#f97316" : "#22c55e";
  const tempColor = data.cpu.tempCelsius > 75 ? "#ef4444" : data.cpu.tempCelsius > 60 ? "#f97316" : "#22c55e";
  const storColor = data.storage.heapUsagePercent > 85 ? "#ef4444" : data.storage.heapUsagePercent > 65 ? "#f97316" : "#22c55e";

  return (
    <div className="mon-panel">
      {/* Header */}
      <div className="mon-header">
        <div className="mon-header__left">
          <span className="mon-header__title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Radio size={16} color="#38bdf8" />
            Server Monitor
          </span>
          <span className={`mon-status ${connected ? "mon-status--ok" : "mon-status--err"}`}>
            {connected ? "● Live" : reconnectStatus ? `○ ${reconnectStatus}` : "○ Offline"}
          </span>
        </div>
        <div className="mon-header__time">{new Date(data.timestamp).toLocaleTimeString("id-ID")}</div>
      </div>

      {/* Manual retry banner */}
      {failed && (
        <div style={{ padding: "8px 12px", background: "#fef2f2", borderBottom: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#dc2626", flex: 1 }}>{reconnectStatus}</span>
          <button type="button" className="btn btn--small" onClick={manualRetry}>↺ Coba Lagi</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mon-tabs">
        {(["overview", "vercel", "security", "attacks", "stats"] as Tab[]).map((t) => (
          <button key={t} type="button"
            className={`mon-tab ${tab === t ? "mon-tab--active" : ""}`}
            onClick={() => setTab(t)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {t === "overview" && <Activity size={13} />}
            {t === "vercel" && <Triangle size={12} />}
            {t === "security" && <Shield size={13} />}
            {t === "stats" && <BarChart3 size={13} />}
            {t === "attacks" && <AlertTriangle size={13} />}
            <span>{t === "overview" ? "Overview" : t === "vercel" ? "Vercel" : t === "security" ? "Defence" : t === "stats" ? "Stats" : "Attacks"}</span>
          </button>
        ))}
      </div>

      <div className="mon-body">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="mon-section">
              <div className="mon-section__title">Server</div>
              <div className="mon-info-row"><span>Hostname</span><span>{data.server.hostname}</span></div>
              <div className="mon-info-row"><span>Platform</span><span>{data.server.platform}/{data.server.arch}</span></div>
              <div className="mon-info-row"><span>Node</span><span>{data.server.nodeVersion}</span></div>
              <div className="mon-info-row"><span>Env</span><span>{data.server.environment}</span></div>
              <div className="mon-info-row"><span>Uptime</span><span>{data.uptime.formatted}</span></div>
              <div className="mon-info-row"><span>CPU Cores</span><span>{data.server.cpuCores}</span></div>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">CPU</div>
              <div className="mon-metric">
                <div className="mon-metric__label">Usage <span style={{ color: cpuColor }}>{data.cpu.usagePercent}%</span></div>
                <MiniBar value={data.cpu.usagePercent} color={cpuColor} />
              </div>
              <div className="mon-metric">
                <div className="mon-metric__label">Suhu <span style={{ color: tempColor }}>{data.cpu.tempCelsius}°C</span></div>
                <MiniBar value={data.cpu.tempCelsius} max={100} color={tempColor} />
              </div>
              <div className="mon-info-row"><span>Load 1m</span><span>{data.cpu.loadAvg["1min"]}</span></div>
              <div className="mon-info-row"><span>Load 5m</span><span>{data.cpu.loadAvg["5min"]}</span></div>
              <div className="mon-info-row"><span>Load 15m</span><span>{data.cpu.loadAvg["15min"]}</span></div>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Memory</div>
              <div className="mon-metric">
                <div className="mon-metric__label">System <span style={{ color: memColor }}>{data.memory.system.usagePercent}%</span></div>
                <MiniBar value={data.memory.system.usagePercent} color={memColor} />
              </div>
              <div className="mon-info-row"><span>Total</span><span>{data.memory.system.totalMB} MB</span></div>
              <div className="mon-info-row"><span>Used</span><span>{data.memory.system.usedMB} MB</span></div>
              <div className="mon-info-row"><span>Free</span><span>{data.memory.system.freeMB} MB</span></div>
              <div className="mon-info-row"><span>Heap</span><span>{data.memory.process.heapUsedMB}/{data.memory.process.heapTotalMB} MB</span></div>
              <div className="mon-info-row"><span>RSS</span><span>{data.memory.process.rssMB} MB</span></div>
            </div>

            <div className="mon-section">
              <div className="mon-section__title">Storage / Heap</div>
              <div className="mon-metric">
                <div className="mon-metric__label">Heap Usage <span style={{ color: storColor }}>{data.storage.heapUsagePercent}%</span></div>
                <MiniBar value={data.storage.heapUsagePercent} color={storColor} />
              </div>
              <div className="mon-info-row"><span>Heap Used</span><span>{data.storage.heapUsedMB} MB</span></div>
              <div className="mon-info-row"><span>Heap Total</span><span>{data.storage.heapTotalMB} MB</span></div>
            </div>

            {data.network.length > 0 && (
              <div className="mon-section">
                <div className="mon-section__title">Network</div>
                {data.network.map((n, i) => (
                  <div key={i} className="mon-info-row">
                    <span>{n.name} ({n.family})</span>
                    <span>{n.address}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── VERCEL ── */}
        {tab === "vercel" && (
          <>
            {vercel?.error && (
              <div className="mon-section">
                <div className="mon-empty" style={{ color: "#dc2626" }}>
                  {vercel.error}
                  <br />
                  <small>Pastikan VERCEL_API_TOKEN dan VERCEL_PROJECT_ID sudah diset di environment variables.</small>
                </div>
              </div>
            )}
            {!vercel?.error && (
              <>
                {vercel?.project && (
                  <div className="mon-section">
                    <div className="mon-section__title">
                      ▲ Project
                      {vercelLoading && <span className="mon-badge" style={{ background: "#d97706" }}>Refreshing...</span>}
                    </div>
                    <div className="mon-info-row"><span>Name</span><span>{vercel.project.name}</span></div>
                    <div className="mon-info-row"><span>Framework</span><span>{vercel.project.framework ?? "N/A"}</span></div>
                    <div className="mon-info-row"><span>Node</span><span>{vercel.project.nodeVersion ?? "N/A"}</span></div>
                    {vercel.project.productionUrl && (
                      <div className="mon-info-row"><span>URL</span><span style={{ color: "#2563eb" }}>{vercel.project.productionUrl}</span></div>
                    )}
                    <div className="mon-info-row"><span>Updated</span><span>{timeAgo(vercel.project.updatedAt)}</span></div>
                  </div>
                )}
                {vercel?.latestDeployment && (
                  <div className="mon-section">
                    <div className="mon-section__title">Latest Deployment</div>
                    <div className="mon-info-row">
                      <span>Status</span>
                      <span style={{ color: stateColor(vercel.latestDeployment.state), fontWeight: 600 }}>
                        <StatusDot status={vercel.latestDeployment.state} /> {vercel.latestDeployment.state}
                      </span>
                    </div>
                    <div className="mon-info-row"><span>Target</span><span>{vercel.latestDeployment.target ?? "preview"}</span></div>
                    <div className="mon-info-row"><span>URL</span><span style={{ fontSize: 10 }}>{vercel.latestDeployment.url}</span></div>
                    <div className="mon-info-row"><span>Deployed</span><span>{timeAgo(vercel.latestDeployment.createdAt)}</span></div>
                  </div>
                )}
                {vercel?.stats && (
                  <div className="mon-section">
                    <div className="mon-section__title">Deployment Stats (Last 10)</div>
                    <div className="mon-info-row"><span>Total</span><span>{vercel.stats.total}</span></div>
                    <div className="mon-info-row"><span style={{ color: "#16a34a" }}>● Ready</span><span>{vercel.stats.ready}</span></div>
                    <div className="mon-info-row"><span style={{ color: "#dc2626" }}>● Error</span><span>{vercel.stats.error}</span></div>
                    <div className="mon-info-row"><span style={{ color: "#d97706" }}>● Building</span><span>{vercel.stats.building}</span></div>
                  </div>
                )}
                <div className="mon-section">
                  <div className="mon-section__title">
                    Recent Deployments
                    <button type="button" className="mon-badge" style={{ cursor: "pointer", background: "#2563eb" }} onClick={fetchVercel}>
                      ↻ Refresh
                    </button>
                  </div>
                  {(vercel?.deployments ?? []).length === 0 ? (
                    <div className="mon-empty">Tidak ada deployment data</div>
                  ) : (
                    <div className="mon-attack-list">
                      {(vercel?.deployments ?? []).map((d) => (
                        <div key={d.uid} className="mon-attack-item">
                          <div className="mon-attack-item__header">
                            <span style={{ color: stateColor(d.state), fontSize: 11, fontWeight: 600 }}>● {d.state}</span>
                            <span className="mon-attack-item__time">{timeAgo(d.createdAt)}</span>
                          </div>
                          <div className="mon-attack-item__detail">
                            <span>{d.target ?? "preview"}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.url}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── SECURITY ── */}
        {tab === "security" && (
          <>
            {/* Request Traffic Overview */}
            <div className="mon-section">
              <div className="mon-section__title">🔍 Request Traffic — Normal vs Abnormal</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Total", val: data.security.stats.total, color: "var(--text)" },
                  { label: "Last 10m", val: data.security.stats.last10min, color: "#4a90e2" },
                  { label: "Normal", val: data.security.stats.normalRequests, color: "#16a34a" },
                  { label: "Abnormal", val: data.security.stats.abnormalRequests, color: "#dc2626" },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.06em" }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: item.color, marginTop: 3, fontFamily: "monospace" }}>{item.val}</div>
                  </div>
                ))}
              </div>
              {/* Normality bar */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Avg Normality Score</span>
                  <span style={{ fontWeight: 700, color: (data.security.stats.avgNormality ?? 100) >= 80 ? "#16a34a" : (data.security.stats.avgNormality ?? 100) >= 50 ? "#d97706" : "#dc2626", fontFamily: "monospace" }}>
                    {data.security.stats.avgNormality ?? 100}%
                  </span>
                </div>
                <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${data.security.stats.avgNormality ?? 100}%`, height: "100%", background: (data.security.stats.avgNormality ?? 100) >= 80 ? "#16a34a" : (data.security.stats.avgNormality ?? 100) >= 50 ? "#d97706" : "#dc2626", transition: "width 0.4s" }} />
                </div>
              </div>
              <div className="mon-info-row"><span>Last 24h</span><span>{data.security.stats.last24h}</span></div>
              <div className="mon-info-row"><span>Last Hour</span><span>{data.security.stats.lastHour}</span></div>
              <div className="mon-info-row"><span style={{ color: "#dc2626" }}>🚫 Blocked</span><span style={{ color: "#dc2626", fontWeight: 700 }}>{data.security.stats.blocked}</span></div>
            </div>

            {/* ASI Intelligence Metrics */}
            {(data.security.stats.avgTrustScore !== undefined || data.security.stats.botDetections !== undefined) && (
              <div className="mon-section">
                <div className="mon-section__title">🧠 ASI Intelligence Metrics</div>
                {data.security.stats.avgTrustScore !== undefined && (
                  <div className="mon-info-row">
                    <span>Avg Trust Score</span>
                    <span style={{ fontWeight: 700, color: (data.security.stats.avgTrustScore ?? 50) >= 70 ? "#16a34a" : (data.security.stats.avgTrustScore ?? 50) >= 40 ? "#d97706" : "#dc2626", fontFamily: "monospace" }}>{data.security.stats.avgTrustScore}</span>
                  </div>
                )}
                {data.security.stats.botDetections !== undefined && (
                  <div className="mon-info-row"><span>🤖 Bot Detections</span><span style={{ color: (data.security.stats.botDetections ?? 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{data.security.stats.botDetections ?? 0}</span></div>
                )}
                {data.security.stats.chainAttacks !== undefined && (
                  <div className="mon-info-row"><span>⛓️ Chain Attacks</span><span style={{ color: (data.security.stats.chainAttacks ?? 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{data.security.stats.chainAttacks ?? 0}</span></div>
                )}
                {data.security.stats.promptInjections !== undefined && (
                  <div className="mon-info-row"><span>💉 Prompt Injections</span><span style={{ color: (data.security.stats.promptInjections ?? 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{data.security.stats.promptInjections ?? 0}</span></div>
                )}
                {data.security.stats.geoAnomalies !== undefined && (
                  <div className="mon-info-row"><span>🌍 Geo Anomalies</span><span style={{ color: (data.security.stats.geoAnomalies ?? 0) > 0 ? "#d97706" : "#16a34a", fontWeight: 600 }}>{data.security.stats.geoAnomalies ?? 0}</span></div>
                )}
              </div>
            )}

            {/* Storage Protection */}
            <div className="mon-section">
              <div className="mon-section__title">🗄️ Storage Protection</div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Event Log Usage</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{data.security.stats.storageUsed ?? 0}/{data.security.stats.storageMax ?? 500}</span>
                </div>
                <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${data.security.stats.storagePercent ?? 0}%`, height: "100%",
                    background: (data.security.stats.storagePercent ?? 0) >= 85 ? "#dc2626" : (data.security.stats.storagePercent ?? 0) >= 60 ? "#d97706" : "#16a34a",
                    transition: "width 0.4s"
                  }} />
                </div>
              </div>
              <div className="mon-info-row"><span>Auto-evict</span><span style={{ color: "#16a34a" }}>✓ Active (LIFO)</span></div>
              <div className="mon-info-row"><span>Event TTL</span><span>24 hours</span></div>
              <div className="mon-info-row"><span>Persistent Store</span><span style={{ color: "#4a90e2" }}>Upstash Redis</span></div>
              <div className="mon-info-row"><span>Cross-instance</span><span style={{ color: "#16a34a" }}>✓ Shared</span></div>
            </div>

            {/* Defence Systems */}
            <div className="mon-section">
              <div className="mon-section__title">🛡️ Defence Systems</div>
              {Object.entries(data.security.defenceStatus).map(([k, v]) => (
                <div key={k} className="mon-info-row">
                  <span>{k}</span>
                  <span className="mon-defence-badge">
                    <StatusDot status={v === "active" || v === "redis" ? "active" : "inactive"} />
                    {v}
                  </span>
                </div>
              ))}
            </div>

            {/* Severity breakdown */}
            <div className="mon-section">
              <div className="mon-section__title">By Severity</div>
              {Object.entries(data.security.stats.bySeverity).map(([k, v]) => (
                <div key={k} className="mon-info-row">
                  <span style={{ color: severityColor(k) }}>● {k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>

            {/* Top offending IPs */}
            {(data.security.stats.topIps?.length ?? 0) > 0 && (
              <div className="mon-section">
                <div className="mon-section__title">Top Offending IPs</div>
                {data.security.stats.topIps.map(({ ip, count }) => (
                  <div key={ip} className="mon-info-row">
                    <span style={{ fontFamily: "monospace", fontSize: 11 }}>{ip}</span>
                    <span style={{ color: "#ef4444", fontWeight: 700 }}>{count} hits</span>
                  </div>
                ))}
              </div>
            )}

            {/* Attack types */}
            <div className="mon-section">
              <div className="mon-section__title">Attack Types Detected</div>
              {Object.keys(data.security.stats.byType).length === 0
                ? <div className="mon-empty">✓ Tidak ada serangan terdeteksi</div>
                : Object.entries(data.security.stats.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                    <div key={k} className="mon-info-row">
                      <span>{k.replace(/_/g, " ")}</span>
                      <span style={{ fontWeight: 600 }}>{v}×</span>
                    </div>
                  ))}
            </div>
          </>
        )}

        {/* ── ATTACKS ── */}
        {tab === "attacks" && (
          <div className="mon-section">
            <div className="mon-section__title">
              All Requests — Real-time (Normal + Threats)
              <span className="mon-badge">{data.security.recentAttacks.length}</span>
            </div>
            {data.security.recentAttacks.length === 0
              ? <div className="mon-empty">Belum ada request masuk tercatat. Coba akses salah satu endpoint.</div>
              : (
                <div className="mon-attack-list">
                  {data.security.recentAttacks.map((a) => {
                    const normColor = (a.normalityScore ?? 100) >= 80 ? "#16a34a" : (a.normalityScore ?? 100) >= 50 ? "#d97706" : "#dc2626";
                    const normLabel = (a.normalityScore ?? 100) >= 80 ? "Normal" : (a.normalityScore ?? 100) >= 50 ? "Suspicious" : "Attack";
                    return (
                      <div key={a.requestId} className="mon-attack-item" style={{ borderLeft: `3px solid ${severityColor(a.severity)}` }}>
                        <div className="mon-attack-item__header">
                          <span className="mon-attack-item__type" style={{ color: severityColor(a.severity) }}>
                            ● {a.type.replace(/_/g, " ")}
                            {a.blocked && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef2f2", color: "#dc2626", padding: "1px 5px", borderRadius: 3, border: "1px solid #fecaca" }}>BLOCKED</span>}
                          </span>
                          <span className="mon-attack-item__time">{new Date(a.timestamp).toLocaleTimeString("id-ID")}</span>
                        </div>
                        <div className="mon-attack-item__detail">
                          <span style={{ fontWeight: 600 }}>{a.method}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10 }}>{a.ip}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{a.endpoint}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
                          {/* Threat score */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border)" }}>
                            <span style={{ color: "var(--text-muted)" }}>threat</span>
                            <span style={{ fontWeight: 700, color: a.threatScore >= 70 ? "#dc2626" : a.threatScore >= 40 ? "#d97706" : "#6b7280", fontFamily: "monospace" }}>{a.threatScore}</span>
                          </div>
                          {/* Trust score */}
                          {a.trustScore !== undefined && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, background: `${a.trustScore >= 70 ? "#16a34a" : a.trustScore >= 40 ? "#d97706" : "#dc2626"}18`, padding: "2px 7px", borderRadius: 4, border: `1px solid ${a.trustScore >= 70 ? "#16a34a" : a.trustScore >= 40 ? "#d97706" : "#dc2626"}40` }}>
                              <span style={{ color: "var(--text-muted)" }}>trust</span>
                              <span style={{ fontWeight: 700, color: a.trustScore >= 70 ? "#16a34a" : a.trustScore >= 40 ? "#d97706" : "#dc2626", fontFamily: "monospace" }}>{a.trustScore}</span>
                            </div>
                          )}
                          {/* Fused score */}
                          {a.fusedScore !== undefined && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border)" }}>
                              <span style={{ color: "var(--text-muted)" }}>fused</span>
                              <span style={{ fontWeight: 700, color: a.fusedScore >= 60 ? "#dc2626" : a.fusedScore >= 40 ? "#d97706" : "#6b7280", fontFamily: "monospace" }}>{a.fusedScore}</span>
                            </div>
                          )}
                          {/* Normality score */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, background: `${normColor}12`, padding: "2px 7px", borderRadius: 4, border: `1px solid ${normColor}40` }}>
                            <span style={{ color: normColor, fontWeight: 700 }}>{normLabel}</span>
                            <span style={{ color: normColor, fontFamily: "monospace", fontWeight: 700 }}>{a.normalityScore ?? 100}%</span>
                          </div>
                        </div>
                        {a.signals?.length > 0 && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {a.signals.slice(0, 4).map((s, i) => (
                              <span key={i} style={{ background: "var(--bg-secondary)", padding: "1px 6px", borderRadius: 3, border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                                {s.type.replace(/_/g, " ")} <span style={{ opacity: 0.7 }}>({Math.round(s.confidence * 100)}%)</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          <StatsTab
            statsPeriod={statsPeriod}
            setStatsPeriod={setStatsPeriod}
            activityEvents={activityEvents}
            statsLoading={statsLoading}
            onRefresh={fetchActivity}
          />
        )}

      </div>
    </div>
  );
}
