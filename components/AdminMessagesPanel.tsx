"use client";

import { useEffect, useState } from "react";

interface Report {
  id: string;
  userId: string;
  email: string;
  username: string;
  type: "bug" | "feature" | "other";
  message: string;
  createdAt: string;
}

interface BroadcastResult {
  successCount: number;
  failureCount: number;
  totalCount: number;
  message: string;
}

const TYPE_FILTERS = [
  { value: "all",     label: "Semua" },
  { value: "bug",     label: "Bug" },
  { value: "feature", label: "Fitur" },
  { value: "other",   label: "Lainnya" },
] as const;

export default function AdminMessagesPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "bug" | "feature" | "other">("all");
  const [activeTab, setActiveTab] = useState<"inbox" | "broadcast">("inbox");

  const [subject, setSubject] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastError, setBroadcastError] = useState("");

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/admin/messages");
      if (res.ok) {
        const data = await res.json() as { reports: Report[] };
        setReports(data.reports || []);
      }
    } catch { /* silent */ }
    finally { setLoadingReports(false); }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBroadcastError(""); setBroadcastResult(null);
    if (subject.trim().length < 3) { setBroadcastError("Subjek minimal 3 karakter"); return; }
    if (broadcastMessage.trim().length < 5) { setBroadcastError("Isi pesan minimal 5 karakter"); return; }
    setSendingBroadcast(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: broadcastMessage.trim() }),
      });
      const data = await res.json() as { error?: string; successCount?: number; failureCount?: number; totalCount?: number; message?: string };
      if (!res.ok) { setBroadcastError(data.error ?? "Gagal broadcast"); }
      else {
        setBroadcastResult({ successCount: data.successCount ?? 0, failureCount: data.failureCount ?? 0, totalCount: data.totalCount ?? 0, message: data.message ?? "Selesai" });
        setSubject(""); setBroadcastMessage("");
      }
    } catch { setBroadcastError("Terjadi kesalahan koneksi"); }
    finally { setSendingBroadcast(false); }
  };

  const typeIcon  = (t: string) => ({ bug: "🐛", feature: "💡", other: "💬" }[t] ?? "💬");
  const typeColor = (t: string) => ({ bug: "#fca5a5", feature: "#fde68a", other: "#a5b4fc" }[t] ?? "#a5b4fc");
  const typeBg    = (t: string) => ({ bug: "rgba(239,68,68,0.08)", feature: "rgba(245,158,11,0.08)", other: "rgba(99,102,241,0.08)" }[t] ?? "rgba(99,102,241,0.08)");
  const typeBorder= (t: string) => ({ bug: "rgba(239,68,68,0.2)", feature: "rgba(245,158,11,0.2)", other: "rgba(99,102,241,0.2)" }[t] ?? "rgba(99,102,241,0.2)");

  const filtered = reports.filter(r => filterType === "all" || r.type === filterType);

  const NAV_ITEMS = [
    { key: "inbox",     icon: "📥", label: "Inbox" },
    { key: "broadcast", icon: "📢", label: "Broadcast" },
  ] as const;

  return (
    <div className="pl-root">
      <style>{`
        /* Mobile tab bar for panels */
        @media (max-width: 768px) {
          .pl-root { grid-template-columns: 1fr !important; grid-template-rows: 64px 1fr 56px !important; }
          .pl-sidebar { display: none !important; }
          .panel-mobile-tabs { display: flex !important; }
        }
        .panel-mobile-tabs {
          display: none;
          grid-column: 1 / -1;
          grid-row: 3;
          border-top: 1px solid rgba(0,120,255,0.15);
          background: rgba(0,15,40,0.88);
          backdrop-filter: blur(20px);
        }
        .panel-mobile-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 3px; padding: 8px 4px;
          border: none; background: transparent; cursor: pointer;
          font-family: inherit;
        }
        .panel-mobile-tab__icon { font-size: 18px; }
        .panel-mobile-tab__label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); }
        .panel-mobile-tab.active .panel-mobile-tab__label { color: #38bdf8; }
        .panel-mobile-tab.active { background: rgba(14,165,233,0.1); }
      `}</style>

      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">📬</div>
          <div>
            <div className="pl-header__title">Pesan & Broadcast</div>
            <div className="pl-header__sub">Inbox feedback pengguna dan pengiriman email massal</div>
          </div>
        </div>
        <div className="pl-header__right">
          <span className="pl-badge pl-badge--blue">
            <span className="pl-badge__dot" />
            {reports.length} pesan
          </span>
          <button className="pl-btn pl-btn--ghost" onClick={fetchReports} disabled={loadingReports}>
            {loadingReports ? <span className="pl-spinner" /> : "Refresh"}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Menu</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            className={`pl-sidebar__item${activeTab === item.key ? " active" : ""}`}
            onClick={() => setActiveTab(item.key)}
          >
            <span className="pl-sidebar__item-icon">{item.icon}</span>
            {item.label === "Inbox" ? `Inbox (${reports.length})` : item.label}
          </button>
        ))}

        {activeTab === "inbox" && (
          <>
            <div className="pl-divider" style={{ margin: "10px 0" }} />
            <div className="pl-sidebar__section-label">Filter</div>
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                className={`pl-sidebar__item${filterType === f.value ? " active" : ""}`}
                onClick={() => setFilterType(f.value)}
              >
                <span className="pl-sidebar__item-icon">
                  {f.value === "all" ? "◉" : typeIcon(f.value)}
                </span>
                {f.label}
                {f.value !== "all" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    {reports.filter(r => r.type === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        <div className="pl-sidebar__spacer" />
        <div className="pl-sidebar__footer">
          Broadcast dikirim ke semua email terdaftar via Gmail SMTP.
        </div>
      </div>

      {/* Main Content */}
      <div className="pl-content">
        {activeTab === "inbox" ? (
          <>
            {/* Mobile filter chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.value}
                  className={`pl-chip${filterType === f.value ? " active" : ""}`}
                  onClick={() => setFilterType(f.value)}
                  style={{ fontSize: 11 }}
                >
                  {f.value === "all" ? f.label : `${typeIcon(f.value)} ${f.label} (${reports.filter(r => r.type === f.value).length})`}
                </button>
              ))}
            </div>

            {/* Stats strip */}
            <div className="pl-stat-row">
              {[
                { label: "Total",   value: reports.length,                                    sub: "Semua" },
                { label: "Bug",     value: reports.filter(r => r.type === "bug").length,     sub: "Laporan bug" },
                { label: "Fitur",   value: reports.filter(r => r.type === "feature").length, sub: "Usulan" },
              ].map(s => (
                <div key={s.label} className="pl-stat-item">
                  <div className="pl-stat-item__label">{s.label}</div>
                  <div className="pl-stat-item__value">{s.value}</div>
                  <div className="pl-stat-item__sub">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* List */}
            <div className="pl-card">
              <div className="pl-card__head">
                <div className="pl-card__title">
                  {filterType === "all" ? "Semua Laporan" : `Laporan: ${TYPE_FILTERS.find(f => f.value === filterType)?.label}`}
                </div>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{filtered.length} item</span>
              </div>
              <div style={{ padding: "10px 14px" }}>
                {loadingReports ? (
                  <div className="pl-empty"><span className="pl-spinner" style={{ width: 20, height: 20 }} /></div>
                ) : filtered.length === 0 ? (
                  <div className="pl-empty">
                    <span className="pl-empty__icon">📥</span>
                    <span className="pl-empty__text">Tidak ada pesan.</span>
                  </div>
                ) : (
                  <div className="pl-list">
                    {filtered.map(item => (
                      <div key={item.id} className="pl-list-item">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: typeBg(item.type), border: `1px solid ${typeBorder(item.type)}`, color: typeColor(item.type) }}>
                              {typeIcon(item.type)} {item.type === "bug" ? "Bug" : item.type === "feature" ? "Fitur" : "Lainnya"}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{item.username}</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{item.email}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                            {new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>{item.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Broadcast tab */
          <div className="pl-cols">
            {/* Composer */}
            <div className="pl-card">
              <div className="pl-card__head">
                <div>
                  <div className="pl-card__title">Broadcast Email</div>
                  <div className="pl-card__desc">Kirim pengumuman ke seluruh pengguna terdaftar</div>
                </div>
              </div>
              <div className="pl-card__body">
                <form onSubmit={handleBroadcast} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label className="pl-label">Subjek Email</label>
                    <input className="pl-input" type="text" value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="Contoh: Pembaruan Fitur Stock AI Studio" />
                  </div>
                  <div>
                    <label className="pl-label">Isi Pesan</label>
                    <textarea className="pl-input" value={broadcastMessage}
                      onChange={e => setBroadcastMessage(e.target.value)}
                      placeholder="Tuliskan detail pengumuman..."
                      rows={6} style={{ resize: "vertical" }} />
                  </div>
                  {broadcastError && <div className="pl-alert pl-alert--err">{broadcastError}</div>}
                  {broadcastResult && (
                    <div className="pl-alert pl-alert--ok">
                      <div style={{ fontWeight: 700, marginBottom: 5 }}>Broadcast selesai</div>
                      <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
                        <span>Total: <strong>{broadcastResult.totalCount}</strong></span>
                        <span style={{ color: "#86efac" }}>Berhasil: <strong>{broadcastResult.successCount}</strong></span>
                        {broadcastResult.failureCount > 0 && <span style={{ color: "#fca5a5" }}>Gagal: <strong>{broadcastResult.failureCount}</strong></span>}
                      </div>
                    </div>
                  )}
                  <button type="submit" className="pl-btn pl-btn--primary pl-btn--full"
                    disabled={sendingBroadcast}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {sendingBroadcast ? <><span className="pl-spinner" /> Mengirim...</> : "Kirim Broadcast"}
                  </button>
                </form>
              </div>
            </div>

            {/* Live preview */}
            <div className="pl-card">
              <div className="pl-card__head"><div className="pl-card__title">Preview Email</div></div>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span><strong style={{ color: "rgba(255,255,255,0.5)" }}>Dari:</strong> Stock AI Studio</span>
                  <span><strong style={{ color: "rgba(255,255,255,0.5)" }}>Subjek:</strong> {subject || <em style={{ opacity: 0.4 }}>tulis subjek...</em>}</span>
                </div>
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", background: "#0b0f19", fontFamily: "system-ui, sans-serif" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>✨ Stock AI Studio</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Pengumuman Resmi</div>
                  </div>
                  <div style={{ padding: "14px 16px", fontSize: 12.5, color: "#d1d5db", lineHeight: 1.7 }}>
                    <p style={{ fontWeight: 600, color: "#fff", marginBottom: 8 }}>Halo Pengguna,</p>
                    <div style={{ background: "#111827", borderRadius: 6, padding: 12, minHeight: 50, whiteSpace: "pre-wrap", color: "#e5e7eb", fontSize: 12 }}>
                      {broadcastMessage || <span style={{ opacity: 0.3 }}>Ketik isi pesan...</span>}
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center", fontSize: 10, color: "#4b5563" }}>
                    © {new Date().getFullYear()} Stock AI Studio
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="panel-mobile-tabs">
        {NAV_ITEMS.map(item => (
          <button key={item.key} type="button"
            className={`panel-mobile-tab${activeTab === item.key ? " active" : ""}`}
            onClick={() => setActiveTab(item.key)}>
            <span className="panel-mobile-tab__icon">{item.icon}</span>
            <span className="panel-mobile-tab__label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
