"use client";

import { useEffect, useState } from "react";
import {
  Tag, ZoomIn, MessageSquare, ArrowRight,
  Clock, Shield, ChevronRight,
  Power, Radio, ShieldCheck, Mail, Lock,
  Megaphone, Database, Crown, Gift, Trophy,
  Flame, Sparkles, History, Zap, TrendingUp,
  ShieldAlert
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  tag?: string;
  tagColor?: string;
  iconBg?: string;
}

/* ─── Data ───────────────────────────────────────────────────────────────────── */
const TOOLS: Tool[] = [
  {
    id: "metadata",
    icon: <Tag size={20} strokeWidth={2} />,
    label: "Metadata AI",
    desc: "Generate title, keyword & kategori untuk Adobe Stock, Shutterstock, dan Magnific.",
    tag: "Populer",
    tagColor: "#2563eb",
    iconBg: "#eff6ff",
  },
  {
    id: "history",
    icon: <History size={20} strokeWidth={2} />,
    label: "Riwayat Cloud",
    desc: "Semua hasil metadata tersimpan di database cloud. Akses dan unduh CSV kapan saja.",
    tag: "Cloud",
    tagColor: "#059669",
    iconBg: "#ecfdf5",
  },
  {
    id: "upscale",
    icon: <ZoomIn size={20} strokeWidth={2} />,
    label: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 8K menggunakan Sharp Lanczos3 server-side.",
    tag: "Sharp",
    tagColor: "#7c3aed",
    iconBg: "#faf5ff",
  },
  {
    id: "leaderboard",
    icon: <Trophy size={20} strokeWidth={2} />,
    label: "Leaderboard",
    desc: "Statistik proses foto harian dan peringkat kontributor komunitas.",
    tag: "Live",
    tagColor: "#d97706",
    iconBg: "#fffbeb",
  },
  {
    id: "google-flow",
    icon: <Sparkles size={20} strokeWidth={2} />,
    label: "Google Flow AI",
    desc: "Studio kreatif Gemini untuk generasi foto, video, dan tool kustom unlimited.",
    tag: "Unlimited",
    tagColor: "#7c3aed",
    iconBg: "#faf5ff",
  },
  {
    id: "feedback",
    icon: <MessageSquare size={20} strokeWidth={2} />,
    label: "Laporan & Saran",
    desc: "Kirim laporan bug atau ide fitur langsung ke tim pengembang.",
    tagColor: "#64748b",
    iconBg: "#f8fafc",
  },
];

const ADMIN_TOOLS: Tool[] = [
  { id: "shutdown",       icon: <Power size={17} />,       label: "Server Control",  desc: "Shutdown server & mode maintenance.",  tagColor: "#dc2626", iconBg: "#fff5f5" },
  { id: "monitor",        icon: <Radio size={17} />,        label: "Server Monitor",  desc: "Real-time CPU, memori & request.",       tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "accounts",       icon: <ShieldCheck size={17} />,  label: "Accounts",        desc: "Daftar akun & status online live.",      tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "messageweb",     icon: <Mail size={17} />,         label: "Broadcast",       desc: "Kirim pesan ke semua user.",             tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "closing",        icon: <Lock size={17} />,         label: "Feature Lock",    desc: "Tutup akses fitur tertentu.",            tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "admin-messages", icon: <Megaphone size={17} />,    label: "Mass Email",      desc: "Kelola feedback & kirim mass email.",    tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "storage",        icon: <Database size={17} />,     label: "Redis Monitor",   desc: "Pantau memori & statistik database.",   tagColor: "#2563eb", iconBg: "#eff6ff" },
  { id: "prem_access",    icon: <Crown size={17} />,        label: "Premium Engine",  desc: "Kelola akses premium & auto-expiry.",    tagColor: "#d97706", iconBg: "#fffbeb" },
  { id: "giveaway",       icon: <Gift size={17} />,         label: "Giveaway",        desc: "Platform giveaway otomatis.",            tagColor: "#db2777", iconBg: "#fdf2f8" },
];

interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
  isAdmin?: boolean;
}

export default function Dashboard({ onNavigate, username, isAdmin = false }: Props) {
  const [todayPhotos, setTodayPhotos] = useState(0);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { if (typeof d?.todayCount === "number") setTodayPhotos(d.todayCount); })
      .catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Selamat pagi" : hour < 17 ? "Selamat siang" : "Selamat malam";

  return (
    <div style={{ width: "100%", fontFamily: "inherit" }}>
      <style>{`
        /* ── Reset overflow ── */
        .db-root { padding: 24px 0 80px; }

        /* ── Inner wrapper — penuh di mobile, max di desktop ── */
        .db-inner {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 16px;
          box-sizing: border-box;
        }

        /* ── Tool grid: 1 kolom mobile, 2 kolom tablet, 3 kolom desktop ── */
        .db-tool-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 600px) {
          .db-tool-grid { grid-template-columns: 1fr 1fr; }
          .db-inner { padding: 0 20px; }
        }
        @media (min-width: 960px) {
          .db-tool-grid { grid-template-columns: 1fr 1fr 1fr; }
          .db-inner { padding: 0 28px; }
        }

        /* ── Admin grid ── */
        .db-admin-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        @media (min-width: 600px) {
          .db-admin-grid { grid-template-columns: 1fr 1fr 1fr; }
        }
        @media (min-width: 960px) {
          .db-admin-grid { grid-template-columns: repeat(4, 1fr); }
        }

        /* ── Stats grid ── */
        .db-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        @media (min-width: 600px) {
          .db-stats-grid { grid-template-columns: repeat(4, 1fr); }
        }

        /* ── Quick buttons ── */
        .db-quick-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* ── Tool card ── */
        .db-tool-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
          transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s;
          font-family: inherit;
          width: 100%;
          box-sizing: border-box;
        }
        .db-tool-card:hover {
          border-color: #bfdbfe;
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
          transform: translateY(-2px);
        }
        .db-tool-card:active { transform: translateY(0); }

        /* ── Admin card ── */
        .db-admin-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px;
          background: #ffffff;
          border: 1px solid #fee2e2;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s, box-shadow 0.12s;
          font-family: inherit;
          width: 100%;
          box-sizing: border-box;
        }
        .db-admin-card:hover {
          background: #fff5f5;
          box-shadow: 0 2px 10px rgba(220,38,38,0.08);
        }

        /* ── Pill button ── */
        .db-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 16px;
          border-radius: 9px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.12s, border-color 0.12s;
          box-sizing: border-box;
        }
        .db-btn:hover { background: #f9fafb; border-color: #d1d5db; }
        .db-btn--primary {
          background: #111827 !important;
          color: #fff !important;
          border-color: #111827 !important;
        }
        .db-btn--primary:hover { background: #1f2937 !important; }

        /* ── Section label ── */
        .db-section-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="db-root">
        <div className="db-inner">

          {/* ── Greeting ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <h1 style={{
                fontSize: "clamp(20px, 5vw, 28px)",
                fontWeight: 700,
                color: "#111827",
                margin: 0,
                letterSpacing: "-0.025em",
                lineHeight: 1.2,
              }}>
                {greeting},{" "}
                <span style={{ color: "#2563eb" }}>{username ?? "Kreator"}</span>
                {isAdmin && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 4,
                    background: "#fee2e2", color: "#dc2626",
                    verticalAlign: "middle", letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}>Admin</span>
                )}
              </h1>

              {/* Today badge */}
              <button type="button" onClick={() => onNavigate("leaderboard")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 20,
                  border: "1px solid #d1fae5", background: "#ecfdf5",
                  cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#065f46",
                  fontFamily: "inherit", flexShrink: 0,
                }}>
                <Flame size={13} color="#059669" />
                <strong>{todayPhotos.toLocaleString("id-ID")}</strong> foto
                <ChevronRight size={12} color="#059669" />
              </button>
            </div>

            <p style={{ fontSize: 13.5, color: "#6b7280", margin: "0 0 18px", lineHeight: 1.55 }}>
              Pilih tool yang ingin digunakan. Hasil proses tersimpan otomatis di cloud.
            </p>

            {/* Quick actions */}
            <div className="db-quick-row">
              <button className="db-btn db-btn--primary" type="button"
                onClick={() => onNavigate("metadata")}
                style={{ flex: "1 1 auto", justifyContent: "center" }}>
                <Tag size={14} /> Mulai Metadata AI <ArrowRight size={14} />
              </button>
              <button className="db-btn" type="button" onClick={() => onNavigate("upscale")}>
                <ZoomIn size={14} color="#7c3aed" /> Upscaler
              </button>
              <button className="db-btn" type="button" onClick={() => onNavigate("history")}>
                <History size={14} color="#059669" /> Riwayat
              </button>
              <button className="db-btn" type="button" onClick={() => onNavigate("google-flow")}
                style={{ background: "#faf5ff", color: "#5b21b6", borderColor: "#e9d5ff" }}>
                <Sparkles size={14} /> Google Flow
              </button>
              {!isAdmin && (
                <button className="db-btn" type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"))}
                  style={{ background: "#fefce8", color: "#92400e", borderColor: "#fde68a" }}>
                  <Crown size={14} color="#d97706" /> Premium
                </button>
              )}
            </div>
          </div>

          {/* ── Stats bar ────────────────────────────────────────────── */}
          <div className="db-stats-grid" style={{ marginBottom: 28 }}>
            {[
              { icon: <Zap size={14} color="#2563eb" />,       label: "AI Engine", value: "Groq 120B",      bg: "#eff6ff" },
              { icon: <Shield size={14} color="#059669" />,     label: "Platform",  value: "3 Microstock",  bg: "#ecfdf5" },
              { icon: <TrendingUp size={14} color="#d97706" />, label: "Output",    value: "CSV Ready",     bg: "#fffbeb" },
              { icon: <Clock size={14} color="#7c3aed" />,      label: "Speed",     value: "~15s / foto",   bg: "#faf5ff" },
            ].map(s => (
              <div key={s.label} style={{
                padding: "12px 14px",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                boxSizing: "border-box",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {s.icon}
                  </div>
                  <span style={{ fontSize: 9.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ── Creator Tools ──────────────────────────────────────────── */}
          <div style={{ marginBottom: isAdmin ? 32 : 0 }}>
            <div className="db-section-label">Creator Tools</div>
            <div className="db-tool-grid">
              {TOOLS.map(t => <ToolCard key={t.id} tool={t} onNavigate={onNavigate} />)}
            </div>
          </div>

          {/* ── Admin Tools ────────────────────────────────────────────── */}
          {isAdmin && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                <ShieldAlert size={13} color="#dc2626" />
                <span className="db-section-label" style={{ color: "#dc2626", marginBottom: 0 }}>
                  Admin Panel
                </span>
              </div>
              <div className="db-admin-grid">
                {ADMIN_TOOLS.map(t => <AdminCard key={t.id} tool={t} onNavigate={onNavigate} />)}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ─── Tool Card ─────────────────────────────────────────────────────────────── */
function ToolCard({ tool, onNavigate }: { tool: Tool; onNavigate: (id: string) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      className="db-tool-card"
      onClick={() => onNavigate(tool.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: hov ? (tool.iconBg ?? "#f3f4f6") : (tool.iconBg ?? "#f9fafb"),
          border: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tool.tagColor ?? "#374151",
          transition: "background 0.15s",
          flexShrink: 0,
        }}>
          {tool.icon}
        </div>
        {tool.tag && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "2px 7px", borderRadius: 5,
            background: (tool.tagColor ?? "#2563eb") + "18",
            color: tool.tagColor ?? "#2563eb",
          }}>
            {tool.tag}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#111827", marginBottom: 4, lineHeight: 1.3 }}>
          {tool.label}
        </div>
        <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.55 }}>
          {tool.desc}
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 12.5, fontWeight: 600,
        color: hov ? "#2563eb" : "#9ca3af",
        transition: "color 0.15s",
      }}>
        Buka <ArrowRight size={13} />
      </div>
    </button>
  );
}

/* ─── Admin Card ────────────────────────────────────────────────────────────── */
function AdminCard({ tool, onNavigate }: { tool: Tool; onNavigate: (id: string) => void }) {
  return (
    <button type="button" className="db-admin-card" onClick={() => onNavigate(tool.id)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: (tool.tagColor ?? "#dc2626") + "12",
          border: "1px solid " + (tool.tagColor ?? "#dc2626") + "25",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tool.tagColor ?? "#dc2626",
        }}>
          {tool.icon}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "left" }}>
          {tool.label}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.5, textAlign: "left" }}>
        {tool.desc}
      </div>
    </button>
  );
}
