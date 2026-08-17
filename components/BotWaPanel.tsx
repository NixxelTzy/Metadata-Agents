"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bot, Smartphone, QrCode, KeyRound, ShieldCheck,
  Send, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Clock, Users, Trash2, Plus, Copy, Check, ArrowRight,
  Sparkles, ShieldAlert, Radio, HelpCircle, Terminal,
  ExternalLink, Zap
} from "lucide-react";
import { showToast } from "./Toast";

interface BotConfig {
  pairingMethod: "qr" | "code";
  targetNumber: string;
  status: "disconnected" | "connecting" | "qr_ready" | "code_ready" | "connected";
  pairingCode?: string;
  qrData?: string;
  connectedAt?: string;
  lastActive?: string;
}

interface ActivePremiumUser {
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
  isExpired: boolean;
}

interface BotLog {
  id: string;
  timestamp: string;
  senderNumber: string;
  command: string;
  rawText: string;
  status: "success" | "unauthorized" | "error" | "info";
  targetEmail?: string;
  targetPlan?: string;
  replyText: string;
}

export default function BotWaPanel() {
  const [config, setConfig] = useState<BotConfig>({
    pairingMethod: "code",
    targetNumber: "6282343769190",
    status: "connected",
    pairingCode: "8N9K-2P4Q",
  });
  const [adminNumbers, setAdminNumbers] = useState<string[]>(["6282343769190"]);
  const [activeUsers, setActiveUsers] = useState<ActivePremiumUser[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form states
  const [targetNumberInput, setTargetNumberInput] = useState("6282343769190");
  const [newAdminInput, setNewAdminInput] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<"code" | "qr">("code");

  // Simulator states
  const [simSender, setSimSender] = useState("6282343769190");
  const [simCommand, setSimCommand] = useState(".prem 30 hari ");
  const [simHistory, setSimHistory] = useState<Array<{ sender: string; text: string; reply: string; status: string; time: string }>>([
    {
      sender: "6282343769190",
      text: ".status",
      reply: "📊 *STATUS BOT & SISTEM*\n━━━━━━━━━━━━━━━━━━━━━\n🤖 *Bot State*: Online & Siap Memproses\n⚡ *Role Handler*: .prem & .unprem Ready\n━━━━━━━━━━━━━━━━━━━━━",
      status: "info",
      time: "15:45",
    },
  ]);

  const [copiedCode, setCopiedCode] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/botwa");
      if (!res.ok) throw new Error("Gagal mengambil data bot");
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setTargetNumberInput(data.config.targetNumber || "6282343769190");
        setSelectedMethod(data.config.pairingMethod || "code");
      }
      if (data.adminNumbers) setAdminNumbers(data.adminNumbers);
      if (data.activePremiumUsers) setActiveUsers(data.activePremiumUsers);
      if (data.logs) setLogs(data.logs);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle connect / restart session
  const handleConnect = async (method: "code" | "qr") => {
    setActionLoading("connect");
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          pairingMethod: method,
          targetNumber: targetNumberInput.trim() || "6282343769190",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghubungkan");
      showToast({ type: "success", title: "Bot Terhubung!", message: `Metode ${method === "code" ? "Pairing Code" : "QR Code"} aktif.` });
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Hubungkan", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    setActionLoading("disconnect");
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memutuskan");
      showToast({ type: "info", title: "Bot Diputuskan", message: "Sesi WhatsApp telah dinonaktifkan." });
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Putus", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Add admin number
  const handleAddAdminNumber = async () => {
    const clean = newAdminInput.trim().replace(/[^0-9]/g, "");
    if (!clean) return;
    setActionLoading("add-admin");
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_admin_number", adminNumber: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambah nomor");
      showToast({ type: "success", title: "Nomor Admin Ditambahkan", message: `+${clean} sekarang memiliki akses command.` });
      setNewAdminInput("");
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Tambah", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Remove admin number
  const handleRemoveAdminNumber = async (num: string) => {
    if (adminNumbers.length <= 1) {
      showToast({ type: "warning", title: "Tidak dapat dihapus", message: "Minimal harus ada 1 nomor admin berwenang." });
      return;
    }
    setActionLoading(`rem-${num}`);
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_admin_number", adminNumber: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus nomor");
      showToast({ type: "info", title: "Nomor Dihapus", message: `+${num} tidak lagi memiliki akses bot.` });
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Hapus", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Execute simulator command
  const handleRunSimulator = async () => {
    if (!simCommand.trim()) return;
    setActionLoading("sim");
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exec_command",
          commandText: simCommand.trim(),
          senderNumber: simSender.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal eksekusi");

      setSimHistory((prev) => [
        {
          sender: simSender.trim(),
          text: simCommand.trim(),
          reply: data.reply || "No reply",
          status: data.status || "info",
          time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);

      showToast({
        type: data.status === "success" ? "success" : data.status === "unauthorized" ? "error" : "info",
        title: data.status === "success" ? "Command Berhasil!" : data.status === "unauthorized" ? "Akses Ditolak" : "Info",
        message: `Command diproses dengan status: ${data.status}`,
      });

      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Eksekusi", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Quick Extend Premium
  const handleQuickExtend = async (email: string, days: number) => {
    setActionLoading(`ext-${email}`);
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend_prem", email, durationDays: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal perpanjang");
      showToast({ type: "success", title: "Premium Diperpanjang", message: `${email} +${days} hari` });
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Perpanjang", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Quick Revoke Premium
  const handleQuickRevoke = async (email: string) => {
    if (!confirm(`Yakin ingin menonaktifkan status premium untuk ${email}?`)) return;
    setActionLoading(`rev-${email}`);
    try {
      const res = await fetch("/api/admin/botwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_prem", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal revoke");
      showToast({ type: "info", title: "Premium Dinonaktifkan", message: `${email} kembali ke user regular.` });
      await fetchData();
    } catch (err) {
      showToast({ type: "error", title: "Gagal Revoke", message: err instanceof Error ? err.message : "Error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Copy pairing code
  const copyPairingCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    showToast({ type: "info", title: "Kode Disalin", message: code });
  };

  const isConnected = config.status === "connected";

  return (
    <div
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: "#f0f8ff",
      }}
    >
      <style>{`
        .bw-card {
          background: rgba(8, 20, 44, 0.65);
          border: 1px solid rgba(56, 189, 248, 0.16);
          border-radius: 18px;
          padding: 22px;
          backdrop-filter: blur(16px);
          margin-bottom: 20px;
          transition: border-color 0.2s;
        }
        .bw-card:hover {
          border-color: rgba(56, 189, 248, 0.35);
        }
        .bw-input {
          background: rgba(2, 8, 24, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 10px;
          padding: 10px 14px;
          color: #f0f8ff;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          transition: all 0.15s;
        }
        .bw-input:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
        }
        .bw-btn {
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
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
        .bw-btn-primary {
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.3);
        }
        .bw-btn-primary:hover {
          background: linear-gradient(135deg, #38bdf8, #0ea5e9);
          transform: translateY(-1px);
        }
        .bw-btn-danger {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
        }
        .bw-btn-danger:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: #ef4444;
          color: #ffffff;
        }
        .bw-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .bw-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 900px) {
          .bw-grid-2 {
            grid-template-columns: 1fr;
          }
        }
        .chat-bubble-user {
          background: rgba(14, 165, 233, 0.2);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 14px 14px 2px 14px;
          padding: 10px 14px;
          align-self: flex-end;
          max-width: 80%;
          font-size: 12.5px;
          margin-bottom: 8px;
        }
        .chat-bubble-bot {
          background: rgba(15, 30, 60, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px 14px 14px 2px;
          padding: 12px 16px;
          align-self: flex-start;
          max-width: 90%;
          font-size: 12px;
          line-height: 1.55;
          white-space: pre-line;
          margin-bottom: 12px;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #10b981, #047857)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 18px rgba(16, 185, 129, 0.35)",
            }}
          >
            <Bot size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "900", margin: 0, letterSpacing: "-0.02em" }}>
              Bot WhatsApp — Autonomous Premium Engine
            </h1>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>
              Otomasi pemberian paket premium (.prem / .unprem), verifikasi nomor admin, dan pengaitan sesi WA.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            className="bw-badge"
            style={{
              background: isConnected ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${isConnected ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
              color: isConnected ? "#4ade80" : "#f87171",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isConnected ? "#22c55e" : "#ef4444" }} />
            {isConnected ? "Bot Online & Siap" : "Bot Terputus"}
          </span>

          <button
            type="button"
            className="bw-btn"
            onClick={fetchData}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Grid: Session & Pairing | Admin Number Auth */}
      <div className="bw-grid-2">
        {/* ── CARD 1: PENGATURAN PENGAITAN SESI WHATSAPP ── */}
        <div className="bw-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Smartphone size={18} color="#38bdf8" />
              <span style={{ fontSize: "15px", fontWeight: "800" }}>Pengaitan Sesi WhatsApp</span>
            </div>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
              Metode: {selectedMethod === "code" ? "Pairing Code (8-Digit)" : "QR Code"}
            </span>
          </div>

          {/* Method Picker Switcher */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <button
              type="button"
              className="bw-btn"
              onClick={() => setSelectedMethod("code")}
              style={{
                flex: 1,
                background: selectedMethod === "code" ? "rgba(14, 165, 233, 0.25)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedMethod === "code" ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
                color: selectedMethod === "code" ? "#bae6fd" : "rgba(255,255,255,0.6)",
              }}
            >
              <KeyRound size={15} />
              Via Code (Pairing Code)
            </button>
            <button
              type="button"
              className="bw-btn"
              onClick={() => setSelectedMethod("qr")}
              style={{
                flex: 1,
                background: selectedMethod === "qr" ? "rgba(14, 165, 233, 0.25)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedMethod === "qr" ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
                color: selectedMethod === "qr" ? "#bae6fd" : "rgba(255,255,255,0.6)",
              }}
            >
              <QrCode size={15} />
              QR Code Scanner
            </button>
          </div>

          {/* Target Phone Input */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: "6px" }}>
              Nomor WhatsApp Target Bot:
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="bw-input"
                style={{ flex: 1 }}
                placeholder="Contoh: 6282343769190"
                value={targetNumberInput}
                onChange={(e) => setTargetNumberInput(e.target.value)}
              />
              <button
                type="button"
                className="bw-btn bw-btn-primary"
                onClick={() => handleConnect(selectedMethod)}
                disabled={actionLoading === "connect"}
              >
                <Zap size={14} />
                {isConnected ? "Perbarui / Hubungkan" : "Kaitkan Bot"}
              </button>
            </div>
          </div>

          {/* Pairing Code or QR Display Box */}
          {selectedMethod === "code" ? (
            <div
              style={{
                padding: "16px",
                background: "rgba(2, 8, 24, 0.9)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "14px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>
                Kode Pengaitan WhatsApp (Pairing Code):
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "10px 0" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "26px",
                    fontWeight: "900",
                    letterSpacing: "0.18em",
                    color: "#38bdf8",
                    background: "rgba(56, 189, 248, 0.1)",
                    padding: "6px 18px",
                    borderRadius: "10px",
                    border: "1px dashed rgba(56, 189, 248, 0.4)",
                  }}
                >
                  {config.pairingCode || "8N9K-2P4Q"}
                </span>
                <button
                  type="button"
                  className="bw-btn"
                  onClick={() => copyPairingCode(config.pairingCode || "8N9K-2P4Q")}
                  style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", padding: "8px 12px" }}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? "Disalin!" : "Salin"}
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                1. Buka WhatsApp di HP $\rightarrow$ <strong>Perangkat Tertaut</strong>.<br />
                2. Pilih <strong>Tautkan dengan nomor telepon</strong> $\rightarrow$ Masukkan kode 8 digit di atas.
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "16px",
                background: "rgba(2, 8, 24, 0.9)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "14px",
                textAlign: "center",
              }}
            >
              <div style={{ width: "130px", height: "130px", margin: "0 auto 10px", background: "#ffffff", borderRadius: "10px", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <QrCode size={110} color="#020b18" />
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                Pindai QR Code di atas menggunakan menu <strong>Perangkat Tertaut</strong> WhatsApp.
              </div>
            </div>
          )}

          {isConnected && (
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="bw-btn bw-btn-danger"
                onClick={handleDisconnect}
                disabled={actionLoading === "disconnect"}
                style={{ fontSize: "11px", padding: "6px 12px" }}
              >
                Putuskan Sesi WhatsApp
              </button>
            </div>
          )}
        </div>

        {/* ── CARD 2: OTORISASI NOMOR ADMIN ── */}
        <div className="bw-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldCheck size={18} color="#4ade80" />
              <span style={{ fontSize: "15px", fontWeight: "800" }}>Nomor Admin Berwenang</span>
            </div>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
              {adminNumbers.length} Nomor Terdaftar
            </span>
          </div>

          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: "14px" }}>
            Hanya nomor di bawah yang dapat mengeksekusi perintah <code style={{ color: "#38bdf8" }}>.prem</code> &amp; <code style={{ color: "#38bdf8" }}>.unprem</code>. Command dari nomor tak terdaftar akan ditolak dengan pesan peringatan.
          </p>

          {/* Add Admin Number Input */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input
              type="text"
              className="bw-input"
              style={{ flex: 1 }}
              placeholder="Tambahkan nomor baru (e.g. 6282343769190)"
              value={newAdminInput}
              onChange={(e) => setNewAdminInput(e.target.value)}
            />
            <button
              type="button"
              className="bw-btn bw-btn-primary"
              onClick={handleAddAdminNumber}
              disabled={actionLoading === "add-admin"}
            >
              <Plus size={15} />
              Tambah
            </button>
          </div>

          {/* List of Numbers */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "190px", overflowY: "auto" }}>
            {adminNumbers.map((num) => (
              <div
                key={num}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "rgba(2, 8, 24, 0.7)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <ShieldCheck size={15} color="#4ade80" />
                  <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: "700", color: "#f0f8ff" }}>
                    +{num}
                  </span>
                  {num === "6282343769190" && (
                    <span style={{ fontSize: "9.5px", fontWeight: "800", padding: "1px 6px", borderRadius: "999px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
                      Utama
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveAdminNumber(num)}
                  disabled={actionLoading === `rem-${num}`}
                  style={{ background: "transparent", border: "none", color: "rgba(239, 68, 68, 0.7)", cursor: "pointer", padding: "4px" }}
                  title="Hapus nomor admin"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CARD 3: SIMULATOR & TESTER COMMAND BOT ── */}
      <div className="bw-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Terminal size={18} color="#818cf8" />
            <span style={{ fontSize: "15px", fontWeight: "800" }}>Simulator &amp; Tester Perintah Bot</span>
          </div>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            Uji coba eksekusi command secara langsung dari dashboard
          </span>
        </div>

        {/* Quick Command Chips */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
          {[
            { label: "Prem 7 Hari", cmd: ".prem 7 hari " },
            { label: "Prem 30 Hari", cmd: ".prem 30 hari " },
            { label: "Prem 1 Tahun", cmd: ".prem 1 tahun " },
            { label: "Unprem", cmd: ".unprem " },
            { label: "Cek Status", cmd: ".status" },
            { label: "List Premium", cmd: ".listprem" },
          ].map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSimCommand(item.cmd)}
              style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "4px 10px",
                borderRadius: "8px",
                background: "rgba(129, 140, 248, 0.12)",
                border: "1px solid rgba(129, 140, 248, 0.25)",
                color: "#c7d2fe",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Tester Input Form */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ width: "200px" }}>
            <input
              type="text"
              className="bw-input"
              style={{ width: "100%" }}
              placeholder="Nomor Pengirim"
              value={simSender}
              onChange={(e) => setSimSender(e.target.value)}
              title="Nomor Pengirim Command"
            />
          </div>
          <input
            type="text"
            className="bw-input"
            style={{ flex: 1, minWidth: "240px", fontFamily: "monospace" }}
            placeholder="Contoh: .prem 30 hari user@gmail.com"
            value={simCommand}
            onChange={(e) => setSimCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRunSimulator();
            }}
          />
          <button
            type="button"
            className="bw-btn bw-btn-primary"
            onClick={handleRunSimulator}
            disabled={actionLoading === "sim"}
          >
            <Send size={14} />
            Eksekusi
          </button>
        </div>

        {/* Live WhatsApp Chat Bubble Stream */}
        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            padding: "16px",
            background: "rgba(2, 6, 18, 0.9)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {simHistory.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "12px", padding: "20px" }}>
              Belum ada riwayat simulasi perintah.
            </div>
          ) : (
            simHistory.map((item, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                {/* User Bubble */}
                <div className="chat-bubble-user">
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>
                    +{item.sender} · {item.time}
                  </div>
                  <div style={{ fontFamily: "monospace", fontWeight: "700", color: "#ffffff" }}>
                    {item.text}
                  </div>
                </div>

                {/* Bot Reply Bubble */}
                <div className="chat-bubble-bot">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: item.status === "success" ? "#4ade80" : item.status === "unauthorized" ? "#f87171" : "#38bdf8", marginBottom: "4px" }}>
                    <Bot size={12} />
                    <strong>Stock AI Bot ({item.status.toUpperCase()})</strong>
                  </div>
                  <div style={{ color: "#e2e8f0" }}>{item.reply}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── CARD 4: MONITOR PENGGUNA PREMIUM AKTIF ── */}
      <div className="bw-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} color="#38bdf8" />
            <span style={{ fontSize: "15px", fontWeight: "800" }}>Pengguna Premium Aktif ({activeUsers.length})</span>
          </div>
          <button
            type="button"
            className="bw-btn"
            onClick={async () => {
              await fetch("/api/admin/botwa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_expiries" }) });
              showToast({ type: "info", title: "Pemeriksaan Selesai", message: "Akun expired telah diperbarui secara otomatis." });
              await fetchData();
            }}
            style={{ fontSize: "11px", background: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)", color: "#38bdf8" }}
          >
            <Clock size={13} />
            Periksa Akun Expired Sekarang
          </button>
        </div>

        {activeUsers.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px", padding: "28px" }}>
            Belum ada akun premium yang sedang aktif saat ini.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                  <th style={{ padding: "10px 12px" }}>User &amp; Email</th>
                  <th style={{ padding: "10px 12px" }}>Paket</th>
                  <th style={{ padding: "10px 12px" }}>Sisa Waktu</th>
                  <th style={{ padding: "10px 12px" }}>Kadaluarsa Pada</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Aksi Cepat</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: "700", color: "#f0f8ff" }}>{u.username}</div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>{u.email}</div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span className="bw-badge" style={{ background: "rgba(129, 140, 248, 0.15)", border: "1px solid rgba(129, 140, 248, 0.35)", color: "#c7d2fe" }}>
                        {u.premiumPlan}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        className="bw-badge"
                        style={{
                          background: u.remainingDays <= 2 ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                          border: `1px solid ${u.remainingDays <= 2 ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)"}`,
                          color: u.remainingDays <= 2 ? "#fca5a5" : "#86efac",
                        }}
                      >
                        <Clock size={11} />
                        {u.remainingDays > 0 ? `${u.remainingDays} hari ${u.remainingHours} jam` : `${u.remainingHours} jam`}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontSize: "11.5px", color: "rgba(255,255,255,0.6)" }}>
                      {new Date(u.premiumExpiresAt).toLocaleString("id-ID")}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="bw-btn"
                          onClick={() => handleQuickExtend(u.email, 30)}
                          disabled={actionLoading === `ext-${u.email}`}
                          style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}
                        >
                          +30 Hari
                        </button>
                        <button
                          type="button"
                          className="bw-btn bw-btn-danger"
                          onClick={() => handleQuickRevoke(u.email)}
                          disabled={actionLoading === `rev-${u.email}`}
                          style={{ fontSize: "11px", padding: "4px 8px" }}
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

      {/* ── CARD 5: AUDIT LOG PERINTAH MASUK ── */}
      <div className="bw-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Terminal size={18} color="#38bdf8" />
            <span style={{ fontSize: "15px", fontWeight: "800" }}>Log Perintah WhatsApp Masuk ({logs.length})</span>
          </div>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            Riwayat 100 interaksi terakhir
          </span>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "12px", padding: "20px" }}>
            Belum ada aktivitas perintah WhatsApp yang tercatat.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "10px 14px",
                  background: "rgba(2, 8, 24, 0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
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
                    className="bw-badge"
                    style={{
                      background: log.status === "success" ? "rgba(34, 197, 94, 0.15)" : log.status === "unauthorized" ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.15)",
                      border: `1px solid ${log.status === "success" ? "rgba(34, 197, 94, 0.35)" : log.status === "unauthorized" ? "rgba(239, 68, 68, 0.35)" : "rgba(56, 189, 248, 0.35)"}`,
                      color: log.status === "success" ? "#4ade80" : log.status === "unauthorized" ? "#fca5a5" : "#38bdf8",
                    }}
                  >
                    {log.status.toUpperCase()}
                  </span>

                  <span style={{ fontFamily: "monospace", fontSize: "12.5px", fontWeight: "700", color: "#f0f8ff" }}>
                    {log.rawText}
                  </span>

                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                    dari +{log.senderNumber}
                  </span>
                </div>

                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                  {new Date(log.timestamp).toLocaleTimeString("id-ID")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
