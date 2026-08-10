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

  const [title, setTitle] = useState("Server Sedang Dalam Pemeliharaan");
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

  useEffect(() => { fetchConfig(); }, []);

  const handleActivate = async () => {
    if (!reason.trim()) { setResult({ ok: false, msg: "Alasan penutupan wajib diisi." }); return; }
    if (!confirmClose) { setResult({ ok: false, msg: "Centang konfirmasi terlebih dahulu." }); return; }
    setSaving(true); setResult(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, title: title.trim(), message: reason.trim(), estimatedEnd: estimatedEnd ? new Date(estimatedEnd).toISOString() : undefined }),
      });
      const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
      if (data.ok && data.config) { setConfig(data.config); setConfirmClose(false); setResult({ ok: true, msg: "Server berhasil ditutup. Pengguna biasa tidak dapat mengakses." }); }
      else setResult({ ok: false, msg: data.error ?? "Gagal menutup server" });
    } catch { setResult({ ok: false, msg: "Gagal terhubung ke server" }); }
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
      if (data.ok && data.config) { setConfig(data.config); setResult({ ok: true, msg: "Server kembali online. Semua pengguna dapat mengakses." }); }
      else setResult({ ok: false, msg: data.error ?? "Gagal membuka server" });
    } catch { setResult({ ok: false, msg: "Gagal terhubung ke server" }); }
    setSaving(false);
  };

  const isActive = config?.enabled === true;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      top: 56,
      display: "grid",
      gridTemplateRows: "auto 1fr",
      gridTemplateColumns: "200px 1fr",
      background: "#07070f",
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes breatheRed { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes breatheGreen { 0%,100%{opacity:.6} 50%{opacity:.95} }
        .ssp-input {
          width: 100%;
          padding: 10px 13px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: #e2e8f0;
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
          font-family: inherit;
        }
        .ssp-input:focus { border-color: rgba(99,102,241,0.5); }
        .ssp-input::placeholder { color: rgba(255,255,255,0.2); }
        .ssp-input-dark {
          color-scheme: dark;
        }
        .ssp-chip {
          padding: 4px 11px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: rgba(255,255,255,0.4);
          font-size: 11.5px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          font-family: inherit;
        }
        .ssp-chip:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); }
        .ssp-chip.active { border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.1); color: #fca5a5; }
        .ssp-btn-primary {
          width: 100%; padding: 12px;
          border-radius: 9px; border: none;
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          color: #fff; font-weight: 700; font-size: 13px;
          cursor: pointer; transition: opacity 0.15s;
          font-family: inherit; letter-spacing: 0.01em;
        }
        .ssp-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
        .ssp-btn-primary:not(:disabled):hover { opacity: 0.88; }
        .ssp-btn-green {
          padding: 9px 20px;
          border-radius: 8px; border: none;
          background: linear-gradient(135deg, #16a34a, #15803d);
          color: #fff; font-weight: 700; font-size: 12.5px;
          cursor: pointer; transition: opacity 0.15s;
          font-family: inherit; white-space: nowrap;
        }
        .ssp-btn-green:disabled { opacity: 0.35; cursor: not-allowed; }
        .ssp-btn-green:not(:disabled):hover { opacity: 0.85; }
        .ssp-btn-blue {
          flex: 1; padding: 11px;
          border-radius: 8px; border: none;
          background: rgba(99,102,241,0.18);
          border: 1px solid rgba(99,102,241,0.3);
          color: #a5b4fc; font-weight: 700; font-size: 12.5px;
          cursor: pointer; transition: all 0.15s;
          font-family: inherit;
        }
        .ssp-btn-blue:not(:disabled):hover { background: rgba(99,102,241,0.28); }
        .ssp-label {
          display: block;
          font-size: 10.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.3);
          margin-bottom: 7px;
        }
      `}</style>

      {/* ── TOP HEADER BAR (spans full width) ── */}
      <div style={{
        gridColumn: "1 / -1",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        height: 64,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        backdropFilter: "blur(8px)",
      }}>
        {/* Left: title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: isActive ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${isActive ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            🔌
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.01em" }}>
              Server Shutdown Control
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
              Admin panel · Manajemen akses platform
            </div>
          </div>
        </div>

        {/* Right: status badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px",
          borderRadius: 999,
          background: isActive ? "rgba(239,68,68,0.1)" : "rgba(74,222,128,0.08)",
          border: `1px solid ${isActive ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.2)"}`,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isActive ? "#ef4444" : "#4ade80",
            animation: isActive ? "breatheRed 1.8s ease-in-out infinite" : "breatheGreen 2.5s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isActive ? "#fca5a5" : "#86efac",
            letterSpacing: "0.02em",
          }}>
            {isActive ? "MAINTENANCE AKTIF" : "ONLINE"}
          </span>
        </div>
      </div>

      {/* ── SIDEBAR KIRI ── */}
      <div style={{
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflowY: "auto",
        background: "rgba(255,255,255,0.01)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.2)", marginBottom: 8, paddingLeft: 4 }}>
          Navigasi
        </div>

        {[
          { icon: "◉", label: "Status Server", key: "status" },
          { icon: "✎", label: "Konfigurasi", key: "config" },
          { icon: "ℹ", label: "Cara Kerja", key: "info" },
        ].map((item) => (
          <div key={item.key} style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "9px 12px",
            borderRadius: 8,
            background: item.key === "status" ? "rgba(255,255,255,0.06)" : "transparent",
            color: item.key === "status" ? "#e2e8f0" : "rgba(255,255,255,0.35)",
            fontSize: 12.5,
            fontWeight: item.key === "status" ? 600 : 400,
            cursor: "pointer",
            transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Info box at bottom of sidebar */}
        <div style={{
          padding: "12px 12px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
            Admin bypass aktif. Email <span style={{ color: "rgba(167,139,250,0.7)" }}>nixxeltzy@gmail.com</span> tetap dapat mengakses saat maintenance.
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{
        overflowY: "auto",
        padding: "32px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
            Memuat konfigurasi...
          </div>
        ) : (
          <>
            {/* ── STATUS CARD ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 20,
              padding: "22px 26px",
              borderRadius: 14,
              background: isActive
                ? "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(185,28,28,0.04) 100%)"
                : "linear-gradient(135deg, rgba(74,222,128,0.06) 0%, rgba(16,185,129,0.03) 100%)",
              border: `1px solid ${isActive ? "rgba(239,68,68,0.18)" : "rgba(74,222,128,0.15)"}`,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: isActive ? "rgba(252,165,165,0.6)" : "rgba(134,239,172,0.6)", marginBottom: 6 }}>
                  {isActive ? "Status Saat Ini" : "Status Saat Ini"}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: isActive ? "#fca5a5" : "#86efac", letterSpacing: "-0.02em", marginBottom: 6 }}>
                  {isActive ? "Maintenance Mode" : "Server Online"}
                </div>
                {isActive ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                      Ditutup sejak {config?.updatedAt ? new Date(config.updatedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                    {config?.estimatedEnd && (
                      <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>
                        Estimasi buka: {new Date(config.estimatedEnd).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} WIB
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                    Semua pengguna dapat mengakses platform
                  </div>
                )}
              </div>

              {isActive && (
                <button className="ssp-btn-green" onClick={handleDeactivate} disabled={saving}>
                  {saving ? "Memproses..." : "Buka Server"}
                </button>
              )}
            </div>

            {/* ── CURRENT MESSAGE (if active) ── */}
            {isActive && config?.message && (
              <div style={{
                padding: "16px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                  Pesan untuk pengguna
                </div>
                <div style={{ fontSize: 13.5, color: "#cbd5e1", lineHeight: 1.65 }}>
                  {config.message}
                </div>
              </div>
            )}

            {/* ── FORM CARD ── */}
            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              overflow: "hidden",
            }}>
              {/* Card header */}
              <div style={{
                padding: "16px 22px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#6366f1" : "#ef4444" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                  {isActive ? "Edit Konfigurasi Maintenance" : "Konfigurasi Penutupan Server"}
                </span>
              </div>

              {/* Card body */}
              <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Title field (only when closing) */}
                {!isActive && (
                  <div>
                    <label className="ssp-label">Judul halaman maintenance</label>
                    <input
                      className="ssp-input"
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Server Sedang Dalam Pemeliharaan"
                    />
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label className="ssp-label">
                    Alasan / pesan {!isActive && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  {!isActive && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {QUICK_REASONS.map((r) => (
                        <button key={r} type="button" className={`ssp-chip${reason === r ? " active" : ""}`} onClick={() => setReason(r)}>
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="ssp-input"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Jelaskan alasan penutupan kepada pengguna..."
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>

                {/* Estimated end */}
                <div>
                  <label className="ssp-label">Estimasi selesai <span style={{ color: "rgba(255,255,255,0.18)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opsional)</span></label>
                  <input
                    className="ssp-input ssp-input-dark"
                    type="datetime-local"
                    value={estimatedEnd}
                    onChange={e => setEstimatedEnd(e.target.value)}
                  />
                </div>

                {/* Confirmation (only when closing) */}
                {!isActive && (
                  <label style={{
                    display: "flex", alignItems: "flex-start", gap: 11,
                    padding: "13px 15px",
                    borderRadius: 9,
                    background: "rgba(239,68,68,0.05)",
                    border: `1px solid ${confirmClose ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}>
                    <input
                      type="checkbox"
                      checked={confirmClose}
                      onChange={e => setConfirmClose(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "#ef4444", marginTop: 1, flexShrink: 0, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>
                      Saya konfirmasi akan menutup akses platform untuk semua pengguna biasa.
                    </span>
                  </label>
                )}

                {/* Result feedback */}
                {result && (
                  <div style={{
                    padding: "11px 15px",
                    borderRadius: 8,
                    background: result.ok ? "rgba(74,222,128,0.06)" : "rgba(239,68,68,0.06)",
                    border: `1px solid ${result.ok ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)"}`,
                    color: result.ok ? "#86efac" : "#fca5a5",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}>
                    {result.msg}
                  </div>
                )}

                {/* Action buttons */}
                {!isActive ? (
                  <button
                    className="ssp-btn-primary"
                    onClick={handleActivate}
                    disabled={saving || !reason.trim() || !confirmClose}
                  >
                    {saving ? "Menutup server..." : "Tutup Server Sekarang"}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="ssp-btn-blue"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true); setResult(null);
                        try {
                          const res = await fetch("/api/admin/maintenance", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ enabled: true, message: reason.trim(), estimatedEnd: estimatedEnd ? new Date(estimatedEnd).toISOString() : undefined }),
                          });
                          const data = await res.json() as { ok?: boolean; config?: MaintenanceConfig; error?: string };
                          if (data.ok) { setConfig(data.config!); setResult({ ok: true, msg: "Konfigurasi berhasil diperbarui." }); }
                          else setResult({ ok: false, msg: data.error ?? "Gagal update" });
                        } catch { setResult({ ok: false, msg: "Gagal terhubung" }); }
                        setSaving(false);
                      }}
                    >
                      Simpan Perubahan
                    </button>
                    <button
                      className="ssp-btn-green"
                      style={{ flex: 1 }}
                      onClick={handleDeactivate}
                      disabled={saving}
                    >
                      {saving ? "Memproses..." : "Buka Server"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── INFO ROW ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}>
              {[
                { label: "Pengguna biasa", desc: "Tidak dapat mengakses saat maintenance aktif", color: "#f87171" },
                { label: "Admin bypass", desc: "nixxeltzy@gmail.com tetap dapat mengakses", color: "#a78bfa" },
                { label: "Perubahan instan", desc: "Berlaku segera tanpa perlu deploy ulang", color: "#34d399" },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 5 }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
