"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning" | "unblock";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
}

// ─── Global event bus ─────────────────────────────────────────────────────────

const TOAST_EVENT = "nixel_toast";

export function showToast(toast: Omit<Toast, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: { ...toast, id: `t-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  }));
}

// ─── Sounds ───────────────────────────────────────────────────────────────────

function playToastSound(type: ToastType) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    if (type === "unblock") {
      // Triumphant upward chime
      const freqs = [523, 659, 784, 1047]; // C5 E5 G5 C6
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.14, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.35);
      });
    } else if (type === "error") {
      // Low warning buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.3);
    } else if (type === "warning") {
      // Two-tone alert
      [440, 330].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.15);
        gain.gain.setValueAtTime(0.1, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.25);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.25);
      });
    } else {
      // Default soft chime (success / info)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.1, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.22);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1174.66, now + 0.1);
      gain2.gain.setValueAtTime(0.14, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.start(now + 0.1); osc2.stop(now + 0.42);
    }
  } catch { /* autoplay restriction */ }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, { icon: string; bg: string; border: string; accent: string; titleColor: string }> = {
  success: {
    icon: "✓",
    bg: "linear-gradient(135deg, #0a1a14 0%, #061210 100%)",
    border: "rgba(16,185,129,0.3)",
    accent: "#10b981",
    titleColor: "#34d399",
  },
  error: {
    icon: "✕",
    bg: "linear-gradient(135deg, #1a0a0a 0%, #120606 100%)",
    border: "rgba(239,68,68,0.3)",
    accent: "#ef4444",
    titleColor: "#f87171",
  },
  warning: {
    icon: "⚠",
    bg: "linear-gradient(135deg, #1a150a 0%, #120f06 100%)",
    border: "rgba(245,158,11,0.3)",
    accent: "#f59e0b",
    titleColor: "#fbbf24",
  },
  info: {
    icon: "ℹ",
    bg: "linear-gradient(135deg, #0a0f1a 0%, #060a12 100%)",
    border: "rgba(99,102,241,0.3)",
    accent: "#6366f1",
    titleColor: "#a5b4fc",
  },
  unblock: {
    icon: "🔓",
    bg: "linear-gradient(135deg, #0a1418 0%, #060e12 100%)",
    border: "rgba(16,185,129,0.4)",
    accent: "#10b981",
    titleColor: "#34d399",
  },
};

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const cfg = TOAST_CONFIG[toast.type];

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(toast.id), 320);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    // Mount animation
    const t1 = setTimeout(() => setVisible(true), 20);
    // Auto-dismiss
    const duration = toast.duration ?? (toast.type === "unblock" ? 8000 : 4500);
    if (duration > 0) {
      const t2 = setTimeout(dismiss, duration);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    return () => clearTimeout(t1);
  }, [toast.duration, toast.type, dismiss]);

  const opacity = leaving ? 0 : visible ? 1 : 0;
  const translateX = leaving ? "110%" : visible ? "0%" : "110%";

  return (
    <div
      onClick={dismiss}
      style={{
        width: "340px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "14px",
        padding: "14px 16px",
        cursor: "pointer",
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03), 0 2px 8px ${cfg.accent}22`,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        opacity,
        transform: `translateX(${translateX})`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: "3px",
        background: cfg.accent, borderRadius: "14px 0 0 14px",
      }} />

      {/* Icon */}
      <div style={{
        width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
        background: `${cfg.accent}20`,
        border: `1px solid ${cfg.accent}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: toast.type === "unblock" ? "16px" : "14px",
        fontWeight: "900", color: cfg.accent,
        marginLeft: "6px",
      }}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "13px", fontWeight: "700", color: cfg.titleColor,
          marginBottom: toast.message ? "3px" : 0, lineHeight: 1.3,
        }}>
          {toast.title}
        </div>
        {toast.message && (
          <div style={{
            fontSize: "11.5px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5,
          }}>
            {toast.message}
          </div>
        )}
      </div>

      {/* Close hint */}
      <div style={{
        fontSize: "11px", color: "rgba(255,255,255,0.2)",
        flexShrink: 0, marginTop: "2px", lineHeight: 1,
      }}>
        ✕
      </div>
    </div>
  );
}

// ─── Toast Container ──────────────────────────────────────────────────────────

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const soundedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: Event) => {
      const toast = (e as CustomEvent<Toast>).detail;
      setToasts(prev => [...prev.slice(-4), toast]); // max 5 at once
      if (!soundedRef.current.has(toast.id)) {
        soundedRef.current.add(toast.id);
        playToastSound(toast.type);
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 9999999,
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      alignItems: "flex-end",
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
