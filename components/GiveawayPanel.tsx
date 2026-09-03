"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gift, Power, Sparkles, Users, Clock, CheckCircle2,
  AlertTriangle, RefreshCw, Trophy, Dice5, Mail,
  Calendar, Shield, ShieldCheck, Flame, ChevronRight,
  TrendingUp, Zap, Info, XCircle, RotateCcw
} from "lucide-react";
import { showToast } from "./Toast";

interface GiveawayConfig {
  isEnabled: boolean;
  winnerCount: number;
  lastRunAt?: string;
  totalDraws: number;
  totalWinnersAwarded: number;
  updatedAt: string;
}

interface CandidateUser {
  id: string;
  email: string;
  username: string;
  role: string;
  luckPercentage: number;
  isEligible: boolean;
  createdAt: string;
}

interface GiveawayWinnerReport {
  id: string;
  username: string;
  email: string;
  luckPercentage: number;
  grantedUntil: string;
}

interface ActiveGiveawayWinner {
  id: string;
  email: string;
  username: string;
  grantedAt: string;
  expiresAt: string;
  remainingDays: number;
  remainingHours: number;
  luckPercentage: number;
  isExpired: boolean;
}

interface GiveawayHistoryEntry {
  id: string;
  executedAt: string;
  executedBy: string;
  winnerCount: number;
  totalCandidates: number;
  winners: GiveawayWinnerReport[];
  emailSentToAdmin: boolean;
}

export default function GiveawayPanel() {
  const [config, setConfig] = useState<GiveawayConfig>({
    isEnabled: false,
    winnerCount: 5,
    totalDraws: 0,
    totalWinnersAwarded: 0,
    updatedAt: new Date().toISOString(),
  });
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [activeWinners, setActiveWinners] = useState<ActiveGiveawayWinner[]>([]);
  const [history, setHistory] = useState<GiveawayHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form input state
  const [inputWinnerCount, setInputWinnerCount] = useState<number>(5);
  const [activeSubTab, setActiveSubTab] = useState<"winners" | "candidates" | "history">("winners");
  const [searchFilter, setSearchFilter] = useState("");
  const [lastDrawnWinners, setLastDrawnWinners] = useState<GiveawayWinnerReport[] | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/giveaway");
      if (!res.ok) throw new Error("Gagal mengambil data giveaway");
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setInputWinnerCount(data.config.winnerCount || 5);
      }
      if (data.candidates) setCandidates(data.candidates);
      if (data.activeWinners) setActiveWinners(data.activeWinners);
      if (data.history) setHistory(data.history);
    } catch (err) {
      console.error(err);
      if (!silent) {
        showToast({
          type: "error",
          title: "Error Memuat Data",
          message: err instanceof Error ? err.message : "Koneksi terputus",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 1. Toggle ON / OFF
  const handleToggle = async () => {
    const nextState = !config.isEnabled;
    setActionLoading("toggle");
    try {
      const res = await fetch("/api/admin/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", isEnabled: nextState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah status giveaway");

      setConfig(data.config);
      showToast({
        type: nextState ? "success" : "info",
        title: nextState ? "🟢 Giveaway Diaktifkan (ON)" : "⚫ Giveaway Dinonaktifkan (OFF)",
        message: data.message,
      });
    } catch (err) {
      showToast({
        type: "error",
        title: "Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Update Winner Count Target
  const handleUpdateWinnerCount = async (count: number) => {
    setInputWinnerCount(count);
    setActionLoading("update_count");
    try {
      const res = await fetch("/api/admin/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_count", winnerCount: count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal update jumlah pemenang");

      setConfig(data.config);
      showToast({
        type: "success",
        title: "Target Pemenang Diperbarui",
        message: `Jumlah target pemenang diubah menjadi ${count} orang.`,
      });
    } catch (err) {
      showToast({
        type: "error",
        title: "Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 3. Execute Lucky Draw
  const handleDraw = async () => {
    if (!config.isEnabled) {
      showToast({
        type: "warning",
        title: "Sistem Sedang OFF",
        message: "Tekan tombol ON terlebih dahulu untuk mengaktifkan sistem giveaway.",
      });
      return;
    }

    setActionLoading("draw");
    setLastDrawnWinners(null);

    try {
      const res = await fetch("/api/admin/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draw", winnerCount: inputWinnerCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengundi giveaway");

      setConfig(data.config);
      setCandidates(data.candidates || []);
      setActiveWinners(data.activeWinners || []);
      setHistory(data.history || []);
      setLastDrawnWinners(data.winners || []);
      setActiveSubTab("winners");

      showToast({
        type: "success",
        title: `🎁 Giveaway Sukses (${data.winners?.length || 0} Pemenang)!`,
        message: `Token Unlimited 7 Hari telah aktif. Email laporan dikirimkan ke nixxeltzy@gmail.com.`,
        duration: 8000,
      });
    } catch (err) {
      showToast({
        type: "error",
        title: "Pengundian Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Revoke a winner
  const handleRevoke = async (email: string) => {
    if (!confirm(`Yakin ingin mencabut status giveaway unlimited dari ${email}?`)) return;

    setActionLoading(`revoke-${email}`);
    try {
      const res = await fetch("/api/admin/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_winner", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencabut giveaway");

      if (data.activeWinners) setActiveWinners(data.activeWinners);
      showToast({
        type: "info",
        title: "Akses Dicabut",
        message: data.message,
      });
    } catch (err) {
      showToast({
        type: "error",
        title: "Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredCandidates = candidates.filter(
    (c) =>
      c.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.email.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 80px", fontFamily: "var(--font)" }}>
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.8); }
        }
        @keyframes pulseGlowRed {
          0%, 100% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.6); }
        }
        .luck-bar-wrap {
          background: rgba(0,0,0,0.06);
          border-radius: 999px;
          height: 7px;
          overflow: hidden;
          position: relative;
        }
        .luck-bar-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 0.4s ease;
        }
      `}</style>

      {/* ══ HEADER BANNER ══ */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(139, 92, 246, 0.14) 50%, rgba(59, 130, 246, 0.12) 100%)",
          border: "1px solid rgba(236, 72, 153, 0.3)",
          borderRadius: 20,
          padding: "24px 26px",
          marginBottom: 24,
          position: "relative",
          boxShadow: "0 8px 32px rgba(236, 72, 153, 0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 18px rgba(236, 72, 153, 0.4)",
              }}
            >
              <Gift size={28} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)" }}>
                  Platform Giveaway Otomatis
                </h1>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    background: config.isEnabled ? "rgba(34, 197, 94, 0.18)" : "rgba(100, 116, 139, 0.18)",
                    border: `1px solid ${config.isEnabled ? "rgba(34, 197, 94, 0.4)" : "rgba(100, 116, 139, 0.3)"}`,
                    color: config.isEnabled ? "#16a34a" : "#64748b",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: config.isEnabled ? "#22c55e" : "#94a3b8",
                      boxShadow: config.isEnabled ? "0 0 8px #22c55e" : "none",
                    }}
                  />
                  {config.isEnabled ? "SISTEM AKTIF (ON)" : "SISTEM NONAKTIF (OFF)"}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                Memberikan <strong>Token AI Unlimited selama 1 Minggu (7 Hari)</strong> kepada pemenang terpilih berdasarkan <strong>rasio hoki dinamis</strong>. Laporan hasil otomatis dikirim ke <code>nixxeltzy@gmail.com</code>.
              </p>
            </div>
          </div>

          {/* ON / OFF Main Switch Button */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={actionLoading === "toggle"}
            style={{
              padding: "14px 28px",
              borderRadius: 14,
              border: "none",
              background: config.isEnabled
                ? "linear-gradient(135deg, #22c55e, #16a34a)"
                : "linear-gradient(135deg, #475569, #334155)",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "0.03em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: config.isEnabled
                ? "0 6px 24px rgba(34, 197, 94, 0.35)"
                : "0 4px 16px rgba(0, 0, 0, 0.2)",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <Power size={18} />
            <span>{config.isEnabled ? "MATIKAN (OFF)" : "AKTIFKAN (ON)"}</span>
          </button>
        </div>
      </div>

      {/* ══ STATS CARDS ══ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Hadiah Utama</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#ec4899", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={18} /> Unlimited 7 Hari
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Bebas kuota selama 1 minggu</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Target Pemenang</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#8b5cf6", marginTop: 4 }}>
            {config.winnerCount} Orang
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Dapat diatur dinamis via input</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Pemenang Aktif Sekarang</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981", marginTop: 4 }}>
            {activeWinners.length} User
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Sedang menikmati token unlimited</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Diberikan</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", marginTop: 4 }}>
            {config.totalWinnersAwarded} Kali
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Dari {config.totalDraws} sesi pengundian</div>
        </div>
      </div>

      {/* ══ CONTROL CONSOLE & ACTION BAR ══ */}
      <div
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "20px 22px",
          marginBottom: 24,
          boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          {/* Target Winner Input */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
              🎯 Mau Berapa Pemenang?
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                min={1}
                max={50}
                value={inputWinnerCount}
                onChange={(e) => setInputWinnerCount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: 74,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text)",
                  fontSize: 15,
                  fontWeight: 900,
                  textAlign: "center",
                }}
              />
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>Orang</span>
            </div>

            {/* Quick preset chips */}
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 3, 5, 10].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleUpdateWinnerCount(preset)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: inputWinnerCount === preset ? "1px solid #ec4899" : "1px solid var(--border)",
                    background: inputWinnerCount === preset ? "rgba(236, 72, 153, 0.15)" : "transparent",
                    color: inputWinnerCount === preset ? "#ec4899" : "var(--text)",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {preset} Orang
                </button>
              ))}
            </div>
          </div>

          {/* Action Button: Putar Giveaway Sekarang */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => fetchData(false)}
              disabled={loading}
              title="Refresh Data"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
            </button>

            <button
              type="button"
              onClick={handleDraw}
              disabled={actionLoading === "draw" || !config.isEnabled}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                background: config.isEnabled
                  ? "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)"
                  : "var(--border)",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 900,
                cursor: config.isEnabled ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: config.isEnabled ? "0 4px 20px rgba(236, 72, 153, 0.4)" : "none",
                opacity: config.isEnabled ? 1 : 0.6,
                transition: "all 0.2s ease",
              }}
            >
              <Dice5 size={18} />
              <span>{actionLoading === "draw" ? "🎲 Mengundi Hoki..." : "🎲 Putar Giveaway (Lucky Draw)"}</span>
            </button>
          </div>
        </div>

        {/* Info Box Notification Method */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            color: "#0369a1",
          }}
        >
          <Mail size={15} />
          <span>
            <strong>Sistem Notifikasi:</strong> Pesan pemenang dikirimkan langsung ke <strong>kotak masuk user (inbox)</strong> tanpa popup di tengah layar, dan email rekap otomatis dikirimkan ke <code>nixxeltzy@gmail.com</code>.
          </span>
        </div>
      </div>

      {/* ══ RECENT DRAW WINNERS BANNER (IF JUST DRAWN) ══ */}
      {lastDrawnWinners && lastDrawnWinners.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)",
            border: "1px solid rgba(34, 197, 94, 0.4)",
            borderRadius: 16,
            padding: "18px 20px",
            marginBottom: 24,
            animation: "dashFadeUp 0.3s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Trophy size={20} color="#16a34a" />
            <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>
              🎉 Pemenang Terpilih Barusan ({lastDrawnWinners.length} Orang):
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {lastDrawnWinners.map((w, idx) => (
              <div
                key={w.id}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 800, color: "#ec4899" }}>#{idx + 1}</span>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{w.username}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({w.email})</span>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "rgba(236,72,153,0.15)",
                    color: "#ec4899",
                    fontWeight: 800,
                    fontSize: 10,
                  }}
                >
                  {w.luckPercentage}% Hoki
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ NAVIGATION TABS ══ */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", marginBottom: 18, paddingBottom: 6 }}>
        <button
          type="button"
          onClick={() => setActiveSubTab("winners")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeSubTab === "winners" ? "var(--bg-secondary)" : "transparent",
            color: activeSubTab === "winners" ? "#ec4899" : "var(--text-muted)",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Trophy size={15} />
          <span>Pemenang Aktif ({activeWinners.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("candidates")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeSubTab === "candidates" ? "var(--bg-secondary)" : "transparent",
            color: activeSubTab === "candidates" ? "#8b5cf6" : "var(--text-muted)",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Users size={15} />
          <span>Kandidat & Rasio Hoki ({candidates.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("history")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeSubTab === "history" ? "var(--bg-secondary)" : "transparent",
            color: activeSubTab === "history" ? "#3b82f6" : "var(--text-muted)",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Clock size={15} />
          <span>Riwayat Giveaway ({history.length})</span>
        </button>
      </div>

      {/* ══ SUBTAB 1: PEMENANG AKTIF ══ */}
      {activeSubTab === "winners" && (
        <div>
          {activeWinners.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                background: "rgba(255,255,255,0.6)",
                border: "1px dashed var(--border)",
                borderRadius: 16,
                color: "var(--text-muted)",
              }}
            >
              <Gift size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: 15, fontWeight: 700 }}>Belum Ada Pemenang Giveaway Aktif</div>
              <p style={{ fontSize: 12, margin: "6px 0 16px" }}>
                Aktifkan saklar ON dan tekan tombol &quot;🎲 Putar Giveaway (Lucky Draw)&quot; untuk memilih pemenang.
              </p>
              {config.isEnabled && (
                <button
                  type="button"
                  onClick={handleDraw}
                  disabled={actionLoading === "draw"}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
                    border: "none",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  🎲 Putar Sekarang
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
              {activeWinners.map((w) => (
                <div
                  key={w.id}
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid rgba(236,72,153,0.3)",
                    borderRadius: 14,
                    padding: "18px 20px",
                    position: "relative",
                    boxShadow: "0 4px 16px rgba(236,72,153,0.06)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)" }}>{w.username}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", marginTop: 2 }}>{w.email}</div>
                    </div>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "rgba(34,197,94,0.15)",
                        color: "#16a34a",
                        border: "1px solid rgba(34,197,94,0.3)",
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    >
                      ⚡ UNLIMITED
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
                    <div>
                      <strong>Sisa:</strong> {w.remainingDays} Hari {w.remainingHours} Jam
                    </div>
                    <span>•</span>
                    <div>
                      <strong>Hingga:</strong> {new Date(w.expiresAt).toLocaleDateString("id-ID")}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => handleRevoke(w.email)}
                      disabled={actionLoading === `revoke-${w.email}`}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1px solid rgba(239,68,68,0.3)",
                        background: "rgba(239,68,68,0.1)",
                        color: "#dc2626",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cabut Akses
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ SUBTAB 2: KANDIDAT & RASIO HOKI ══ */}
      {activeSubTab === "candidates" && (
        <div
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Daftar Peserta & Rasio Keberuntungan (*Luck Percentage*)
            </div>
            <input
              type="text"
              placeholder="Cari user/email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                fontSize: 12,
                color: "var(--text)",
                width: 180,
              }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 16px" }}>User</th>
                  <th style={{ padding: "10px 16px" }}>Email</th>
                  <th style={{ padding: "10px 16px" }}>Status Akun</th>
                  <th style={{ padding: "10px 16px", minWidth: 200 }}>Rasio Hoki (Peluang Menang)</th>
                  <th style={{ padding: "10px 16px" }}>Terdaftar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => {
                  const luckColor = c.luckPercentage >= 75 ? "#16a34a" : c.luckPercentage >= 45 ? "#eab308" : "#f43f5e";
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text)" }}>{c.username}</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontFamily: "monospace" }}>{c.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: c.role === "premium" ? "rgba(139,92,246,0.15)" : "rgba(100,116,139,0.15)",
                            color: c.role === "premium" ? "#8b5cf6" : "#64748b",
                          }}
                        >
                          {c.role === "premium" ? "⭐ Premium" : "👤 Regular"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="luck-bar-wrap" style={{ flex: 1 }}>
                            <div className="luck-bar-fill" style={{ width: `${c.luckPercentage}%`, background: luckColor }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 900, color: luckColor, width: 50, textAlign: "right" }}>
                            {c.luckPercentage}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 11 }}>
                        {new Date(c.createdAt).toLocaleDateString("id-ID")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ SUBTAB 3: RIWAYAT PENGUNDIAN ══ */}
      {activeSubTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
              Belum ada riwayat pengundian giveaway yang tercatat.
            </div>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Trophy size={16} color="#ec4899" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
                      Pengundian #{h.id.slice(-6)} ({h.winnerCount} Pemenang)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {new Date(h.executedAt).toLocaleString("id-ID")} • Oleh {h.executedBy}
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {h.winners.map((w) => (
                    <span
                      key={w.id}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        fontSize: 11,
                        color: "var(--text)",
                      }}
                    >
                      {w.username} ({w.luckPercentage}% Hoki)
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: h.emailSentToAdmin ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                  <Mail size={12} />
                  <span>{h.emailSentToAdmin ? "Laporan email terkirim ke nixxeltzy@gmail.com" : "Email log tersimpan di server"}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
