"use client";

import { useEffect, useState } from "react";
import { Power, ShieldAlert, CheckCircle2, Clock, Info, AlertTriangle, RefreshCw, Layers } from "lucide-react";

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
  "Perbaikan bug kritis & keamanan",
  "Peningkatan infrastruktur server & database",
  "Update fitur & optimasi performa",
];

export default function ServerShutdownPanel() {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [title, setTitle] = useState("Server Sedang Dalam Pemeliharaan");
  const [reason, setReason] = useState("Pemeliharaan rutin & update sistem");
  const [estimatedEnd, setEstimatedEnd] = useState("");

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

  useEffect(() => { fetchConfig(); }, []);

  const handleActivate = async () => {
    setSaving(true); setResult(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          title: title.trim() || "Server Sedang Dalam Pemeliharaan",
          message: reason.trim() || "Pemeliharaan rutin & update sistem",
          estimatedEnd: estimatedEnd ? new Date(estimatedEnd).toISOString() : undefined
        }),
      });
      const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setResult({ ok: true, msg: "Akses server berhasil DITUTUP. Pengguna biasa dialihkan ke halaman maintenance." });
      } else {
        setResult({ ok: false, msg: data.error ?? "Gagal menutup server" });
      }
    } catch {
      setResult({ ok: false, msg: "Gagal terhubung ke server" });
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    setSaving(true); setResult(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setResult({ ok: true, msg: "Server KEMBALI ONLINE. Semua pengguna dapat mengakses platform dengan normal." });
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
    <div style={{
      maxWidth: 960,
      margin: "0 auto",
      padding: "24px 18px 60px",
      fontFamily: "var(--font)",
    }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 999, fontSize: 11, fontWeight: 800, color: "#fca5a5", marginBottom: 8 }}>
            <ShieldAlert size={13} />
            <span>Kontrol Darurat &amp; Hak Akses Server</span>
          </div>
          <h1 style={{ fontSize: "clamp(22px, 3.5vw, 28px)", fontWeight: 800, color: "#f0f8ff", letterSpacing: "-0.02em", marginBottom: 6 }}>
            Server Shutdown &amp; Maintenance Control
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 620 }}>
            Tutup akses publik ke seluruh website saat perbaikan mendesak. Pengguna biasa akan melihat halaman pemeliharaan, sementara email administrator tetap dapat mengakses dengan bypass otomatis.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchConfig}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            color: "#bae6fd",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          <span>Segarkan Status</span>
        </button>
      </div>

      {/* ── Status Feedback Alert ── */}
      {result && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          borderRadius: 12,
          marginBottom: 20,
          background: result.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${result.ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
          color: result.ok ? "#86efac" : "#fca5a5",
          fontSize: 13,
          fontWeight: 700
        }}>
          {result.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{result.msg}</span>
        </div>
      )}

      {/* ── MAIN EMERGENCY ACTION CARD ── */}
      <div style={{
        padding: "24px 22px",
        borderRadius: 18,
        background: isActive
          ? "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(153,27,27,0.12) 100%)"
          : "linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(34,197,94,0.08) 100%)",
        border: `1.5px solid ${isActive ? "rgba(239,68,68,0.4)" : "rgba(56,189,248,0.35)"}`,
        boxShadow: isActive ? "0 8px 32px rgba(239,68,68,0.25)" : "0 8px 32px rgba(14,165,233,0.15)",
        marginBottom: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: isActive ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.2)",
              border: `1px solid ${isActive ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.4)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isActive ? "0 0 20px rgba(239,68,68,0.4)" : "0 0 20px rgba(34,197,94,0.3)",
              flexShrink: 0
            }}>
              <Power size={26} color={isActive ? "#f87171" : "#4ade80"} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: isActive ? "#fca5a5" : "#86efac" }}>
                Status Sistem Saat Ini
              </div>
              <div style={{ fontSize: "clamp(18px, 3.5vw, 24px)", fontWeight: 900, color: "#f0f8ff", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                    background: isActive ? "#ef4444" : "#22c55e",
                    boxShadow: isActive ? "0 0 12px rgba(239,68,68,0.7)" : "0 0 12px rgba(34,197,94,0.7)",
                  }} />
                  {isActive ? "SERVER DITUTUP — Maintenance Aktif" : "SERVER ONLINE — Akses Publik Terbuka"}
                </div>
            </div>
          </div>
        </div>

        {/* Big Action Button */}
        {isActive ? (
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 14, lineHeight: 1.5 }}>
              Server saat ini sedang ditutup untuk umum. Klik tombol hijau di bawah ini untuk membuka akses kembali secara instan.
            </div>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={saving}
              style={{
                width: "100%",
                padding: "16px 24px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "white",
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "0.02em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: saving ? "wait" : "pointer",
                boxShadow: "0 6px 24px rgba(16,185,129,0.4)",
                transition: "all 0.18s ease"
              }}
            >
              <Power size={20} />
              <span>{saving ? "Membuka Server..." : "BUKA KEMBALI AKSES SERVER SEKARANG"}</span>
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 14, lineHeight: 1.5 }}>
              Klik tombol merah di bawah ini untuk mengaktifkan mode maintenance dan menutup akses bagi pengguna umum.
            </div>
            <button
              type="button"
              onClick={handleActivate}
              disabled={saving}
              style={{
                width: "100%",
                padding: "16px 24px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "white",
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "0.02em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: saving ? "wait" : "pointer",
                boxShadow: "0 6px 24px rgba(239,68,68,0.45)",
                transition: "all 0.18s ease"
              }}
            >
              <Power size={20} />
              <span>{saving ? "Menutup Akses Server..." : "TUTUP AKSES SERVER SEKARANG (MODE MAINTENANCE)"}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Configuration Form (Reason & Estimated Time) ── */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "22px",
        marginBottom: 24
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f8ff", marginBottom: 4 }}>
          Pesan &amp; Informasi Halaman Pemeliharaan
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 18 }}>
          Informasi ini akan ditampilkan kepada pengguna ketika mereka mencoba membuka website saat maintenance.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>
              Judul Banner Maintenance
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Server Sedang Dalam Pemeliharaan"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(0,10,30,0.6)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#f0f8ff",
                fontSize: 13,
                outline: "none"
              }}
            />
          </div>

          {/* Quick Reasons */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8 }}>
              Pilih Alasan Cepat
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: reason === r ? "rgba(14,165,233,0.25)" : "rgba(255,255,255,0.04)",
                    border: reason === r ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                    color: reason === r ? "#38bdf8" : "rgba(255,255,255,0.7)",
                    transition: "all 0.15s ease"
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Reason Textarea */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>
              Deskripsi / Pesan Lengkap
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Tuliskan pesan penjelasan untuk pengguna..."
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(0,10,30,0.6)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#f0f8ff",
                fontSize: 13,
                outline: "none",
                resize: "vertical"
              }}
            />
          </div>

          {/* Estimated End Time */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>
              Estimasi Selesai (Opsional)
            </label>
            <input
              type="datetime-local"
              value={estimatedEnd}
              onChange={e => setEstimatedEnd(e.target.value)}
              style={{
                padding: "10px 14px",
                background: "rgba(0,10,30,0.6)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#f0f8ff",
                fontSize: 13,
                outline: "none"
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Admin Bypass Info ── */}
      <div style={{
        padding: "14px 18px",
        background: "rgba(56,189,248,0.06)",
        border: "1px solid rgba(56,189,248,0.2)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 10
      }}>
        <Info size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          <strong>Admin Bypass Aktif:</strong> Akun admin (<code style={{ color: "#38bdf8" }}>nixxeltzy@gmail.com</code>) tetap dapat login dan mengakses seluruh fitur kapan saja meskipun maintenance sedang aktif.
        </div>
      </div>
    </div>
  );
}
