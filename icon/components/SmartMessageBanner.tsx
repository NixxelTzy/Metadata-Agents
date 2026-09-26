"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Megaphone, Bell, Sparkles } from "lucide-react";

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
  if (m < 1) return "Baru saja";
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
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(msg.id), 220);
  };

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.94) 100%)",
        border: "1px solid rgba(56, 189, 248, 0.3)",
        borderRadius: 14,
        padding: "12px 14px 10px 14px",
        boxShadow: "0 10px 32px -4px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.12)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.96)",
        transition: "opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        maxWidth: "min(330px, calc(100vw - 28px))",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Top ambient color highlight accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2.5px",
          background: "linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%)",
        }}
      />

      {/* Header bar: Icon + Tag + Time + Close Button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Megaphone size={11} color="#38bdf8" />
          </div>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#38bdf8",
            }}
          >
            Pengumuman
          </span>
          <span style={{ fontSize: 9, color: "#64748b" }}>•</span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{relTime(msg.sentAt)}</span>
        </div>

        {/* X dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          title="Tutup pesan (hilangkan permanen)"
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            background: "rgba(148, 163, 184, 0.1)",
            color: "#94a3b8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(239, 68, 68, 0.2)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239, 68, 68, 0.5)";
            (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(148, 163, 184, 0.1)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(148, 163, 184, 0.2)";
            (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: "#f8fafc",
          lineHeight: 1.35,
          marginBottom: 4,
          wordBreak: "break-word",
        }}
      >
        {msg.title}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "#cbd5e1",
          lineHeight: 1.5,
          marginBottom: 6,
          wordBreak: "break-word",
        }}
      >
        {msg.body}
      </div>

      {/* Footer hint */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid rgba(148, 163, 184, 0.12)",
          paddingTop: 5,
          marginTop: 4,
          fontSize: 9.5,
          color: "#64748b",
        }}
      >
        <span>Klik ✕ untuk menandai sudah dibaca</span>
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
      const data = (await res.json()) as { messages: SmartMessage[] };
      setMessages(data.messages ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
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
        right: 14,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "min(330px, calc(100vw - 28px))",
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
            fontSize: 10,
            fontWeight: 600,
            color: "#94a3b8",
            padding: "2px 6px",
            pointerEvents: "auto",
          }}
        >
          +{visible.length - 3} pengumuman lainnya
        </div>
      )}
    </div>
  );
}
