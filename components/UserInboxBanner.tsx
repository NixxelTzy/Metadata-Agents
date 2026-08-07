"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminMessage {
  id: string;
  type: "message" | "refresh" | "block";
  title: string;
  body: string;
  reason?: string;
  targetUsername: string | "all";
  sentAt: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserInboxBanner() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [blockActive, setBlockActive] = useState(false);
  const [blockMsg, setBlockMsg] = useState<AdminMessage | null>(null);
  const [refreshPrompt, setRefreshPrompt] = useState<AdminMessage | null>(null);
  const [visible, setVisible] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/user/inbox");
      if (!res.ok) return;
      const data = await res.json() as { messages: AdminMessage[] };
      const msgs = data.messages ?? [];
      if (msgs.length === 0) return;

      setMessages(msgs);
      setCurrentIdx(0);
      setVisible(true);

      // Check for special types
      const blockMsg = msgs.find((m) => m.type === "block");
      const refreshMsg = msgs.find((m) => m.type === "refresh");

      if (blockMsg) {
        setBlockMsg(blockMsg);
        setBlockActive(true);
      } else if (refreshMsg) {
        setRefreshPrompt(refreshMsg);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  const markRead = async (ids: string[]) => {
    try {
      await fetch("/api/user/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch { /* silent */ }
  };

  const handleDismiss = (msg: AdminMessage) => {
    const newDismissed = [...dismissed, msg.id];
    setDismissed(newDismissed);
    void markRead([msg.id]);

    const remaining = messages.filter((m) => !newDismissed.includes(m.id));
    if (remaining.length === 0) {
      setVisible(false);
    } else {
      setCurrentIdx((prev) => Math.min(prev, remaining.length - 1));
    }
  };

  const handleDismissAll = () => {
    const allIds = messages.map((m) => m.id);
    setDismissed(allIds);
    void markRead(allIds);
    setVisible(false);
    setRefreshPrompt(null);
  };

  const handleReload = () => {
    if (refreshPrompt) void markRead([refreshPrompt.id]);
    window.location.reload();
  };

  const pendingMessages = messages.filter((m) => !dismissed.includes(m.id) && m.type === "message");
  const currentMsg = pendingMessages[currentIdx] ?? null;

  // ── Block Overlay ─────────────────────────────────────────────────────────

  if (blockActive && blockMsg) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(0,0,0,0.96)",
          backdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "inherit",
        }}
      >
        <style>{`
          @keyframes blockPulse {
            0%,100% { transform: scale(1); }
            50% { transform: scale(1.03); }
          }
          @keyframes blockFadeIn {
            from { opacity:0; transform:translateY(24px) scale(0.96); }
            to { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(15,15,26,0.98))",
            border: "1.5px solid rgba(239,68,68,0.4)",
            borderRadius: "20px",
            padding: "40px 36px",
            textAlign: "center",
            animation: "blockFadeIn 0.4s ease",
            boxShadow: "0 0 60px rgba(239,68,68,0.2), 0 30px 80px rgba(0,0,0,0.8)",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.15)",
              border: "2px solid rgba(239,68,68,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              margin: "0 auto 20px",
              animation: "blockPulse 3s ease-in-out infinite",
            }}
          >
            🚫
          </div>

          <h2 style={{ margin: "0 0 12px", fontSize: "22px", fontWeight: "900", color: "#f87171", letterSpacing: "-0.01em" }}>
            {blockMsg.title}
          </h2>

          <p style={{ margin: "0 0 16px", fontSize: "15px", color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
            {blockMsg.body}
          </p>

          {blockMsg.reason && (
            <div style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "20px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>
                Alasan Pemblokiran
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
                {blockMsg.reason}
              </div>
            </div>
          )}

          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "24px" }}>
            Hubungi admin untuk membuka blokir ini.
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              color: "white",
              fontWeight: "800",
              fontSize: "14px",
              cursor: "pointer",
              letterSpacing: "0.03em",
            }}
          >
            🔄 Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  // ── Refresh Prompt (floating card) ────────────────────────────────────────

  if (refreshPrompt && !dismissed.includes(refreshPrompt.id)) {
    return (
      <>
        <style>{`
          @keyframes slideDown {
            from { opacity:0; transform:translateY(-20px); }
            to { opacity:1; transform:translateY(0); }
          }
          @keyframes shimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
        `}</style>
        <div
          style={{
            position: "fixed",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            width: "min(520px, calc(100vw - 32px))",
            background: "linear-gradient(135deg, rgba(5,150,105,0.95), rgba(6,95,70,0.98))",
            backdropFilter: "blur(20px)",
            border: "1.5px solid rgba(74,222,128,0.5)",
            borderRadius: "16px",
            padding: "0",
            animation: "slideDown 0.4s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(74,222,128,0.2)",
            overflow: "hidden",
          }}
        >
          {/* Shimmer strip */}
          <div style={{
            height: "3px",
            background: "linear-gradient(90deg, transparent, #4ade80, transparent)",
            backgroundSize: "200% 100%",
            animation: "shimmer 2s linear infinite",
          }} />

          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                flexShrink: 0,
              }}>
                🔄
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "800", fontSize: "15px", color: "white", marginBottom: "4px" }}>
                  {refreshPrompt.title}
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
                  {refreshPrompt.body}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button
                onClick={handleReload}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "9px",
                  border: "none",
                  background: "rgba(255,255,255,0.2)",
                  color: "white",
                  fontWeight: "800",
                  fontSize: "13px",
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              >
                🔄 Muat Ulang Sekarang
              </button>
              <button
                onClick={() => { void markRead([refreshPrompt.id]); setRefreshPrompt(null); }}
                style={{
                  padding: "11px 18px",
                  borderRadius: "9px",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Nanti
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Normal Message Notification ───────────────────────────────────────────

  if (!visible || !currentMsg) return null;

  const isMulti = pendingMessages.length > 1;

  return (
    <>
      <style>{`
        @keyframes notifIn {
          from { opacity:0; transform:translateY(24px) scale(0.95); }
          to { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes gradShift {
          0%,100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .notif-dismiss:hover { background: rgba(255,255,255,0.12) !important; }
        .notif-close:hover { background: rgba(255,255,255,0.12) !important; }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9998,
          width: "min(380px, calc(100vw - 32px))",
          animation: "notifIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(79,70,229,0.98))",
            backdropFilter: "blur(24px)",
            border: "1.5px solid rgba(167,139,250,0.5)",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 30px rgba(124,58,237,0.3)",
          }}
        >
          {/* Gradient top strip */}
          <div style={{
            height: "3px",
            background: "linear-gradient(90deg, #7c3aed, #ec4899, #7c3aed)",
            backgroundSize: "200% 100%",
            animation: "gradShift 3s ease infinite",
          }} />

          <div style={{ padding: "18px 20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
              <div style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}>
                📨
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "800", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Pesan dari Admin
                  </span>
                  {isMulti && (
                    <span style={{
                      fontSize: "9px",
                      fontWeight: "800",
                      background: "rgba(255,255,255,0.2)",
                      padding: "1px 6px",
                      borderRadius: "8px",
                      color: "white",
                    }}>
                      {currentIdx + 1}/{pendingMessages.length}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: "800", fontSize: "14px", color: "white", lineHeight: 1.3 }}>
                  {currentMsg.title}
                </div>
              </div>
              <button
                className="notif-close"
                onClick={() => handleDismiss(currentMsg)}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "7px",
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.82)",
              lineHeight: 1.6,
              marginBottom: "14px",
              paddingLeft: "50px",
            }}>
              {currentMsg.body}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "8px", paddingLeft: "50px", flexWrap: "wrap" }}>
              {isMulti && currentIdx < pendingMessages.length - 1 && (
                <button
                  className="notif-dismiss"
                  onClick={() => { handleDismiss(currentMsg); setCurrentIdx((p) => p + 1); }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid rgba(255,255,255,0.25)",
                    background: "transparent",
                    color: "white",
                    fontWeight: "600",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  Berikutnya →
                </button>
              )}
              <button
                className="notif-dismiss"
                onClick={() => handleDismiss(currentMsg)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "white",
                  fontWeight: "700",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                ✓ Mengerti
              </button>
              {isMulti && (
                <button
                  className="notif-dismiss"
                  onClick={handleDismissAll}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid rgba(255,255,255,0.15)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: "600",
                    fontSize: "11px",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  Tutup Semua
                </button>
              )}
            </div>

            {/* Timestamp */}
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "10px", paddingLeft: "50px" }}>
              {new Date(currentMsg.sentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} WIB
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
