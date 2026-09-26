"use client";

import { useEffect, useState } from "react";
import {
  Tag, ZoomIn, MessageSquare, ArrowRight, Zap,
  TrendingUp, Clock, Shield, ChevronRight,
  FileText, Layers, Power, Radio,
  ShieldCheck, Mail, Lock, Megaphone, Database,
  ShieldAlert, Crown, Gift, Trophy, Flame, Sparkles,
  Star, BarChart2, Image as ImageIcon, History
} from "lucide-react";

interface FeatureCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
  accentColor: string;
  adminOnly?: boolean;
}

const CREATOR_FEATURES: FeatureCard[] = [
  {
    id: "metadata",
    icon: <Tag size={22} />,
    title: "Metadata AI",
    desc: "Generate title, keyword & kategori untuk Adobe Stock, Shutterstock, dan Magnific secara otomatis.",
    badge: "Populer",
    badgeColor: "#3b82f6",
    accentColor: "#3b82f6",
  },
  {
    id: "history",
    icon: <History size={22} />,
    title: "Riwayat Cloud",
    desc: "Semua hasil metadata tersimpan permanen di database cloud. Akses dan unduh CSV kapan saja.",
    badge: "Cloud",
    badgeColor: "#10b981",
    accentColor: "#10b981",
  },
  {
    id: "upscale",
    icon: <ZoomIn size={22} />,
    title: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 8K menggunakan Sharp Lanczos3 dan multi-pass neural pipeline.",
    badge: "Sharp",
    badgeColor: "#6366f1",
    accentColor: "#6366f1",
  },
  {
    id: "leaderboard",
    icon: <Trophy size={22} />,
    title: "Leaderboard",
    desc: "Pantau statistik proses foto harian dan peringkat kontributor teraktif komunitas microstock.",
    badge: "Live",
    badgeColor: "#f59e0b",
    accentColor: "#f59e0b",
  },
  {
    id: "google-flow",
    icon: <Sparkles size={22} />,
    title: "Google Flow AI",
    desc: "Studio kreatif Gemini untuk generasi foto, video, dan tool kustom unlimited tanpa batas.",
    badge: "Unlimited",
    badgeColor: "#8b5cf6",
    accentColor: "#8b5cf6",
  },
  {
    id: "feedback",
    icon: <MessageSquare size={22} />,
    title: "Laporan & Saran",
    desc: "Kirim laporan bug atau ide fitur baru langsung ke tim pengembang.",
    accentColor: "#64748b",
  },
];

const ADMIN_FEATURES: FeatureCard[] = [
  { id: "shutdown",      icon: <Power size={20} />,      title: "Server Control",      desc: "Kontrol shutdown server dan mode maintenance.",         badge: "Critical",  badgeColor: "#ef4444", accentColor: "#ef4444", adminOnly: true },
  { id: "monitor",       icon: <Radio size={20} />,       title: "Server Monitor",      desc: "Real-time CPU, memori, request rate & microservice.",   badge: "SSE",       badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "accounts",      icon: <ShieldCheck size={20} />, title: "Account Manager",     desc: "Daftar akun, status online live, dan autentikasi.",      badge: "Users",     badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "messageweb",    icon: <Mail size={20} />,        title: "Broadcast Web",       desc: "Kirim pesan popup atau perintah refresh ke semua user.", badge: "Push",      badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "closing",       icon: <Lock size={20} />,        title: "Feature Lock",        desc: "Tutup akses fitur tertentu tanpa menutup server.",       badge: "Control",   badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "admin-messages",icon: <Megaphone size={20} />,   title: "Mass Email Hub",      desc: "Kelola feedback pengguna dan kirim mass email SMTP.",    badge: "Email",     badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "storage",       icon: <Database size={20} />,    title: "Redis Monitor",       desc: "Pantau memori Redis, keys, dan statistik database.",     badge: "DB",        badgeColor: "#3b82f6", accentColor: "#3b82f6", adminOnly: true },
  { id: "prem_access",   icon: <Crown size={20} />,       title: "Premium Engine",      desc: "Kelola akses premium dengan auto-expiry otomatis.",      badge: "Premium",   badgeColor: "#f59e0b", accentColor: "#f59e0b", adminOnly: true },
  { id: "giveaway",      icon: <Gift size={20} />,        title: "Giveaway Platform",   desc: "Platform giveaway otomatis dengan rasio hoki dinamis.",  badge: "Auto",      badgeColor: "#ec4899", accentColor: "#ec4899", adminOnly: true },
];

interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
  isAdmin?: boolean;
}

export default function Dashboard({ onNavigate, username, isAdmin = false }: Props) {
  const [todayPhotos, setTodayPhotos] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { if (typeof d?.todayCount === "number") setTodayPhotos(d.todayCount); })
      .catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";

  return (
    <div style={{ minHeight: "100%", padding: "28px 20px 80px", maxWidth: 1080, margin: "0 auto", fontFamily: "inherit" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .db-section { animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .db-section:nth-child(2) { animation-delay: 0.06s; }
        .db-section:nth-child(3) { animation-delay: 0.12s; }
        .db-section:nth-child(4) { animation-delay: 0.18s; }

        .db-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 20px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          text-align: left;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03);
        }
        .db-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
          transform: translateY(-2px);
        }
        .db-card-accent {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          border-radius: 14px 14px 0 0;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .db-card:hover .db-card-accent { opacity: 1; }

        .db-icon {
          width: 44px; height: 44px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: transform 0.2s;
        }
        .db-card:hover .db-icon { transform: scale(1.05); }

        .db-cta {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 600; color: #64748b;
          margin-top: auto;
          transition: color 0.2s, gap 0.2s;
        }
        .db-card:hover .db-cta { color: #0f172a; gap: 8px; }

        .db-badge {
          display: inline-flex; align-items: center;
          padding: 2px 8px; border-radius: 999px;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.03em;
        }

        .db-quick-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 9px; border: none;
          font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: all 0.18s;
          white-space: nowrap;
        }

        .db-stat {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        @media (max-width: 640px) {
          .db-grid-creator { grid-template-columns: 1fr !important; }
          .db-grid-admin   { grid-template-columns: 1fr !important; }
          .db-grid-stats   { grid-template-columns: 1fr 1fr !important; }
          .db-hero-btns    { flex-wrap: wrap !important; }
          .db-hero-btns .db-quick-btn { flex: 1 1 auto; justify-content: center; }
        }
      `}</style>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <div className="db-section" style={{ marginBottom: 36 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>Stock AI Studio</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Microstock Metadata & Upscale Suite</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("leaderboard")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, border: "1px solid #dcfce7",
              background: "#f0fdf4", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Flame size={13} color="#16a34a" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>
              {todayPhotos.toLocaleString("id-ID")} foto hari ini
            </span>
            <ChevronRight size={12} color="#16a34a" />
          </button>
        </div>

        {/* Greeting */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.15, letterSpacing: "-0.025em", margin: 0, marginBottom: 8 }}>
            {greeting},{" "}
            <span style={{ color: "#2563eb" }}>{username ?? "Kreator"}</span>
            {isAdmin && (
              <span style={{ marginLeft: 10, fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontWeight: 700, verticalAlign: "middle" }}>
                Admin
              </span>
            )}
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0, maxWidth: 520 }}>
            Pilih tool yang ingin digunakan. Semua hasil proses tersimpan otomatis di cloud dan bisa diakses kapan saja.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="db-hero-btns" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="db-quick-btn" onClick={() => onNavigate("metadata")}
            style={{ background: "#0f172a", color: "#fff", boxShadow: "0 2px 8px rgba(15,23,42,0.2)" }}>
            <Tag size={14} />
            Buka Metadata AI
            <ArrowRight size={13} />
          </button>
          <button type="button" className="db-quick-btn" onClick={() => onNavigate("history")}
            style={{ background: "#f8fafc", color: "#374151", border: "1px solid #e2e8f0" }}>
            <History size={14} color="#10b981" />
            Riwayat
          </button>
          <button type="button" className="db-quick-btn" onClick={() => onNavigate("upscale")}
            style={{ background: "#f8fafc", color: "#374151", border: "1px solid #e2e8f0" }}>
            <ZoomIn size={14} color="#6366f1" />
            AI Upscaler
          </button>
          <button type="button" className="db-quick-btn" onClick={() => onNavigate("google-flow")}
            style={{ background: "#faf5ff", color: "#5b21b6", border: "1px solid #e9d5ff", fontWeight: 700 }}>
            <Sparkles size={14} />
            Google Flow
          </button>
          {!isAdmin && (
            <button type="button" className="db-quick-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"))}
              style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
              <Crown size={14} color="#d97706" />
              Premium
            </button>
          )}
        </div>
      </div>

      {/* ── STATS ───────────────────────────────────────────────────────── */}
      <div className="db-section" style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Platform Overview
        </div>
        <div className="db-grid-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { icon: <Zap size={16} color="#3b82f6" />, label: "AI Engine", value: "Groq 120B + Vision", bg: "#eff6ff" },
            { icon: <Shield size={16} color="#10b981" />, label: "Platform", value: "3 Microstock", bg: "#f0fdf4" },
            { icon: <TrendingUp size={16} color="#f59e0b" />, label: "Output", value: "CSV Siap Upload", bg: "#fffbeb" },
            { icon: <Clock size={16} color="#8b5cf6" />, label: "Proses", value: "< 15 Detik/Foto", bg: "#faf5ff" },
          ].map(s => (
            <div key={s.label} className="db-stat">
              <div style={{ width: 34, height: 34, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CREATOR TOOLS ──────────────────────────────────────────────── */}
      <div className="db-section" style={{ marginBottom: isAdmin ? 48 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Creator Tools
          </div>
          <span style={{ fontSize: 11.5, color: "#64748b" }}>{CREATOR_FEATURES.length} tools tersedia</span>
        </div>
        <div className="db-grid-creator" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {CREATOR_FEATURES.map(f => (
            <button
              key={f.id}
              type="button"
              className="db-card"
              onMouseEnter={() => setHovered(f.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNavigate(f.id)}
            >
              <div className="db-card-accent" style={{ background: f.accentColor }} />

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div className="db-icon" style={{ background: hovered === f.id ? f.accentColor + "15" : "#f8fafc", color: f.accentColor }}>
                  {f.icon}
                </div>
                {f.badge && (
                  <span className="db-badge" style={{ background: f.badgeColor + "15", color: f.badgeColor }}>
                    {f.badge}
                  </span>
                )}
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 5, lineHeight: 1.3 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{f.desc}</div>
              </div>

              <div className="db-cta">
                Buka
                <ArrowRight size={13} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── ADMIN TOOLS ────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="db-section">
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 10,
            background: "#fef2f2", border: "1px solid #fecaca",
            marginBottom: 16,
          }}>
            <ShieldAlert size={16} color="#dc2626" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>Admin Control Panel</div>
              <div style={{ fontSize: 11, color: "#9f1239" }}>Akses khusus manajemen server, database, dan keamanan</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "3px 8px", borderRadius: 999 }}>
              {ADMIN_FEATURES.length} modules
            </span>
          </div>
          <div className="db-grid-admin" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {ADMIN_FEATURES.map(f => (
              <button
                key={f.id}
                type="button"
                className="db-card"
                onMouseEnter={() => setHovered(f.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNavigate(f.id)}
                style={{ border: "1px solid #fee2e2" }}
              >
                <div className="db-card-accent" style={{ background: f.accentColor }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="db-icon" style={{ background: f.accentColor + "12", color: f.accentColor }}>
                    {f.icon}
                  </div>
                  {f.badge && (
                    <span className="db-badge" style={{ background: f.badgeColor + "15", color: f.badgeColor }}>
                      {f.badge}
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.55 }}>{f.desc}</div>
                </div>
                <div className="db-cta" style={{ fontSize: 11 }}>
                  Buka Panel
                  <ArrowRight size={12} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FOOTER TIP ─────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 44,
        padding: "18px 22px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={15} color="#64748b" />
          <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            Gunakan tombol <strong style={{ color: "#0f172a" }}>← Kembali</strong> di bagian atas untuk kembali ke dashboard kapan saja.
          </p>
        </div>
        <button type="button" className="db-quick-btn" onClick={() => onNavigate("metadata")}
          style={{ background: "#0f172a", color: "#fff", flexShrink: 0 }}>
          <Tag size={13} />
          Mulai Sekarang
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
