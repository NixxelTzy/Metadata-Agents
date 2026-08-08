"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminMessage {
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
    const raw = localStorage.getItem("adminmsg_dismissed_v5");
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem("adminmsg_dismissed_v5", JSON.stringify(Array.from(set)));
  } catch {}
}

// ─── Web Audio API Sound Chime Synthesizer ───────────────────────────────────

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;

    // First tone (A5 - 880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Second tone (D6 - 1174.66Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.1);
    gain2.gain.setValueAtTime(0.18, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.42);
  } catch { /* Autoplay restriction fallback */ }
}

// ─── Notification Bell Button Component ───────────────────────────────────────

export function NotificationBellButton() {
  const [unreadCount, setUnreadCount] = useState(0);

  const updateCount = useCallback(() => {
    try {
      const rawMsgs = sessionStorage.getItem("adminmsg_latest_cache");
      if (!rawMsgs) { setUnreadCount(0); return; }
      const msgs: AdminMessage[] = JSON.parse(rawMsgs);
      const dismissed = loadDismissed();
      const unread = msgs.filter((m) => !dismissed.has(m.id)).length;
      setUnreadCount(unread);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    updateCount();
    const handler = () => updateCount();
    window.addEventListener("adminmsg_updated", handler);
    window.addEventListener("storage", handler);
    const id = setInterval(updateCount, 1500);
    return () => {
      window.removeEventListener("adminmsg_updated", handler);
      window.removeEventListener("storage", handler);
      clearInterval(id);
    };
  }, [updateCount]);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("open_admin_inbox_drawer"));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Kotak Masuk Notifikasi Admin"
      style={{
        position: "relative",
        background: "rgba(124, 58, 237, 0.12)",
        border: "1px solid rgba(124, 58, 237, 0.3)",
        borderRadius: "10px",
        width: "36px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "16px",
        color: "#a78bfa",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      🔔
      {unreadCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            background: "#ef4444",
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: "800",
            padding: "1px 5px",
            borderRadius: "10px",
            boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)",
            lineHeight: 1,
            animation: "pulse 2s infinite",
          }}
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}

// ─── Autonomous Background Messenger Engine Component ───────────────────────

export default function UserInboxBanner() {
  const [allMessages, setAllMessages] = useState<AdminMessage[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [appealText, setAppealText] = useState("");
  const [appealing, setAppealing] = useState(false);
  const [appealRes, setAppealRes] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"unread" | "all">("unread");
  const [popupAutoOpen, setPopupAutoOpen] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const prevCountRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Load dismissed set on mount & setup event listeners & tab sync
  useEffect(() => {
    setDismissed(loadDismissed());

    const openDrawerHandler = () => setDrawerOpen(true);
    window.addEventListener("open_admin_inbox_drawer", openDrawerHandler);

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        channelRef.current = new BroadcastChannel("admin_inbox_system_channel");
        channelRef.current.onmessage = (ev: MessageEvent<{ type: string; messages?: AdminMessage[] }>) => {
          if (ev.data?.type === "NEW_MESSAGES" && Array.isArray(ev.data.messages)) {
            setAllMessages(ev.data.messages);
            setPopupAutoOpen(true);
          }
        };
      } catch { /* fallback */ }
    }
    return () => {
      mountedRef.current = false;
      window.removeEventListener("open_admin_inbox_drawer", openDrawerHandler);
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  // ── Background Polling Engine (1.5s interval) ──────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/user/inbox", { credentials: "include" });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json() as { messages: AdminMessage[] };
      const msgs: AdminMessage[] = data.messages ?? [];

      if (mountedRef.current) {
        const dismissedSet = loadDismissed();
        const activeUnreadCount = msgs.filter((m) => !dismissedSet.has(m.id)).length;

        // Play chime sound if new unread message arrived in background
        if (activeUnreadCount > prevCountRef.current && prevCountRef.current >= 0) {
          playNotificationSound();
          setPopupAutoOpen(true);
        }
        prevCountRef.current = activeUnreadCount;

        setAllMessages(msgs);

        // Cache in sessionStorage for bell counter
        try {
          sessionStorage.setItem("adminmsg_latest_cache", JSON.stringify(msgs));
          window.dispatchEvent(new CustomEvent("adminmsg_updated"));
        } catch {}

        // Broadcast to other tabs
        if (channelRef.current && msgs.length > 0) {
          channelRef.current.postMessage({ type: "NEW_MESSAGES", messages: msgs });
        }
      }
    } catch { /* silent background error recovery */ }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);

    // Re-poll on tab visibility focus
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
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
    setPopupAutoOpen(false);
    void markRead([msg.id]);
    window.dispatchEvent(new CustomEvent("adminmsg_updated"));
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
    setPopupAutoOpen(false);
    void markRead(ids);
    window.dispatchEvent(new CustomEvent("adminmsg_updated"));
  }, [allMessages, markRead]);

  // ── Restore / Clear Dismissed ────────────────────────────────────────────────
  const handleRestoreAll = useCallback(() => {
    setDismissed(new Set());
    try { localStorage.removeItem("adminmsg_dismissed_v5"); } catch {}
    setPopupAutoOpen(true);
    window.dispatchEvent(new CustomEvent("adminmsg_updated"));
  }, []);

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
  const unreadMessages = allMessages.filter((m) => m.type === "message" && !dismissed.has(m.id));
  const safeIdx = unreadMessages.length > 0 ? Math.min(currentIdx, unreadMessages.length - 1) : 0;
  const activeMsg = unreadMessages[safeIdx] ?? unreadMessages[0] ?? null;

  const showCenterPopup = popupAutoOpen && activeMsg !== null;

  return (
    <>
      <style>{`
        @keyframes centerModalIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes drawerIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        .inbox-btn-blue:hover { background: linear-gradient(135deg, #1d4ed8, #1e40af) !important; }
        .inbox-btn-light:hover { background: #e2e8f0 !important; }
      `}</style>

      {/* ── Block Overlay (Highest Priority) ─────────────────────────────────── */}
      {blockMsg && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999999,
            background: "rgba(15, 23, 42, 0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "500px", width: "100%", background: "#ffffff", borderRadius: "20px", overflow: "hidden",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.2)",
              animation: "centerModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ background: "#0f172a", padding: "28px 32px", textAlign: "center" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.15)", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 14px" }}>
                🚫
              </div>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "#ffffff" }}>
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
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#dc2626", textTransform: "uppercase", marginBottom: "3px" }}>
                    Alasan Pemblokiran
                  </div>
                  <div style={{ fontSize: "13px", color: "#991b1b", fontWeight: "500" }}>
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
                    cursor: appealing || !appealText.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {appealing ? "⏳ AI Sedang Mengevaluasi Banding..." : "⚡ Evaluasi & Unblock Akun dengan AI"}
                </button>
                {appealRes && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "#2563eb", fontWeight: "600" }}>
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
                }}
              >
                🔄 Muat Ulang Halaman
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Refresh Modal ───────────────────────────────────────────────────── */}
      {refreshMsg && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999998,
            background: "rgba(15, 23, 42, 0.78)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "460px", width: "100%", background: "#ffffff", borderRadius: "20px", overflow: "hidden",
              boxShadow: "0 25px 60px -15px rgba(37, 99, 235, 0.3), 0 0 0 1px rgba(37, 99, 235, 0.2)",
              animation: "centerModalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e3a8a)", padding: "24px 28px", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#2563eb", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>
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
                  }}
                >
                  🔄 Buka Ulang Sekarang
                </button>
                <button
                  onClick={() => handleDismiss(refreshMsg)}
                  style={{
                    padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1",
                    background: "#f8fafc", color: "#475569", fontWeight: "600",
                    fontSize: "13px", cursor: "pointer",
                  }}
                >
                  Nanti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Central Message Modal Popup ──────────────────────────────────────── */}
      {showCenterPopup && activeMsg && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999997,
            background: "rgba(15, 23, 42, 0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            key={activeMsg.id}
            style={{
              maxWidth: "480px", width: "100%", background: "#ffffff", borderRadius: "20px", overflow: "hidden",
              boxShadow: "0 25px 60px -15px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.15)",
              animation: "centerModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", padding: "24px 28px", borderBottom: "3px solid #2563eb" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#2563eb", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                  💬
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#60a5fa", textTransform: "uppercase" }}>
                      Notifikasi Admin
                    </span>
                    {unreadMessages.length > 1 && (
                      <span style={{ fontSize: "10px", fontWeight: "800", background: "#2563eb", color: "#ffffff", padding: "1px 7px", borderRadius: "10px" }}>
                        {safeIdx + 1}/{unreadMessages.length}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeMsg.title}
                  </h3>
                </div>
                <button
                  onClick={() => handleDismiss(activeMsg)}
                  style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", background: "rgba(255, 255, 255, 0.1)", color: "#94a3b8", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "28px" }}>
              <div style={{ fontSize: "14px", color: "#334155", lineHeight: 1.7, marginBottom: "24px", whiteSpace: "pre-wrap", background: "#f8fafc", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                {activeMsg.body}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="inbox-btn-blue"
                  onClick={() => handleDismiss(activeMsg)}
                  style={{ flex: 1, padding: "12px 20px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#ffffff", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
                >
                  ✓ Mengerti
                </button>

                {unreadMessages.length > 1 && safeIdx < unreadMessages.length - 1 && (
                  <button
                    className="inbox-btn-light"
                    onClick={() => { handleDismiss(activeMsg); setCurrentIdx(safeIdx + 1); }}
                    style={{ padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#0f172a", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
                  >
                    Berikutnya →
                  </button>
                )}

                {unreadMessages.length > 1 && (
                  <button
                    onClick={handleDismissAll}
                    style={{ padding: "12px 14px", borderRadius: "10px", border: "none", background: "transparent", color: "#64748b", fontWeight: "600", fontSize: "12px", cursor: "pointer" }}
                  >
                    Tutup Semua
                  </button>
                )}
              </div>

              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "14px", textAlign: "right" }}>
                {new Date(activeMsg.sentAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
                })} WIB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Notification Drawer Modal ───────────────────────────── */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999995,
            background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            display: "flex", justifyContent: "flex-end",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "440px", width: "100%", height: "100%", background: "#ffffff",
              boxShadow: "-10px 0 40px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column",
              animation: "drawerIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Drawer Header */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", padding: "20px 24px", borderBottom: "3px solid #2563eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>📬</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#ffffff" }}>
                    Kotak Masuk Notifikasi Admin
                  </h3>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    {unreadMessages.length} belum dibaca · {allMessages.length} total pesan
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.1)", color: "#94a3b8", cursor: "pointer", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {/* Tab Filter */}
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", padding: "8px 16px", gap: "8px" }}>
              <button
                onClick={() => setDrawerTab("unread")}
                style={{
                  flex: 1, padding: "8px", borderRadius: "8px", border: "none",
                  background: drawerTab === "unread" ? "#2563eb" : "transparent",
                  color: drawerTab === "unread" ? "#ffffff" : "#64748b",
                  fontWeight: "700", fontSize: "12px", cursor: "pointer",
                }}
              >
                Belum Dibaca ({unreadMessages.length})
              </button>
              <button
                onClick={() => setDrawerTab("all")}
                style={{
                  flex: 1, padding: "8px", borderRadius: "8px", border: "none",
                  background: drawerTab === "all" ? "#2563eb" : "transparent",
                  color: drawerTab === "all" ? "#ffffff" : "#64748b",
                  fontWeight: "700", fontSize: "12px", cursor: "pointer",
                }}
              >
                Semua Pesan ({allMessages.length})
              </button>
            </div>

            {/* Drawer Body List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {allMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📭</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>Belum Ada Pesan</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Pesan yang dikirim admin akan muncul di sini secara otomatis.</div>
                </div>
              ) : drawerTab === "unread" && unreadMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>Semua Pesan Sudah Dibaca</div>
                  <button
                    onClick={handleRestoreAll}
                    style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#2563eb", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                  >
                    🔄 Tampilkan Kembali Semua Pesan
                  </button>
                </div>
              ) : (
                (drawerTab === "unread" ? unreadMessages : allMessages).map((msg) => {
                  const isSeen = dismissed.has(msg.id);
                  return (
                    <div
                      key={msg.id}
                      style={{
                        padding: "14px 16px", borderRadius: "12px", marginBottom: "10px",
                        border: `1px solid ${isSeen ? "#e2e8f0" : "rgba(37,99,235,0.3)"}`,
                        background: isSeen ? "#ffffff" : "rgba(37,99,235,0.04)",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", padding: "2px 7px", borderRadius: "6px", background: msg.type === "block" ? "#fef2f2" : msg.type === "refresh" ? "#ecfdf5" : "#eff6ff", color: msg.type === "block" ? "#dc2626" : msg.type === "refresh" ? "#059669" : "#2563eb" }}>
                          {msg.type === "block" ? "🚫 Blokir" : msg.type === "refresh" ? "🔄 Refresh" : "💬 Pesan Admin"}
                        </span>
                        <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                          {new Date(msg.sentAt).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </span>
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", marginBottom: "4px" }}>
                        {msg.title}
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: "10px" }}>
                        {msg.body}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {!isSeen ? (
                          <button
                            onClick={() => handleDismiss(msg)}
                            style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontWeight: "700", fontSize: "11px", cursor: "pointer" }}
                          >
                            ✓ Tandai Dibaca
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>✓ Sudah Dibaca</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div style={{ padding: "16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", gap: "10px" }}>
              <button
                onClick={handleRestoreAll}
                style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
              >
                🔄 Reset Status Pesan
              </button>
              <button
                onClick={handleDismissAll}
                style={{ padding: "10px 14px", borderRadius: "8px", border: "none", background: "#0f172a", color: "#ffffff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
              >
                Tandai Semua Dibaca
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
