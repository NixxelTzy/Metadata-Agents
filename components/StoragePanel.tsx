"use client";

import { useEffect, useState, useCallback } from "react";

interface KeyBreakdown { prefix: string; label: string; emoji: string; count: number; }
interface DbStats {
  name: string; online: boolean; error?: string;
  dbSize: number; totalKeys: number;
  usedMemoryBytes: number; usedMemoryHuman: string;
  maxMemoryBytes: number; maxMemoryHuman: string; peakMemoryHuman: string;
  usedPercent: number | null; hitRate: number | null;
  connectedClients: number; totalCommands: number; uptimeSeconds: number;
  redisVersion: string; keyBreakdown: KeyBreakdown[];
}
interface StorageData { timestamp: string; databases: DbStats[]; }

function fmtUptime(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function memColor(pct: number | null) {
  if (pct === null) return "#64748b";
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#10b981";
}

export default function StoragePanel() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/storage", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as StorageData;
      setData(json);
      setLastRefresh(new Date());
      if (!selectedDb && json.databases[0]) setSelectedDb(json.databases[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedDb]);

  useEffect(() => { fetchStats(false); }, []);
  useEffect(() => {
    const id = setInterval(() => fetchStats(true), 1500);
    return () => clearInterval(id);
  }, [fetchStats]);

  const totalKeys = data?.databases.reduce((s, d) => s + d.totalKeys, 0) ?? 0;
  const totalMemBytes = data?.databases.reduce((s, d) => s + d.usedMemoryBytes, 0) ?? 0;
  const totalMem = totalMemBytes >= 1_048_576
    ? `${(totalMemBytes / 1_048_576).toFixed(2)} MB`
    : `${(totalMemBytes / 1_024).toFixed(1)} KB`;

  const activeDb = data?.databases.find(d => d.name === selectedDb) ?? data?.databases[0] ?? null;

  return (
    <div className="pl-root">
      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">🗄️</div>
          <div>
            <div className="pl-header__title">Storage Monitor</div>
            <div className="pl-header__sub">Real-time monitoring Upstash Redis database</div>
          </div>
        </div>
        <div className="pl-header__right">
          {lastRefresh && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
              {lastRefresh.toLocaleTimeString("id-ID")}.{String(lastRefresh.getMilliseconds()).padStart(3, "0")}
            </span>
          )}
          <span className="pl-badge pl-badge--green">
            <span className="pl-badge__dot" style={{ animation: "pl-pulse-green 1.5s ease-in-out infinite" }} />
            Auto-refresh 1.5s
          </span>
          <button className="pl-btn pl-btn--ghost" onClick={() => fetchStats(false)} disabled={loading}>
            {loading ? <span className="pl-spinner" /> : "Refresh"}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Database</div>
        {(data?.databases ?? []).map(db => (
          <button
            key={db.name}
            className={`pl-sidebar__item${selectedDb === db.name ? " active" : ""}`}
            onClick={() => setSelectedDb(db.name)}
          >
            <span className="pl-sidebar__item-icon">{db.name.includes("#2") ? "🗄️" : "💾"}</span>
            <span style={{ flex: 1, textAlign: "left", fontSize: 12 }}>{db.name}</span>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: db.online ? "#4ade80" : "#ef4444",
            }} />
          </button>
        ))}

        <div className="pl-sidebar__spacer" />

        {/* Mini summary */}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
            {[
              { label: "Total Keys", value: fmtNum(totalKeys) },
              { label: "Total Memory", value: totalMem },
              { label: "DB Online", value: `${data.databases.filter(d => d.online).length}/${data.databases.length}` },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</span>
                <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="pl-content">
        {error && (
          <div className="pl-alert pl-alert--err">⚠ {error}</div>
        )}

        {loading && !data && (
          <div className="pl-empty" style={{ height: 200 }}>
            <span className="pl-spinner" style={{ width: 24, height: 24 }} />
            <span className="pl-empty__text">Memuat data storage...</span>
          </div>
        )}

        {activeDb && (
          <>
            {/* DB status card */}
            <div className="pl-card">
              <div className="pl-card__head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{activeDb.name.includes("#2") ? "🗄️" : "💾"}</span>
                  <div>
                    <div className="pl-card__title">{activeDb.name}</div>
                    <div className="pl-card__desc">Redis v{activeDb.redisVersion}</div>
                  </div>
                </div>
                <span className={`pl-badge ${activeDb.online ? "pl-badge--green" : "pl-badge--red"}`}>
                  <span className="pl-badge__dot" />
                  {activeDb.online ? "Online" : "Offline"}
                </span>
              </div>

              {activeDb.online && (
                <div className="pl-card__body">
                  {/* Memory */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
                      <label className="pl-label" style={{ margin: 0 }}>Memory Usage</label>
                      <span style={{ fontSize: 12, fontFamily: "monospace" }}>
                        <span style={{ color: memColor(activeDb.usedPercent), fontWeight: 700 }}>{activeDb.usedMemoryHuman}</span>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}> / {activeDb.maxMemoryHuman !== "0B" ? activeDb.maxMemoryHuman : "Unlimited"}</span>
                        {activeDb.usedPercent !== null && (
                          <span style={{ color: memColor(activeDb.usedPercent), marginLeft: 6 }}>({activeDb.usedPercent}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="pl-progress-track">
                      <div className="pl-progress-fill" style={{ width: `${Math.min(activeDb.usedPercent ?? 0, 100)}%`, background: memColor(activeDb.usedPercent) }} />
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Peak: {activeDb.peakMemoryHuman}</div>
                  </div>

                  {/* Stats grid */}
                  <div className="pl-cols pl-cols--3" style={{ gap: 10 }}>
                    {[
                      { label: "Total Keys",  value: fmtNum(activeDb.totalKeys) },
                      { label: "Hit Rate",    value: activeDb.hitRate !== null ? `${activeDb.hitRate}%` : "—" },
                      { label: "Commands",    value: fmtNum(activeDb.totalCommands) },
                      { label: "Clients",     value: activeDb.connectedClients },
                      { label: "Uptime",      value: fmtUptime(activeDb.uptimeSeconds) },
                      { label: "DB Size",     value: activeDb.dbSize },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: "12px 14px", borderRadius: 9,
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.28)", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", fontFamily: "monospace" }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Key breakdown */}
                  {activeDb.keyBreakdown.length > 0 && (
                    <div>
                      <label className="pl-label">Key Breakdown</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {activeDb.keyBreakdown.map(cat => {
                          const pct = activeDb.totalKeys > 0 ? (cat.count / activeDb.totalKeys) * 100 : 0;
                          return (
                            <div key={cat.prefix} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 14, width: 20, flexShrink: 0 }}>{cat.emoji}</span>
                              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</span>
                              <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: "rgba(99,102,241,0.7)", borderRadius: 999, transition: "width 0.3s" }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#e2e8f0", width: 30, textAlign: "right", flexShrink: 0 }}>{cat.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeDb.totalKeys === 0 && (
                    <div className="pl-empty" style={{ padding: "24px" }}>
                      <span className="pl-empty__icon" style={{ fontSize: 24 }}>📭</span>
                      <span className="pl-empty__text">Database kosong</span>
                    </div>
                  )}
                </div>
              )}

              {!activeDb.online && activeDb.error && (
                <div style={{ padding: "14px 20px" }}>
                  <div className="pl-alert pl-alert--err">⚠ {activeDb.error}</div>
                </div>
              )}
            </div>

            {/* All DBs summary strip */}
            {data && data.databases.length > 1 && (
              <div className="pl-stat-row">
                {data.databases.map(db => (
                  <div
                    key={db.name}
                    className="pl-stat-item"
                    style={{ cursor: "pointer", border: selectedDb === db.name ? "1px solid rgba(99,102,241,0.3)" : undefined }}
                    onClick={() => setSelectedDb(db.name)}
                  >
                    <div className="pl-stat-item__label">{db.name}</div>
                    <div className="pl-stat-item__value" style={{ fontSize: 16, color: db.online ? "#86efac" : "#fca5a5" }}>
                      {fmtNum(db.totalKeys)} keys
                    </div>
                    <div className="pl-stat-item__sub">{db.usedMemoryHuman} used</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
