"use client";

import { useState } from "react";
import {
  Tag, ZoomIn, Eraser, Search, Sparkles, Bot,
  Clapperboard, MessageSquare, ArrowRight, Zap,
  TrendingUp, Clock, Shield, Star, ChevronRight,
  ImageIcon, FileText, Layers,
} from "lucide-react";

interface FeatureCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  color: string;
  glow: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: "metadata",
    icon: <Tag size={26} />,
    title: "Metadata Generator",
    desc: "Generate judul, keyword, dan kategori siap pakai untuk Adobe Stock, Shutterstock, & Magnific secara otomatis dengan AI.",
    badge: "Paling Populer",
    color: "#4a90e2",
    glow: "rgba(74,144,226,0.18)",
  },
  {
    id: "upscale",
    icon: <ZoomIn size={26} />,
    title: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 4× tanpa kehilangan detail. Cocok untuk foto stok, ilustrasi, dan aset digital.",
    color: "#ec4899",
    glow: "rgba(236,72,153,0.15)",
  },
  {
    id: "watermark",
    icon: <Eraser size={26} />,
    title: "Hapus Watermark",
    desc: "Hapus watermark, logo, atau teks tidak diinginkan dari gambar menggunakan AI inpainting yang presisi.",
    color: "#14b8a6",
    glow: "rgba(20,184,166,0.15)",
  },
  {
    id: "research",
    icon: <Search size={26} />,
    title: "Keyword Research",
    desc: "Riset keyword terbaik untuk konten stok Anda. Temukan tren, volume, dan kompetisi keyword secara real-time.",
    color: "#7b5ae0",
    glow: "rgba(123,90,224,0.15)",
  },
  {
    id: "vector",
    icon: <Sparkles size={26} />,
    title: "Vector Creator",
    desc: "Buat ide konten vektor AI dengan prompt kreatif. Cocok untuk desainer yang butuh inspirasi dan brief yang detail.",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.15)",
  },
  {
    id: "chat",
    icon: <Bot size={26} />,
    title: "AI Chat",
    desc: "Asisten AI berbasis Groq yang cepat untuk menjawab pertanyaan, brainstorming ide, dan membantu pekerjaan sehari-hari.",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.15)",
  },
  {
    id: "motion",
    icon: <Clapperboard size={26} />,
    title: "Motion Studio",
    desc: "Buat animasi canvas dan efek gerak kreatif dengan bantuan AI. Export langsung sebagai GIF atau video.",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.15)",
  },
  {
    id: "feedback",
    icon: <MessageSquare size={26} />,
    title: "Laporan & Saran",
    desc: "Temukan bug? Punya ide fitur baru? Kirim laporan langsung ke tim pengembang dan pantau statusnya.",
    color: "#f472b6",
    glow: "rgba(244,114,182,0.15)",
  },
];

const STATS = [
  { icon: <Zap size={18} />, label: "AI Powered", value: "Groq + Gemini", color: "#f59e0b" },
  { icon: <Shield size={18} />, label: "Platform", value: "3 Marketplace", color: "#4a90e2" },
  { icon: <TrendingUp size={18} />, label: "Format Output", value: "CSV Siap Upload", color: "#22c55e" },
  { icon: <Clock size={18} />, label: "Waktu Generate", value: "< 10 Detik", color: "#a78bfa" },
];

interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
}

export default function Dashboard({ onNavigate, username }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";

  return (
    <div style={{
      minHeight: "100%",
      padding: "32px 24px 48px",
      maxWidth: 1100,
      margin: "0 auto",
      fontFamily: "var(--font)",
    }}>
      <style>{`
        @keyframes dashFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-hero { animation: dashFadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .dash-stats { animation: dashFadeUp 0.5s 0.08s cubic-bezier(0.16,1,0.3,1) both; }
        .dash-features { animation: dashFadeUp 0.55s 0.14s cubic-bezier(0.16,1,0.3,1) both; }

        .feat-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 22px 20px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.18s, box-shadow 0.2s, background 0.2s;
          overflow: hidden;
          text-align: left;
        }
        .feat-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          opacity: 0;
          transition: opacity 0.25s;
          pointer-events: none;
        }
        .feat-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255,255,255,0.14);
        }
        .feat-card:hover::before { opacity: 1; }

        .feat-icon-wrap {
          width: 50px; height: 50px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: transform 0.2s;
        }
        .feat-card:hover .feat-icon-wrap { transform: scale(1.08); }

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
          padding: 14px 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
        }

        .quick-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          font-family: var(--font);
          transition: all 0.18s;
        }
        .quick-btn--primary {
          background: linear-gradient(135deg, #0ea5e9, #0369a1);
          color: white;
          box-shadow: 0 4px 18px rgba(14,165,233,0.3);
        }
        .quick-btn--primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(14,165,233,0.45);
        }
        .quick-btn--secondary {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.75);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .quick-btn--secondary:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }

        .badge-popular {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase;
          background: rgba(245,158,11,0.18);
          color: #fbbf24;
          border: 1px solid rgba(245,158,11,0.3);
        }

        .section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 16px;
        }

        @media (max-width: 640px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-stats-grid { grid-template-columns: 1fr 1fr !important; }
          .dash-hero-actions { flex-direction: column; }
          .dash-hero-actions .quick-btn { width: 100%; justify-content: center; }
        }
      `}</style>

      {/* ── Hero ── */}
      <div className="dash-hero" style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg,#0ea5e9,#0369a1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 18px rgba(14,165,233,0.35)",
          }}>
            <Layers size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Stock AI Studio</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Platform Creator Tools</div>
          </div>
        </div>

        <h1 style={{
          fontSize: "clamp(22px, 4vw, 34px)",
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
          </span>{" "}👋
        </h1>
        <p style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.45)",
          maxWidth: 520,
          lineHeight: 1.7,
          marginBottom: 24,
        }}>
          Semua alat yang kamu butuhkan untuk memaksimalkan pendapatan dari platform stok foto.
          Pilih fitur di bawah untuk mulai bekerja.
        </p>

        <div className="dash-hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="quick-btn quick-btn--primary"
            onClick={() => onNavigate("metadata")}
          >
            <Tag size={15} />
            Mulai Generate Metadata
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="quick-btn quick-btn--secondary"
            onClick={() => onNavigate("upscale")}
          >
            <ZoomIn size={15} />
            Upscale Gambar
          </button>
          <button
            type="button"
            className="quick-btn quick-btn--secondary"
            onClick={() => onNavigate("watermark")}
          >
            <Eraser size={15} />
            Hapus Watermark
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="dash-stats" style={{ marginBottom: 40 }}>
        <div className="section-label">Ringkasan Platform</div>
        <div
          className="dash-stats-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}
        >
          {STATS.map((s) => (
            <div key={s.label} className="stat-card">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `rgba(${s.color === "#f59e0b" ? "245,158,11" : s.color === "#4a90e2" ? "74,144,226" : s.color === "#22c55e" ? "34,197,94" : "167,139,250"},0.15)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: s.color, flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff", lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature Cards ── */}
      <div className="dash-features">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Semua Fitur</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            <ImageIcon size={12} />
            <span>8 Tools tersedia</span>
          </div>
        </div>

        <div
          className="dash-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}
        >
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              className="feat-card"
              style={{
                boxShadow: hovered === f.id ? `0 8px 32px ${f.glow}` : "none",
                borderColor: hovered === f.id ? `${f.color}44` : "rgba(255,255,255,0.07)",
                background: hovered === f.id ? `rgba(255,255,255,0.05)` : "rgba(255,255,255,0.03)",
              }}
              onMouseEnter={() => setHovered(f.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNavigate(f.id)}
            >
              {/* Glow bg */}
              <div style={{
                position: "absolute", inset: 0, borderRadius: 16,
                background: `radial-gradient(ellipse 80% 60% at 10% 10%, ${f.glow}, transparent)`,
                opacity: hovered === f.id ? 1 : 0,
                transition: "opacity 0.25s",
                pointerEvents: "none",
              }} />

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, position: "relative" }}>
                <div
                  className="feat-icon-wrap"
                  style={{ background: `${f.color}20`, color: f.color }}
                >
                  {f.icon}
                </div>
                {f.badge && (
                  <span className="badge-popular">
                    <Star size={8} />
                    {f.badge}
                  </span>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f0f8ff", marginBottom: 6, lineHeight: 1.3 }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>
                  {f.desc}
                </div>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 600, color: f.color,
                opacity: hovered === f.id ? 1 : 0.5,
                transition: "opacity 0.2s",
                position: "relative",
              }}>
                Buka Fitur
                <ChevronRight size={13} />
              </div>

              <div className="feat-arrow">
                <ArrowRight size={16} color={f.color} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div style={{
        marginTop: 48,
        padding: "28px 32px",
        background: "linear-gradient(135deg, rgba(14,165,233,0.08), rgba(99,102,241,0.06))",
        border: "1px solid rgba(14,165,233,0.15)",
        borderRadius: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <FileText size={16} color="#38bdf8" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>Tips Cepat</span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, maxWidth: 420 }}>
            Upload hingga <strong style={{ color: "#38bdf8" }}>10 gambar sekaligus</strong> di Metadata Generator.
            AI akan memproses semua secara paralel dan menghasilkan CSV siap upload ke platform stok.
          </p>
        </div>
        <button
          type="button"
          className="quick-btn quick-btn--primary"
          onClick={() => onNavigate("metadata")}
          style={{ flexShrink: 0 }}
        >
          <Tag size={14} />
          Coba Sekarang
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
