"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailIntent =
  | "UNBLOCK_REQUEST"
  | "TOKEN_RESET_REQUEST"
  | "BUG_REPORT"
  | "FEATURE_SUGGESTION"
  | "GENERAL_INQUIRY";

interface EmailLog {
  logId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  intent: EmailIntent;
  confidence: number;
  reasoningTrace: string;
  aiResponseText: string;
  actionTaken: string;
  emailSent: boolean;
  inAppDelivered: boolean;
  timestamp: string;
}

interface Stats {
  totalProcessed: number;
  unblockRequests: number;
  tokenResets: number;
  bugReports: number;
  emailsSent: number;
  workerStatus: string;
}

const INTENT_META: Record<EmailIntent, { label: string; icon: string; color: string }> = {
  UNBLOCK_REQUEST: { label: "UNBLOCK REQUEST", icon: "🔓", color: "#f472b6" },
  TOKEN_RESET_REQUEST: { label: "TOKEN BOOST", icon: "⚡", color: "#fbbf24" },
  BUG_REPORT: { label: "BUG REPORT", icon: "🐞", color: "#f87171" },
  FEATURE_SUGGESTION: { label: "FEATURE IDEA", icon: "💡", color: "#60a5fa" },
  GENERAL_INQUIRY: { label: "GENERAL INQUIRY", icon: "💬", color: "#a78bfa" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  return `${h}j lalu`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmailAiHub() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterIntent, setFilterIntent] = useState<"ALL" | EmailIntent>("ALL");
  const [search, setSearch] = useState("");

  // Simulation Form State
  const [simEmail, setSimEmail] = useState("");
  const [simName, setSimName] = useState("");
  const [simSubject, setSimSubject] = useState("");
  const [simBody, setSimBody] = useState("");
  const [processingSim, setProcessingSim] = useState(false);
  const [simResult, setSimResult] = useState<EmailLog | null>(null);
  const [simError, setSimError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-ai-worker");
      if (!res.ok) return;
      const data = await res.json() as { stats: Stats; logs: EmailLog[] };
      setStats(data.stats);
      setLogs(data.logs ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimError("");
    setSimResult(null);

    if (!simEmail || !simSubject || !simBody) {
      setSimError("Email pengirim, subjek, dan isi pesan wajib diisi!");
      return;
    }

    setProcessingSim(true);
    try {
      const res = await fetch("/api/admin/email-ai-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: simEmail.trim(),
          fromName: simName.trim() || simEmail.split("@")[0],
          subject: simSubject.trim(),
          body: simBody.trim(),
        }),
      });

      const data = await res.json() as { ok?: boolean; result?: EmailLog; error?: string };
      if (data.ok && data.result) {
        setSimResult(data.result);
        setSimSubject("");
        setSimBody("");
        fetchData();
      } else {
        setSimError(data.error ?? "Gagal memproses email");
      }
    } catch {
      setSimError("Gagal terhubung ke server");
    } finally {
      setProcessingSim(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Hapus semua log riwayat email AI?")) return;
    await fetch("/api/admin/email-ai-worker", { method: "DELETE" });
    fetchData();
  };

  const filteredLogs = logs.filter((l) => {
    const matchIntent = filterIntent === "ALL" || l.intent === filterIntent;
    const term = search.toLowerCase();
    const matchSearch =
      l.fromEmail.toLowerCase().includes(term) ||
      l.fromName.toLowerCase().includes(term) ||
      l.subject.toLowerCase().includes(term) ||
      l.actionTaken.toLowerCase().includes(term);
    return matchIntent && matchSearch;
  });

  return (
    <div className="uploader">
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-log-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="uploader__hero" style={{ marginBottom: "24px" }}>
        <h2>🤖 Autonomous Email AI Hub</h2>
        <p>
          Sistem AI Otonom yang berjalan 24/7 untuk menerima email dari pengguna, mengklasifikasi maksud pesan (minta unblock, kuota token, bug), mengeksekusi perintah database secara otomatis, dan membalas email pengguna via Gmail SMTP.
        </p>
      </div>

      {/* ── Status & Metrics Row ────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "14px",
        marginBottom: "24px",
      }}>
        {/* Worker Status */}
        <div style={{
          background: "linear-gradient(135deg, rgba(74,222,128,0.1), rgba(15,23,42,0.8))",
          border: "1px solid rgba(74,222,128,0.3)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}>
          <div style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#4ade80",
            boxShadow: "0 0 10px #4ade80",
            animation: "pulseDot 2s infinite",
          }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "#4ade80" }}>
              24/7 Worker Active
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Groq AI Autonomous Engine
            </div>
          </div>
        </div>

        {/* Processed Count */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid rgba(96,165,250,0.25)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <div style={{ fontSize: "24px" }}>📨</div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text)", lineHeight: 1 }}>
              {stats?.totalProcessed ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
              Total Email Diproses
            </div>
          </div>
        </div>

        {/* Unblock Granted */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid rgba(244,114,182,0.25)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <div style={{ fontSize: "24px" }}>🔓</div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#f472b6", lineHeight: 1 }}>
              {stats?.unblockRequests ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
              Unblock Disetujui AI
            </div>
          </div>
        </div>

        {/* Emails Sent */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid rgba(167,139,250,0.25)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <div style={{ fontSize: "24px" }}>📧</div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#a78bfa", lineHeight: 1 }}>
              {stats?.emailsSent ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
              Auto-Email Terkirim
            </div>
          </div>
        </div>
      </div>

      {/* ── Simulation & Inbound Receiver Section ───────────────────────────── */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "24px",
        animation: "slideInUp 0.3s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{ fontSize: "22px" }}>⚡</span>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--text)" }}>
              Simulasi Email Masuk (Inbound Email AI Dispatcher)
            </h3>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Kirim email ke alamat admin <strong style={{ color: "#a78bfa" }}>nixxeltzy@gmail.com</strong> untuk memproses perintah unblock, kuota token, atau feedback secara otomatis.
            </div>
          </div>
        </div>

        <form onSubmit={handleSimulateInbound} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>
                Email Pengirim (Sender Email)
              </label>
              <input
                type="email"
                placeholder="user@example.com"
                value={simEmail}
                onChange={(e) => setSimEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>
                Nama Pengirim (Optional)
              </label>
              <input
                type="text"
                placeholder="Nama Pengguna"
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>
              Subjek Email (Subject)
            </label>
            <input
              type="text"
              placeholder="Contoh: Tolong unblock akun saya / Minta reset token"
              value={simSubject}
              onChange={(e) => setSimSubject(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text)",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>
              Isi Email (Body Text)
            </label>
            <textarea
              placeholder="Tuliskan permintaan atau keluhan pengguna di sini..."
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              rows={4}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text)",
                fontSize: "13px",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {simError && (
            <div style={{ padding: "10px 14px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px" }}>
              ⚠️ {simError}
            </div>
          )}

          <button
            type="submit"
            disabled={processingSim}
            style={{
              padding: "12px 24px",
              borderRadius: "9px",
              border: "none",
              background: processingSim ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              fontWeight: "800",
              fontSize: "13px",
              cursor: processingSim ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {processingSim ? "⏳ Groq AI Sedang Memproses Email & Eksekusi Perintah..." : "⚡ Jalankan Email AI Worker"}
          </button>
        </form>

        {/* Simulation Output Card */}
        {simResult && (
          <div style={{
            marginTop: "20px",
            padding: "20px",
            background: "rgba(37,99,235,0.08)",
            border: "1.5px solid rgba(37,99,235,0.3)",
            borderRadius: "12px",
            animation: "slideInUp 0.3s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "18px" }}>✅</span>
              <span style={{ fontWeight: "800", fontSize: "14px", color: "#60a5fa" }}>
                AI Processing Complete · Intent: {simResult.intent} ({(simResult.confidence * 100).toFixed(0)}%)
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
              <div>
                <strong style={{ color: "var(--text-muted)" }}>🧠 Reasoning Trace:</strong>{" "}
                <span style={{ color: "var(--text)" }}>{simResult.reasoningTrace}</span>
              </div>
              <div>
                <strong style={{ color: "var(--text-muted)" }}>🛠️ Action Executed:</strong>{" "}
                <span style={{ color: "#4ade80", fontWeight: "700" }}>{simResult.actionTaken}</span>
              </div>
              <div>
                <strong style={{ color: "var(--text-muted)" }}>📧 Email Status:</strong>{" "}
                <span style={{ color: simResult.emailSent ? "#4ade80" : "#f87171" }}>
                  {simResult.emailSent ? "✓ Email balasan terkirim via Gmail SMTP" : "⚫ Email notification error (check GMAIL credentials)"}
                </span>
              </div>

              <div style={{ marginTop: "8px", background: "var(--bg-secondary)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "12px", color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                <strong>🤖 Balasan AI yang Dihasilkan:</strong>{"\n"}{simResult.aiResponseText}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Log Table & Stream Section ───────────────────────────────────────── */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        overflow: "hidden",
      }}>
        {/* Table Controls */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}>
          <div style={{ fontWeight: "800", fontSize: "15px", color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📋 Audit Log Inbound Email AI</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "400" }}>
              ({filteredLogs.length} record)
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="🔍 Cari email/subjek/aksi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "6px 12px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
              }}
            />

            <select
              value={filterIntent}
              onChange={(e) => setFilterIntent(e.target.value as any)}
              style={{
                padding: "6px 10px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
              }}
            >
              <option value="ALL">Semua Intent</option>
              <option value="UNBLOCK_REQUEST">Unblock Request</option>
              <option value="TOKEN_RESET_REQUEST">Token Boost</option>
              <option value="BUG_REPORT">Bug Report</option>
              <option value="FEATURE_SUGGESTION">Feature Idea</option>
              <option value="GENERAL_INQUIRY">General Inquiry</option>
            </select>

            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                padding: "6px 12px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {loading ? "..." : "🔄"}
            </button>

            <button
              onClick={handleClearLogs}
              style={{
                padding: "6px 12px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid var(--error)",
                color: "var(--error)",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              🗑️ Reset Log
            </button>
          </div>
        </div>

        {/* Log Records */}
        <div style={{ overflowX: "auto" }}>
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <span className="spinner" style={{ marginBottom: "12px" }} />
              <div>Memuat data log email AI...</div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              ⚫ Belum ada log email AI yang cocok.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const meta = INTENT_META[log.intent] ?? INTENT_META.GENERAL_INQUIRY;
              return (
                <div
                  key={log.logId}
                  className="ai-log-row"
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                    transition: "background 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "16px",
                      flexShrink: 0,
                    }}
                  >
                    {meta.icon}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--text)" }}>
                        {log.fromName} ({log.fromEmail})
                      </span>
                      <span style={{
                        fontSize: "9px",
                        fontWeight: "800",
                        color: meta.color,
                        background: `${meta.color}18`,
                        padding: "2px 7px",
                        borderRadius: "10px",
                      }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
                        {relTime(log.timestamp)}
                      </span>
                    </div>

                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#60a5fa", marginBottom: "4px" }}>
                      Subjek: {log.subject}
                    </div>

                    <div style={{ fontSize: "12px", color: "#4ade80", fontWeight: "600", marginBottom: "4px" }}>
                      🛠️ Tindakan: {log.actionTaken}
                    </div>

                    <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      🧠 AI Reason: {log.reasoningTrace}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
