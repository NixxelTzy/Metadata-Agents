"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Crown, Sparkles, Terminal, Send, RefreshCw, CheckCircle2,
  AlertTriangle, XCircle, Clock, Users, Trash2, Plus,
  Copy, Check, ArrowRight, ShieldCheck, Zap, Search,
  Calendar, KeyRound, CornerDownLeft, FileText, Info
} from "lucide-react";
import { showToast } from "./Toast";

interface ActivePremUser {
  id: string;
  email: string;
  username: string;
  role: string;
  premiumPlan: string;
  premiumExpiresAt: string;
  premiumGrantedAt?: string;
  premiumGrantedBy?: string;
  remainingDays: number;
  remainingHours: number;
  remainingMinutes: number;
  isExpired: boolean;
}

interface PremLog {
  id: string;
  timestamp: string;
  adminEmail: string;
  command: string;
  rawText: string;
  status: "success" | "error" | "info";
  targetEmail?: string;
  targetPlan?: string;
  replyText: string;
}

interface Stats {
  totalUsers: number;
  activePremiumCount: number;
  totalLogs: number;
  recentlyExpiredCount: number;
}

export default function PremAccessPanel() {
  const [activeUsers, setActiveUsers] = useState<ActivePremUser[]>([]);
  const [logs, setLogs] = useState<PremLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activePremiumCount: 0,
    totalLogs: 0,
    recentlyExpiredCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Command input
  const [commandInput, setCommandInput] = useState("prem 30 hari ");
  const [searchFilter, setSearchFilter] = useState("");

  // Console output history
  const [consoleHistory, setConsoleHistory] = useState<Array<{
    command: string;
    reply: string;
    status: "success" | "error" | "info";
    timestamp: string;
  }>>([
    {
      command: "help",
      reply: "⚡ PREM ACCESS CONSOLE READY\nKetik perintah seperti:\n• prem 7 hari <email>\n• prem 30 hari <email>\n• prem 1 tahun <email>\n• unprem <email>\n• list prem",
      status: "info",
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all data
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/prem-access");
      if (!res.ok) throw new Error("Gagal mengambil data Prem Access");
      const data = await res.json();
      if (data.activeUsers) setActiveUsers(data.activeUsers);
      if (data.logs) setLogs(data.logs);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error(err);
      if (!silent) {
        showToast({ type: "error", title: "Gagal Memuat Data", message: err instanceof Error ? err.message : "Error" });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds to keep live countdowns fresh and enforce auto-demotions
    const timer = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Execute command from input
  const handleExecuteCommand = async (cmdToRun?: string) => {
    const text = (cmdToRun !== undefined ? cmdToRun : commandInput).trim();
    if (!text) {
      showToast({ type: "warning", title: "Input Kosong", message: "Masukkan perintah terlebih dahulu." });
      return;
    }

    setActionLoading("exec");
    try {
      const res = await fetch("/api/admin/prem-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exec_command", commandText: text }),
      });
      const data = await res.json();

      if (!res.ok && !data.reply) {
        throw new Error(data.error || "Gagal mengeksekusi perintah");
      }

      setConsoleHistory((prev) => [
        {
          command: text,
          reply: data.reply || (data.ok ? "Perintah berhasil diproses." : data.error || "Gagal"),
          status: data.status || (data.ok ? "success" : "error"),
          timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
        ...prev,
      ]);

      if (data.ok) {
        showToast({
          type: "success",
          title: "Perintah Berhasil!",
          message: data.targetEmail
            ? `${text.split(" ")[0].toUpperCase()} untuk ${data.targetEmail}`
            : "Perintah selesai dieksekusi.",
        });
      } else {
        showToast({
          type: "error",
          title: "Perintah Gagal",
          message: data.reply?.split("\n")[0] || data.error || "Periksa kembali format perintah.",
        });
      }

      await fetchData(true);
    } catch (err) {
      showToast({ type: "error", title: "Error Eksekusi", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Quick Action: Grant / Extend
  const handleQuickGrant = async (email: string, days: number, planLabel: string) => {
    setActionLoading(`grant-${email}-${days}`);
    try {
      const res = await fetch("/api/admin/prem-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quick_grant",
          email,
          durationDays: days,
          planLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memberikan premium");

      showToast({ type: "success", title: "Premium Diperbarui", message: `${email} (+${planLabel})` });
      await fetchData(true);
    } catch (err) {
      showToast({ type: "error", title: "Gagal", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Quick Action: Revoke
  const handleQuickRevoke = async (email: string) => {
    if (!confirm(`Yakin ingin mencabut akses premium untuk ${email}? Role akan kembali ke regular user (100k token/hari).`)) {
      return;
    }
    setActionLoading(`revoke-${email}`);
    try {
      const res = await fetch("/api/admin/prem-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quick_revoke", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencabut premium");

      showToast({ type: "info", title: "Akses Dicabut", message: `${email} telah kembali ke user regular.` });
      await fetchData(true);
    } catch (err) {
      showToast({ type: "error", title: "Gagal Revoke", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // On-demand expiry check
  const handleRunExpiryCheck = async () => {
    setActionLoading("check_exp");
    try {
      const res = await fetch("/api/admin/prem-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_expiries" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menjalankan pemeriksaan");

      if (data.expiredCount > 0) {
        showToast({
          type: "warning",
          title: "Pencabutan Otomatis Selesai",
          message: `${data.expiredCount} akun yang telah lewat masa aktifnya berhasil dicabut dan dikembalikan ke user regular.`,
        });
      } else {
        showToast({
          type: "success",
          title: "Semua Akun Valid",
          message: "Seluruh akun premium masih dalam masa aktif yang sah.",
        });
      }
      await fetchData(true);
    } catch (err) {
      showToast({ type: "error", title: "Gagal Cek", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Copy text to clipboard
  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
    showToast({ type: "info", title: "Disalin ke Clipboard", message: text });
  };

  // Filtered active users
  const filteredUsers = activeUsers.filter(
    (u) =>
      u.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.premiumPlan.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: "#0f172a",
      }}
    >
      <style>{`
        .pa-card {
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(147, 197, 253, 0.45);
          border-radius: 18px;
          padding: 22px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          margin-bottom: 20px;
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.08);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .pa-card:hover {
          border-color: rgba(59, 130, 246, 0.5);
          box-shadow: 0 8px 30px rgba(59, 130, 246, 0.12);
        }
        .pa-input {
          background: rgba(255, 255, 255, 0.85);
          border: 1.5px solid rgba(147, 197, 253, 0.5);
          border-radius: 10px;
          padding: 11px 15px;
          color: #0f172a;
          font-size: 13.5px;
          font-family: inherit;
          outline: none;
          transition: all 0.15s;
        }
        .pa-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
          background: #ffffff;
        }
        .pa-btn {
          padding: 9px 15px;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.16s;
          font-family: inherit;
        }
        .pa-btn-primary {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
        }
        .pa-btn-primary:hover {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(59, 130, 246, 0.45);
        }
        .pa-btn-danger {
          background: rgba(254, 226, 226, 0.7);
          border: 1px solid rgba(252, 165, 165, 0.6);
          color: #dc2626;
        }
        .pa-btn-danger:hover {
          background: rgba(254, 202, 202, 0.9);
          border-color: #ef4444;
          color: #991b1b;
        }
        .pa-btn-secondary {
          background: rgba(219, 234, 254, 0.6);
          border: 1px solid rgba(147, 197, 253, 0.5);
          color: #1e40af;
        }
        .pa-btn-secondary:hover {
          background: rgba(191, 219, 254, 0.8);
          color: #1d4ed8;
        }
        .pa-chip {
          font-size: 11.5px;
          font-weight: 700;
          padding: 5px 12px;
          border-radius: 8px;
          cursor: pointer;
          border: 1px solid rgba(147, 197, 253, 0.5);
          background: rgba(219, 234, 254, 0.6);
          color: #1e40af;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .pa-chip:hover {
          background: rgba(191, 219, 254, 0.85);
          border-color: #3b82f6;
          color: #1d4ed8;
          transform: translateY(-1px);
        }
        .pa-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .terminal-box {
          background: #0f172a;
          border: 1px solid rgba(147, 197, 253, 0.3);
          border-radius: 12px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          color: #e2e8f0;
          padding: 16px;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.2);
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #eab308, #ca8a04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(234, 179, 8, 0.35)",
            }}
          >
            <Crown size={26} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "900", margin: 0, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: "8px" }}>
              Prem Access <span style={{ fontSize: "12px", fontWeight: "800", color: "#facc15", background: "rgba(234, 179, 8, 0.15)", border: "1px solid rgba(234, 179, 8, 0.3)", padding: "2px 8px", borderRadius: "6px" }}>COMMAND CENTER</span>
            </h1>
            <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "2px" }}>
              Platform eksekusi perintah <code style={{ color: "#1d4ed8" }}>prem</code>, <code style={{ color: "#1d4ed8" }}>unprem</code>, <code style={{ color: "#1d4ed8" }}>list prem</code> &amp; pencabutan otomatis saat masa aktif habis.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span
            className="pa-badge"
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              color: "#15803d",
              padding: "6px 12px",
            }}
          >
            <Zap size={13} />
            {stats.activePremiumCount} Akun Premium Aktif
          </span>

          <button
            type="button"
            className="pa-btn pa-btn-secondary"
            onClick={() => fetchData()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* ── CARD 1: COMMAND CONSOLE & EXECUTION BOX ── */}
      <div className="pa-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Terminal size={18} color="#2563eb" />
            <span style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a" }}>Command Console</span>
          </div>
          <span style={{ fontSize: "11.5px", color: "#475569", fontWeight: 600 }}>
            Format: <code style={{ color: "#1d4ed8", fontWeight: 700 }}>prem &lt;7 hari | 30 hari | 1 tahun&gt; &lt;email&gt;</code> atau <code style={{ color: "#1d4ed8", fontWeight: 700 }}>unprem &lt;email&gt;</code>
          </span>
        </div>

        {/* Quick Command Template Chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          <span style={{ fontSize: "11.5px", color: "#475569", alignSelf: "center", fontWeight: "700" }}>Template Cepat:</span>
          <button
            type="button"
            className="pa-chip"
            onClick={() => {
              setCommandInput("prem 7 hari ");
              inputRef.current?.focus();
            }}
          >
            <Sparkles size={12} />
            prem 7 hari (5k)
          </button>
          <button
            type="button"
            className="pa-chip"
            onClick={() => {
              setCommandInput("prem 30 hari ");
              inputRef.current?.focus();
            }}
          >
            <Sparkles size={12} />
            prem 30 hari (20k)
          </button>
          <button
            type="button"
            className="pa-chip"
            onClick={() => {
              setCommandInput("prem 1 tahun ");
              inputRef.current?.focus();
            }}
          >
            <Crown size={12} />
            prem 1 tahun (80k)
          </button>
          <button
            type="button"
            className="pa-chip"
            style={{ background: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#fca5a5" }}
            onClick={() => {
              setCommandInput("unprem ");
              inputRef.current?.focus();
            }}
          >
            <Trash2 size={12} />
            unprem &lt;email&gt;
          </button>
          <button
            type="button"
            className="pa-chip"
            style={{ background: "rgba(219,234,254,0.7)", borderColor: "rgba(147,197,253,0.6)", color: "#1e40af" }}
            onClick={() => handleExecuteCommand("list prem")}
          >
            <FileText size={12} />
            list prem
          </button>
          <button
            type="button"
            className="pa-chip"
            style={{ background: "rgba(219,234,254,0.5)", borderColor: "rgba(147,197,253,0.5)", color: "#334155" }}
            onClick={() => handleExecuteCommand("help")}
          >
            <Info size={12} />
            help
          </button>
        </div>

        {/* Command Input Bar */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              className="pa-input"
              style={{ width: "100%", fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", paddingRight: "40px" }}
              placeholder="Contoh: prem 30 hari user@gmail.com"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleExecuteCommand();
              }}
            />
            <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "11px", pointerEvents: "none", fontWeight: 600 }}>
              ↵ Enter
            </span>
          </div>

          <button
            type="button"
            className="pa-btn pa-btn-primary"
            onClick={() => handleExecuteCommand()}
            disabled={actionLoading === "exec"}
            style={{ padding: "0 24px", minWidth: "140px" }}
          >
            <Send size={15} />
            {actionLoading === "exec" ? "Memproses..." : "Eksekusi"}
          </button>
        </div>

        {/* Live Terminal Output Stream */}
        <div className="terminal-box" style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          {consoleHistory.map((item, idx) => (
            <div
              key={idx}
              style={{
                paddingBottom: "12px",
                borderBottom: idx === consoleHistory.length - 1 ? "none" : "1px solid rgba(147, 197, 253, 0.15)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#38bdf8", fontWeight: "800" }}>$</span>
                  <span style={{ color: "#f8fafc", fontWeight: "700" }}>{item.command}</span>
                  <span
                    className="pa-badge"
                    style={{
                      fontSize: "9.5px",
                      background: item.status === "success" ? "rgba(34,197,94,0.2)" : item.status === "error" ? "rgba(239,68,68,0.2)" : "rgba(56,189,248,0.2)",
                      border: `1px solid ${item.status === "success" ? "rgba(34,197,94,0.4)" : item.status === "error" ? "rgba(239,68,68,0.4)" : "rgba(56,189,248,0.4)"}`,
                      color: item.status === "success" ? "#4ade80" : item.status === "error" ? "#f87171" : "#38bdf8",
                    }}
                  >
                    {item.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10.5px", color: "rgba(148,163,184,0.8)" }}>{item.timestamp}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(item.reply, idx)}
                    style={{ background: "transparent", border: "none", color: "rgba(148,163,184,0.7)", cursor: "pointer", padding: "2px" }}
                    title="Salin hasil output"
                  >
                    {copiedIndex === idx ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontSize: "12px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  color: item.status === "error" ? "#fca5a5" : "#cbd5e1",
                  paddingLeft: "14px",
                }}
              >
                {item.reply}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CARD 2: MONITOR PENGGUNA PREMIUM AKTIF DENGAN COUNTDOWN ── */}
      <div className="pa-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Users size={18} color="#ca8a04" />
            <span style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>Pengguna Premium Aktif ({filteredUsers.length})</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", minWidth: "220px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
              <input
                type="text"
                className="pa-input"
                style={{ width: "100%", paddingLeft: "32px", fontSize: "12px", padding: "7px 10px 7px 32px" }}
                placeholder="Cari email / username..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="pa-btn"
              onClick={handleRunExpiryCheck}
              disabled={actionLoading === "check_exp"}
              style={{
                fontSize: "11.5px",
                background: "rgba(234, 179, 8, 0.1)",
                border: "1px solid rgba(234, 179, 8, 0.35)",
                color: "#b45309",
              }}
            >
              <Clock size={13} />
              Cek &amp; Cabut Expired Otomatis
            </button>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div style={{ textAlign: "center", color: "#64748b", fontSize: "13px", padding: "36px 16px", fontWeight: 600 }}>
            {searchFilter ? "Tidak ada pengguna premium yang cocok dengan pencarian." : "Belum ada pengguna dengan status premium aktif."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(147,197,253,0.45)", textAlign: "left", color: "#334155" }}>
                  <th style={{ padding: "10px 12px", fontWeight: 700 }}>User &amp; Email</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700 }}>Paket</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700 }}>Sisa Waktu Masa Aktif</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700 }}>Kadaluarsa Pada</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>Aksi Cepat Admin</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid rgba(147,197,253,0.25)" }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Crown size={14} color="#ca8a04" />
                        {u.username}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>{u.email}</div>
                    </td>

                    <td style={{ padding: "12px" }}>
                      <span
                        className="pa-badge"
                        style={{
                          background: "rgba(234, 179, 8, 0.12)",
                          border: "1px solid rgba(234, 179, 8, 0.35)",
                          color: "#b45309",
                        }}
                      >
                        {u.premiumPlan}
                      </span>
                    </td>

                    <td style={{ padding: "12px" }}>
                      <span
                        className="pa-badge"
                        style={{
                          background: u.remainingDays <= 2 ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                          border: `1px solid ${u.remainingDays <= 2 ? "rgba(239, 68, 68, 0.35)" : "rgba(34, 197, 94, 0.35)"}`,
                          color: u.remainingDays <= 2 ? "#b91c1c" : "#15803d",
                        }}
                      >
                        <Clock size={11} />
                        {u.remainingDays > 0
                          ? `${u.remainingDays} hari ${u.remainingHours} jam`
                          : `${u.remainingHours} jam ${u.remainingMinutes} mnt`}
                      </span>
                    </td>

                    <td style={{ padding: "12px", fontSize: "11.5px", color: "#475569", fontWeight: 600 }}>
                      {new Date(u.premiumExpiresAt).toLocaleString("id-ID")}
                    </td>

                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="pa-btn"
                          onClick={() => handleQuickGrant(u.email, 7, "7 Hari")}
                          disabled={actionLoading === `grant-${u.email}-7`}
                          style={{ fontSize: "10.5px", padding: "4px 8px", background: "rgba(219,234,254,0.8)", border: "1px solid rgba(147,197,253,0.6)", color: "#1e40af" }}
                          title="Perpanjang 7 Hari"
                        >
                          +7 Hari
                        </button>
                        <button
                          type="button"
                          className="pa-btn"
                          onClick={() => handleQuickGrant(u.email, 30, "30 Hari")}
                          disabled={actionLoading === `grant-${u.email}-30`}
                          style={{ fontSize: "10.5px", padding: "4px 8px", background: "rgba(219,234,254,0.8)", border: "1px solid rgba(147,197,253,0.6)", color: "#1e40af" }}
                          title="Perpanjang 30 Hari"
                        >
                          +30 Hari
                        </button>
                        <button
                          type="button"
                          className="pa-btn"
                          onClick={() => handleQuickGrant(u.email, 365, "1 Tahun")}
                          disabled={actionLoading === `grant-${u.email}-365`}
                          style={{ fontSize: "10.5px", padding: "4px 8px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.35)", color: "#b45309" }}
                          title="Perpanjang 1 Tahun"
                        >
                          +1 Tahun
                        </button>
                        <button
                          type="button"
                          className="pa-btn pa-btn-danger"
                          onClick={() => handleQuickRevoke(u.email)}
                          disabled={actionLoading === `revoke-${u.email}`}
                          style={{ fontSize: "10.5px", padding: "4px 8px" }}
                          title="Cabut Akses Premium"
                        >
                          Unprem
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CARD 3: AUDIT LOG PERINTAH MASUK ── */}
      <div className="pa-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={18} color="#2563eb" />
            <span style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a" }}>Log Riwayat Perintah ({logs.length})</span>
          </div>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
            Audit trail eksekusi perintah admin
          </span>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", padding: "24px", fontWeight: 600 }}>
            Belum ada catatan aktivitas perintah.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "11px 14px",
                  background: "rgba(255,255,255,0.8)",
                  border: "1px solid rgba(147,197,253,0.45)",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    className="pa-badge"
                    style={{
                      background: log.status === "success" ? "rgba(34, 197, 94, 0.12)" : log.status === "error" ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                      border: `1px solid ${log.status === "success" ? "rgba(34, 197, 94, 0.35)" : log.status === "error" ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
                      color: log.status === "success" ? "#15803d" : log.status === "error" ? "#b91c1c" : "#1e40af",
                    }}
                  >
                    {log.status.toUpperCase()}
                  </span>

                  <span style={{ fontFamily: "monospace", fontSize: "12.5px", fontWeight: "700", color: "#0f172a" }}>
                    {log.rawText}
                  </span>

                  {log.targetEmail && (
                    <span style={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}>
                      → {log.targetEmail}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                  {new Date(log.timestamp).toLocaleString("id-ID")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
