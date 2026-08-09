"use client";

import { useState } from "react";
import type React from "react";
import type { AdminMessage } from "./UserInboxBanner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionButton {
  label: string;
  onClick: (() => void) | undefined;
  variant?: "primary" | "secondary";
}

interface AdminMessageCardProps {
  message: AdminMessage | null;
  actions?: ActionButton[];
  onDismiss?: (message: AdminMessage) => void;
  senderLogoUrl?: string;
}

// ─── Helper: format timestamp ─────────────────────────────────────────────────

function formatTimestamp(sentAt: string): string {
  try {
    const d = new Date(sentAt);
    if (isNaN(d.getTime())) return "(Waktu tidak tersedia)";
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "(Waktu tidak tersedia)";
  }
}

// ─── AdminMessageCard ─────────────────────────────────────────────────────────

export default function AdminMessageCard({
  message,
  actions = [],
  onDismiss,
  senderLogoUrl,
}: AdminMessageCardProps): React.ReactElement | null {
  const [imgError, setImgError] = useState(false);

  if (!message) return null;

  // ── Compute effective actions (inject "Tutup" from onDismiss if needed) ─────
  const hasTutupAlready = actions.some((a) => a.label === "Tutup");
  const effectiveActions: ActionButton[] =
    onDismiss && !hasTutupAlready
      ? [...actions, { label: "Tutup", onClick: () => onDismiss(message), variant: "secondary" as const }]
      : actions;

  // ── Render Header ────────────────────────────────────────────────────────────
  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        paddingBottom: "12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        marginBottom: "12px",
      }}
    >
      {/* Logo or initials */}
      {senderLogoUrl && !imgError ? (
        <img
          src={senderLogoUrl}
          alt="NixelStudio"
          onError={() => setImgError(true)}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: "800",
            color: "#ffffff",
            flexShrink: 0,
            letterSpacing: "-0.02em",
          }}
        >
          NS
        </span>
      )}

      {/* Sender name */}
      <span
        style={{
          fontSize: "14px",
          fontWeight: "700",
          color: "#f1f5f9",
          letterSpacing: "-0.01em",
        }}
      >
        NixelStudio
      </span>

      {/* Official badge */}
      <span
        aria-label="Pesan Resmi"
        style={{
          fontSize: "10px",
          fontWeight: "700",
          color: "#818cf8",
          background: "rgba(99,102,241,0.12)",
          border: "1px solid rgba(99,102,241,0.35)",
          padding: "2px 8px",
          borderRadius: "20px",
          letterSpacing: "0.04em",
          textTransform: "uppercase" as const,
          userSelect: "none" as const,
        }}
      >
        Pesan Resmi
      </span>
    </div>
  );

  // ── Render Body ──────────────────────────────────────────────────────────────
  const titleText = message.title && message.title.trim() ? message.title : "(Tanpa Judul)";
  const bodyText = message.body && message.body.trim() ? message.body : null;
  const bodySegments = bodyText
    ? bodyText.split("\n").filter((seg) => seg.trim().length > 0)
    : null;

  const body = (
    <div style={{ marginBottom: "16px" }}>
      {/* Message title */}
      <h3
        style={{
          margin: "0 0 8px 0",
          fontSize: "16px",
          fontWeight: "700",
          color: "#f1f5f9",
          letterSpacing: "-0.02em",
          lineHeight: 1.4,
        }}
      >
        {titleText}
      </h3>

      {/* Message body */}
      <div
        style={{
          fontSize: "14px",
          color: "rgba(241,245,249,0.75)",
          lineHeight: 1.7,
          marginBottom: "10px",
        }}
      >
        {bodySegments ? (
          bodySegments.map((seg, i) => (
            <span key={i} style={{ display: "block" }}>
              {seg}
            </span>
          ))
        ) : (
          <span style={{ display: "block", fontStyle: "italic", color: "rgba(241,245,249,0.4)" }}>
            (Tidak ada isi pesan)
          </span>
        )}
      </div>

      {/* Timestamp */}
      <div
        style={{
          fontSize: "11px",
          color: "rgba(241,245,249,0.35)",
          fontWeight: "500",
        }}
      >
        📅 {formatTimestamp(message.sentAt)}
      </div>
    </div>
  );

  // ── Render Footer ────────────────────────────────────────────────────────────
  const footer =
    effectiveActions.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap" as const,
          gap: "8px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
        className="admin-card-footer"
      >
        {effectiveActions.map((action, i) => {
          const isPrimary = action.variant === "primary";
          const isDisabled = typeof action.onClick !== "function";
          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={isDisabled ? undefined : action.onClick}
              style={{
                flex: 1,
                minWidth: "80px",
                padding: "9px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: isDisabled ? "not-allowed" : "pointer",
                transition: "all 0.18s",
                border: isPrimary ? "none" : "1px solid rgba(99,102,241,0.4)",
                background: isPrimary
                  ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                  : "transparent",
                color: isPrimary ? "#ffffff" : "#a5b4fc",
                opacity: isDisabled ? 0.45 : 1,
                outline: "none",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLButtonElement).style.outline = "2px solid #818cf8";
                (e.currentTarget as HTMLButtonElement).style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLButtonElement).style.outline = "none";
              }}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    ) : null;

  // ── Root container ───────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @media (max-width: 399px) {
          .admin-card-footer { flex-direction: column !important; }
          .admin-card-footer button { width: 100% !important; flex: unset !important; }
        }
        .admin-card-footer button:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
      `}</style>

      <div
        role="region"
        aria-label="Pesan resmi dari NixelStudio"
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "20px",
          borderRadius: "16px",
          background: "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,27,75,0.98))",
          border: "1px solid rgba(99,102,241,0.2)",
          boxShadow:
            "0 20px 60px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.08), 0 4px 24px rgba(99,102,241,0.06)",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          color: "#f1f5f9",
        }}
      >
        {header}
        {body}
        {footer}
      </div>
    </>
  );
}
