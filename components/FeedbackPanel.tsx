"use client";

import { useEffect, useState } from "react";

interface Report {
  id: string;
  type: "bug" | "feature" | "other";
  message: string;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: "bug",     label: "Bug / Error",       icon: "🐛" },
  { value: "feature", label: "Usulan Fitur",       icon: "💡" },
  { value: "other",   label: "Pertanyaan / Lainnya", icon: "💬" },
] as const;

export default function FeedbackPanel() {
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
      }
    } catch { setError("Terjadi kesalahan koneksi"); }
    finally { setLoading(false); }
  };

  const getTypeLabel = (t: string) => TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
  const getTypeIcon  = (t: string) => TYPE_OPTIONS.find(o => o.value === t)?.icon ?? "💬";

  return (
    <div className="pl-root">
      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">💬</div>
          <div>
            <div className="pl-header__title">Laporan & Usulan</div>
            <div className="pl-header__sub">Kirim bug report atau usulan fitur baru</div>
          </div>
        </div>
        <div className="pl-header__right">
          <span className="pl-badge pl-badge--blue">
            <span className="pl-badge__dot" />
            {history.length} laporan terkirim
          </span>
        </div>
      </div>

      {/* Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Tipe Laporan</div>
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`pl-sidebar__item${type === opt.value ? " active" : ""}`}
            onClick={() => setType(opt.value)}
          >
            <span className="pl-sidebar__item-icon">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
        <div className="pl-sidebar__spacer" />
        <div className="pl-sidebar__footer">
          Laporan diproses oleh sistem AI dan dikirim ke tim pengembang.
        </div>
      </div>

      {/* Content */}
      <div className="pl-content">
        <div className="pl-cols">
          {/* Form */}
          <div className="pl-card">
            <div className="pl-card__head">
              <div>
                <div className="pl-card__title">Kirim Laporan Baru</div>
                <div className="pl-card__desc">Jelaskan detail masalah atau fitur yang diusulkan</div>
              </div>
            </div>
            <div className="pl-card__body">
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Type selector */}
                <div>
                  <label className="pl-label">Tipe Laporan</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`pl-chip${type === opt.value ? " active" : ""}`}
                        onClick={() => setType(opt.value)}
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="pl-label">Detail Laporan</label>
                  <textarea
                    className="pl-input"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={
                      type === "bug"
                        ? "Jelaskan bug yang ditemukan: apa yang terjadi, bagaimana mereproduksinya..."
                        : type === "feature"
                        ? "Deskripsikan fitur yang diinginkan: kegunaan, cara kerja yang diharapkan..."
                        : "Tulis pertanyaan atau catatan Anda..."
                    }
                    rows={6}
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

          {/* History */}
          <div className="pl-card" style={{ display: "flex", flexDirection: "column" }}>
            <div className="pl-card__head">
              <div>
                <div className="pl-card__title">Riwayat Laporan</div>
                <div className="pl-card__desc">Laporan yang telah Anda kirimkan sebelumnya</div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{history.length} item</span>
            </div>
            <div style={{ padding: "12px 16px", flex: 1, overflowY: "auto" }}>
              {loadingHistory ? (
                <div className="pl-empty">
                  <span className="pl-spinner" style={{ width: 20, height: 20 }} />
                  <span className="pl-empty__text">Memuat riwayat...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="pl-empty">
                  <span className="pl-empty__icon">📭</span>
                  <span className="pl-empty__text">Belum ada riwayat laporan.</span>
                </div>
              ) : (
                <div className="pl-list" style={{ maxHeight: "none" }}>
                  {history.map(item => (
                    <div key={item.id} className="pl-list-item">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 9px", borderRadius: 20,
                          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                          fontSize: 11, fontWeight: 600, color: "#a5b4fc",
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
                        marginTop: 8, padding: "8px 11px", borderRadius: 7,
                        background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)",
                        fontSize: 11.5, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 7,
                      }}>
                        <span>🤖</span>
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
    </div>
  );
}
