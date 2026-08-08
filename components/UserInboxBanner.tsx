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
        channelRef.current.onmessage = (ev: MessageEvent<{ type: string; messages?: AdminMessage[] }>) => {
          if (ev.data?.type === "NEW_MESSAGES" && Array.isArray(ev.data.messages)) {
            const u = authUserRef.current || authUser;
            const myEmail = u?.email?.toLowerCase().trim();
            const myUserId = u?.userId?.trim();
            const myUsername = u?.username?.toLowerCase().trim();

            const forMe = ev.data.messages.filter((m) => {
              const isBroadcast =
                m.targetUserId === "all" ||
                m.targetEmail === "all" ||
                m.targetUsername === "all" ||
                String(m.targetUserId).toLowerCase() === "all" ||
                String(m.targetEmail).toLowerCase() === "all" ||
                String(m.targetUsername).toLowerCase() === "all";

              const isTargetedToMe =
                (myUserId && String(m.targetUserId).toLowerCase() === String(myUserId).toLowerCase()) ||
                (myEmail && m.targetEmail && m.targetEmail.toLowerCase() === myEmail) ||
                (myUsername && m.targetUsername && m.targetUsername.toLowerCase() === myUsername);

              return isBroadcast || isTargetedToMe;
            });

            if (forMe.length > 0) {
              setAllMessages((prev) => {
                const map = new Map<string, AdminMessage>();
                for (const m of prev) {
                  if (!dismissed.has(m.id)) map.set(m.id, m);
                }
                for (const m of forMe) {
                  map.set(m.id, m);
                }
                const merged = Array.from(map.values());
                merged.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
                return merged;
              });
              playNotificationSound();
              setPopupAutoOpen(true);
            }
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

      const url = `/api/user/inbox${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json() as { messages: AdminMessage[] };
      const msgs: AdminMessage[] = data.messages ?? [];

      if (mountedRef.current) {
        const idsStr = msgs.map((m) => m.id).join(",");

        // New messages arrived that weren't in previous poll
        if (idsStr && idsStr !== prevIdsRef.current) {
          playNotificationSound();
          setPopupAutoOpen(true);
          prevIdsRef.current = idsStr;
        }

        setAllMessages((prev) => {
          const map = new Map<string, AdminMessage>();
          // Preserve existing unread messages currently being viewed
          for (const m of prev) {
            if (!dismissed.has(m.id)) map.set(m.id, m);
          }
          // Merge incoming messages from poll
          for (const m of msgs) {
            map.set(m.id, m);
          }
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
          return merged;
        });

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
  }, [authUser]);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);

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

  // Show modal popup continuously for any active unread message until explicitly closed by user
  const showCenterPopup = activeMsg !== null && !dismissed.has(activeMsg.id);

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
        @keyframes topBannerSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .inbox-btn-blue:hover { background: linear-gradient(135deg, #1d4ed8, #1e40af) !important; }
        .inbox-btn-light:hover { background: #e2e8f0 !important; }
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

      {/* ── Central Message Modal Popup (Ultra-Sleek Landscape Glassmorphic Design) ─── */}
      {showCenterPopup && activeMsg && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999997,
            background: "rgba(15, 23, 42, 0.78)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            key={activeMsg.id}
            style={{
              maxWidth: "780px", width: "100%", background: "#ffffff", borderRadius: "28px", overflow: "hidden",
              boxShadow: "0 35px 90px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.25)",
              display: "grid", gridTemplateColumns: "260px 1fr",
              animation: "centerModalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Left Column: Dark Obsidian Gradient Sidebar */}
            <div style={{
              background: "linear-gradient(145deg, #0b1329 0%, #1e293b 100%)",
              padding: "36px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between",
              borderRight: "1px solid rgba(255, 255, 255, 0.08)", position: "relative", overflow: "hidden",
            }}>
              {/* Background Ambient Glow */}
              <div style={{
                position: "absolute", top: "-40px", left: "-40px", width: "160px", height: "160px",
                borderRadius: "50%", background: activeMsg.type === "block" ? "rgba(239,68,68,0.25)" : activeMsg.type === "refresh" ? "rgba(16,185,129,0.25)" : "rgba(99,102,241,0.3)",
                filter: "blur(40px)", pointerEvents: "none",
              }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Glowing Icon Badge */}
                <div style={{
                  width: "60px", height: "60px", borderRadius: "18px",
                  background: activeMsg.type === "block"
                    ? "linear-gradient(135deg, #dc2626, #991b1b)"
                    : activeMsg.type === "refresh"
                    ? "linear-gradient(135deg, #059669, #047857)"
                    : "linear-gradient(135deg, #3b82f6, #6366f1)",
                  color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "28px", boxShadow: activeMsg.type === "block"
                    ? "0 10px 25px rgba(220, 38, 38, 0.4)"
                    : activeMsg.type === "refresh"
                    ? "0 10px 25px rgba(5, 150, 105, 0.4)"
                    : "0 10px 25px rgba(99, 102, 241, 0.45)",
                  marginBottom: "22px",
                }}>
                  {activeMsg.type === "block" ? "🚫" : activeMsg.type === "refresh" ? "🔄" : "💬"}
                </div>

                <div style={{
                  display: "inline-block", fontSize: "10px", fontWeight: "800",
                  letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 10px", borderRadius: "6px",
                  background: "rgba(255, 255, 255, 0.1)", color: "#93c5fd", border: "1px solid rgba(255, 255, 255, 0.15)",
                  marginBottom: "10px",
                }}>
                  {activeMsg.type === "block" ? "🚫 Keamanan Akun" : activeMsg.type === "refresh" ? "🔄 Pembaruan Web" : "💬 Pesan Resmi Admin"}
                </div>

                <div style={{ fontSize: "20px", fontWeight: "900", color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                  Stock AI Studio
                </div>
              </div>

              <div style={{ position: "relative", zIndex: 1, marginTop: "24px" }}>
                {unreadMessages.length > 1 && (
                  <div style={{
                    background: "rgba(99, 102, 241, 0.18)", border: "1px solid rgba(99, 102, 241, 0.35)",
                    padding: "6px 12px", borderRadius: "8px", color: "#a5b4fc", fontSize: "11px", fontWeight: "700",
                    marginBottom: "14px", display: "inline-flex", alignItems: "center", gap: "6px",
                  }}>
                    <span>📬</span> Pesan {safeIdx + 1} dari {unreadMessages.length}
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>📅</span> {new Date(activeMsg.sentAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} WIB
                </div>
              </div>
            </div>

            {/* Right Column: Clean White Content Area */}
            <div style={{ padding: "36px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#ffffff" }}>
              <div>
                {/* Header Title & Close Button */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.35 }}>
                    {activeMsg.title}
                  </h3>
                  <button
                    onClick={() => handleDismiss(activeMsg)}
                    title="Tutup & Tandai Dibaca"
                    style={{
                      width: "36px", height: "36px", borderRadius: "10px", border: "none",
                      background: "#f1f5f9", color: "#64748b", cursor: "pointer", fontSize: "15px",
                      fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "all 0.2s",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Styled Message Body Text Area */}
                <div style={{
                  fontSize: "14px", color: "#334155", lineHeight: 1.7, whiteSpace: "pre-wrap",
                  background: "#f8fafc", padding: "20px 22px", borderRadius: "14px",
                  border: "1px solid #e2e8f0", maxHeight: "250px", overflowY: "auto",
                  marginBottom: "28px", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                }}>
                  {activeMsg.body}
                </div>
              </div>

              {/* Bottom Action Toolbar */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="inbox-btn-blue"
                  onClick={() => handleDismiss(activeMsg)}
                  style={{
                    flex: 1, padding: "14px 24px", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#ffffff",
                    fontWeight: "800", fontSize: "13.5px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: "0 6px 18px rgba(37, 99, 235, 0.35)", transition: "all 0.2s",
                  }}
                >
                  ✓ Tutup & Tandai Dibaca
                </button>

                {unreadMessages.length > 1 && safeIdx < unreadMessages.length - 1 && (
                  <button
                    className="inbox-btn-light"
                    onClick={() => { handleDismiss(activeMsg); setCurrentIdx(safeIdx + 1); }}
                    style={{
                      padding: "14px 20px", borderRadius: "12px", border: "1px solid #cbd5e1",
                      background: "#ffffff", color: "#0f172a", fontWeight: "700",
                      fontSize: "13px", cursor: "pointer", transition: "all 0.2s",
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
                      background: "transparent", color: "#64748b", fontWeight: "600",
                      fontSize: "12.5px", cursor: "pointer",
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
