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

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  tag?: string;
  tagColor?: string;
}

/* ─── Data ───────────────────────────────────────────────────────────────────── */
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

const STATS = [
  { icon: <Zap size={14} />,         label: "AI Engine",   value: "Groq 120B",      color: "#2563eb" },
  { icon: <Shield size={14} />,      label: "Platform",    value: "3 Microstock",   color: "#059669" },
  { icon: <TrendingUp size={14} />,  label: "Output",      value: "CSV Ready",      color: "#d97706" },
  { icon: <Clock size={14} />,       label: "Speed",       value: "~15s / foto",    color: "#7c3aed" },
];

/* ─── Component ──────────────────────────────────────────────────────────────── */
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
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px", fontFamily: "inherit" }}>

      {/* ── Wordmark ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#111827", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={15} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>Stock AI Studio</span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("leaderboard")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 6,
            border: "1px solid #d1fae5", background: "#ecfdf5",
            cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#065f46",
          }}
        >
          <Flame size={12} color="#059669" />
          {todayPhotos.toLocaleString("id-ID")} foto hari ini
          <ChevronRight size={11} color="#059669" />
        </button>
      </div>

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, color: "#111827", margin: "0 0 10px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {greeting},{" "}
          <span style={{ color: "#2563eb" }}>{username ?? "Kreator"}</span>
          {isAdmin && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", verticalAlign: "middle", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Admin
            </span>
          )}
        </h1>
        <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.65, margin: 0 }}>
          Pilih tool yang ingin digunakan di bawah ini.
        </p>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 48, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {STATS.map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: "14px 16px",
            borderRight: i < STATS.length - 1 ? "1px solid #e5e7eb" : "none",
            background: "#fff",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: s.color, marginBottom: 4 }}>
              {s.icon}
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 48 }}>
        {[
          { id: "metadata",    label: "Metadata AI",    icon: <Tag size={13} />,      primary: true  },
          { id: "history",     label: "Riwayat",        icon: <History size={13} />,  primary: false },
          { id: "upscale",     label: "Upscaler",       icon: <ZoomIn size={13} />,   primary: false },
          { id: "google-flow", label: "Google Flow",    icon: <Sparkles size={13} />, primary: false },
        ].map(b => (
          <button key={b.id} type="button" onClick={() => onNavigate(b.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 7,
            border: b.primary ? "none" : "1px solid #e5e7eb",
            background: b.primary ? "#111827" : "#fff",
            color: b.primary ? "#fff" : "#374151",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "opacity 0.15s",
            fontFamily: "inherit",
          }}>
            {b.icon}
            {b.label}
          </button>
        ))}
        {!isAdmin && (
          <button type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open_premium_pricing_modal"))}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 7,
              border: "1px solid #fde68a", background: "#fefce8",
              color: "#92400e", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
            <Crown size={13} color="#d97706" />
            Premium
          </button>
        )}
      </div>

      {/* ── Tools section ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 56 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 16 }}>
          Creator Tools
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          {TOOLS.map((t, i) => (
            <ToolRow key={t.id} tool={t} onNavigate={onNavigate} hasBorder={i < TOOLS.length} />
          ))}
        </div>
      </div>

      {/* ── Admin section ────────────────────────────────────────────── */}
      {isAdmin && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <ShieldAlert size={13} color="#dc2626" />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Admin Panel
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 1, border: "1px solid #fee2e2", borderRadius: 12, overflow: "hidden" }}>
            {ADMIN_TOOLS.map(t => (
              <ToolRow key={t.id} tool={t} onNavigate={onNavigate} admin />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer tip ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={13} color="#9ca3af" />
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          Gunakan tombol <strong style={{ color: "#374151" }}>← Kembali</strong> di bagian atas untuk kembali ke dashboard kapan saja.
        </p>
      </div>
    </div>
  );
}

/* ─── Tool Row Component ─────────────────────────────────────────────────────── */
function ToolRow({
  tool,
  onNavigate,
  admin = false,
  hasBorder = true,
}: {
  tool: Tool;
  onNavigate: (id: string) => void;
  admin?: boolean;
  hasBorder?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onNavigate(tool.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        background: hovered ? (admin ? "#fff5f5" : "#f9fafb") : "#fff",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
        fontFamily: "inherit",
        borderBottom: hasBorder ? "1px solid " + (admin ? "#fee2e2" : "#e5e7eb") : "none",
        width: "100%",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: hovered ? (admin ? "#fee2e2" : "#f3f4f6") : "#f9fafb",
        border: "1px solid " + (admin ? "#fecaca" : "#e5e7eb"),
        display: "flex", alignItems: "center", justifyContent: "center",
        color: admin ? "#dc2626" : "#374151",
        transition: "background 0.12s, border-color 0.12s",
      }}>
        {tool.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{tool.label}</span>
          {tool.tag && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              padding: "1px 6px", borderRadius: 4,
              background: (tool.tagColor ?? "#2563eb") + "14",
              color: tool.tagColor ?? "#2563eb",
              letterSpacing: "0.02em",
            }}>
              {tool.tag}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tool.desc}
        </div>
      </div>

      {/* Arrow */}
      <ArrowUpRight
        size={14}
        color={hovered ? (admin ? "#dc2626" : "#2563eb") : "#d1d5db"}
        style={{ flexShrink: 0, transition: "color 0.12s" }}
      />
    </button>
  );
}
