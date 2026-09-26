"use client";

import { useEffect, useState } from "react";
import {
  Trophy, Medal, Flame, Sparkles, RefreshCw, Users,
  TrendingUp, CheckCircle, ArrowRight
} from "lucide-react";

interface LeaderboardEntry {
  username: string;
  photoCount: number;
}

interface StatsData {
  todayCount: number;
  totalCount: number;
  leaderboard: LeaderboardEntry[];
}

export default function LeaderboardPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<StatsData>({
    todayCount: 0,
    totalCount: 0,
    leaderboard: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.success) {
        setStats({
          todayCount: data.todayCount || 0,
          totalCount: data.totalCount || 0,
          leaderboard: data.leaderboard || [],
        });
      }
    } catch (err) {
      console.error("fetchStats error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(245,158,11,0.4)" }}>
          🥇
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #94a3b8, #64748b)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(100,116,139,0.3)" }}>
          🥈
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #b45309, #78350f)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(180,83,9,0.3)" }}>
          🥉
        </div>
      );
    }
    return (
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(219, 234, 254, 0.7)", border: "1px solid rgba(147, 197, 253, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#1e40af", fontWeight: 800, fontSize: 12 }}>
        #{rank}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: "100%", margin: "0", padding: "20px 14px 60px", fontFamily: "inherit" }}>
      {/* ── Top Header ── */}
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 999, background: "rgba(254, 243, 199, 0.8)", border: "1px solid rgba(245, 158, 11, 0.4)", color: "#b45309", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          <Trophy size={14} color="#d97706" />
          <span>Komunitas Kontributor Microstock</span>
        </div>
        <h1 style={{ fontSize: "clamp(22px, 3.8vw, 32px)", fontWeight: 900, color: "var(--text-main, #0f172a)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          Leaderboard &amp; Statistik Live
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-sub, #64748b)", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
          Peringkat kreator paling aktif memproses foto stok. Dapatkan inspirasi dan pantau produktivitas harian Anda bersama ratusan kontributor lainnya!
        </p>
      </div>

      {/* ── Counters ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        {/* Counter Hari Ini */}
        <div style={{
          background: "linear-gradient(135deg, rgba(239,246,255,0.9), rgba(219,234,254,0.75))",
          border: "1px solid rgba(147, 197, 253, 0.6)",
          borderRadius: 18,
          padding: "20px 22px",
          backdropFilter: "blur(14px)",
          boxShadow: "0 8px 24px rgba(59, 130, 246, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: 16
        }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 14px rgba(37,99,235,0.35)", flexShrink: 0 }}>
            <Flame size={24} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e40af" }}>
              Total Foto Diproses Hari Ini
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginTop: 2, letterSpacing: "-0.01em" }}>
              {stats.todayCount.toLocaleString("id-ID")} <span style={{ fontSize: 14, fontWeight: 700, color: "#2563eb" }}>Foto</span>
            </div>
            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <TrendingUp size={12} />
              <span>Real-time update dari AI Engine</span>
            </div>
          </div>
        </div>

        {/* Counter Total All-Time */}
        <div style={{
          background: "linear-gradient(135deg, rgba(245,243,255,0.9), rgba(237,233,254,0.75))",
          border: "1px solid rgba(196, 181, 253, 0.6)",
          borderRadius: 18,
          padding: "20px 22px",
          backdropFilter: "blur(14px)",
          boxShadow: "0 8px 24px rgba(139, 92, 246, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: 16
        }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 14px rgba(139,92,246,0.35)", flexShrink: 0 }}>
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6d28d9" }}>
              Akumulasi Foto Diproses
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginTop: 2, letterSpacing: "-0.01em" }}>
              {stats.totalCount.toLocaleString("id-ID")} <span style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>Foto</span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
              Sejak platform diluncurkan
            </div>
          </div>
        </div>
      </div>

      {/* ── Leaderboard Table / Card List ── */}
      <div style={{
        background: "rgba(255, 255, 255, 0.8)",
        border: "1px solid rgba(147, 197, 253, 0.5)",
        borderRadius: 20,
        padding: "22px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 6px 24px rgba(59, 130, 246, 0.08)",
        marginBottom: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Medal size={20} color="#2563eb" />
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Top 10 Kontributor Teraktif
            </h2>
          </div>
          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(147, 197, 253, 0.6)", background: "rgba(219, 234, 254, 0.7)", color: "#1e40af", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
          >
            <RefreshCw size={12} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
            <span>Segarkan</span>
          </button>
        </div>

        {/* List Entries */}
        {stats.leaderboard.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "36px 16px",
            background: "rgba(248, 250, 252, 0.7)",
            borderRadius: 14,
            border: "1px dashed rgba(147, 197, 253, 0.6)"
          }}>
            <Medal size={32} color="#94a3b8" style={{ margin: "0 auto 10px" }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
              Belum ada kontributor di leaderboard saat ini
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              Jadilah yang pertama! Proses foto Anda di Metadata Generator untuk langsung menempati posisi #1.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.leaderboard.map((item, idx) => {
              const rank = idx + 1;
              const isTop3 = rank <= 3;
              return (
                <div
                  key={`${item.username}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: 14,
                    background: isTop3 ? "rgba(239, 246, 255, 0.85)" : "rgba(255, 255, 255, 0.7)",
                    border: isTop3 ? "1px solid rgba(147, 197, 253, 0.7)" : "1px solid rgba(226, 232, 240, 0.8)",
                    transition: "transform 0.15s ease",
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    {getRankBadge(rank)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.username}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                        Kontributor Aktif
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: isTop3 ? "#2563eb" : "#0f172a" }}>
                      {item.photoCount.toLocaleString("id-ID")}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>
                      Foto Selesai
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA Banner */}
      {onNavigate && (
        <div style={{
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          borderRadius: 18,
          padding: "20px 24px",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          boxShadow: "0 10px 30px rgba(37, 99, 235, 0.3)"
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Mau naik ke posisi teratas?</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
              Upload foto kamu sekarang di Metadata AI Generator untuk menambah skor kontribusimu!
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("metadata")}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#fff",
              color: "#1d4ed8",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
            }}
          >
            <span>Mulai Generate Foto</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
