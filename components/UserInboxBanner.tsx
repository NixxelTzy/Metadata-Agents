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

interface UserAuth {
  userId: string;
  email: string;
  username: string;
  recipientId?: string;
  role: string;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem("adminmsg_dismissed_session");
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    sessionStorage.setItem("adminmsg_dismissed_session", JSON.stringify(Array.from(set)));
  } catch {}
}

// ─── Web Audio API Sound Chime Synthesizer ───────────────────────────────────

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    // Tone 1: 880Hz (A5)
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

    // Tone 2: 1174.66Hz (D6)
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
  const [authUser, setAuthUser] = useState<UserAuth | null>(null);
  const authUserRef = useRef<UserAuth | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  const [unblockResult, setUnblockResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const prevIdsRef = useRef<string>("");
  const mountedRef = useRef(true);

  // Fetch current authenticated user on mount
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: UserAuth } | null) => {
        if (data?.user && mountedRef.current) {
          setAuthUser(data.user);
          authUserRef.current = data.user;
        }
      })
      .catch(() => {});
  }, []);

  // Load dismissed set on mount & setup event listeners & tab sync
  useEffect(() => {
    setDismissed(loadDismissed());

    const openDrawerHandler = () => setDrawerOpen(true);
    window.addEventListener("open_admin_inbox_drawer", openDrawerHandler);

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        channelRef.current = new BroadcastChannel("admin_inbox_system_channel");
        // When another tab sends a NEW_MESSAGE signal, just re-poll from server.
        // The server is the single source of truth for what messages belong to this user.
        channelRef.current.onmessage = (ev: MessageEvent<{ type: string }>) => {
          if (ev.data?.type === "POLL_NOW") {
            void poll();
          }
        };
      } catch { /* fallback */ }
    }
    return () => {
      mountedRef.current = false;
      window.removeEventListener("open_admin_inbox_drawer", openDrawerHandler);
      if (channelRef.current) channelRef.current.close();
    };
  }, [authUser]);

  // ── 4-Second Real-Time Precision Online Heartbeat Ping ─────────────────────
  useEffect(() => {
    const sendPing = async () => {
      try {
        const u = authUserRef.current || authUser;
        const queryParams = new URLSearchParams();
        if (u?.email) queryParams.set("email", u.email);
        if (u?.userId) queryParams.set("userId", u.userId);
        if (u?.username) queryParams.set("username", u.username);

        await fetch(`/api/user/ping?${queryParams.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: u?.email,
            userId: u?.userId,
            username: u?.username,
            path: typeof window !== "undefined" ? window.location.pathname : "/",
            visibility: typeof document !== "undefined" ? document.visibilityState : "visible",
          }),
        });
      } catch { /* silent */ }
    };

    sendPing();
    const pingInterval = setInterval(sendPing, 4000);
    return () => clearInterval(pingInterval);
  }, [authUser]);

  // ── Background Polling Engine (1.5s interval) ──────────────────────────────
  const poll = useCallback(async () => {
    try {
      const u = authUserRef.current || authUser;
      const queryParams = new URLSearchParams();
      if (u?.email) queryParams.set("email", u.email);
      if (u?.userId) queryParams.set("userId", u.userId);
      if (u?.username) queryParams.set("username", u.username);
      if (u?.recipientId) queryParams.set("recipientId", u.recipientId);

      const url = `/api/user/inbox${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json() as { messages: AdminMessage[] };
      const msgs: AdminMessage[] = data.messages ?? [];

      if (mountedRef.current) {
        const unreadIncoming = msgs.filter((m) => !dismissed.has(m.id));
        const idsStr = unreadIncoming.map((m) => m.id).join(",");

        // New messages arrived that weren't in previous poll
        if (idsStr && idsStr !== prevIdsRef.current) {
          playNotificationSound();
          setPopupAutoOpen(true);
          prevIdsRef.current = idsStr;
        }

        setAllMessages(msgs);

        // Cache in sessionStorage for bell counter
        try {
          sessionStorage.setItem("adminmsg_latest_cache", JSON.stringify(msgs));
          window.dispatchEvent(new CustomEvent("adminmsg_updated"));
        } catch {}

        // Signal other tabs to re-poll from server (don't send raw message data)
        if (channelRef.current) {
          try { channelRef.current.postMessage({ type: "POLL_NOW" }); } catch { /* ignore */ }
        }
      }
    } catch { /* silent background error recovery */ }
  }, [authUser, dismissed]);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);

    const handleTriggerPoll = () => void poll();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };

    window.addEventListener("trigger_inbox_poll", handleTriggerPoll);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("trigger_inbox_poll", handleTriggerPoll);
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
    try { sessionStorage.removeItem("adminmsg_dismissed_session"); } catch {}
    setPopupAutoOpen(true);
    window.dispatchEvent(new CustomEvent("adminmsg_updated"));
  }, []);

  // ── AI Unblock Appeal ────────────────────────────────────────────────────────
  const handleAiUnblockAppeal = async () => {
    if (!appealText.trim()) return;
    setAppealing(true);
    setAppealRes(null);
    try {
      const res = await fetch("/api/user/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "appeal", appealMessage: appealText.trim() }),
      });
      const data = await res.json() as { ok?: boolean; aiReplyText?: string; unblocked?: boolean };
      if (data.ok && data.unblocked) {
        setAppealRes("🟢 Banding disetujui AI! Akun berhasil dibuka. Memuat ulang...");
        setAllMessages([]);
        prevIdsRef.current = "";
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

  // ── Admin Force Unblock (Testing) ────────────────────────────────────────────
  const handleAdminUnblock = async (targetUserId?: string) => {
    setUnblocking(true);
    setUnblockResult(null);
    try {
      const res = await fetch("/api/admin/messageweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "unblock", targetUserId: targetUserId ?? authUser?.userId }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (data.ok) {
        setUnblockResult({ ok: true, msg: data.message ?? "✅ Blokir berhasil dilepas!" });
        // Clear local messages and reload after short delay
        setAllMessages([]);
        prevIdsRef.current = "";
        setTimeout(() => window.location.reload(), 1800);
      } else {
        setUnblockResult({ ok: false, msg: data.error ?? "Gagal melepas blokir" });
      }
    } catch {
      setUnblockResult({ ok: false, msg: "Gagal terhubung ke server" });
    } finally {
      setUnblocking(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const blockMsg = allMessages.find((m) => m.type === "block" && !dismissed.has(m.id)) ?? null;
  const refreshMsg = allMessages.find((m) => m.type === "refresh" && !dismissed.has(m.id)) ?? null;
  const unreadMessages = allMessages.filter((m) => m.type === "message" && !dismissed.has(m.id));
  const safeIdx = unreadMessages.length > 0 ? Math.min(currentIdx, unreadMessages.length - 1) : 0;
  const activeMsg = unreadMessages[safeIdx] ?? unreadMessages[0] ?? null;

  // Show modal popup continuously for any active unread message until explicitly closed by user
  const showCenterPopup = activeMsg !== null && !dismissed.has(activeMsg.id);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes centerModalIn {
          from { opacity: 0; transform: scale(0.90) translateY(24px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes drawerIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes topBannerSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 40px rgba(239,68,68,0.8), 0 0 60px rgba(239,68,68,0.3); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .inbox-modal * { font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
        .inbox-close-btn:hover { background: rgba(255,255,255,0.15) !important; transform: scale(1.1); }
        .inbox-action-btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .inbox-pill:hover { opacity: 0.85; transform: scale(0.97); }
        .inbox-appeal-input { transition: border-color 0.2s, box-shadow 0.2s; }
        .inbox-appeal-input:focus { border-color: #818cf8 !important; box-shadow: 0 0 0 3px rgba(129,140,248,0.2) !important; outline: none; }
        .inbox-drawer-item:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── Top-of-Screen Sticky Admin Announcement Notice Bar ──────────────── */}
      {activeMsg && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999980,
            background: "linear-gradient(135deg, #0f172a, #1e3a8a)",
            borderBottom: "2px solid #2563eb",
            padding: "10px 20px",
            color: "#ffffff",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            animation: "topBannerSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "18px" }}>💬</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "#60a5fa", textTransform: "uppercase" }}>
                Pesan dari Admin
              </div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeMsg.title}: <span style={{ fontWeight: "400", color: "#cbd5e1" }}>{activeMsg.body}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => setPopupAutoOpen(true)}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
            >
              🔍 Buka Detail
            </button>
            <button
              onClick={() => handleDismiss(activeMsg)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #475569", background: "transparent", color: "#94a3b8", fontWeight: "600", fontSize: "12px", cursor: "pointer" }}
            >
              ✕ Tutup
            </button>
          </div>
        </div>
      )}

      {/* ── Block Overlay (Highest Priority) — LANDSCAPE 2-COLUMN ─────────── */}
      {blockMsg && (
        <div
          className="inbox-modal"
          style={{
            position: "fixed", inset: 0, zIndex: 999999,
            background: "rgba(2, 4, 18, 0.94)",
            backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px",
          }}
        >
          {/* Ambient orbs */}
          <div style={{ position: "absolute", top: "10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "10%", right: "10%", width: "380px", height: "380px", borderRadius: "50%", background: "radial-gradient(circle, rgba(220,38,38,0.08) 0%, transparent 65%)", pointerEvents: "none" }} />

          {/* ── LANDSCAPE CARD (max-width wide, 2 columns) ── */}
          <div
            style={{
              maxWidth: "880px", width: "100%", position: "relative",
              background: "linear-gradient(145deg, rgba(12,8,28,0.99) 0%, rgba(25,8,18,0.99) 100%)",
              borderRadius: "28px", overflow: "hidden",
              border: "1px solid rgba(239,68,68,0.22)",
              boxShadow: "0 0 0 1px rgba(239,68,68,0.08), 0 40px 100px -20px rgba(0,0,0,0.9), 0 0 80px rgba(239,68,68,0.1)",
              animation: "centerModalIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              display: "grid",
              gridTemplateColumns: "260px 1fr",
            }}
          >
            {/* Top Danger Stripe — spans both cols */}
            <div style={{
              gridColumn: "1 / -1",
              height: "4px",
              background: "linear-gradient(90deg, #dc2626, #ef4444, #f87171, #ef4444, #dc2626)",
              backgroundSize: "200% auto",
              animation: "shimmer 3s linear infinite",
            }} />

            {/* ── LEFT COLUMN: Red sidebar panel ── */}
            <div style={{
              background: "linear-gradient(160deg, rgba(40,8,18,0.95) 0%, rgba(20,5,12,0.98) 100%)",
              borderRight: "1px solid rgba(239,68,68,0.18)",
              padding: "36px 28px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Glow orb behind icon */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: "220px", height: "220px", borderRadius: "50%",
                background: "radial-gradient(circle, rgba(239,68,68,0.22) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              {/* Block icon */}
              <div style={{
                width: "90px", height: "90px", borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(185,28,28,0.15))",
                border: "2px solid rgba(239,68,68,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "42px", position: "relative", zIndex: 1,
                animation: "pulse-glow 2.5s ease-in-out infinite, float 4s ease-in-out infinite",
              }}>
                🚫
              </div>

              {/* Status badge */}
              <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
                <div style={{
                  display: "inline-block",
                  fontSize: "9px", fontWeight: "800", letterSpacing: "0.15em",
                  textTransform: "uppercase", color: "#f87171",
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  padding: "5px 14px", borderRadius: "20px",
                  marginBottom: "12px",
                }}>
                  ⚠️ Akun Diblokir
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                  Sistem Keamanan<br />& Batasan Akses
                </div>
              </div>

              {/* Timestamp */}
              <div style={{
                position: "relative", zIndex: 1,
                fontSize: "10px", color: "rgba(239,68,68,0.55)",
                textAlign: "center", fontWeight: "600",
              }}>
                📅 {new Date(blockMsg.sentAt ?? Date.now()).toLocaleString("id-ID", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                })}
              </div>
            </div>

            {/* ── RIGHT COLUMN: Content ── */}
            <div style={{
              padding: "32px 32px 28px",
              overflowY: "auto",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: "0",
            }}>
              {/* Title row */}
              <h2 style={{
                margin: "0 0 6px 0", fontSize: "20px", fontWeight: "900",
                color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1.3,
              }}>
                {blockMsg.title}
              </h2>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "20px" }}>
                NixelStudio · Pemberitahuan Resmi
              </div>

              {/* Message body */}
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px", padding: "18px",
                fontSize: "13px", color: "rgba(255,255,255,0.72)", lineHeight: 1.8,
                marginBottom: "16px",
              }}>
                {blockMsg.body}
              </div>

              {/* Block reason */}
              {blockMsg.reason && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(185,28,28,0.06))",
                  border: "1px solid rgba(239,68,68,0.28)",
                  borderRadius: "12px", padding: "14px 16px",
                  display: "flex", gap: "10px", alignItems: "flex-start",
                  marginBottom: "16px",
                }}>
                  <div style={{ fontSize: "18px", flexShrink: 0, marginTop: "1px" }}>⚠️</div>
                  <div>
                    <div style={{ fontSize: "9px", fontWeight: "800", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Alasan Pemblokiran</div>
                    <div style={{ fontSize: "13px", color: "#fca5a5", fontWeight: "600", lineHeight: 1.5 }}>{blockMsg.reason}</div>
                  </div>
                </div>
              )}

              {/* Appeal section */}
              <div style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))",
                border: "1px solid rgba(99,102,241,0.22)",
                borderRadius: "14px", padding: "18px",
                marginBottom: "14px",
              }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#a5b4fc", marginBottom: "10px", display: "flex", alignItems: "center", gap: "7px" }}>
                  <span>🤖</span> Ajukan Banding & Unblock Otomatis oleh AI
                </div>
                <textarea
                  placeholder="Tulis alasan/penjelasan banding Anda dengan jelas..."
                  value={appealText}
                  onChange={(e) => setAppealText(e.target.value)}
                  rows={3}
                  className="inbox-appeal-input"
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: "9px",
                    border: "1px solid rgba(99,102,241,0.3)",
                    background: "rgba(15,10,40,0.6)",
                    fontSize: "13px", color: "#e2e8f0", marginBottom: "10px",
                    boxSizing: "border-box", resize: "none", lineHeight: 1.6,
                  }}
                />
                <button
                  className="inbox-action-btn"
                  onClick={handleAiUnblockAppeal}
                  disabled={appealing || !appealText.trim()}
                  style={{
                    width: "100%", padding: "11px", borderRadius: "9px", border: "none",
                    background: appealing || !appealText.trim()
                      ? "rgba(255,255,255,0.07)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: appealing || !appealText.trim() ? "rgba(255,255,255,0.3)" : "#ffffff",
                    fontWeight: "700", fontSize: "13px",
                    cursor: appealing || !appealText.trim() ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    boxShadow: appealing || !appealText.trim() ? "none" : "0 4px 16px rgba(99,102,241,0.3)",
                  }}
                >
                  {appealing ? "⏳ AI Sedang Mengevaluasi Banding..." : "⚡ Kirim Banding ke AI"}
                </button>
                {appealRes && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "#a5b4fc", fontWeight: "600", padding: "10px 12px", background: "rgba(99,102,241,0.1)", borderRadius: "8px", lineHeight: 1.5 }}>
                    {appealRes}
                  </div>
                )}
              </div>

              {/* ── Admin-Only: Force Unblock Button ── */}
              {authUser?.email === "nixxeltzy@gmail.com" && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(234,179,8,0.1), rgba(202,138,4,0.05))",
                  border: "1px solid rgba(234,179,8,0.28)",
                  borderRadius: "14px", padding: "16px 18px",
                  marginBottom: "14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{
                      padding: "3px 10px", borderRadius: "20px",
                      background: "rgba(234,179,8,0.18)", border: "1px solid rgba(234,179,8,0.38)",
                      fontSize: "9px", fontWeight: "800", color: "#fde047",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>
                      🛡️ Mode Admin
                    </div>
                    <span style={{ fontSize: "10px", color: "rgba(253,224,71,0.55)" }}>Hanya terlihat oleh kamu</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(253,224,71,0.7)", marginBottom: "12px", lineHeight: 1.5 }}>
                    Kamu sedang dalam mode blokir uji coba. Klik tombol di bawah untuk langsung melepas blokir.
                  </div>
                  <button
                    className="inbox-action-btn"
                    onClick={() => void handleAdminUnblock(blockMsg?.targetUserId === "all" ? authUser.userId : (blockMsg?.targetUserId ?? authUser.userId))}
                    disabled={unblocking}
                    style={{
                      width: "100%", padding: "12px", borderRadius: "10px", border: "none",
                      background: unblocking ? "rgba(255,255,255,0.07)" : "linear-gradient(135deg, #eab308, #ca8a04)",
                      color: unblocking ? "rgba(255,255,255,0.3)" : "#000000",
                      fontWeight: "800", fontSize: "13px",
                      cursor: unblocking ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      boxShadow: unblocking ? "none" : "0 4px 16px rgba(234,179,8,0.35)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                  >
                    {unblocking ? "⏳ Melepas blokir..." : "🔓 Lepas Blokir Sekarang"}
                  </button>
                  {unblockResult && (
                    <div style={{
                      marginTop: "10px", fontSize: "12px", fontWeight: "600",
                      color: unblockResult.ok ? "#4ade80" : "#f87171",
                      padding: "10px 12px",
                      background: unblockResult.ok ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)",
                      border: `1px solid ${unblockResult.ok ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                      borderRadius: "9px", lineHeight: 1.5,
                    }}>
                      {unblockResult.msg}
                    </div>
                  )}
                </div>
              )}

              {/* Reload button */}
              <button
                className="inbox-action-btn"
                onClick={() => window.location.reload()}
                style={{
                  width: "100%", padding: "13px", borderRadius: "11px",
                  border: "1px solid rgba(255,255,255,0.09)",
                  background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)",
                  fontWeight: "600", fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                🔄 Muat Ulang Halaman
              </button>
            </div>

            {/* Bottom stripe */}
            <div style={{ gridColumn: "1 / -1", height: "3px", background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.4), transparent)" }} />
          </div>
        </div>
      )}

      {/* ── Refresh Modal ───────────────────────────────────────────────────── */}
      {refreshMsg && (
        <div
          className="inbox-modal"
          style={{
            position: "fixed", inset: 0, zIndex: 999998,
            background: "rgba(2, 6, 23, 0.90)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          <div style={{ position: "absolute", top: "20%", left: "25%", width: "350px", height: "350px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

          <div
            style={{
              maxWidth: "460px", width: "100%",
              background: "linear-gradient(145deg, rgba(5,25,40,0.98) 0%, rgba(5,30,20,0.98) 100%)",
              borderRadius: "24px", overflow: "hidden",
              border: "1px solid rgba(16,185,129,0.2)",
              boxShadow: "0 0 0 1px rgba(16,185,129,0.08), 0 40px 80px -20px rgba(0,0,0,0.8), 0 0 50px rgba(16,185,129,0.08)",
              animation: "centerModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ height: "3px", background: "linear-gradient(90deg, #059669, #10b981, #34d399, #10b981, #059669)", backgroundSize: "200% auto", animation: "shimmer 3s linear infinite" }} />

            <div style={{ padding: "32px 32px 24px", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "16px", flexShrink: 0,
                background: "linear-gradient(135deg, #059669, #047857)",
                color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "26px",
                boxShadow: "0 8px 20px rgba(5,150,105,0.4)",
                animation: "float 3s ease-in-out infinite",
              }}>
                🔄
              </div>
              <div>
                <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#34d399", marginBottom: "4px" }}>Pembaruan Tersedia</div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#ffffff", letterSpacing: "-0.02em" }}>{refreshMsg.title}</h3>
              </div>
            </div>

            <div style={{ padding: "0 32px 28px" }}>
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "14px", padding: "18px", marginBottom: "20px",
                fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: 1.7,
              }}>
                {refreshMsg.body}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="inbox-action-btn"
                  onClick={() => { void markRead([refreshMsg.id]); window.location.reload(); }}
                  style={{
                    flex: 1, padding: "13px", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg, #059669, #10b981)", color: "#ffffff",
                    fontWeight: "700", fontSize: "13px", cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(5,150,105,0.35)", transition: "all 0.2s",
                  }}
                >
                  🔄 Perbarui Sekarang
                </button>
                <button
                  className="inbox-action-btn"
                  onClick={() => handleDismiss(refreshMsg)}
                  style={{
                    padding: "13px 18px", borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)",
                    fontWeight: "600", fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  Nanti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Central Message Modal Popup (Ultra-Sleek Landscape Glassmorphic Design) ─── */}
      {showCenterPopup && activeMsg && (
        <div
          className="inbox-modal"
          style={{
            position: "fixed", inset: 0, zIndex: 999997,
            background: "rgba(2, 4, 18, 0.88)",
            backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          {/* Ambient glows */}
          <div style={{ position: "absolute", top: "10%", left: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "10%", right: "10%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 65%)", pointerEvents: "none" }} />

          <div
            key={activeMsg.id}
            style={{
              maxWidth: "800px", width: "100%", position: "relative",
              background: "linear-gradient(145deg, rgba(8,10,28,0.98) 0%, rgba(12,10,30,0.98) 100%)",
              borderRadius: "28px", overflow: "hidden",
              border: "1px solid rgba(99,102,241,0.2)",
              boxShadow: "0 0 0 1px rgba(99,102,241,0.08), 0 40px 100px -20px rgba(0,0,0,0.9), 0 0 80px rgba(99,102,241,0.1)",
              display: "grid", gridTemplateColumns: "270px 1fr",
              animation: "centerModalIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Top accent line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #8b5cf6, #6366f1)", backgroundSize: "200% auto", animation: "shimmer 4s linear infinite", zIndex: 2 }} />

            {/* Left Column: Dark Sidebar */}
            <div style={{
              background: "linear-gradient(160deg, rgba(30,20,60,0.8) 0%, rgba(15,10,35,0.95) 100%)",
              padding: "44px 28px 36px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              borderRight: "1px solid rgba(255,255,255,0.07)", position: "relative", overflow: "hidden",
            }}>
              {/* Ambient glow orb */}
              <div style={{
                position: "absolute", top: "-60px", left: "-60px", width: "220px", height: "220px",
                borderRadius: "50%",
                background: activeMsg.type === "block" ? "rgba(239,68,68,0.2)" : activeMsg.type === "refresh" ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.25)",
                filter: "blur(50px)", pointerEvents: "none",
              }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Icon Badge */}
                <div style={{
                  width: "64px", height: "64px", borderRadius: "20px", marginBottom: "24px",
                  background: activeMsg.type === "block"
                    ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                    : activeMsg.type === "refresh"
                    ? "linear-gradient(135deg, #059669, #047857)"
                    : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "30px",
                  boxShadow: activeMsg.type === "block"
                    ? "0 12px 30px rgba(220,38,38,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
                    : activeMsg.type === "refresh"
                    ? "0 12px 30px rgba(5,150,105,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
                    : "0 12px 30px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
                  animation: "float 4s ease-in-out infinite",
                }}>
                  {activeMsg.type === "block" ? "🚫" : activeMsg.type === "refresh" ? "🔄" : "💬"}
                </div>

                {/* Type badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  fontSize: "10px", fontWeight: "800", letterSpacing: "0.1em",
                  textTransform: "uppercase", padding: "4px 10px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.07)",
                  color: activeMsg.type === "block" ? "#f87171" : activeMsg.type === "refresh" ? "#34d399" : "#a5b4fc",
                  border: `1px solid ${activeMsg.type === "block" ? "rgba(239,68,68,0.3)" : activeMsg.type === "refresh" ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
                  marginBottom: "12px",
                }}>
                  {activeMsg.type === "block" ? "🚫 Keamanan Akun" : activeMsg.type === "refresh" ? "🔄 Pembaruan Web" : "💬 Pesan Resmi Admin"}
                </div>

                <div style={{ fontSize: "21px", fontWeight: "900", color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "4px" }}>
                  Nixel Studio
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>Stock AI Platform</div>
              </div>

              <div style={{ position: "relative", zIndex: 1, marginTop: "28px" }}>
                {unreadMessages.length > 1 && (
                  <div style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    padding: "7px 12px", borderRadius: "10px", color: "#a5b4fc", fontSize: "11px", fontWeight: "700",
                    marginBottom: "14px", display: "inline-flex", alignItems: "center", gap: "6px",
                  }}>
                    📬 Pesan {safeIdx + 1} dari {unreadMessages.length}
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px" }}>
                  📅 {new Date(activeMsg.sentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} WIB
                </div>
              </div>
            </div>

            {/* Right Column: Content */}
            <div style={{ padding: "44px 36px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                {/* Title row with close button */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "20px" }}>
                  <h3 style={{ margin: 0, fontSize: "21px", fontWeight: "900", color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1.3 }}>
                    {activeMsg.title}
                  </h3>
                  <button
                    className="inbox-close-btn"
                    onClick={() => handleDismiss(activeMsg)}
                    title="Tutup & Tandai Dibaca"
                    style={{
                      width: "36px", height: "36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "14px",
                      fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "all 0.2s",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Message body */}
                <div style={{
                  fontSize: "14px", color: "rgba(255,255,255,0.65)", lineHeight: 1.8, whiteSpace: "pre-wrap",
                  background: "rgba(255,255,255,0.04)",
                  padding: "20px 22px", borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  maxHeight: "240px", overflowY: "auto",
                  marginBottom: "24px",
                }}>
                  {activeMsg.body}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="inbox-action-btn"
                  onClick={() => handleDismiss(activeMsg)}
                  style={{
                    flex: 1, padding: "14px 24px", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#ffffff",
                    fontWeight: "800", fontSize: "13.5px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: "0 6px 20px rgba(99,102,241,0.4)", transition: "all 0.2s",
                  }}
                >
                  ✓ Tutup & Tandai Dibaca
                </button>

                {unreadMessages.length > 1 && safeIdx < unreadMessages.length - 1 && (
                  <button
                    className="inbox-action-btn"
                    onClick={() => { handleDismiss(activeMsg); setCurrentIdx(safeIdx + 1); }}
                    style={{
                      padding: "14px 20px", borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                      fontWeight: "700", fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    Berikutnya →
                  </button>
                )}

                {unreadMessages.length > 1 && (
                  <button
                    onClick={handleDismissAll}
                    style={{
                      padding: "14px 16px", borderRadius: "12px", border: "none",
                      background: "transparent", color: "rgba(255,255,255,0.3)",
                      fontWeight: "600", fontSize: "12px", cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    Tutup Semua
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Notification Drawer Modal ───────────────────────────── */}
      {drawerOpen && (
        <div
          className="inbox-modal"
          style={{
            position: "fixed", inset: 0, zIndex: 999995,
            background: "rgba(2, 4, 18, 0.80)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            display: "flex", justifyContent: "flex-end",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "420px", width: "100%", height: "100%",
              background: "linear-gradient(180deg, rgba(10,8,28,0.98) 0%, rgba(8,6,22,0.98) 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRight: "none",
              boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column",
              animation: "drawerIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: "22px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              background: "linear-gradient(135deg, rgba(30,20,60,0.8), rgba(15,10,40,0.9))",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", boxShadow: "0 6px 16px rgba(99,102,241,0.4)" }}>📬</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "800", color: "#ffffff" }}>Kotak Masuk</h3>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                    {unreadMessages.length} belum dibaca · {allMessages.length} total
                  </div>
                </div>
              </div>
              <button
                className="inbox-close-btn"
                onClick={() => setDrawerOpen(false)}
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "14px", transition: "all 0.2s" }}
              >
                ✕
              </button>
            </div>

            {/* Tab Filter */}
            <div style={{ display: "flex", padding: "12px 16px", gap: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => setDrawerTab("unread")}
                style={{
                  flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: drawerTab === "unread" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.05)",
                  color: drawerTab === "unread" ? "#ffffff" : "rgba(255,255,255,0.4)",
                  fontWeight: "700", fontSize: "12px",
                  boxShadow: drawerTab === "unread" ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                Belum Dibaca ({unreadMessages.length})
              </button>
              <button
                onClick={() => setDrawerTab("all")}
                style={{
                  flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: drawerTab === "all" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.05)",
                  color: drawerTab === "all" ? "#ffffff" : "rgba(255,255,255,0.4)",
                  fontWeight: "700", fontSize: "12px",
                  boxShadow: drawerTab === "all" ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                Semua ({allMessages.length})
              </button>
            </div>

            {/* Drawer Body List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
              {allMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 20px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "rgba(255,255,255,0.7)" }}>Belum Ada Pesan</div>
                  <div style={{ fontSize: "12px", marginTop: "6px", color: "rgba(255,255,255,0.3)" }}>Pesan dari admin akan muncul otomatis.</div>
                </div>
              ) : drawerTab === "unread" && unreadMessages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 20px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "rgba(255,255,255,0.7)" }}>Semua Sudah Dibaca</div>
                  <button
                    onClick={handleRestoreAll}
                    style={{ marginTop: "14px", padding: "9px 18px", borderRadius: "8px", border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)", color: "#a5b4fc", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
                  >
                    🔄 Tampilkan Kembali
                  </button>
                </div>
              ) : (
                (drawerTab === "unread" ? unreadMessages : allMessages).map((msg) => {
                  const isSeen = dismissed.has(msg.id);
                  const typeColor = msg.type === "block" ? "#f87171" : msg.type === "refresh" ? "#34d399" : "#a5b4fc";
                  const typeBg = msg.type === "block" ? "rgba(239,68,68,0.12)" : msg.type === "refresh" ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)";
                  return (
                    <div
                      key={msg.id}
                      className="inbox-drawer-item"
                      style={{
                        padding: "14px 16px", borderRadius: "14px", marginBottom: "10px",
                        border: `1px solid ${isSeen ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.25)"}`,
                        background: isSeen ? "rgba(255,255,255,0.03)" : "rgba(99,102,241,0.06)",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", padding: "3px 8px", borderRadius: "6px", background: typeBg, color: typeColor, border: `1px solid ${typeColor}30` }}>
                          {msg.type === "block" ? "🚫 Blokir" : msg.type === "refresh" ? "🔄 Refresh" : "💬 Pesan Admin"}
                        </span>
                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                          {new Date(msg.sentAt).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </span>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "rgba(255,255,255,0.9)", marginBottom: "5px" }}>{msg.title}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: "12px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{msg.body}</div>
                      {!isSeen ? (
                        <button
                          onClick={() => handleDismiss(msg)}
                          style={{ padding: "6px 14px", borderRadius: "7px", border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#ffffff", fontWeight: "700", fontSize: "11px", cursor: "pointer", boxShadow: "0 3px 10px rgba(99,102,241,0.3)" }}
                        >
                          ✓ Tandai Dibaca
                        </button>
                      ) : (
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", fontWeight: "600" }}>✓ Sudah Dibaca</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", gap: "10px" }}>
              <button
                onClick={handleRestoreAll}
                style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", fontWeight: "700", fontSize: "12px", cursor: "pointer", transition: "all 0.2s" }}
              >
                🔄 Reset
              </button>
              <button
                onClick={handleDismissAll}
                style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#ffffff", fontWeight: "700", fontSize: "12px", cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.3)", transition: "all 0.2s" }}
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
