"use client";

import { useEffect, useState, useCallback } from "react";

interface SmartMessage {
  id: string;
  title: string;
  body: string;
  audience: "all" | "new_users" | "guests";
  sentAt: string;
  expiresAt: string;
}

// ── Dismiss helpers persisted in localStorage ──────────────────────────────────
const LS_KEY = "smartmsg_dismissed_v1";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  if (h < 24) return `${h}j lalu`;
  return `${d}h lalu`;
}

// ── Single Message Card ────────────────────────────────────────────────────────
function SmartCard({
  msg,
  onDismiss,
}: {
  msg: SmartMessage;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(msg.id), 200);
  };

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))",
        border: "1px solid rgba(56,189,248,0.35)",
        borderRadius: 8,
        padding: "7px 28px 7px 10px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.45), 0 0 10px rgba(56,189,248,0.15)",
        backdropFilter: "blur(10px)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        maxWidth: "min(310px, calc(100vw - 24px))",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* X dismiss button di pojok kanan atas */}
      <button
        type="button"
        onClick={handleDismiss}
        title="Tutup pesan (hilangkan permanen)"
        style={{
          position: "absolute",
          top: 5,
          right: 5,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: "none",
          background: "rgba(148,163,184,0.15)",
          color: "#94a3b8",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          lineHeight: 1,
          padding: 0,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.3)";
          (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(148,163,184,0.15)";
          (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
        }}
      >
        ✕
      </button>

      {/* Content - Dibuat kompak dan rapi untuk HP */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#38bdf8",
          lineHeight: 1.3,
          marginBottom: 2,
          wordBreak: "break-word",
        }}
      >
        {msg.title}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#cbd5e1",
          lineHeight: 1.4,
          marginBottom: 3,
          wordBreak: "break-word",
        }}
      >
        {msg.body}
      </div>
      <div style={{ fontSize: 8.5, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
        <span>📢</span>
        <span>{relTime(msg.sentAt)}</span>
      </div>
    </div>
  );
}

// ── Main Banner Component ─────────────────────────────────────────────────────
export default function SmartMessageBanner() {
  const [messages, setMessages] = useState<SmartMessage[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Fetch active smart messages from public API endpoint
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/smart-message", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { messages: SmartMessage[] };
      setMessages(data.messages ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    // Load dismissed set from localStorage
    setDismissed(loadDismissed());
    void fetchMessages();

    // Re-poll every 10 seconds for instant message delivery
    const id = setInterval(fetchMessages, 10_000);

    const onCustomRefresh = () => void fetchMessages();
    window.addEventListener("smartmsg_refresh", onCustomRefresh);

    return () => {
      clearInterval(id);
      window.removeEventListener("smartmsg_refresh", onCustomRefresh);
    };
  }, [fetchMessages]);

  // Visible = not dismissed + not expired
  const visible = messages.filter(
    (m) => !dismissed.has(m.id) && new Date(m.expiresAt).getTime() > Date.now()
  );

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    // Record read status on server (persistent)
    fetch("/api/user/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "read", ids: [id] }),
    }).catch(() => {});
  }, []);

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        right: 12,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: "min(310px, calc(100vw - 24px))",
        width: "100%",
        pointerEvents: "none",
      }}
    >
      {visible.slice(0, 3).map((msg) => (
        <div key={msg.id} style={{ pointerEvents: "auto" }}>
          <SmartCard msg={msg} onDismiss={handleDismiss} />
        </div>
      ))}
      {visible.length > 3 && (
        <div
          style={{
            textAlign: "right",
            fontSize: 9.5,
            color: "#64748b",
            padding: "1px 4px",
            pointerEvents: "auto",
          }}
        >
          +{visible.length - 3} pesan lainnya
        </div>
      )}
    </div>
  );
}

