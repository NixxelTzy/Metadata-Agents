"use client";

import { useState } from "react";
import {
  Tag, ZoomIn, Eraser, Search, Sparkles, Bot,
  Clapperboard, MessageSquare, ArrowRight, Zap,
  TrendingUp, Clock, Shield, Star, ChevronRight,
  ImageIcon, FileText, Layers, Power, Radio,
  ShieldCheck, Mail, Lock, Megaphone, Database,
  ShieldAlert, UserCheck, Crown
} from "lucide-react";

interface FeatureCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  color: string;
  glow: string;
  adminOnly?: boolean;
}

const ICON_COLOR = "#38bdf8";
const ICON_GLOW = "rgba(56,189,248,0.25)";

const CREATOR_FEATURES: FeatureCard[] = [
  {
    id: "metadata",
    icon: <Tag size={24} color={ICON_COLOR} />,
    title: "Metadata Generator",
    desc: "Generate judul, keyword, dan kategori siap pakai untuk Adobe Stock, Shutterstock, & Magnific secara otomatis dengan AI.",
    badge: "Paling Populer",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "upscale",
    icon: <ZoomIn size={24} color={ICON_COLOR} />,
    title: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 4× tanpa kehilangan detail. Cocok untuk foto stok, ilustrasi, dan aset digital.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "watermark",
    icon: <Eraser size={24} color={ICON_COLOR} />,
    title: "Hapus Watermark",
    desc: "Hapus watermark, logo, atau teks tidak diinginkan dari gambar menggunakan AI inpainting yang presisi.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "research",
    icon: <Search size={24} color={ICON_COLOR} />,
    title: "Keyword Research",
    desc: "Riset keyword terbaik untuk konten stok Anda. Temukan tren, volume, dan kompetisi keyword secara real-time.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "vector",
    icon: <Sparkles size={24} color={ICON_COLOR} />,
    title: "Vector Creator",
    desc: "Buat ide konten vektor AI dengan prompt kreatif. Cocok untuk desainer yang butuh inspirasi dan brief yang detail.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "chat",
    icon: <Bot size={24} color={ICON_COLOR} />,
    title: "AI Chat",
    desc: "Asisten AI berbasis Groq yang cepat untuk menjawab pertanyaan, brainstorming ide, dan membantu pekerjaan sehari-hari.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "motion",
    icon: <Clapperboard size={24} color={ICON_COLOR} />,
    title: "Motion Studio",
    desc: "Buat animasi canvas dan efek gerak kreatif dengan bantuan AI. Export langsung sebagai GIF atau video.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
  {
    id: "feedback",
    icon: <MessageSquare size={24} color={ICON_COLOR} />,
    title: "Laporan & Saran",
    desc: "Temukan bug? Punya ide fitur baru? Kirim laporan langsung ke tim pengembang dan pantau statusnya.",
    color: ICON_COLOR,
    glow: ICON_GLOW,
  },
];

const ADMIN_FEATURES: FeatureCard[] = [
  {
    id: "shutdown",
    icon: <Power size={24} color="#f87171" />,
    title: "Server Shutdown Control",
    desc: "Kontrol darurat penutupan server & mode pemeliharaan (maintenance) untuk memblokir/membuka akses publik.",
    badge: "Kontrol Akses",
    color: "#f87171",
    glow: "rgba(239,68,68,0.25)",
    adminOnly: true,
  },
  {
    id: "monitor",
    icon: <Radio size={24} color="#38bdf8" />,
    title: "Server Monitor",
    desc: "Dashboard real-time SSE untuk memantau performa CPU, memori, request rate, dan status microservice.",
    badge: "Real-time SSE",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "accounts",
    icon: <ShieldCheck size={24} color="#38bdf8" />,
    title: "Account Checker",
    desc: "Lihat daftar akun terdaftar, status user online/offline secara live, dan kelola otentikasi pengguna.",
    badge: "Manajemen Akun",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "messageweb",
    icon: <Mail size={24} color="#38bdf8" />,
    title: "Message Web Broadcast",
    desc: "Kirim pesan popup, perintah refresh paksa, atau pemblokiran sementara ke layar pengguna aktif.",
    badge: "Broadcast",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "closing",
    icon: <Lock size={24} color="#38bdf8" />,
    title: "Closing Features Panel",
    desc: "Tutup akses ke fitur tertentu secara spesifik tanpa harus menutup keseluruhan server.",
    badge: "Fitur Lock",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "admin-messages",
    icon: <Megaphone size={24} color="#38bdf8" />,
    title: "Broadcast & Mass Email",
    desc: "Kelola pesan feedback dari pengguna serta kirimkan mass email notifikasi via SMTP.",
    badge: "Email Hub",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "storage",
    icon: <Database size={24} color="#38bdf8" />,
    title: "Storage Redis Monitor",
    desc: "Pantau penggunaan memori Redis Upstash, total keys, client connection, dan statistik database.",
    badge: "Database",
    color: ICON_COLOR,
    glow: ICON_GLOW,
    adminOnly: true,
  },
  {
    id: "prem_access",
    icon: <Crown size={24} color="#facc15" />,
    title: "Prem Access",
    desc: "Command Center untuk pemberian & pencabutan akses premium (prem / unprem / list prem) dengan auto-expiry pencabutan otomatis.",
    badge: "Premium Engine",
    color: "#facc15",
    glow: "rgba(250, 204, 21, 0.25)",
    adminOnly: true,
  },
];

const STATS = [
  { icon: <Zap size={18} color="#38bdf8" />, label: "AI Engine", value: "Groq & Vision AI" },
  { icon: <Shield size={18} color="#38bdf8" />, label: "Target Pasar", value: "3 Platform Stok" },
  { icon: <TrendingUp size={18} color="#38bdf8" />, label: "Format Output", value: "CSV Siap Pakai" },
  { icon: <Clock size={18} color="#38bdf8" />, label: "Waktu Proses", value: "< 10 Detik" },
];

interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
  isAdmin?: boolean;
}

export default function Dashboard({ onNavigate, username, isAdmin = false }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";

  return (
    <div style={{
      minHeight: "100%",
      padding: "24px 18px 60px",
      maxWidth: 1100,
      margin: "0 auto",
      fontFamily: "var(--font)",
    }}>
      <style>{`
        @keyframes dashFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-hero { animation: dashFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .dash-stats { animation: dashFadeUp 0.45s 0.06s cubic-bezier(0.16,1,0.3,1) both; }
        .dash-features { animation: dashFadeUp 0.5s 0.12s cubic-bezier(0.16,1,0.3,1) both; }
        .dash-admin { animation: dashFadeUp 0.55s 0.18s cubic-bezier(0.16,1,0.3,1) both; }

        .feat-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 22px 20px;
          background: rgba(149, 199, 255, 0.05);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(149, 199, 255, 0.15);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          overflow: hidden;
          text-align: left;
        }
        .feat-card:hover {
          transform: translateY(-4px);
          border-color: rgba(56, 189, 248, 0.5);
          background: rgba(149, 199, 255, 0.1);
          box-shadow: 0 10px 30px rgba(14, 165, 233, 0.2), 0 0 0 1px rgba(56, 189, 248, 0.2) inset;
        }
        .feat-card--admin:hover {
          border-color: rgba(239, 68, 68, 0.5);
          box-shadow: 0 10px 30px rgba(239, 68, 68, 0.2), 0 0 0 1px rgba(239, 68, 68, 0.2) inset;
        }

        .feat-icon-wrap {
          width: 48px; height: 48px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background: rgba(14, 165, 233, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.3);
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
          transition: transform 0.2s;
        }
        .feat-icon-wrap--admin {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          box-shadow: 0 0 14px rgba(239, 68, 68, 0.25);
        }
        .feat-card:hover .feat-icon-wrap {
          transform: scale(1.08);
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.5);
          background: rgba(14, 165, 233, 0.25);
        }
        .feat-card--admin:hover .feat-icon-wrap--admin {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
          background: rgba(239, 68, 68, 0.25);
        }

        .feat-arrow {
          position: absolute;
          right: 18px; bottom: 18px;
          opacity: 0;
          transform: translate(-4px, 4px);
          transition: opacity 0.2s, transform 0.2s;
        }
        .feat-card:hover .feat-arrow {
          opacity: 1;
          transform: translate(0, 0);
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(149, 199, 255, 0.05);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(149, 199, 255, 0.15);
          border-radius: 14px;
        }

        .quick-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          font-family: var(--font);
          transition: all 0.18s;
        }
        .quick-btn--primary {
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: white;
          box-shadow: 0 4px 20px rgba(14,165,233,0.35);
        }
        .quick-btn--primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(14,165,233,0.55);
        }
        .quick-btn--secondary {
          background: rgba(149,199,255,0.08);
          color: #f0f8ff;
          border: 1px solid rgba(149,199,255,0.25);
        }
        .quick-btn--secondary:hover {
          background: rgba(149,199,255,0.18);
          border-color: rgba(56,189,248,0.5);
          transform: translateY(-2px);
        }

        .badge-popular {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 999px;
          font-size: 9px; font-weight: 800; letter-spacing: 0.04em;
          text-transform: uppercase;
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
        }
        .badge-admin {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 999px;
          font-size: 9px; font-weight: 800; letter-spacing: 0.04em;
          text-transform: uppercase;
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.35);
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
        }

        .section-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(186, 230, 253, 0.75);
          margin-bottom: 14px;
        }

        @media (max-width: 640px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .dash-hero-actions { flex-direction: column; }
          .dash-hero-actions .quick-btn { width: 100%; justify-content: center; }
        }
      `}</style>

      {/* ── Hero ── */}
      <div className="dash-hero" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg,#0ea5e9,#0369a1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 18px rgba(14,165,233,0.4)",
          }}>
            <Layers size={19} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700 }}>Stock AI Studio</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Creative Suite & Microstock Toolkit</div>
          </div>
        </div>

        <h1 style={{
          fontSize: "clamp(22px, 4vw, 32px)",
          fontWeight: 800,
          color: "#f0f8ff",
          lineHeight: 1.2,
          marginBottom: 10,
          letterSpacing: "-0.02em",
        }}>
          {greeting},{" "}
          <span style={{
            background: "linear-gradient(90deg,#38bdf8,#818cf8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {username ?? "Kreator"}
          </span>
          {isAdmin && (
            <span style={{
              marginLeft: 10,
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#fca5a5",
              verticalAlign: "middle",
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase"
            }}>
              Admin
            </span>
          )}
        </h1>
        <p style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
          maxWidth: 580,
          lineHeight: 1.7,
          marginBottom: 22,
        }}>
          Pilih salah satu platform tool di bawah untuk mulai bekerja. Di setiap tool tersedia tombol kembali di bagian atas untuk kembali ke dashboard kapan saja.
        </p>

        <div className="dash-hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="quick-btn quick-btn--primary"
            onClick={() => onNavigate("metadata")}
          >
            <Tag size={15} />
            Mulai Metadata
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="quick-btn quick-btn--secondary"
            onClick={() => onNavigate("upscale")}
          >
            <ZoomIn size={15} color="#38bdf8" />
            AI Upscaler
          </button>
          <button
            type="button"
            className="quick-btn quick-btn--secondary"
            onClick={() => onNavigate("watermark")}
          >
            <Eraser size={15} color="#38bdf8" />
            Hapus Watermark
          </button>
          {!isAdmin && (
            <button
              type="button"
              className="quick-btn"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"));
                }
              }}
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(14,165,233,0.2))",
                border: "1px solid rgba(129, 140, 248, 0.4)",
                color: "#c7d2fe",
              }}
            >
              <Crown size={15} color="#818cf8" />
              Paket Premium (Unlimited)
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="dash-stats" style={{ marginBottom: 36 }}>
        <div className="section-label">Ringkasan Platform</div>
        <div
          className="dash-stats-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}
        >
          {STATS.map((s) => (
            <div key={s.label} className="stat-card">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(14,165,233,0.15)",
                border: "1px solid rgba(56,189,248,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff", lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature Cards (Creator Tools) ── */}
      <div className="dash-features" style={{ marginBottom: isAdmin ? 44 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Fitur &amp; Tools Kreator</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#38bdf8", fontWeight: 600 }}>
            <Sparkles size={12} />
            <span>8 Tools Siap Pakai</span>
          </div>
        </div>

        <div
          className="dash-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}
        >
          {CREATOR_FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              className="feat-card"
              onMouseEnter={() => setHovered(f.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNavigate(f.id)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, position: "relative" }}>
                <div className="feat-icon-wrap">
                  {f.icon}
                </div>
                {f.badge && (
                  <span className="badge-popular">
                    <Star size={9} fill="#38bdf8" />
                    {f.badge}
                  </span>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f8ff", marginBottom: 6, lineHeight: 1.3 }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                  {f.desc}
                </div>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700, color: "#38bdf8",
                marginTop: "auto",
                position: "relative",
              }}>
                Buka Tool
                <ChevronRight size={13} />
              </div>

              <div className="feat-arrow">
                <ArrowRight size={16} color="#38bdf8" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── ADMIN ONLY SECTION ── */}
      {isAdmin && (
        <div className="dash-admin" style={{ marginTop: 44 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(239,68,68,0.2)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "rgba(239,68,68,0.18)",
                border: "1px solid rgba(239,68,68,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <ShieldAlert size={16} color="#f87171" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5", letterSpacing: "0.02em" }}>
                  Platform Khusus Administrator
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  Akses khusus manajemen server, database, dan kontrol keamanan
                </div>
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, color: "#f87171",
              background: "rgba(239,68,68,0.1)", padding: "3px 8px", borderRadius: 999,
              border: "1px solid rgba(239,68,68,0.25)"
            }}>
              7 Admin Modules
            </span>
          </div>

          <div
            className="dash-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}
          >
            {ADMIN_FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                className="feat-card feat-card--admin"
                onMouseEnter={() => setHovered(f.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNavigate(f.id)}
                style={{
                  background: "rgba(239, 68, 68, 0.03)",
                  borderColor: "rgba(239, 68, 68, 0.18)"
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, position: "relative" }}>
                  <div className="feat-icon-wrap feat-icon-wrap--admin">
                    {f.icon}
                  </div>
                  {f.badge && (
                    <span className="badge-admin">
                      {f.badge}
                    </span>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f8ff", marginBottom: 6, lineHeight: 1.3 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                    {f.desc}
                  </div>
                </div>

                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 700, color: f.id === "shutdown" ? "#fca5a5" : "#38bdf8",
                  marginTop: "auto",
                  position: "relative",
                }}>
                  Buka Panel Admin
                  <ChevronRight size={13} />
                </div>

                <div className="feat-arrow">
                  <ArrowRight size={16} color={f.id === "shutdown" ? "#fca5a5" : "#38bdf8"} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom CTA Tips ── */}
      <div style={{
        marginTop: 40,
        padding: "24px 28px",
        background: "rgba(149,199,255,0.06)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(149,199,255,0.2)",
        borderRadius: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <FileText size={16} color="#38bdf8" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>Navigasi Satu Pintu</span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, maxWidth: 480 }}>
            Klik tool mana saja untuk membuka halaman kerja. Gunakan tombol <strong style={{ color: "#38bdf8" }}>← Kembali ke Dashboard</strong> di bar bagian atas untuk kembali ke menu utama kapan saja.
          </p>
        </div>
        <button
          type="button"
          className="quick-btn quick-btn--primary"
          onClick={() => onNavigate("metadata")}
          style={{ flexShrink: 0 }}
        >
          <Tag size={14} />
          Buka Metadata
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
