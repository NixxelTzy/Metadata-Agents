"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    stats: { total: number; bySeverity: Record<string, number>; byType: Record<string, number>; last24h: number; lastHour: number; blocked: number; topIps: { ip: string; count: number }[] };
    recentAttacks: { type: string; severity: string; ip: string; endpoint: string; method: string; threatScore: number; action: string; blocked: boolean; timestamp: number; requestId: string; signals: { type: string; severity: string; confidence: number; detail: string }[] }[];
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

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = "overview" | "vercel" | "security" | "attacks";

export default function ServerMonitor() {
  const { data, connected, reconnectStatus, failed, manualRetry } = useSse("/api/monitor");

  const [vercel, setVercel] = useState<VercelData | null>(null);
  const [vercelLoading, setVercelLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const vercelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          <span className="mon-header__title">🖥️ Server Monitor</span>
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
        {(["overview", "vercel", "security", "attacks"] as Tab[]).map((t) => (
          <button key={t} type="button"
            className={`mon-tab ${tab === t ? "mon-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "overview" ? "📊 Overview" : t === "vercel" ? "▲ Vercel" : t === "security" ? "🛡️ Defence" : "⚠️ Attacks"}
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
            <div className="mon-section">
              <div className="mon-section__title">Defence Systems</div>
              {Object.entries(data.security.defenceStatus).map(([k, v]) => (
                <div key={k} className="mon-info-row">
                  <span>{k}</span>
                  <span className="mon-defence-badge"><StatusDot status={v} />{v}</span>
                </div>
              ))}
            </div>
            <div className="mon-section">
              <div className="mon-section__title">Security Events — Live Counter</div>
              <div className="mon-info-row"><span>Total Logged</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{data.security.stats.total}</span></div>
              <div className="mon-info-row"><span>Last 24h</span><span>{data.security.stats.last24h}</span></div>
              <div className="mon-info-row"><span>Last Hour</span><span>{data.security.stats.lastHour}</span></div>
              <div className="mon-info-row"><span style={{ color: "#dc2626" }}>🚫 Blocked</span><span style={{ color: "#dc2626", fontWeight: 700 }}>{data.security.stats.blocked}</span></div>
              {Object.entries(data.security.stats.bySeverity).map(([k, v]) => (
                <div key={k} className="mon-info-row">
                  <span style={{ color: severityColor(k === "error" ? "error" : k) }}>● {k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div className="mon-section">
              <div className="mon-section__title">Attack Types</div>
              {Object.entries(data.security.stats.byType).length === 0
                ? <div className="mon-empty">Tidak ada event tercatat</div>
                : Object.entries(data.security.stats.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                    <div key={k} className="mon-info-row">
                      <span>{k.replace(/_/g, " ")}</span><span style={{ fontWeight: 600 }}>{v}×</span>
                    </div>
                  ))}
            </div>
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
          </>
        )}

        {/* ── ATTACKS ── */}
        {tab === "attacks" && (
          <div className="mon-section">
            <div className="mon-section__title">
              Recent Attacks (Real-time)
              <span className="mon-badge">{data.security.recentAttacks.length}</span>
            </div>
            {data.security.recentAttacks.length === 0
              ? <div className="mon-empty">✓ Tidak ada serangan terdeteksi</div>
              : (
                <div className="mon-attack-list">
                  {data.security.recentAttacks.map((a) => (
                    <div key={a.requestId} className="mon-attack-item" style={{ borderLeft: `3px solid ${severityColor(a.severity)}` }}>
                      <div className="mon-attack-item__header">
                        <span className="mon-attack-item__type" style={{ color: severityColor(a.severity) }}>
                          ● {a.type.replace(/_/g, " ")}
                          {a.blocked && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 4, border: "1px solid #fecaca" }}>BLOCKED</span>}
                        </span>
                        <span className="mon-attack-item__time">{new Date(a.timestamp).toLocaleTimeString("id-ID")}</span>
                      </div>
                      <div className="mon-attack-item__detail">
                        <span>{a.method}</span>
                        <span style={{ fontFamily: "monospace" }}>{a.ip}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{a.endpoint}</span>
                        <span style={{ color: a.threatScore >= 70 ? "#dc2626" : a.threatScore >= 40 ? "#d97706" : "#6b7280", fontWeight: 600 }}>
                          score: {a.threatScore}
                        </span>
                      </div>
                      {a.signals?.length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                          {a.signals.slice(0, 3).map((s, i) => (
                            <span key={i} style={{ display: "inline-block", marginRight: 6, background: "var(--bg-secondary)", padding: "1px 5px", borderRadius: 3, border: "1px solid var(--border)" }}>
                              {s.type.replace(/_/g, " ")} ({Math.round(s.confidence * 100)}%)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

      </div>
    </div>
  );
}
