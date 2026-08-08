"use client";

import { useEffect, useState } from "react";

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string;
  allowedEmails: string[];
  updatedAt: string;
}

const QUICK_REASONS = [
  "Pemeliharaan rutin & update sistem",
  "Perbaikan bug kritis",
  "Peningkatan infrastruktur server",
  "Update keamanan mendesak",
  "Pembaruan fitur baru",
];

export default function ServerShutdownPanel() {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form state
  const [title, setTitle] = useState("🔧 Server Sedang Ditutup Sementara");
  const [reason, setReason] = useState("");
  const [estimatedEnd, setEstimatedEnd] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/maintenance");
      if (res.ok) {
        const data = await res.json() as MaintenanceConfig;
        setConfig(data);
        if (data.title) setTitle(data.title);
        if (data.message) setReason(data.message);
        if (data.estimatedEnd) setEstimatedEnd(data.estimatedEnd.slice(0, 16));
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleActivate = async () => {
    if (!reason.trim()) {
      setResult({ ok: false, msg: "Alasan penutupan wajib diisi!" });
      return;
    }
    if (!confirmClose) {
      setResult({ ok: false, msg: "Centang konfirmasi terlebih dahulu sebelum menutup server." });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          title: title.trim(),
          message: reason.trim(),
          estimatedEnd: estimatedEnd ? new Date(estimatedEnd).toISOString() : undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setConfirmClose(false);
        setResult({ ok: true, msg: "✅ Server berhasil ditutup! Semua pengguna biasa tidak dapat mengakses." });
      } else {
        setResult({ ok: false, msg: data.error ?? "Gagal menutup server" });
      }
    } catch {
      setResult({ ok: false, msg: "Gagal terhubung ke server" });
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setResult({ ok: true, msg: "✅ Server kembali online! Semua pengguna dapat mengakses kembali." });
      } else {
        setResult({ ok: false, msg: data.error ?? "Gagal membuka server" });
      }
    } catch {
      setResult({ ok: false, msg: "Gagal terhubung ke server" });
    }
    setSaving(false);
  };

  const isActive = config?.enabled === true;

  return (
    <div className="uploader">
      <style>{`
        @keyframes serverPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 40px rgba(239,68,68,0.8); }
        }
        @keyframes onlinePulse {
          0%, 100% { box-shadow: 0 0 14px rgba(74,222,128,0.4); }
          50% { box-shadow: 0 0 28px rgba(74,222,128,0.7); }
        }
      `}</style>

      {/* Hero */}
      <div className="uploader__hero" style={{ marginBottom: 24 }}>
        <h2>🔌 Server Shutdown Control</h2>
        <p>
          Platform khusus admin untuk menutup akses web secara instan. Saat server ditutup, semua pengguna biasa akan melihat halaman maintenance. Admin tetap dapat mengakses semua fitur.
        </p>
      </div>

      {/* Status Card */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "20px 24px",
        borderRadius: 16,
        marginBottom: 24,
        background: isActive
          ? "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(185,28,28,0.06))"
          : "linear-gradient(135deg, rgba(74,222,128,0.1), rgba(16,185,129,0.05))",
        border: `1.5px solid ${isActive ? "rgba(239,68,68,0.35)" : "rgba(74,222,128,0.3)"}`,
        animation: isActive ? "serverPulse 2s ease-in-out infinite" : "onlinePulse 3s ease-in-out infinite",
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: isActive ? "rgba(239,68,68,0.2)" : "rgba(74,222,128,0.15)",
          border: `2px solid ${isActive ? "#ef4444" : "#4ade80"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, flexShrink: 0,
        }}>
          {isActive ? "🔴" : "🟢"}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: isActive ? "#f87171" : "#4ade80" }}>
            {isActive ? "SERVER DITUTUP — Maintenance Mode Aktif" : "SERVER ONLINE — Semua Pengguna Dapat Mengakses"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {isActive
              ? `Ditutup sejak: ${config?.updatedAt ? new Date(config.updatedAt).toLocaleString("id-ID") : "—"}`
              : "Status normal — tidak ada pembatasan akses"}
          </div>
          {isActive && config?.estimatedEnd && (
            <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 4, fontWeight: 700 }}>
              ⏰ Estimasi buka: {new Date(config.estimatedEnd).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} WIB
            </div>
          )}
        </div>

        {/* Quick open button if active */}
        {isActive && (
          <button
            onClick={handleDeactivate}
            disabled={saving}
            style={{
              marginLeft: "auto",
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: saving ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #4ade80, #16a34a)",
              color: saving ? "rgba(255,255,255,0.3)" : "#000",
              fontWeight: 800,
              fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {saving ? "⏳ Memproses..." : "🔓 Buka Server Sekarang"}
          </button>
        )}
      </div>

      {/* Current message if active */}
      {isActive && config?.message && (
        <div style={{
          padding: "14px 18px",
          borderRadius: 12,
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.2)",
          marginBottom: 24,
          fontSize: 13,
          color: "var(--text)",
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Pesan yang ditampilkan ke pengguna:
          </div>
          {config.message}
        </div>
      )}

      {/* Form: Activate Shutdown */}
      {!isActive && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
            ⚙️ Konfigurasi Penutupan Server
          </div>

          {/* Title */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
              Judul Halaman Maintenance
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Contoh: 🔧 Server Sedang Ditutup Sementara"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Reason */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
              Alasan Penutupan <span style={{ color: "#ef4444" }}>*</span>
            </label>
            {/* Quick reason chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 20,
                    border: `1px solid ${reason === r ? "#ef4444" : "var(--border)"}`,
                    background: reason === r ? "rgba(239,68,68,0.12)" : "var(--bg-secondary)",
                    color: reason === r ? "#f87171" : "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Jelaskan alasan penutupan server kepada pengguna..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${reason.trim() ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
                background: "var(--bg-secondary)",
                color: "var(--text)",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Estimated end */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
              Estimasi Selesai (Opsional)
            </label>
            <input
              type="datetime-local"
              value={estimatedEnd}
              onChange={e => setEstimatedEnd(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                fontSize: 13,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Confirmation checkbox */}
          <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={confirmClose}
              onChange={e => setConfirmClose(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#ef4444", marginTop: 1, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
              <strong style={{ color: "#f87171" }}>Saya konfirmasi</strong> — Dengan ini saya menutup akses server untuk semua pengguna biasa. Admin tetap dapat mengakses platform.
            </span>
          </label>

          {/* Result feedback */}
          {result && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: result.ok ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${result.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: result.ok ? "#4ade80" : "#f87171",
              fontSize: 13,
              fontWeight: 600,
            }}>
              {result.msg}
            </div>
          )}

          {/* Shutdown button */}
          <button
            onClick={handleActivate}
            disabled={saving || !reason.trim() || !confirmClose}
            style={{
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: saving || !reason.trim() || !confirmClose
                ? "rgba(255,255,255,0.07)"
                : "linear-gradient(135deg, #dc2626, #991b1b)",
              color: saving || !reason.trim() || !confirmClose ? "rgba(255,255,255,0.3)" : "#ffffff",
              fontWeight: 800,
              fontSize: 14,
              cursor: saving || !reason.trim() || !confirmClose ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              boxShadow: saving || !reason.trim() || !confirmClose ? "none" : "0 6px 20px rgba(220,38,38,0.4)",
            }}
          >
            {saving ? "⏳ Menutup Server..." : "🔴 Tutup Server Sekarang"}
          </button>
        </div>
      )}

      {/* If active — show reopen form */}
      {isActive && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
            ✏️ Edit Konfigurasi Maintenance
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
              Update Alasan / Pesan
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
              Update Estimasi Selesai
            </label>
            <input
              type="datetime-local"
              value={estimatedEnd}
              onChange={e => setEstimatedEnd(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                fontSize: 13,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {result && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: result.ok ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${result.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: result.ok ? "#4ade80" : "#f87171",
              fontSize: 13,
              fontWeight: 600,
            }}>
              {result.msg}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={async () => {
                setSaving(true);
                setResult(null);
                try {
                  const res = await fetch("/api/admin/maintenance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      enabled: true,
                      message: reason.trim(),
                      estimatedEnd: estimatedEnd ? new Date(estimatedEnd).toISOString() : undefined,
                    }),
                  });
                  const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
                  if (data.ok) { setConfig(data.config!); setResult({ ok: true, msg: "✅ Konfigurasi berhasil diperbarui!" }); }
                  else setResult({ ok: false, msg: data.error ?? "Gagal update" });
                } catch { setResult({ ok: false, msg: "Gagal terhubung" }); }
                setSaving(false);
              }}
              disabled={saving}
              style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              💾 Simpan Perubahan
            </button>
            <button
              onClick={handleDeactivate}
              disabled={saving}
              style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "none",
                background: saving ? "rgba(255,255,255,0.07)" : "linear-gradient(135deg, #4ade80, #16a34a)",
                color: saving ? "rgba(255,255,255,0.3)" : "#000",
                fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "⏳..." : "🔓 Buka Server"}
            </button>
          </div>
        </div>
      )}

      {/* Info box */}
      <div style={{
        marginTop: 20,
        padding: "14px 18px",
        background: "rgba(124,58,237,0.07)",
        border: "1px solid rgba(124,58,237,0.2)",
        borderRadius: 10,
        fontSize: 12,
        color: "var(--text-muted)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <div>
          <strong style={{ color: "var(--text)" }}>Cara kerja:</strong> Saat server ditutup, pengguna biasa akan melihat halaman maintenance penuh layar dengan pesan yang kamu tulis. Admin dengan email <strong style={{ color: "#a78bfa" }}>nixxeltzy@gmail.com</strong> tetap dapat mengakses semua fitur. Perubahan berlaku secara instan.
        </div>
      </div>
    </div>
  );
}
