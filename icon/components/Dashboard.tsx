"use client";

import { useEffect, useState } from "react";
import {
  Tag, ZoomIn, MessageSquare, ArrowUpRight,
  Clock, Shield, ChevronRight,
  FileText, Layers, Power, Radio,
  ShieldCheck, Mail, Lock, Megaphone, Database,
  Crown, Gift, Trophy, Flame, Sparkles,
  History, Zap, TrendingUp, ShieldAlert
} from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  tag?: string;
  tagColor?: string;
}

/* ─── Data ─────────────────────────────────────────────────────────────────── */
const TOOLS: Tool[] = [
  {
    id: "metadata",
    icon: <Tag size={16} strokeWidth={2} />,
    label: "Metadata AI",
    desc: "Generate title, keyword & kategori untuk Adobe Stock, Shutterstock, dan Magnific.",
    tag: "Populer",
    tagColor: "#2563eb",
  },
  {
    id: "history",
    icon: <History size={16} strokeWidth={2} />,
    label: "Riwayat Cloud",
    desc: "Semua hasil metadata tersimpan di database cloud. Akses dan unduh CSV kapan saja.",
    tag: "Cloud",
    tagColor: "#059669",
  },
  {
    id: "upscale",
    icon: <ZoomIn size={16} strokeWidth={2} />,
    label: "AI Upscaler",
    desc: "Tingkatkan resolusi gambar hingga 8K menggunakan Sharp Lanczos3 server-side.",
    tag: "Sharp",
    tagColor: "#7c3aed",
  },
  {
    id: "leaderboard",
    icon: <Trophy size={16} strokeWidth={2} />,
    label: "Leaderboard",
    desc: "Statistik proses foto harian dan peringkat kontributor komunitas microstock.",
    tag: "Live",
    tagColor: "#d97706",
  },
  {
    id: "google-flow",
    icon: <Sparkles size={16} strokeWidth={2} />,
    label: "Google Flow AI",
    desc: "Studio kreatif Gemini untuk generasi foto, video, dan tool kustom unlimited.",
    tag: "Unlimited",
    tagColor: "#7c3aed",
  },
  {
    id: "feedback",
    icon: <MessageSquare size={16} strokeWidth={2} />,
    label: "Laporan & Saran",
    desc: "Kirim laporan bug atau ide fitur langsung ke tim pengembang.",
  },
];

const ADMIN_TOOLS: Tool[] = [
  { id: "shutdown",       icon: <Power size={15} strokeWidth={2} />,       label: "Server Control",   desc: "Shutdown server dan mode maintenance." },
  { id: "monitor",        icon: <Radio size={15} strokeWidth={2} />,        label: "Server Monitor",   desc: "Real-time CPU, memori, dan request rate." },
  { id: "accounts",       icon: <ShieldCheck size={15} strokeWidth={2} />,  label: "Accounts",         desc: "Daftar akun dan status online live." },
  { id: "messageweb",     icon: <Mail size={15} strokeWidth={2} />,         label: "Broadcast",        desc: "Kirim pesan atau perintah ke semua user." },
  { id: "closing",        icon: <Lock size={15} strokeWidth={2} />,         label: "Feature Lock",     desc: "Tutup akses fitur tertentu." },
  { id: "admin-messages", icon: <Megaphone size={15} strokeWidth={2} />,    label: "Mass Email",       desc: "Kelola feedback dan kirim mass email." },
  { id: "storage",        icon: <Database size={15} strokeWidth={2} />,     label: "Redis Monitor",    desc: "Pantau memori dan statistik database." },
  { id: "prem_access",    icon: <Crown size={15} strokeWidth={2} />,        label: "Premium Engine",   desc: "Kelola akses premium dan auto-expiry." },
  { id: "giveaway",       icon: <Gift size={15} strokeWidth={2} />,         label: "Giveaway",         desc: "Platform giveaway otomatis." },
];

/* ─── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  onNavigate: (tab: string) => void;
  username?: string;
  isAdmin?: boolean;
}

/* ─── Dashboard ────────────────────────────────────────────────────────────── */
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
    <div style={{
      maxWidth: 780,
      margin: "0 auto",
      padding: "32px 20px 80px",
      fontFamily: "inherit",
    }}>

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <h1 style={{
            fontSize: "clamp(22px, 3.5vw, 28px)",
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
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: "#fee2e2",
                color: "#dc2626",
                verticalAlign: "middle",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                Admin
              </span>
            )}
          </h1>

          {/* Today counter */}
          <button
            type="button"
            onClick={() => onNavigate("leaderboard")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 20,
              border: "1px solid #d1fae5", background: "#ecfdf5",
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#065f46",
              fontFamily: "inherit",
            }}
          >
            <Flame size={12} color="#059669" />
            {todayPhotos.toLocaleString("id-ID")} foto hari ini
            <ChevronRight size={11} color="#059669" />
          </button>
        </div>

        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
          Pilih tool yang ingin digunakan. Hasil proses tersimpan otomatis di cloud.
        </p>

        {/* Quick action pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onNavigate("metadata")}
            style={btnStyle(true)}>
            <Tag size={13} />
            Metadata AI
          </button>
          <button type="button" onClick={() => onNavigate("upscale")}
            style={btnStyle()}>
            <ZoomIn size={13} color="#7c3aed" />
            AI Upscaler
          </button>
          <button type="button" onClick={() => onNavigate("history")}
            style={btnStyle()}>
            <History size={13} color="#059669" />
            Riwayat
          </button>
          <button type="button" onClick={() => onNavigate("google-flow")}
            style={{ ...btnStyle(), background: "#faf5ff", color: "#5b21b6", borderColor: "#e9d5ff" }}>
            <Sparkles size={13} />
            Google Flow
          </button>
          {!isAdmin && (
            <button type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"))}
              style={{ ...btnStyle(), background: "#fefce8", color: "#92400e", borderColor: "#fde68a" }}>
              <Crown size={13} color="#d97706" />
              Premium
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 36,
      }}>
        {[
          { icon: <Zap size={13} color="#2563eb" />,        label: "AI Engine", value: "Groq 120B" },
          { icon: <Shield size={13} color="#059669" />,      label: "Platform",  value: "3 Microstock" },
          { icon: <TrendingUp size={13} color="#d97706" />,  label: "Output",    value: "CSV Ready" },
          { icon: <Clock size={13} color="#7c3aed" />,       label: "Speed",     value: "~15s / foto" },
        ].map((s, i, arr) => (
          <div key={s.label} style={{
            padding: "12px 14px",
            background: "#fff",
            borderRight: i < arr.length - 1 ? "1px solid #e5e7eb" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              {s.icon}
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {s.label}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Creator Tools ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: isAdmin ? 40 : 0 }}>
        <SectionLabel>Creator Tools</SectionLabel>
        <ToolList tools={TOOLS} onNavigate={onNavigate} />
      </div>

      {/* ── Admin Tools ──────────────────────────────────────────────── */}
      {isAdmin && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <ShieldAlert size={13} color="#dc2626" />
            <SectionLabel color="#dc2626">Admin Panel</SectionLabel>
          </div>
          <ToolList tools={ADMIN_TOOLS} onNavigate={onNavigate} admin />
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 8 }}>
        <FileText size={12} color="#9ca3af" />
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          Gunakan tombol <strong style={{ color: "#6b7280" }}>← Dashboard</strong> di header untuk kembali kapan saja.
        </p>
      </div>
    </div>
  );
}

/* ─── Helper: button style ─────────────────────────────────────────────────── */
function btnStyle(primary = false): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 7,
    border: primary ? "none" : "1px solid #e5e7eb",
    background: primary ? "#111827" : "#ffffff",
    color: primary ? "#fff" : "#374151",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap" as const,
  };
}

/* ─── Section label ────────────────────────────────────────────────────────── */
function SectionLabel({ children, color = "#9ca3af" }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color,
      letterSpacing: "0.07em", textTransform: "uppercase" as const,
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

/* ─── Tool list ────────────────────────────────────────────────────────────── */
function ToolList({ tools, onNavigate, admin = false }: { tools: Tool[]; onNavigate: (id: string) => void; admin?: boolean }) {
  return (
    <div style={{
      border: "1px solid " + (admin ? "#fee2e2" : "#e5e7eb"),
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {tools.map((t, i) => (
        <ToolRow
          key={t.id}
          tool={t}
          onNavigate={onNavigate}
          admin={admin}
          isLast={i === tools.length - 1}
        />
      ))}
    </div>
  );
}

/* ─── Tool row ─────────────────────────────────────────────────────────────── */
function ToolRow({
  tool, onNavigate, admin = false, isLast = false,
}: {
  tool: Tool;
  onNavigate: (id: string) => void;
  admin?: boolean;
  isLast?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onNavigate(tool.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 18px", width: "100%",
        background: hov ? (admin ? "#fff5f5" : "#f9fafb") : "#ffffff",
        border: "none",
        borderBottom: isLast ? "none" : "1px solid " + (admin ? "#fee2e2" : "#f3f4f6"),
        cursor: "pointer", textAlign: "left",
        transition: "background 0.1s",
        fontFamily: "inherit",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: hov ? (admin ? "#fee2e2" : "#f3f4f6") : "#f9fafb",
        border: "1px solid " + (admin ? "#fecaca" : "#e5e7eb"),
        display: "flex", alignItems: "center", justifyContent: "center",
        color: admin ? "#dc2626" : "#374151",
        transition: "background 0.1s",
      }}>
        {tool.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{tool.label}</span>
          {tool.tag && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              padding: "1px 6px", borderRadius: 4,
              background: (tool.tagColor ?? "#2563eb") + "14",
              color: tool.tagColor ?? "#2563eb",
            }}>
              {tool.tag}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 12, color: "#6b7280", lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {tool.desc}
        </div>
      </div>

      {/* Arrow */}
      <ArrowUpRight
        size={14}
        color={hov ? (admin ? "#dc2626" : "#2563eb") : "#d1d5db"}
        style={{ flexShrink: 0, transition: "color 0.1s" }}
      />
    </button>
  );
}
