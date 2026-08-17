"use client";

import { useEffect, useState } from "react";
import { Megaphone, Mail, Bug, Lightbulb, MessageSquare, Send, Inbox, Filter, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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

  const renderTypeIcon = (t: string) => {
    if (t === "bug") return <Bug size={14} color="#f87171" />;
    if (t === "feature") return <Lightbulb size={14} color="#fbbf24" />;
    return <MessageSquare size={14} color="#38bdf8" />;
  };

  const typeColor = (t: string) => ({ bug: "#fca5a5", feature: "#fde68a", other: "#bae6fd" }[t] ?? "#bae6fd");
  const typeBg    = (t: string) => ({ bug: "rgba(239,68,68,0.1)", feature: "rgba(245,158,11,0.1)", other: "rgba(56,189,248,0.1)" }[t] ?? "rgba(56,189,248,0.1)");
  const typeBorder= (t: string) => ({ bug: "rgba(239,68,68,0.25)", feature: "rgba(245,158,11,0.25)", other: "rgba(56,189,248,0.25)" }[t] ?? "rgba(56,189,248,0.25)");

  const filtered = reports.filter(r => filterType === "all" || r.type === filterType);

  return (
    <div className="pl-root">
      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">
            <Megaphone size={18} color="#38bdf8" />
          </div>
          <div>
            <div className="pl-header__title">Pesan &amp; Broadcast</div>
            <div className="pl-header__sub">Inbox feedback pengguna dan pengiriman email massal</div>
          </div>
        </div>
        <div className="pl-header__right">
          <span className="pl-badge pl-badge--blue">
            <span className="pl-badge__dot" />
            {reports.length} pesan
          </span>
          <button className="pl-btn pl-btn--ghost" onClick={fetchReports} disabled={loadingReports} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={13} className={loadingReports ? "pl-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Menu</div>
        <button
          className={`pl-sidebar__item${activeTab === "inbox" ? " active" : ""}`}
          onClick={() => setActiveTab("inbox")}
        >
          <span className="pl-sidebar__item-icon"><Inbox size={15} color="#38bdf8" /></span>
          Inbox ({reports.length})
        </button>
        <button
          className={`pl-sidebar__item${activeTab === "broadcast" ? " active" : ""}`}
          onClick={() => setActiveTab("broadcast")}
        >
          <span className="pl-sidebar__item-icon"><Send size={15} color="#38bdf8" /></span>
          Broadcast Email
        </button>

        {activeTab === "inbox" && (
          <>
            <div className="pl-divider" style={{ margin: "10px 0" }} />
            <div className="pl-sidebar__section-label">Filter Tipe</div>
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                className={`pl-sidebar__item${filterType === f.value ? " active" : ""}`}
                onClick={() => setFilterType(f.value)}
              >
                <span className="pl-sidebar__item-icon">
                  {f.value === "all" ? <Filter size={13} /> : renderTypeIcon(f.value)}
                </span>
                {f.label}
                {f.value !== "all" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
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
            {/* Stats strip */}
            <div className="pl-stat-row">
              <div className="pl-stat-item">
                <div className="pl-stat-item__label">Total Pesan</div>
                <div className="pl-stat-item__value">{reports.length}</div>
              </div>
              <div className="pl-stat-item">
                <div className="pl-stat-item__label">Bug Report</div>
                <div className="pl-stat-item__value" style={{ color: "#fca5a5" }}>
                  {reports.filter(r => r.type === "bug").length}
                </div>
              </div>
              <div className="pl-stat-item">
                <div className="pl-stat-item__label">Usulan Fitur</div>
                <div className="pl-stat-item__value" style={{ color: "#fde68a" }}>
                  {reports.filter(r => r.type === "feature").length}
                </div>
              </div>
              <div className="pl-stat-item">
                <div className="pl-stat-item__label">Lainnya</div>
                <div className="pl-stat-item__value" style={{ color: "#bae6fd" }}>
                  {reports.filter(r => r.type === "other").length}
                </div>
              </div>
            </div>

            {/* List card */}
            <div className="pl-card">
              <div className="pl-card__head">
                <div>
                  <div className="pl-card__title">
                    {filterType === "all" ? "Semua Pesan Masuk" : `Pesan: ${filterType}`}
                  </div>
                  <div className="pl-card__desc">Menampilkan {filtered.length} dari {reports.length} pesan</div>
                </div>
              </div>

              {loadingReports ? (
                <div className="pl-empty">
                  <span className="pl-spinner" style={{ width: 24, height: 24 }} />
                  <span className="pl-empty__text">Memuat pesan...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="pl-empty">
                  <span className="pl-empty__icon"><Inbox size={32} color="#38bdf8" /></span>
                  <span className="pl-empty__text">Tidak ada pesan yang cocok dengan filter ini.</span>
                </div>
              ) : (
                <div className="pl-list" style={{ maxHeight: "none" }}>
                  {filtered.map(r => (
                    <div key={r.id} className="pl-list-item">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: typeBg(r.type), border: `1px solid ${typeBorder(r.type)}`,
                            color: typeColor(r.type), textTransform: "capitalize",
                          }}>
                            {renderTypeIcon(r.type)} {r.type}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>
                            {r.username || "Anonim"}
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                            ({r.email})
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                          {new Date(r.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                        {r.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Broadcast form */
          <div className="pl-card" style={{ maxWidth: 680 }}>
            <div className="pl-card__head">
              <div>
                <div className="pl-card__title">Kirim Broadcast Massal</div>
                <div className="pl-card__desc">
                  Kirim email notifikasi ke semua pengguna yang terdaftar di database
                </div>
              </div>
            </div>
            <div className="pl-card__body">
              <form onSubmit={handleBroadcast} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="pl-label">Subjek Email</label>
                  <input
                    type="text"
                    className="pl-input"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Contoh: Pembaruan Sistem & Fitur Baru Stock AI Studio"
                  />
                </div>
                <div>
                  <label className="pl-label">Isi Pesan Broadcast</label>
                  <textarea
                    className="pl-input"
                    value={broadcastMessage}
                    onChange={e => setBroadcastMessage(e.target.value)}
                    placeholder="Tulis pesan lengkap yang akan dikirimkan ke semua email pengguna..."
                    rows={6}
                    style={{ resize: "vertical" }}
                  />
                </div>

                {broadcastError && (
                  <div className="pl-alert pl-alert--err" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={15} />
                    {broadcastError}
                  </div>
                )}
                {broadcastResult && (
                  <div className="pl-alert pl-alert--ok" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={15} />
                    <div>
                      <div>{broadcastResult.message}</div>
                      <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>
                        Berhasil: {broadcastResult.successCount} / Gagal: {broadcastResult.failureCount} dari {broadcastResult.totalCount} total
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="pl-btn pl-btn--primary pl-btn--full"
                  disabled={sendingBroadcast}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {sendingBroadcast ? (
                    <><span className="pl-spinner" /> Mengirim Broadcast...</>
                  ) : (
                    <><Send size={15} /> Kirim ke Semua Pengguna</>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
