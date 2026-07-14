"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KeyBreakdown {
  prefix: string;
  label: string;
  emoji: string;
  count: number;
}

interface DbStats {
  name: string;
  online: boolean;
  error?: string;
  dbSize: number;
  totalKeys: number;
  usedMemoryBytes: number;
  usedMemoryHuman: string;
  maxMemoryBytes: number;
  maxMemoryHuman: string;
  peakMemoryHuman: string;
  usedPercent: number | null;
  hitRate: number | null;
  connectedClients: number;
  totalCommands: number;
  uptimeSeconds: number;
  redisVersion: string;
  keyBreakdown: KeyBreakdown[];
}

interface StorageData {
  timestamp: string;
  databases: DbStats[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pctColor(pct: number | null): string {
  if (pct === null) return "#64748b";
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#10b981";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ProgressBar({ value, color }: { value: number | null; color: string }) {
  const pct = Math.min(value ?? 0, 100);
  return (
    <div className="stor-bar-track">
      <div
        className="stor-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function StatBadge({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stor-stat-badge">
      <div className="stor-stat-badge__val">{value}</div>
      <div className="stor-stat-badge__lbl">{label}</div>
      {sub && <div className="stor-stat-badge__sub">{sub}</div>}
    </div>
  );
}

function DbCard({ db }: { db: DbStats }) {
  const memColor = pctColor(db.usedPercent);
  const isDb2 = db.name.includes("#2");

  return (
    <div className={`stor-card ${isDb2 ? "stor-card--secondary" : "stor-card--primary"}`}>
      {/* Header */}
      <div className="stor-card__header">
        <div className="stor-card__header-left">
          <span className="stor-card__db-icon">{isDb2 ? "🗄️" : "💾"}</span>
          <div>
            <div className="stor-card__name">{db.name}</div>
            <div className="stor-card__version">Redis v{db.redisVersion}</div>
          </div>
        </div>
        <div className={`stor-card__status ${db.online ? "stor-card__status--ok" : "stor-card__status--err"}`}>
          <span className="stor-card__status-dot" />
          {db.online ? "Online" : "Offline"}
        </div>
      </div>

      {!db.online && db.error && (
        <div className="stor-error-box">⚠️ {db.error}</div>
      )}

      {db.online && (
        <>
          {/* Memory Section */}
          <div className="stor-section">
            <div className="stor-section__title">💽 Memory Usage</div>
            <div className="stor-mem-row">
              <span className="stor-mem-used" style={{ color: memColor }}>{db.usedMemoryHuman}</span>
              <span className="stor-mem-sep">of</span>
              <span className="stor-mem-max">{db.maxMemoryHuman !== "0B" ? db.maxMemoryHuman : "Unlimited"}</span>
              {db.usedPercent !== null && (
                <span className="stor-mem-pct" style={{ color: memColor }}>({db.usedPercent}%)</span>
              )}
            </div>
            <ProgressBar value={db.usedPercent} color={memColor} />
            <div className="stor-mem-peak">Peak: {db.peakMemoryHuman}</div>
          </div>

          {/* Stats Grid */}
          <div className="stor-stats-grid">
            <StatBadge label="Total Keys" value={formatNumber(db.totalKeys)} />
            <StatBadge label="Hit Rate" value={db.hitRate !== null ? `${db.hitRate}%` : "—"} />
            <StatBadge label="Commands" value={formatNumber(db.totalCommands)} />
            <StatBadge label="Uptime" value={formatUptime(db.uptimeSeconds)} />
          </div>

          {/* Key Breakdown */}
          {db.keyBreakdown.length > 0 && (
            <div className="stor-section">
              <div className="stor-section__title">🔑 Key Breakdown</div>
              <div className="stor-keys-list">
                {db.keyBreakdown.map((cat) => {
                  const barPct = db.totalKeys > 0 ? (cat.count / db.totalKeys) * 100 : 0;
                  return (
                    <div key={cat.prefix} className="stor-key-row">
                      <span className="stor-key-emoji">{cat.emoji}</span>
                      <span className="stor-key-label">{cat.label}</span>
                      <div className="stor-key-bar-wrap">
                        <div className="stor-key-bar" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="stor-key-count">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {db.totalKeys === 0 && (
            <div className="stor-empty">
              <span>📭</span>
              <p>Database kosong — belum ada data yang tersimpan</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StoragePanel() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/storage", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as StorageData;
      setData(json);
      setLastRefresh(new Date());
      setCountdown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil data storage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Countdown timer
  useEffect(() => {
    if (loading) return;
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1_000);
    return () => clearInterval(tick);
  }, [loading]);

  const totalKeys = data?.databases.reduce((sum, db) => sum + db.totalKeys, 0) ?? 0;
  const totalMemBytes = data?.databases.reduce((sum, db) => sum + db.usedMemoryBytes, 0) ?? 0;
  const totalMemHuman = totalMemBytes > 1_048_576
    ? `${(totalMemBytes / 1_048_576).toFixed(2)} MB`
    : `${(totalMemBytes / 1_024).toFixed(1)} KB`;

  return (
    <div className="stor-panel">
      {/* Page Header */}
      <div className="stor-header">
        <div className="stor-header__left">
          <h1 className="stor-header__title">🗄️ Storage Monitor</h1>
          <p className="stor-header__sub">Real-time monitoring untuk semua Upstash Redis database</p>
        </div>
        <div className="stor-header__right">
          <button className="stor-refresh-btn" onClick={fetchStats} disabled={loading}>
            <span className={loading ? "stor-spin" : ""}>🔄</span>
            {loading ? "Loading…" : "Refresh"}
          </button>
          {!loading && lastRefresh && (
            <div className="stor-refresh-info">
              <span>Auto-refresh: <strong>{countdown}s</strong></span>
              <span className="stor-refresh-time">
                Last: {lastRefresh.toLocaleTimeString("id-ID")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      {data && !loading && (
        <div className="stor-summary">
          <div className="stor-summary__item">
            <span className="stor-summary__icon">🗃️</span>
            <div>
              <div className="stor-summary__val">{data.databases.filter(d => d.online).length}/{data.databases.length}</div>
              <div className="stor-summary__lbl">DB Online</div>
            </div>
          </div>
          <div className="stor-summary__item">
            <span className="stor-summary__icon">🔑</span>
            <div>
              <div className="stor-summary__val">{formatNumber(totalKeys)}</div>
              <div className="stor-summary__lbl">Total Keys</div>
            </div>
          </div>
          <div className="stor-summary__item">
            <span className="stor-summary__icon">💽</span>
            <div>
              <div className="stor-summary__val">{totalMemHuman}</div>
              <div className="stor-summary__lbl">Total Memory</div>
            </div>
          </div>
          <div className="stor-summary__item">
            <span className="stor-summary__icon">🕐</span>
            <div>
              <div className="stor-summary__val">{new Date(data.timestamp).toLocaleTimeString("id-ID")}</div>
              <div className="stor-summary__lbl">Snapshot At</div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="stor-error-global">
          ⚠️ {error}
          <button onClick={fetchStats} className="stor-retry-btn">Coba Lagi</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div className="stor-grid">
          {[0, 1].map((i) => (
            <div key={i} className="stor-card stor-card--skeleton">
              <div className="stor-skel stor-skel--title" />
              <div className="stor-skel stor-skel--bar" />
              <div className="stor-skel stor-skel--row" />
              <div className="stor-skel stor-skel--row" />
              <div className="stor-skel stor-skel--row stor-skel--short" />
            </div>
          ))}
        </div>
      )}

      {/* DB Cards */}
      {data && (
        <div className="stor-grid">
          {data.databases.map((db) => (
            <DbCard key={db.name} db={db} />
          ))}
        </div>
      )}
    </div>
  );
}
