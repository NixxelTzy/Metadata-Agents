"use client";

import { useEffect, useState } from "react";
import { Bug, Lightbulb, HelpCircle, Send, History, Inbox, Bot, MessageSquare } from "lucide-react";

interface Report {
  id: string;
  type: "bug" | "feature" | "other";
  message: string;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: "bug",     label: "Bug / Error",         icon: <Bug size={16} color="#f87171" /> },
  { value: "feature", label: "Usulan Fitur",          icon: <Lightbulb size={16} color="#38bdf8" /> },
  { value: "other",   label: "Pertanyaan / Lainnya",  icon: <HelpCircle size={16} color="#94a3b8" /> },
] as const;

export default function FeedbackPanel() {
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [type, setType] = useState<"bug" | "feature" | "other">("bug");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [history, setHistory] = useState<Report[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/feedback");
      if (res.ok) {
        const data = await res.json() as { reports: Report[] };
        setHistory(data.reports || []);
      }
    } catch { /* silent */ }
    finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (message.trim().length < 5) { setError("Pesan terlalu pendek (minimal 5 karakter)"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message }),
      });
      const data = await res.json() as { error?: string; report?: Report };
      if (!res.ok) { setError(data.error ?? "Gagal mengirim laporan"); }
      else {
        setSuccess("Laporan berhasil terkirim.");
        setMessage("");
        if (data.report) setHistory(prev => [data.report!, ...prev]);
        setActiveTab("history");
      }
    } catch { setError("Terjadi kesalahan koneksi"); }
    finally { setLoading(false); }
  };

  const getTypeLabel = (t: string) => TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
  const getTypeIcon  = (t: string) => TYPE_OPTIONS.find(o => o.value === t)?.icon ?? <HelpCircle size={16} />;

  const NAV_ITEMS = [
    { key: "form",    icon: <Send size={15} color="#38bdf8" />, label: "Kirim" },
    { key: "history", icon: <History size={15} color="#38bdf8" />, label: "Riwayat" },
  ] as const;

  return (
    <div className="pl-root">
      <style>{`
        @media (max-width: 768px) {
          .pl-root { grid-template-columns: 1fr !important; grid-template-rows: 64px 1fr 56px !important; }
          .pl-sidebar { display: none !important; }
          .panel-mobile-tabs { display: flex !important; }
          .feedback-cols { grid-template-columns: 1fr !important; }
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
          border: none; background: transparent; cursor: pointer; font-family: inherit;
        }
        .panel-mobile-tab__icon { font-size: 18px; }
        .panel-mobile-tab__label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); }
        .panel-mobile-tab.active .panel-mobile-tab__label { color: #38bdf8; }
        .panel-mobile-tab.active { background: rgba(14,165,233,0.1); }
      `}</style>

      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">
            <MessageSquare size={18} color="#38bdf8" />
          </div>
          <div>
            <div className="pl-header__title">Laporan & Usulan</div>
            <div className="pl-header__sub">Kirim bug report atau usulan fitur baru</div>
          </div>
        </div>
        <div className="pl-header__right">
          <span className="pl-badge pl-badge--blue">
            <span className="pl-badge__dot" />
            {history.length} laporan
          </span>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Menu</div>
        <button
          className={`pl-sidebar__item${activeTab === "form" ? " active" : ""}`}
          onClick={() => setActiveTab("form")}
        >
          <span className="pl-sidebar__item-icon"><Send size={15} color="#38bdf8" /></span>
          Kirim Laporan
        </button>
        <button
          className={`pl-sidebar__item${activeTab === "history" ? " active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className="pl-sidebar__item-icon"><History size={15} color="#38bdf8" /></span>
          Riwayat ({history.length})
        </button>

        <div className="pl-divider" style={{ margin: "10px 0" }} />
        <div className="pl-sidebar__section-label">Tipe Laporan</div>
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`pl-sidebar__item${type === opt.value && activeTab === "form" ? " active" : ""}`}
            onClick={() => { setType(opt.value); setActiveTab("form"); }}
          >
            <span className="pl-sidebar__item-icon">{opt.icon}</span>
            {opt.label}
          </button>
        ))}

        <div className="pl-sidebar__spacer" />
        <div className="pl-sidebar__footer">
          Laporan diproses oleh tim dan dikirim via email.
        </div>
      </div>

      {/* Main Content */}
      <div className="pl-content">
        {/* Desktop: always show both columns */}
        <div className="feedback-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>

          {/* Form column — hidden on mobile when history tab active */}
          <div className="pl-card" style={{ display: activeTab === "history" ? "none" : "flex", flexDirection: "column" }}
            data-mobile-visible={activeTab === "form" ? "true" : "false"}>
            <div className="pl-card__head">
              <div>
                <div className="pl-card__title">Kirim Laporan Baru</div>
                <div className="pl-card__desc">Jelaskan detail masalah atau fitur yang diusulkan</div>
              </div>
            </div>
            <div className="pl-card__body">
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="pl-label">Tipe Laporan</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`pl-chip${type === opt.value ? " active" : ""}`}
                        onClick={() => setType(opt.value)}
                        style={{ flex: 1, justifyContent: "center", minWidth: 80 }}
                      >
                        {opt.icon} {opt.label.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="pl-label">Detail Laporan</label>
                  <textarea
                    className="pl-input"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={
                      type === "bug"     ? "Jelaskan bug yang ditemukan..."
                      : type === "feature" ? "Deskripsikan fitur yang diinginkan..."
                      : "Tulis pertanyaan Anda..."
                    }
                    rows={5}
                    style={{ resize: "vertical" }}
                  />
                </div>
                {error   && <div className="pl-alert pl-alert--err">{error}</div>}
                {success && <div className="pl-alert pl-alert--ok">{success}</div>}
                <button
                  type="submit"
                  className="pl-btn pl-btn--primary pl-btn--full"
                  disabled={loading}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {loading ? <><span className="pl-spinner" /> Mengirim...</> : "Kirim Laporan"}
                </button>
              </form>
            </div>
          </div>

          {/* History column — hidden on mobile when form tab active */}
          <div className="pl-card" style={{ display: activeTab === "form" ? "none" : "flex", flexDirection: "column" }}
            data-mobile-visible={activeTab === "history" ? "true" : "false"}>
            <div className="pl-card__head">
              <div>
                <div className="pl-card__title">Riwayat Laporan</div>
                <div className="pl-card__desc">Laporan yang telah Anda kirimkan</div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{history.length}</span>
            </div>
            <div style={{ padding: "10px 14px", flex: 1, overflowY: "auto" }}>
              {loadingHistory ? (
                <div className="pl-empty">
                  <span className="pl-spinner" style={{ width: 20, height: 20 }} />
                </div>
              ) : history.length === 0 ? (
                <div className="pl-empty">
                  <span className="pl-empty__icon"><Inbox size={28} color="#38bdf8" /></span>
                  <span className="pl-empty__text">Belum ada riwayat laporan.</span>
                </div>
              ) : (
                <div className="pl-list" style={{ maxHeight: "none" }}>
                  {history.map(item => (
                    <div key={item.id} className="pl-list-item">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, gap: 8, flexWrap: "wrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)", color: "#38bdf8",
                        }}>
                          {getTypeIcon(item.type)} {getTypeLabel(item.type)}
                        </span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                          {new Date(item.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                      <p style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>
                        {item.message}
                      </p>
                      <div style={{
                        marginTop: 7, padding: "7px 10px", borderRadius: 6,
                        background: "rgba(14,165,233,0.05)", border: "1px solid rgba(14,165,233,0.1)",
                        fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <Bot size={13} color="#38bdf8" />
                        <span>Diproses oleh AI dan dikirim ke tim via Gmail SMTP.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
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
