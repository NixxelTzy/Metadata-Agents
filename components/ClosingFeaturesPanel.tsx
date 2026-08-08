"use client";

import { useEffect, useState } from "react";

export interface FeatureItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
}

export const MANAGED_FEATURES: FeatureItem[] = [
  { id: "metadata",  name: "Metadata Generator", desc: "Upload photo/vector to gen metadata", icon: "🏷️", color: "#4a90e2" },
  { id: "upscale",   name: "Upscaler (Foto & Video)", desc: "Super resolution foto dan video", icon: "🔍", color: "#ec4899" },
  { id: "watermark", name: "Hapus Watermark", desc: "Pembersih watermark media", icon: "🧹", color: "#14b8a6" },
  { id: "research",  name: "Riset Keyword", desc: "Insight produk dan riset pasar", icon: "🔎", color: "#7b5ae0" },
  { id: "vector",    name: "Vector Ideas", desc: "AI Vector concept generator", icon: "✨", color: "#22c55e" },
  { id: "chat",      name: "AI Assistant Chat", desc: "Groq AI Chatbot", icon: "🤖", color: "#f59e0b" },
  { id: "motion",    name: "Motion Studio", desc: "JS Canvas Animation Renderer", icon: "🎬", color: "#a78bfa" },
];

export interface ClosingEntry {
  featureId: string;
  closed: boolean;
  message: string;
  updatedAt?: string;
}

export default function ClosingFeaturesPanel() {
  const [entries, setEntries] = useState<Record<string, ClosingEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchClosingState = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/closing-features");
      if (res.ok) {
        const data = await res.json() as { closing: Record<string, ClosingEntry> };
        setEntries(data.closing || {});
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClosingState();
  }, []);

  const handleToggle = (id: string, currentClosed: boolean) => {
    setEntries((prev) => ({
      ...prev,
      [id]: {
        featureId: id,
        closed: !currentClosed,
        message: prev[id]?.message || "Fitur ini sedang ditutup sementara untuk pemeliharaan sistem. Silakan coba beberapa saat lagi.",
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleMessageChange = (id: string, text: string) => {
    setEntries((prev) => ({
      ...prev,
      [id]: {
        featureId: id,
        closed: prev[id]?.closed ?? false,
        message: text,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/closing-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing: entries }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (data.ok) {
        setStatusMsg({ ok: true, text: "✅ Pengaturan Closing Features berhasil disimpan di Redis!" });
      } else {
        setStatusMsg({ ok: false, text: data.error || "Gagal menyimpan" });
      }
    } catch {
      setStatusMsg({ ok: false, text: "Gagal terhubung ke server" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="uploader">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .feature-close-card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          transition: all 0.2s;
        }
        .feature-close-card--closed {
          border-color: rgba(239, 68, 68, 0.4);
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.04), var(--surface));
        }
      `}</style>

      {/* Hero */}
      <div className="uploader__hero" style={{ marginBottom: "24px" }}>
        <h2>🔒 Closing Features Manager</h2>
        <p>
          Platform khusus admin untuk menutup fitur-fitur aplikasi secara sementara. Pilih fitur yang ingin ditutup, berikan pesan pemberitahuan khusus, dan simpan. Fitur yang ditutup akan menampilkan pesan pemeliharaan ke semua akun (kecuali Admin).
        </p>
      </div>

      {/* Top Action Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "16px 20px",
        marginBottom: "24px",
        gap: "14px",
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: "800", color: "var(--text)" }}>
            Status Closing Fitur Aplikasi
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            {Object.values(entries).filter((e) => e.closed).length} dari {MANAGED_FEATURES.length} fitur sedang DITUTUP
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={fetchClosingState}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text)",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {loading ? "⏳..." : "🔄 Refresh"}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#ffffff",
              fontWeight: "800",
              fontSize: "13px",
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(239, 68, 68, 0.35)",
              transition: "all 0.2s",
            }}
          >
            {saving ? "⏳ Menyimpan..." : "💾 Simpan Pengaturan Closing"}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            marginBottom: "20px",
            background: statusMsg.ok ? "rgba(74, 222, 128, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${statusMsg.ok ? "rgba(74, 222, 128, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: statusMsg.ok ? "#4ade80" : "#f87171",
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Feature Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {MANAGED_FEATURES.map((f) => {
          const entry = entries[f.id] || { featureId: f.id, closed: false, message: "" };
          const isClosed = entry.closed;

          return (
            <div
              key={f.id}
              className={`feature-close-card ${isClosed ? "feature-close-card--closed" : ""}`}
            >
              {/* Feature Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: `${f.color}18`,
                      border: `1px solid ${f.color}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      flexShrink: 0,
                    }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: "800", fontSize: "15px", color: "var(--text)" }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {f.desc}
                    </div>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => handleToggle(f.id, isClosed)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "20px",
                    border: "none",
                    background: isClosed ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "linear-gradient(135deg, #10b981, #047857)",
                    color: "#ffffff",
                    fontWeight: "800",
                    fontSize: "12px",
                    cursor: "pointer",
                    boxShadow: isClosed ? "0 2px 10px rgba(239,68,68,0.3)" : "0 2px 10px rgba(16,185,129,0.3)",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isClosed ? "🔴 TUTUP (Closing)" : "🟢 BUKA (Aktif)"}
                </button>
              </div>

              {/* Custom Warning Message Input */}
              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: isClosed ? "#f87171" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                  {isClosed ? "⚠️ Pesan Pemberitahuan saat User Buka Fitur Ini" : "Pesan Pemberitahuan (Optional)"}
                </label>
                <textarea
                  value={entry.message}
                  onChange={(e) => handleMessageChange(f.id, e.target.value)}
                  placeholder="Contoh: Fitur sedang dalam pemeliharaan rutin. Silakan coba beberapa saat lagi."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${isClosed ? "rgba(239, 68, 68, 0.4)" : "var(--border)"}`,
                    background: "var(--bg-secondary)",
                    color: "var(--text)",
                    fontSize: "12px",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Status Badge */}
              <div style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: isClosed ? "#ef4444" : "#10b981", fontWeight: "700" }}>
                  ● Status: {isClosed ? "Fitur Dikeluarkan/Ditutup bagi User" : "Fitur Berjalan Normal"}
                </span>
                {entry.updatedAt && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
