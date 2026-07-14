"use client";

import { useEffect, useState } from "react";

interface Report {
  id: string;
  type: "bug" | "feature" | "other";
  message: string;
  createdAt: string;
}

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
    } catch (err) {
      console.error("Gagal mengambil riwayat feedback:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (message.trim().length < 5) {
      setError("Pesan terlalu pendek (minimal 5 karakter)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message }),
      });

      const data = await res.json() as { error?: string; message?: string; report?: Report };
      if (!res.ok) {
        setError(data.error || "Gagal mengirim laporan");
      } else {
        setSuccess("Laporan Anda berhasil terkirim dan disimpan di database!");
        setMessage("");
        if (data.report) {
          setHistory(prev => [data.report!, ...prev]);
        }
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
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

  return (
    <div className="fb-wrapper">
      <div className="fb-grid">
        {/* Form Submission */}
        <div className="fb-card">
          <div className="fb-card__header">
            <h2 className="fb-card__title">Kirim Laporan & Usulan</h2>
            <p className="fb-card__desc">Bantu kami meningkatkan kualitas aplikasi. Laporkan bug atau usulkan fitur baru di bawah ini.</p>
          </div>

          <form onSubmit={handleSubmit} className="fb-form">
            <div className="fb-form__group">
              <label htmlFor="fb-type" className="fb-form__label">Tipe Laporan</label>
              <select
                id="fb-type"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="fb-form__select"
              >
                <option value="bug">🐞 Bug / Masalah Error</option>
                <option value="feature">💡 Usulan Fitur Baru</option>
                <option value="other">💬 Pertanyaan / Lainnya</option>
              </select>
            </div>

            <div className="fb-form__group">
              <label htmlFor="fb-message" className="fb-form__label">Isi Laporan / Detail Usulan</label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tuliskan secara jelas bug yang ditemukan atau deskripsi fitur yang diusulkan..."
                className="fb-form__textarea"
                rows={6}
                required
              />
            </div>

            {error && <div className="fb-alert fb-alert--error">{error}</div>}
            {success && <div className="fb-alert fb-alert--success">{success}</div>}

            <button type="submit" disabled={loading} className="fb-btn">
              {loading ? (
                <>
                  <span className="fb-spinner" />
                  Mengirim...
                </>
              ) : "Kirim Feedback"}
            </button>
          </form>
        </div>

        {/* History Panel */}
        <div className="fb-card">
          <div className="fb-card__header">
            <h2 className="fb-card__title">Riwayat Laporan Anda</h2>
            <p className="fb-card__desc">Daftar masukan yang telah Anda kirimkan sebelumnya.</p>
          </div>

          <div className="fb-history">
            {loadingHistory ? (
              <div className="fb-loading">
                <span className="fb-spinner fb-spinner--large" />
                <p>Memuat riwayat...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="fb-empty">
                <div className="fb-empty__icon">📭</div>
                <p className="fb-empty__text">Belum ada riwayat laporan yang Anda kirim.</p>
              </div>
            ) : (
              <div className="fb-history__list">
                {history.map((item) => (
                  <div key={item.id} className="fb-history__item">
                    <div className="fb-history__item-meta">
                      <span className={getBadgeClass(item.type)}>{getLabel(item.type)}</span>
                      <span className="fb-history__item-date">
                        {new Date(item.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <div className="fb-history__item-body">{item.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
