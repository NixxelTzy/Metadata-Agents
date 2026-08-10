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
  const [selected, setSelected] = useState<string | null>(null);

  const closedCount = Object.values(entries).filter(e => e.closed).length;

  const fetchClosingState = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/closing-features");
      if (res.ok) {
        const data = await res.json() as { closing: Record<string, ClosingEntry> };
        setEntries(data.closing || {});
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClosingState(); }, []);

  const handleToggle = (id: string) => {
    const current = entries[id]?.closed ?? false;
    setEntries(prev => ({
      ...prev,
      [id]: {
        featureId: id,
        closed: !current,
        message: prev[id]?.message || "Fitur ini sedang ditutup sementara untuk pemeliharaan sistem.",
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleMessageChange = (id: string, text: string) => {
    setEntries(prev => ({
      ...prev,
      [id]: { featureId: id, closed: prev[id]?.closed ?? false, message: text, updatedAt: new Date().toISOString() },
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true); setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/closing-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing: entries }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      setStatusMsg(data.ok
        ? { ok: true, text: "Pengaturan berhasil disimpan." }
        : { ok: false, text: data.error ?? "Gagal menyimpan" });
    } catch { setStatusMsg({ ok: false, text: "Gagal terhubung ke server" }); }
    finally { setSaving(false); }
  };

  const selectedFeature = selected ? MANAGED_FEATURES.find(f => f.id === selected) : null;
  const selectedEntry = selected ? (entries[selected] ?? { featureId: selected, closed: false, message: "" }) : null;

  return (
    <div className="pl-root">
      {/* Header */}
      <div className="pl-header">
        <div className="pl-header__left">
          <div className="pl-header__icon">🔒</div>
          <div>
            <div className="pl-header__title">Closing Features</div>
            <div className="pl-header__sub">Kelola ketersediaan fitur untuk pengguna</div>
          </div>
        </div>
        <div className="pl-header__right">
          <span className={`pl-badge ${closedCount > 0 ? "pl-badge--red" : "pl-badge--green"}`}>
            <span className="pl-badge__dot" />
            {closedCount === 0 ? "Semua Aktif" : `${closedCount} Fitur Ditutup`}
          </span>
          <button className="pl-btn pl-btn--ghost" onClick={fetchClosingState} disabled={loading}>
            {loading ? <span className="pl-spinner" /> : "Refresh"}
          </button>
          <button className="pl-btn pl-btn--primary" onClick={handleSaveAll} disabled={saving}>
            {saving ? <><span className="pl-spinner" /> Menyimpan...</> : "Simpan Semua"}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="pl-sidebar">
        <div className="pl-sidebar__section-label">Fitur Aplikasi</div>
        {MANAGED_FEATURES.map(f => {
          const isClosed = entries[f.id]?.closed ?? false;
          return (
            <button
              key={f.id}
              className={`pl-sidebar__item${selected === f.id ? " active" : ""}`}
              onClick={() => setSelected(f.id)}
            >
              <span className="pl-sidebar__item-icon">{f.icon}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{f.name}</span>
              {isClosed && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
              )}
            </button>
          );
        })}
        <div className="pl-sidebar__spacer" />
        <div className="pl-sidebar__footer">
          Admin bypass aktif — fitur tertutup tetap bisa diakses admin.
        </div>
      </div>

      {/* Main content */}
      <div className="pl-content">
        {statusMsg && (
          <div className={`pl-alert ${statusMsg.ok ? "pl-alert--ok" : "pl-alert--err"}`}>
            {statusMsg.text}
          </div>
        )}

        {/* Summary strip */}
        <div className="pl-stat-row">
          <div className="pl-stat-item">
            <div className="pl-stat-item__label">Total Fitur</div>
            <div className="pl-stat-item__value">{MANAGED_FEATURES.length}</div>
            <div className="pl-stat-item__sub">Dapat dikelola</div>
          </div>
          <div className="pl-stat-item">
            <div className="pl-stat-item__label">Aktif</div>
            <div className="pl-stat-item__value" style={{ color: "#86efac" }}>
              {MANAGED_FEATURES.length - closedCount}
            </div>
            <div className="pl-stat-item__sub">Dapat diakses pengguna</div>
          </div>
          <div className="pl-stat-item">
            <div className="pl-stat-item__label">Ditutup</div>
            <div className="pl-stat-item__value" style={{ color: closedCount > 0 ? "#fca5a5" : "#e2e8f0" }}>
              {closedCount}
            </div>
            <div className="pl-stat-item__sub">Maintenance mode</div>
          </div>
        </div>

        {/* Detail panel when feature selected */}
        {selectedFeature && selectedEntry ? (
          <div className="pl-card">
            <div className="pl-card__head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9,
                  background: `${selectedFeature.color}18`,
                  border: `1px solid ${selectedFeature.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>{selectedFeature.icon}</div>
                <div>
                  <div className="pl-card__title">{selectedFeature.name}</div>
                  <div className="pl-card__desc">{selectedFeature.desc}</div>
                </div>
              </div>
              <button
                className={`pl-btn ${selectedEntry.closed ? "pl-btn--success" : "pl-btn--danger"}`}
                onClick={() => handleToggle(selectedFeature.id)}
              >
                {selectedEntry.closed ? "Buka Fitur" : "Tutup Fitur"}
              </button>
            </div>
            <div className="pl-card__body">
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 8,
                background: selectedEntry.closed ? "rgba(239,68,68,0.06)" : "rgba(74,222,128,0.06)",
                border: `1px solid ${selectedEntry.closed ? "rgba(239,68,68,0.18)" : "rgba(74,222,128,0.15)"}`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: selectedEntry.closed ? "#ef4444" : "#4ade80",
                }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: selectedEntry.closed ? "#fca5a5" : "#86efac" }}>
                  {selectedEntry.closed ? "Fitur ditutup — pengguna melihat halaman maintenance" : "Fitur aktif — dapat diakses semua pengguna"}
                </span>
              </div>

              <div>
                <label className="pl-label">Pesan untuk pengguna</label>
                <textarea
                  className="pl-input"
                  value={selectedEntry.message}
                  onChange={e => handleMessageChange(selectedFeature.id, e.target.value)}
                  placeholder="Contoh: Fitur sedang dalam pemeliharaan rutin. Silakan coba beberapa saat lagi."
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </div>

              {selectedEntry.updatedAt && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                  Terakhir diubah: {new Date(selectedEntry.updatedAt).toLocaleString("id-ID")}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Feature grid when none selected */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {MANAGED_FEATURES.map(f => {
              const entry = entries[f.id] ?? { featureId: f.id, closed: false, message: "" };
              return (
                <button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: entry.closed ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.025)",
                    border: `1px solid ${entry.closed ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`,
                    cursor: "pointer", transition: "border-color 0.15s",
                    textAlign: "left", fontFamily: "inherit",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: `${f.color}18`, border: `1px solid ${f.color}33`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                  }}>{f.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{f.desc}</div>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    color: entry.closed ? "#fca5a5" : "#86efac",
                  }}>
                    {entry.closed ? "Ditutup" : "Aktif"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
