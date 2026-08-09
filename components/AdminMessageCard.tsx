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
  counterLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(sentAt: string): string {
  try {
    const d = new Date(sentAt);
    if (isNaN(d.getTime())) return "(Waktu tidak tersedia)";
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "(Waktu tidak tersedia)";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminMessageCard({
  message,
  actions = [],
  onDismiss,
  senderLogoUrl,
  counterLabel,
}: AdminMessageCardProps): React.ReactElement | null {
  const [imgError, setImgError] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<number | null>(null);

  if (!message) return null;

  const hasTutupAlready = actions.some((a) => a.label === "Tutup" || a.label === "✕ Tutup");
  const effectiveActions: ActionButton[] =
    onDismiss && !hasTutupAlready
      ? [...actions, { label: "✕ Tutup", onClick: () => onDismiss(message), variant: "secondary" as const }]
      : actions;

  const titleText = message.title?.trim() || "(Tanpa Judul)";
  const bodyText = message.body?.trim() || null;
  const bodySegments = bodyText
    ? bodyText.split("\n").filter((s) => s.trim().length > 0)
    : null;

  return (
    <>
      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes amc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes amc-in {
          from { opacity: 0; transform: scale(0.95) translateY(20px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes amc-float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
      `}</style>

      {/* ── Card wrapper — landscape 2-col grid ── */}
      <div
        role="region"
        aria-label="Pesan resmi dari NixelStudio"
        style={{
          width: "min(860px, calc(100vw - 32px))",
          background: "linear-gradient(145deg, #09091e 0%, #0d0a20 100%)",
          borderRadius: "20px",
          overflow: "hidden",
          border: "1px solid rgba(99,102,241,0.25)",
          boxShadow: "0 0 0 1px rgba(99,102,241,0.06), 0 32px 80px -16px rgba(0,0,0,0.9), 0 0 60px rgba(99,102,241,0.1)",
          display: "grid",
          gridTemplateColumns: "clamp(160px, 22%, 220px) 1fr",
          gridTemplateRows: "auto",
          animation: "amc-in 0.32s cubic-bezier(0.16,1,0.3,1)",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Top shimmer accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "3px", zIndex: 10,
          background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #8b5cf6, #6366f1)",
          backgroundSize: "200% auto",
          animation: "amc-shimmer 4s linear infinite",
        }} />

        {/* ── LEFT SIDEBAR ─── */}
        <div style={{
          background: "linear-gradient(160deg, rgba(25,18,58,0.9) 0%, rgba(10,7,28,0.97) 100%)",
          borderRight: "1px solid rgba(99,102,241,0.12)",
          padding: "40px 20px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Glow orb */}
          <div style={{
            position: "absolute", top: "-40px", left: "-40px",
            width: "200px", height: "200px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* Icon */}
          <div style={{
            width: "58px", height: "58px", borderRadius: "16px", flexShrink: 0,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "28px",
            boxShadow: "0 10px 28px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
            animation: "amc-float 4s ease-in-out infinite",
            position: "relative", zIndex: 1,
          }}>
            {senderLogoUrl && !imgError ? (
              <img
                src={senderLogoUrl} alt="NixelStudio"
                onError={() => setImgError(true)}
                style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }}
              />
            ) : "💬"}
          </div>

          {/* Brand */}
          <div style={{
            fontSize: "18px", fontWeight: "900", color: "#ffffff",
            letterSpacing: "-0.03em", lineHeight: 1.2, textAlign: "center",
            position: "relative", zIndex: 1,
          }}>
            Nixel<br />Studio
          </div>
          <div style={{
            fontSize: "10px", color: "rgba(255,255,255,0.28)", textAlign: "center",
            position: "relative", zIndex: 1,
          }}>
            Stock AI Platform
          </div>

          {/* Official badge */}
          <span
            aria-label="Pesan Resmi"
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              fontSize: "8px", fontWeight: "800", letterSpacing: "0.12em",
              textTransform: "uppercase", color: "#a5b4fc",
              background: "rgba(99,102,241,0.14)",
              border: "1px solid rgba(99,102,241,0.32)",
              padding: "4px 10px", borderRadius: "20px",
              position: "relative", zIndex: 1,
            }}
          >
            ✦ Pesan Resmi
          </span>

          {/* Counter */}
          {counterLabel && (
            <div style={{
              padding: "4px 10px", borderRadius: "8px",
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)",
              fontSize: "9px", fontWeight: "700", color: "#a5b4fc",
              position: "relative", zIndex: 1, textAlign: "center",
            }}>
              📬 {counterLabel}
            </div>
          )}

          {/* Timestamp — pushed to bottom */}
          <div style={{
            marginTop: "auto", fontSize: "9px", color: "rgba(255,255,255,0.2)",
            fontWeight: "500", textAlign: "center",
            position: "relative", zIndex: 1,
          }}>
            📅 {formatTimestamp(message.sentAt)}
          </div>
        </div>

        {/* ── RIGHT CONTENT ─── */}
        <div style={{
          padding: "36px 32px 28px",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          minWidth: 0,
        }}>
          {/* Subline */}
          <div style={{
            fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em",
            textTransform: "uppercase", color: "rgba(165,180,252,0.45)",
            marginBottom: "10px",
          }}>
            NixelStudio · Pemberitahuan Resmi
          </div>

          {/* Title row + close button */}
          <div style={{
            display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", gap: "12px",
            marginBottom: "16px",
          }}>
            <h3 style={{
              margin: 0, fontSize: "clamp(16px, 2.2vw, 22px)", fontWeight: "900",
              color: "#f1f5f9", letterSpacing: "-0.03em", lineHeight: 1.3, flex: 1,
            }}>
              {titleText}
            </h3>

            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(message)}
                title="Tutup & tandai dibaca"
                aria-label="Tutup pesan"
                style={{
                  width: "32px", height: "32px", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.4)", cursor: "pointer",
                  fontSize: "13px", fontWeight: "700",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "all 0.18s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Scrollable body */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            maxHeight: "min(300px, 40vh)",
            marginBottom: "20px",
            fontSize: "14px",
            color: "rgba(241,245,249,0.72)",
            lineHeight: 1.85,
            paddingRight: "6px",
          }}>
            {bodySegments ? (
              bodySegments.map((seg, i) => (
                <span key={i} style={{
                  display: "block",
                  marginBottom: i < bodySegments.length - 1 ? "10px" : 0,
                }}>
                  {seg}
                </span>
              ))
            ) : (
              <span style={{ fontStyle: "italic", color: "rgba(241,245,249,0.3)" }}>
                (Tidak ada isi pesan)
              </span>
            )}
          </div>

          {/* Footer actions */}
          {effectiveActions.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap" as const, gap: "8px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
            }}>
              {effectiveActions.map((action, i) => {
                const isPrimary = action.variant === "primary";
                const isDisabled = typeof action.onClick !== "function";
                const isHovered = hoveredBtn === i;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isDisabled}
                    onClick={isDisabled ? undefined : action.onClick}
                    onMouseEnter={() => setHoveredBtn(i)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    style={{
                      flex: isPrimary ? "1 1 auto" : "0 1 auto",
                      minWidth: "100px",
                      padding: "11px 20px",
                      borderRadius: "10px",
                      fontSize: "13px", fontWeight: "700",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      transition: "all 0.18s",
                      opacity: isDisabled ? 0.4 : 1,
                      border: isPrimary ? "none" : "1px solid rgba(99,102,241,0.35)",
                      background: isPrimary
                        ? (isHovered
                          ? "linear-gradient(135deg, #818cf8, #6366f1)"
                          : "linear-gradient(135deg, #6366f1, #8b5cf6)")
                        : (isHovered ? "rgba(99,102,241,0.12)" : "transparent"),
                      color: isPrimary ? "#ffffff" : "#a5b4fc",
                      boxShadow: isPrimary
                        ? (isHovered ? "0 6px 20px rgba(99,102,241,0.5)" : "0 4px 14px rgba(99,102,241,0.35)")
                        : "none",
                      transform: isHovered && !isDisabled ? "translateY(-1px)" : "translateY(0)",
                      outline: "none",
                    }}
                    onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = "2px solid #818cf8"; }}
                    onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = "none"; }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Mobile override — stack vertically below 640px ── */}
        <style>{`
          @media (max-width: 640px) {
            [data-amc="root"] {
              grid-template-columns: 1fr !important;
            }
            [data-amc="sidebar"] {
              flex-direction: row !important;
              align-items: center !important;
              padding: 16px 20px !important;
              gap: 12px !important;
              border-right: none !important;
              border-bottom: 1px solid rgba(99,102,241,0.12) !important;
            }
            [data-amc="content"] {
              padding: 20px !important;
            }
          }
        `}</style>
      </div>
    </>
  );
}
