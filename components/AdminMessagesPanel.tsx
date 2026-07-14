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

export default function AdminMessagesPanel() {
  // Feedback list states
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "bug" | "feature" | "other">("all");

  // Broadcast states
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
    } catch (err) {
      console.error("Gagal mengambil data laporan admin:", err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBroadcastError("");
    setBroadcastResult(null);

    if (subject.trim().length < 3) {
      setBroadcastError("Subjek minimal 3 karakter");
      return;
    }
    if (broadcastMessage.trim().length < 5) {
      setBroadcastError("Isi pesan minimal 5 karakter");
      return;
    }

    setSendingBroadcast(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          message: broadcastMessage.trim(),
        }),
      });

      const data = await res.json() as { error?: string; successCount?: number; failureCount?: number; totalCount?: number; message?: string };
      if (!res.ok) {
        setBroadcastError(data.error || "Gagal melakukan broadcast email");
      } else {
        setBroadcastResult({
          successCount: data.successCount || 0,
          failureCount: data.failureCount || 0,
          totalCount: data.totalCount || 0,
          message: data.message || "Selesai",
        });
        // Clear input on success
        setSubject("");
        setBroadcastMessage("");
      }
    } catch (err) {
      setBroadcastError("Terjadi kesalahan koneksi");
    } finally {
      setSendingBroadcast(false);
    }
  };

  const getBadgeClass = (t: string) => {
    switch (t) {
      case "bug": return "fb-badge fb-badge--bug";
      case "feature": return "fb-badge fb-badge--feature";
      default: return "fb-badge fb-badge--other";
    }
  };

  const getLabel = (t: string) => {
    switch (t) {
      case "bug": return "🐞 Bug Report";
      case "feature": return "💡 Usulan Fitur";
      default: return "💬 Lainnya";
    }
  };

  const filteredReports = reports.filter(r => filterType === "all" || r.type === filterType);

  return (
    <div className="fb-wrapper">
      <div className="fb-grid fb-grid--admin">
        
        {/* Left Column: Email Broadcast Panel & Preview */}
        <div className="fb-admin-left">
          
          {/* Email Composer */}
          <div className="fb-card">
            <div className="fb-card__header">
              <h2 className="fb-card__title">📢 Broadcast Email ke Seluruh Pengguna</h2>
              <p className="fb-card__desc">Kirim email pengumuman atau update penting ke seluruh alamat Gmail pengguna terdaftar.</p>
            </div>

            <form onSubmit={handleBroadcast} className="fb-form">
              <div className="fb-form__group">
                <label htmlFor="bc-subject" className="fb-form__label">Subjek Email</label>
                <input
                  id="bc-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Contoh: Fitur Baru Stock AI Studio Rilis!"
                  className="fb-form__input"
                  required
                />
              </div>

              <div className="fb-form__group">
                <label htmlFor="bc-message" className="fb-form__label">Isi Pesan Email</label>
                <textarea
                  id="bc-message"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Tuliskan detail pengumuman yang ingin disampaikan..."
                  className="fb-form__textarea"
                  rows={6}
                  required
                />
              </div>

              {broadcastError && <div className="fb-alert fb-alert--error">{broadcastError}</div>}

              <button type="submit" disabled={sendingBroadcast} className="fb-btn fb-btn--primary">
                {sendingBroadcast ? (
                  <>
                    <span className="fb-spinner" />
                    Mengirim Email Massal...
                  </>
                ) : "Kirim Broadcast Email"}
              </button>
            </form>

            {/* Broadcast Results Modal / Card */}
            {broadcastResult && (
              <div className="fb-broadcast-results">
                <div className="fb-broadcast-results__title">✓ Hasil Pengiriman Broadcast</div>
                <div className="fb-stats-grid">
                  <div className="fb-stat-card">
                    <div className="fb-stat-card__num">{broadcastResult.totalCount}</div>
                    <div className="fb-stat-card__label">Total Penerima</div>
                  </div>
                  <div className="fb-stat-card fb-stat-card--success">
                    <div className="fb-stat-card__num">{broadcastResult.successCount}</div>
                    <div className="fb-stat-card__label">Berhasil Terkirim</div>
                  </div>
                  <div className="fb-stat-card fb-stat-card--error">
                    <div className="fb-stat-card__num">{broadcastResult.failureCount}</div>
                    <div className="fb-stat-card__label">Gagal / Error</div>
                  </div>
                </div>
                <p className="fb-broadcast-results__desc">{broadcastResult.message}</p>
              </div>
            )}
          </div>

          {/* live preview email design */}
          <div className="fb-card">
            <div className="fb-card__header">
              <h3 className="fb-card__title" style={{ fontSize: "14px" }}>👀 Preview Desain Email (Live)</h3>
            </div>
            
            <div className="fb-email-preview">
              <div className="fb-email-preview__header">
                <div><strong>Dari:</strong> Stock AI Studio &lt;system@stockaistudio.com&gt;</div>
                <div><strong>Kepada:</strong> semua-pengguna@gmail.com</div>
                <div><strong>Subjek:</strong> {subject || "(Tulis subjek untuk melihat)"}</div>
              </div>
              
              <div className="fb-email-preview__body">
                {/* HTML layout replicating the actual email sent */}
                <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: "100%", padding: "24px 16px", backgroundColor: "#0b0f19", border: "1px solid #1e293b", borderRadius: "12px", color: "#f3f4f6" }}>
                  <div style={{ textAlign: "center", marginBottom: "20px", borderBottom: "1px solid #1e293b", paddingBottom: "16px" }}>
                    <div style={{ width: "40px", height: "40px", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "20px", marginBottom: "8px" }}>✨</div>
                    <h1 style={{ fontSize: "18px", fontWeight: "800", color: "#ffffff", margin: "0" }}>Stock AI Studio</h1>
                    <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0 0 0" }}>Pengumuman & Update Resmi</p>
                  </div>
                  
                  <div style={{ fontSize: "13.5px", color: "#d1d5db", lineHeight: "1.7", marginBottom: "20px" }}>
                    <p style={{ margin: "0 0 12px 0", fontWeight: "500", color: "#ffffff" }}>Halo Pengguna Stock AI Studio,</p>
                    <div style={{ backgroundColor: "#111827", border: "1px solid #1f2937", borderRadius: "8px", padding: "16px", color: "#e5e7eb", minHeight: "80px", whiteSpace: "pre-wrap" }}>
                      {broadcastMessage || "Ketik isi pesan email di atas untuk melihat preview langsung..."}
                    </div>
                  </div>
                  
                  <div style={{ background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.15)", borderRadius: "6px", padding: "10px", marginBottom: "20px", textAlign: "center" }}>
                    <span style={{ fontSize: "11.5px", color: "#60a5fa", fontWeight: "500" }}>Buka aplikasi untuk melihat fitur-fitur baru lainnya!</span>
                  </div>

                  <div style={{ textAlign: "center", borderTop: "1px solid #1e293b", paddingTop: "16px", fontSize: "10px", color: "#6b7280" }}>
                    <p style={{ margin: "0 0 2px 0" }}>Email ini dikirimkan secara resmi kepada seluruh anggota terdaftar.</p>
                    <p style={{ margin: "0" }}>&copy; {new Date().getFullYear()} Stock AI Studio. Hak Cipta Dilindungi.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: User Feedback Inbox */}
        <div className="fb-admin-right">
          <div className="fb-card">
            <div className="fb-card__header fb-card__header--split">
              <div>
                <h2 className="fb-card__title">📥 Kotak Masuk Feedback Pengguna</h2>
                <p className="fb-card__desc">Pesan keluhan bug dan usulan fitur dari pengguna yang terhubung di database.</p>
              </div>
              
              {/* Filtering */}
              <div className="fb-filters">
                <button
                  type="button"
                  className={`fb-filter-btn ${filterType === "all" ? "fb-filter-btn--active" : ""}`}
                  onClick={() => setFilterType("all")}
                >
                  Semua
                </button>
                <button
                  type="button"
                  className={`fb-filter-btn ${filterType === "bug" ? "fb-filter-btn--active" : ""}`}
                  onClick={() => setFilterType("bug")}
                >
                  🐞 Bug
                </button>
                <button
                  type="button"
                  className={`fb-filter-btn ${filterType === "feature" ? "fb-filter-btn--active" : ""}`}
                  onClick={() => setFilterType("feature")}
                >
                  💡 Fitur
                </button>
                <button
                  type="button"
                  className={`fb-filter-btn ${filterType === "other" ? "fb-filter-btn--active" : ""}`}
                  onClick={() => setFilterType("other")}
                >
                  💬 Lainnya
                </button>
              </div>
            </div>

            <div className="fb-history">
              {loadingReports ? (
                <div className="fb-loading">
                  <span className="fb-spinner fb-spinner--large" />
                  <p>Memuat pesan masuk...</p>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="fb-empty">
                  <div className="fb-empty__icon">📥</div>
                  <p className="fb-empty__text">Tidak ada pesan feedback yang cocok.</p>
                </div>
              ) : (
                <div className="fb-history__list">
                  {filteredReports.map((item) => (
                    <div key={item.id} className="fb-history__item fb-history__item--admin">
                      <div className="fb-history__item-meta">
                        <span className={getBadgeClass(item.type)}>{getLabel(item.type)}</span>
                        <span className="fb-history__item-date">
                          {new Date(item.createdAt).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      
                      {/* Sender metadata */}
                      <div className="fb-sender-info">
                        <span className="fb-sender-name">👤 {item.username}</span>
                        <span className="fb-sender-email">✉ {item.email}</span>
                      </div>
                      
                      <div className="fb-history__item-body fb-history__item-body--admin">{item.message}</div>
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
