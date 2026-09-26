"use client";

import { useEffect, useState } from "react";
import {
  Tag, ZoomIn, MessageSquare, ArrowUpRight,
  Clock, Shield, ChevronRight,
  Power, Radio, ShieldCheck, Mail, Lock,
  Megaphone, Database, Crown, Gift, Trophy,
  Flame, Sparkles, History, Zap, TrendingUp,
  ShieldAlert, ArrowRight, Layers
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  tag?: string;
  tagColor?: string;
  accentBg?: string;
}

/* ─── Data ───────────────────────────────────────────────────────────────────── */
const TOOLS: Tool[] = [
  {
    id: "metadata",
    icon: <Tag size={18} strokeWidth={2} />,
    label: "Metadata AI",
    desc: "Generate title, keyword & kategori untuk Adobe Stock, Shutterstock, dan Magnific secara otomatis.",
    tag: "Populer",
    tagColor: "#2563eb",
    accentBg: "#eff6ff",
  },
  {
    id: "history",
    icon: <History size={18} strokeWidth={2} />,
    label: "Riwayat Cloud",
    desc: "Semua hasil metadata tersimpan di database cloud. Akses dan unduh CSV kapan saja.",
    tag: "Cloud",
    tagColor: "#059669",
    accentBg: "#ecfdf5",
  },
  {
    id: "upscale",
    icon: <ZoomIn size={18} strokeWidth={2} />,
    label: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 8K menggunakan Sharp Lanczos3 server-side.",
    tag: "Sharp",
    tagColor: "#7c3aed",
    accentBg: "#faf5ff",
  },
  {
    id: "leaderboard",
    icon: <Trophy size={18} strokeWidth={2} />,
    label: "Leaderboard",
    desc: "Statistik proses foto harian dan peringkat kontributor komunitas microstock.",
    tag: "Live",
    tagColor: "#d97706",
    accentBg: "#fffbeb",
  },
  {
    id: "google-flow",
    icon: <Sparkles size={18} strokeWidth={2} />,
    label: "Google Flow AI",
    desc: "Studio kreatif Gemini untuk generasi foto, video, dan tool kustom unlimited.",
    tag: "Unlimited",
    tagColor: "#7c3aed",
    accentBg: "#faf5ff",
  },
  {
    id: "feedback",
    icon: <MessageSquare size={18} strokeWidth={2} />,
    label: "Laporan & Saran",
    desc: "Kirim laporan bug atau ide fitur langsung ke tim pengembang.",
    accentBg: "#f9fafb",
  },
];

const ADMIN_TOOLS: Tool[] = [
  { id: "shutdown",       icon: <Power size={16} />,       label: "Server Control",  desc: "Shutdown server dan mode maintenance.",          tagColor: "#dc2626", accentBg: "#fff5f5" },
  { id: "monitor",        icon: <Radio size={16} />,        label: "Server Monitor",  desc: "Real-time CPU, memori, dan request rate.",       tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "accounts",       icon: <ShieldCheck size={16} />,  label: "Accounts",        desc: "Daftar akun dan status online live.",            tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "messageweb",     icon: <Mail size={16} />,         label: "Broadcast",       desc: "Kirim pesan atau perintah ke semua user.",       tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "closing",        icon: <Lock size={16} />,         label: "Feature Lock",    desc: "Tutup akses fitur tertentu.",                   tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "admin-messages", icon: <Megaphone size={16} />,    label: "Mass Email",      desc: "Kelola feedback dan kirim mass email.",         tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "storage",        icon: <Database size={16} />,     label: "Redis Monitor",   desc: "Pantau memori dan statistik database.",         tagColor: "#2563eb", accentBg: "#eff6ff" },
  { id: "prem_access",    icon: <Crown size={16} />,        label: "Premium Engine",  desc: "Kelola akses premium dan auto-expiry.",          tagColor: "#d97706", accentBg: "#fffbeb" },
  { id: "giveaway",       icon: <Gift size={16} />,         label: "Giveaway",        desc: "Platform giveaway otomatis.",                   tagColor: "#db2777", accentBg: "#fdf2f8" },
];

interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
  isAdmin?: boolean;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
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
    <div style={{ width: "100%", minHeight: "100%", padding: "0 0 80px", fontFamily: "inherit" }}>
      <style>{`
        .db-wrap { max-width: 1200px; margin: 0 auto; padding: 32px 28px; }
        .db-layout { display: grid; grid-template-columns: 300px 1fr; gap: 28px; align-items: start; }
        .db-tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .db-admin-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .db-card {
          display: flex; flex-direction: column; gap: 10px;
          padding: 18px; border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer; text-align: left;
          transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s;
          font-family: inherit;
        }
        .db-card:hover {
          border-color: #c7d2fe;
          box-shadow: 0 4px 16px rgba(0,0,0,0.07);
          transform: translateY(-1px);
        }
        .db-admin-card {
          display: flex; flex-direction: column; gap: 8px;
          padding: 14px 16px; border-radius: 10px;
          border: 1px solid #fee2e2;
          background: #fff;
          cursor: pointer; text-align: left;
          transition: box-shadow 0.15s, background 0.15s;
          font-family: inherit;
        }
        .db-admin-card:hover { background: #fff5f5; box-shadow: 0 2px 10px rgba(220,38,38,0.08); }
        .db-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 7px;
          font-size: 12.5px; font-weight: 600; cursor: pointer;
          border: 1px solid #e5e7eb; background: #fff;
          color: #374151; transition: background 0.12s, border-color 0.12s;
          font-family: inherit; white-space: nowrap;
        }
        .db-pill:hover { background: #f9fafb; border-color: #d1d5db; }
        .db-pill--primary {
          background: #111827 !important; color: #fff !important;
          border-color: #111827 !important;
        }
        .db-pill--primary:hover { background: #1f2937 !important; }
        @media (max-width: 900px) {
          .db-layout { grid-template-columns: 1fr !important; }
          .db-tool-grid { grid-template-columns: 1fr !important; }
          .db-admin-grid { grid-template-columns: 1fr 1fr !important; }
          .db-wrap { padding: 20px 16px !important; }
        }
        @media (max-width: 540px) {
          .db-admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="db-wrap">
        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="db-layout">

          {/* ── LEFT COLUMN: Greeting + Stats + Quick Actions ─────────── */}
          <div style={{ position: "sticky", top: 72 }}>
            {/* Greeting */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{
                fontSize: "clamp(20px, 2.5vw, 26px)",
                fontWeight: 700, color: "#111827",
                margin: "0 0 6px", letterSpacing: "-0.025em", lineHeight: 1.2,
              }}>
                {greeting},{" "}
                <span style={{ color: "#2563eb" }}>{username ?? "Kreator"}</span>
                {isAdmin && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 4,
                    background: "#fee2e2", color: "#dc2626",
                    verticalAlign: "middle", letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>Admin</span>
                )}
              </h1>
              <p style={{ fontSize: 13.5, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
                Pilih tool yang ingin digunakan. Hasil proses tersimpan otomatis di cloud.
              </p>
            </div>

            {/* Today badge */}
            <button type="button" onClick={() => onNavigate("leaderboard")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid #d1fae5", background: "#ecfdf5",
                cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "#065f46",
                fontFamily: "inherit", marginBottom: 20, width: "100%", justifyContent: "space-between",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Flame size={14} color="#059669" />
                <span>Foto diproses hari ini</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <strong style={{ fontSize: 15 }}>{todayPhotos.toLocaleString("id-ID")}</strong>
                <ChevronRight size={13} color="#059669" />
              </div>
            </button>

            {/* Stats */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
              {[
                { icon: <Zap size={13} color="#2563eb" />,       label: "AI Engine", value: "Groq 120B + Vision" },
                { icon: <Shield size={13} color="#059669" />,     label: "Platform",  value: "Adobe · Shutterstock · Magnific" },
                { icon: <TrendingUp size={13} color="#d97706" />, label: "Output",    value: "CSV Siap Upload" },
                { icon: <Clock size={13} color="#7c3aed" />,      label: "Speed",     value: "~15 detik / foto" },
              ].map((s, i, arr) => (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", background: "#fff",
                  borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <button className="db-pill db-pill--primary" type="button" onClick={() => onNavigate("metadata")}>
                <Tag size={13} /> Mulai Metadata AI <ArrowRight size={13} style={{ marginLeft: "auto" }} />
              </button>
              <div style={{ display: "flex", gap: 7 }}>
                <button className="db-pill" type="button" onClick={() => onNavigate("upscale")} style={{ flex: 1 }}>
                  <ZoomIn size={13} color="#7c3aed" /> Upscaler
                </button>
                <button className="db-pill" type="button" onClick={() => onNavigate("history")} style={{ flex: 1 }}>
                  <History size={13} color="#059669" /> Riwayat
                </button>
              </div>
              <button className="db-pill" type="button" onClick={() => onNavigate("google-flow")}
                style={{ background: "#faf5ff", color: "#5b21b6", borderColor: "#e9d5ff" }}>
                <Sparkles size={13} /> Google Flow AI
              </button>
              {!isAdmin && (
                <button className="db-pill" type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"))}
                  style={{ background: "#fefce8", color: "#92400e", borderColor: "#fde68a" }}>
                  <Crown size={13} color="#d97706" /> Upgrade ke Premium
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Tool Cards ──────────────────────────────── */}
          <div>
            {/* Section label */}
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>
              Creator Tools
            </div>

            {/* Tool grid */}
            <div className="db-tool-grid" style={{ marginBottom: isAdmin ? 32 : 0 }}>
              {TOOLS.map(t => <ToolCard key={t.id} tool={t} onNavigate={onNavigate} />)}
            </div>

            {/* Admin */}
            {isAdmin && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <ShieldAlert size={13} color="#dc2626" />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#dc2626", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    Admin Panel
                  </span>
                </div>
                <div className="db-admin-grid">
                  {ADMIN_TOOLS.map(t => <AdminCard key={t.id} tool={t} onNavigate={onNavigate} />)}
                </div>
              </>
            )}
          </div>
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
      className="db-card"
      onClick={() => onNavigate(tool.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Icon + tag row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: hov ? (tool.accentBg ?? "#f9fafb") : "#f9fafb",
          border: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tool.tagColor ?? "#374151",
          transition: "background 0.15s",
        }}>
          {tool.icon}
        </div>
        {tool.tag && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "2px 7px", borderRadius: 5,
            background: (tool.tagColor ?? "#2563eb") + "15",
            color: tool.tagColor ?? "#2563eb",
          }}>
            {tool.tag}
          </span>
        )}
      </div>

      {/* Text */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{tool.label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>{tool.desc}</div>
      </div>

      {/* CTA */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5, marginTop: "auto",
        fontSize: 12, fontWeight: 600, color: hov ? "#2563eb" : "#9ca3af",
        transition: "color 0.15s",
      }}>
        Buka <ArrowUpRight size={13} />
      </div>
    </button>
  );
}

/* ─── Admin Card ────────────────────────────────────────────────────────────── */
function AdminCard({ tool, onNavigate }: { tool: Tool; onNavigate: (id: string) => void }) {
  return (
    <button
      type="button"
      className="db-admin-card"
      onClick={() => onNavigate(tool.id)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: (tool.tagColor ?? "#dc2626") + "12",
          border: "1px solid " + (tool.tagColor ?? "#dc2626") + "25",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tool.tagColor ?? "#dc2626",
        }}>
          {tool.icon}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{tool.label}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.5 }}>{tool.desc}</div>
    </button>
  );
}
