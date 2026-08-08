"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  targetUserId?: string;
  targetEmail?: string;
  targetUsername?: string;
  sentAt: string;
  sentByEmail?: string;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("adminmsg_dismissed_v3");
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem("adminmsg_dismissed_v3", JSON.stringify(Array.from(set)));
  } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserInboxBanner() {
  const [allMessages, setAllMessages] = useState<AdminMessage[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [appealText, setAppealText] = useState("");
  const [appealing, setAppealing] = useState(false);
  const [appealRes, setAppealRes] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(true);
  const [modalForceOpen, setModalForceOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const mountedRef = useRef(true);

  // Load dismissed set on mount & setup BroadcastChannel for tab sync
  useEffect(() => {
    setDismissed(loadDismissed());
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        channelRef.current = new BroadcastChannel("admin_inbox_channel");
        channelRef.current.onmessage = (ev: MessageEvent<{ type: string; messages?: AdminMessage[] }>) => {
          if (ev.data?.type === "NEW_MESSAGES" && Array.isArray(ev.data.messages)) {
            setAllMessages(ev.data.messages);
            setToastOpen(true);
          }
        };
      } catch { /* fallback */ }
    }
    return () => {
      mountedRef.current = false;
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  // ── Polling ──────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/user/inbox", { credentials: "include" });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json() as { messages: AdminMessage[] };
      const msgs: AdminMessage[] = data.messages ?? [];
      if (mountedRef.current) {
        setAllMessages((prev) => {
          // If new message arrives that wasn't in previous poll, re-open toast
          if (msgs.length > prev.length) setToastOpen(true);
          return msgs;
        });

        // Broadcast to other tabs
        if (channelRef.current && msgs.length > 0) {
          channelRef.current.postMessage({ type: "NEW_MESSAGES", messages: msgs });
        }
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  // ── Mark as read (server) ────────────────────────────────────────────────────
  const markRead = useCallback(async (ids: string[]) => {
    try {
      await fetch("/api/user/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
    } catch { /* silent */ }
  }, []);

  // ── Dismiss a single message ─────────────────────────────────────────────────
  const handleDismiss = useCallback((msg: AdminMessage) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(msg.id);
      saveDismissed(next);
      return next;
    });
    setCurrentIdx(0);
    setModalForceOpen(false);
    void markRead([msg.id]);
  }, [markRead]);

  // ── Dismiss all messages ─────────────────────────────────────────────────────
  const handleDismissAll = useCallback(() => {
    const ids = allMessages.map((m) => m.id);
    setDismissed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveDismissed(next);
      return next;
    });
    setCurrentIdx(0);
    setModalForceOpen(false);
    void markRead(ids);
  }, [allMessages, markRead]);

  // ── AI Unblock Appeal ────────────────────────────────────────────────────────
  const handleAiUnblockAppeal = async () => {
    if (!appealText.trim()) return;
    setAppealing(true);
    setAppealRes(null);
    try {
      const res = await fetch("/api/user/unblock-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealMessage: appealText.trim() }),
      });
      const data = await res.json() as { ok?: boolean; aiReplyText?: string; unblocked?: boolean };
      if (data.ok && data.unblocked) {
        setAppealRes("🟢 Banding disetujui AI! Memuat ulang...");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setAppealRes("🤖 " + (data.aiReplyText || "Banding diproses AI"));
      }
    } catch {
      setAppealRes("Gagal memproses banding AI");
    } finally {
      setAppealing(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const blockMsg = allMessages.find((m) => m.type === "block" && !dismissed.has(m.id)) ?? null;
  const refreshMsg = allMessages.find((m) => m.type === "refresh" && !dismissed.has(m.id)) ?? null;
  const normalMessages = allMessages.filter((m) => m.type === "message" && !dismissed.has(m.id));
  const activeMsg = normalMessages[currentIdx] ?? normalMessages[0] ?? null;

  const hasPending = blockMsg || refreshMsg || normalMessages.length > 0;

  // ── Block Overlay ─────────────────────────────────────────────────────────────
  if (blockMsg) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999999,
          background: "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <style>{`
          @keyframes blockModalIn {
            from { opacity: 0; transform: scale(0.92) translateY(16px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.2)",
            animation: "blockModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ background: "#0f172a", padding: "28px 32px", textAlign: "center" }}>
            <div
              style={{
                width: "64px", height: "64px", borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)", border: "2px solid #ef4444",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "28px", margin: "0 auto 14px",
              }}
            >
              🚫
            </div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "#ffffff", letterSpacing: "-0.01em" }}>
              {blockMsg.title}
            </h2>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
              Sistem Keamanan & Batasan Akses Akun
            </div>
          </div>

          <div style={{ padding: "28px 32px" }}>
            <p style={{ margin: "0 0 18px", fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
              {blockMsg.body}
            </p>

            {blockMsg.reason && (
              <div style={{ background: "#fef2f2", borderLeft: "4px solid #ef4444", padding: "14px 16px", borderRadius: "8px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>
                  Alasan Pemblokiran
                </div>
                <div style={{ fontSize: "13px", color: "#991b1b", fontWeight: "500", lineHeight: 1.5 }}>
                  {blockMsg.reason}
                </div>
              </div>
            )}

            <div style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.04))", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e3a8a", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🤖</span> Ajukan Banding & Unblock Otomatis oleh AI
              </div>
              <input
                type="text"
                placeholder="Tulis alasan/penjelasan banding Anda..."
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#0f172a", marginBottom: "10px", boxSizing: "border-box" }}
              />
              <button
                onClick={handleAiUnblockAppeal}
                disabled={appealing || !appealText.trim()}
                style={{
                  width: "100%", padding: "10px", borderRadius: "8px", border: "none",
                  background: appealing || !appealText.trim() ? "#cbd5e1" : "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "#ffffff", fontWeight: "700", fontSize: "13px",
                  cursor: appealing || !appealText.trim() ? "not-allowed" : "pointer", transition: "all 0.2s",
                }}
              >
                {appealing ? "⏳ AI Sedang Mengevaluasi Banding..." : "⚡ Evaluasi & Unblock Akun dengan AI"}
              </button>
              {appealRes && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#2563eb", fontWeight: "600", lineHeight: 1.5 }}>
                  {appealRes}
                </div>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: "100%", padding: "14px", borderRadius: "10px", border: "none",
                background: "linear-gradient(135deg, #1e293b, #0f172a)", color: "#ffffff",
                fontWeight: "700", fontSize: "14px", cursor: "pointer",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.3)", transition: "all 0.2s",
              }}
            >
              🔄 Muat Ulang Halaman
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Refresh Modal ─────────────────────────────────────────────────────────────
  if (refreshMsg) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 999998,
          background: "rgba(15, 23, 42, 0.78)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <style>{`
          @keyframes refreshModalIn {
            from { opacity: 0; transform: scale(0.92) translateY(12px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        <div
          style={{
            maxWidth: "460px", width: "100%", background: "#ffffff", borderRadius: "20px", overflow: "hidden",
            boxShadow: "0 25px 60px -15px rgba(37, 99, 235, 0.3), 0 0 0 1px rgba(37, 99, 235, 0.2)",
            animation: "refreshModalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ background: "linear-gradient(135deg, #0f172a, #1e3a8a)", padding: "24px 28px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#2563eb", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)" }}>
              🔄
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "#ffffff" }}>
                {refreshMsg.title}
              </h3>
              <div style={{ fontSize: "12px", color: "#93c5fd", marginTop: "2px" }}>
                Pembaruan Sistem Tersedia
              </div>
            </div>
          </div>

          <div style={{ padding: "24px 28px" }}>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
              {refreshMsg.body}
            </p>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { void markRead([refreshMsg.id]); window.location.reload(); }}
                style={{
                  flex: 1, padding: "12px", borderRadius: "10px", border: "none",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#ffffff",
                  fontWeight: "700", fontSize: "13px", cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)", transition: "all 0.2s",
                }}
              >
                🔄 Buka Ulang Sekarang
              </button>
              <button
                onClick={() => handleDismiss(refreshMsg)}
                style={{
                  padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1",
                  background: "#f8fafc", color: "#475569", fontWeight: "600",
                  fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                Nanti
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Normal Message Center Modal & Floating Toast Badge ─────────────────
  const isMulti = normalMessages.length > 1;
  const safeIdx = Math.min(currentIdx, normalMessages.length - 1);
  const showCenterModal = (activeMsg !== null) && (modalForceOpen || toastOpen);

  return (
    <>
      <style>{`
        @keyframes centerModalIn {
          from { opacity: 0; transform: scale(0.9) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes toastPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 10px 30px rgba(37,99,235,0.4); }
          50% { transform: scale(1.03); box-shadow: 0 14px 40px rgba(37,99,235,0.6); }
        }
        .inbox-btn-blue:hover { background: linear-gradient(135deg, #1d4ed8, #1e40af) !important; }
        .inbox-btn-light:hover { background: #e2e8f0 !important; }
      `}</style>

      {/* ── Center Screen Modal Popup ────────────────────────────────────────── */}
      {showCenterModal && activeMsg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999997,
            background: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            key={activeMsg.id}
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "20px",
              overflow: "hidden",
              boxShadow: "0 25px 60px -15px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.15)",
              animation: "centerModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header */}
            <div
              style={{
                background: "linear-gradient(135deg, #0f172a, #1e293b)",
                padding: "24px 28px",
                position: "relative",
                borderBottom: "3px solid #2563eb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "#2563eb",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    flexShrink: 0,
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                  }}
                >
                  💬
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Notifikasi Admin
                    </span>
                    {isMulti && (
                      <span style={{
                        fontSize: "10px", fontWeight: "800", background: "#2563eb", color: "#ffffff",
                        padding: "1px 7px", borderRadius: "10px", flexShrink: 0,
                      }}>
                        {safeIdx + 1}/{normalMessages.length}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "#ffffff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeMsg.title}
                  </h3>
                </div>

                <button
                  onClick={() => { handleDismiss(activeMsg); setToastOpen(false); }}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px", border: "none",
                    background: "rgba(255, 255, 255, 0.1)", color: "#94a3b8", cursor: "pointer",
                    fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "all 0.2s",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "28px" }}>
              <div
                style={{
                  fontSize: "14px", color: "#334155", lineHeight: 1.7, marginBottom: "24px",
                  whiteSpace: "pre-wrap", background: "#f8fafc", padding: "18px 20px",
                  borderRadius: "12px", border: "1px solid #e2e8f0",
                }}
              >
                {activeMsg.body}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="inbox-btn-blue"
                  onClick={() => { handleDismiss(activeMsg); setToastOpen(false); }}
                  style={{
                    flex: 1, padding: "12px 20px", borderRadius: "10px", border: "none",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#ffffff",
                    fontWeight: "700", fontSize: "13px", cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)", transition: "all 0.2s",
                  }}
                >
                  ✓ Mengerti
                </button>

                {isMulti && safeIdx < normalMessages.length - 1 && (
                  <button
                    className="inbox-btn-light"
                    onClick={() => { handleDismiss(activeMsg); setCurrentIdx(safeIdx + 1); }}
                    style={{
                      padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1",
                      background: "#f1f5f9", color: "#0f172a", fontWeight: "600",
                      fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    Berikutnya →
                  </button>
                )}

                {isMulti && (
                  <button
                    onClick={() => { handleDismissAll(); setToastOpen(false); }}
                    style={{
                      padding: "12px 14px", borderRadius: "10px", border: "none",
                      background: "transparent", color: "#64748b", fontWeight: "600",
                      fontSize: "12px", cursor: "pointer",
                    }}
                  >
                    Tutup Semua
                  </button>
                )}
              </div>

              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "14px", textAlign: "right" }}>
                {new Date(activeMsg.sentAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit",
                  day: "2-digit", month: "short",
                })} WIB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Notification Badge & Quick Toast (Bottom Right) ───────────── */}
      {hasPending && activeMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 999990,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            onClick={() => setModalForceOpen(true)}
            style={{
              background: "linear-gradient(135deg, #0f172a, #1e293b)",
              border: "2px solid #2563eb",
              borderRadius: "16px",
              padding: "12px 18px",
              color: "#ffffff",
              cursor: "pointer",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.5), 0 0 0 1px rgba(37, 99, 235, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              animation: "toastPulse 3s infinite ease-in-out",
              maxWidth: "340px",
            }}
          >
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "10px", background: "#2563eb",
                color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "18px", flexShrink: 0,
              }}
            >
              💬
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: "800", color: "#60a5fa", textTransform: "uppercase" }}>
                Pesan Admin ({normalMessages.length})
              </div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeMsg.title}
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#93c5fd", fontWeight: "700", background: "rgba(37,99,235,0.2)", padding: "4px 8px", borderRadius: "6px" }}>
              Buka
            </span>
          </div>
        </div>
      )}
    </>
  );
}
