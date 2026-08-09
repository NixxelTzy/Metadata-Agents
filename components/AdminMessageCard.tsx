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
  /** Counter badge, e.g. "Pesan 1 dari 3" */
  counterLabel?: string;
}

// ─── Helper: format timestamp ─────────────────────────────────────────────────

function formatTimestamp(sentAt: string): string {
  try {
    const d = new Date(sentAt);
    if (isNaN(d.getTime())) return "(Waktu tidak tersedia)";
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
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
  counterLabel,
}: AdminMessageCardProps): React.ReactElement | null {
  const [imgError, setImgError] = useState(false);

  if (!message) return null;

  // ── Compute effective actions ─────────────────────────────────────────────
  const hasTutupAlready = actions.some((a) => a.label === "Tutup");
  const effectiveActions: ActionButton[] =
    onDismiss && !hasTutupAlready
      ? [...actions, { label: "✕ Tutup", onClick: () => onDismiss(message), variant: "secondary" as const }]
      : actions;

  const titleText = message.title?.trim() || "(Tanpa Judul)";
  const bodyText = message.body?.trim() || null;
  const bodySegments = bodyText
    ? bodyText.split("\n").filter((seg) => seg.trim().length > 0)
    : null;

  return (
    <>
      <style>{`
        @keyframes msgCardIn {
          from { opacity: 0; transform: scale(0.96) translateY(16px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        .amc-root {
          animation: msgCardIn 0.32s cubic-bezier(0.16,1,0.3,1);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          width: 100%;
          max-width: 860px;
          background: linear-gradient(145deg, rgba(9,11,30,0.99) 0%, rgba(13,10,32,0.99) 100%);
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(99,102,241,0.22);
          box-shadow:
            0 0 0 1px rgba(99,102,241,0.06),
            0 32px 80px -16px rgba(0,0,0,0.85),
            0 0 60px rgba(99,102,241,0.08);
          display: grid;
          grid-template-columns: 220px 1fr;
          grid-template-rows: auto;
          position: relative;
        }
        /* Mobile: stack vertically */
        @media (max-width: 640px) {
          .amc-root {
            max-width: 100%;
            border-radius: 16px;
            grid-template-columns: 1fr;
          }
          .amc-sidebar {
            border-right: none !important;
            border-bottom: 1px solid rgba(99,102,241,0.12) !important;
            padding: 18px 20px !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 14px !important;
          }
          .amc-sidebar-icon { margin-bottom: 0 !important; }
          .amc-sidebar-name { font-size: 18px !important; }
          .amc-sidebar-sub  { display: none !important; }
          .amc-content { padding: 20px !important; }
          .amc-body-scroll { max-height: 42vh !important; }
          .amc-footer { flex-direction: column !important; }
          .amc-footer button { width: 100% !important; }
        }
        .amc-accent-line {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #8b5cf6, #6366f1);
          background-size: 200% auto;
          animation: shimmer 4s linear infinite;
          z-index: 2;
        }
        @keyframes shimmer {
          0%   { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        .amc-sidebar {
          background: linear-gradient(160deg, rgba(25,18,55,0.85) 0%, rgba(12,8,30,0.95) 100%);
          border-right: 1px solid rgba(99,102,241,0.1);
          padding: 36px 24px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          position: relative;
          overflow: hidden;
        }
        .amc-sidebar::before {
          content: '';
          position: absolute;
          top: -40px; left: -40px;
          width: 200px; height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .amc-sidebar-icon {
          width: 56px; height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex; align-items: center; justify-content: center;
          font-size: 26px;
          box-shadow: 0 10px 28px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.15);
          margin-bottom: 6px;
          flex-shrink: 0;
          position: relative; z-index: 1;
        }
        .amc-sidebar-name {
          font-size: 20px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.03em;
          line-height: 1.2;
          position: relative; z-index: 1;
          text-align: center;
        }
        .amc-sidebar-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          text-align: center;
          position: relative; z-index: 1;
        }
        .amc-official-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #a5b4fc;
          background: rgba(99,102,241,0.14);
          border: 1px solid rgba(99,102,241,0.32);
          padding: 4px 10px;
          border-radius: 20px;
          position: relative; z-index: 1;
        }
        .amc-ts {
          font-size: 10px;
          color: rgba(255,255,255,0.25);
          font-weight: 500;
          text-align: center;
          margin-top: auto;
          position: relative; z-index: 1;
        }
        .amc-content {
          padding: 32px 32px 26px;
          display: flex;
          flex-direction: column;
          gap: 0;
          min-height: 0;
        }
        .amc-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
        }
        .amc-subline {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(165,180,252,0.55);
          margin-bottom: 14px;
        }
        .amc-title {
          margin: 0;
          font-size: 20px;
          font-weight: 900;
          color: #f1f5f9;
          letter-spacing: -0.03em;
          line-height: 1.3;
          flex: 1;
        }
        .amc-close-btn {
          width: 32px; height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.18s;
        }
        .amc-close-btn:hover {
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.8);
          border-color: rgba(255,255,255,0.2);
        }
        .amc-body-scroll {
          flex: 1;
          overflow-y: auto;
          max-height: 260px;
          padding-right: 4px;
          margin-bottom: 20px;
          font-size: 14px;
          color: rgba(241,245,249,0.72);
          line-height: 1.8;
          scrollbar-width: thin;
          scrollbar-color: rgba(99,102,241,0.3) transparent;
        }
        .amc-body-scroll::-webkit-scrollbar { width: 4px; }
        .amc-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .amc-body-scroll::-webkit-scrollbar-thumb {
          background: rgba(99,102,241,0.3);
          border-radius: 4px;
        }
        .amc-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .amc-btn-primary {
          flex: 1;
          min-width: 120px;
          padding: 11px 20px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.35);
        }
        .amc-btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99,102,241,0.45);
        }
        .amc-btn-secondary {
          padding: 11px 18px;
          border-radius: 10px;
          border: 1px solid rgba(99,102,241,0.35);
          background: transparent;
          color: #a5b4fc;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s;
        }
        .amc-btn-secondary:hover:not(:disabled) {
          background: rgba(99,102,241,0.1);
          border-color: rgba(99,102,241,0.55);
        }
        .amc-btn-primary:disabled,
        .amc-btn-secondary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .amc-btn-primary:focus-visible,
        .amc-btn-secondary:focus-visible {
          outline: 2px solid #818cf8;
          outline-offset: 2px;
        }
      `}</style>

      <div
        role="region"
        aria-label="Pesan resmi dari NixelStudio"
        className="amc-root"
      >
        {/* Top accent shimmer line */}
        <div className="amc-accent-line" />

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
        <div className="amc-sidebar">
          {/* Sender logo or icon */}
          <div className="amc-sidebar-icon">
            {senderLogoUrl && !imgError ? (
              <img
                src={senderLogoUrl}
                alt="NixelStudio"
                onError={() => setImgError(true)}
                style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: "26px" }}>💬</span>
            )}
          </div>

          {/* Brand name */}
          <div className="amc-sidebar-name">Nixel<br />Studio</div>
          <div className="amc-sidebar-sub">Stock AI Platform</div>

          {/* Official badge */}
          <span className="amc-official-badge" aria-label="Pesan Resmi">
            ✦ Pesan Resmi
          </span>

          {/* Counter label */}
          {counterLabel && (
            <div style={{
              marginTop: "8px",
              padding: "5px 12px",
              borderRadius: "10px",
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              fontSize: "10px",
              fontWeight: "700",
              color: "#a5b4fc",
              position: "relative",
              zIndex: 1,
            }}>
              📬 {counterLabel}
            </div>
          )}

          {/* Timestamp */}
          <div className="amc-ts">
            📅 {formatTimestamp(message.sentAt)}
          </div>
        </div>

        {/* ── RIGHT CONTENT ─────────────────────────────────────────────── */}
        <div className="amc-content">
          {/* Title row + close button */}
          <div className="amc-subline">NixelStudio · Pemberitahuan Resmi</div>
          <div className="amc-header-row">
            <h3 className="amc-title">{titleText}</h3>
            {onDismiss && (
              <button
                type="button"
                className="amc-close-btn"
                onClick={() => onDismiss(message)}
                title="Tutup & tandai dibaca"
                aria-label="Tutup pesan"
              >
                ✕
              </button>
            )}
          </div>

          {/* Scrollable body */}
          <div className="amc-body-scroll">
            {bodySegments ? (
              bodySegments.map((seg, i) => (
                <span key={i} style={{ display: "block", marginBottom: i < bodySegments.length - 1 ? "8px" : 0 }}>
                  {seg}
                </span>
              ))
            ) : (
              <span style={{ fontStyle: "italic", color: "rgba(241,245,249,0.35)" }}>
                (Tidak ada isi pesan)
              </span>
            )}
          </div>

          {/* Footer actions */}
          {effectiveActions.length > 0 && (
            <div className="amc-footer">
              {effectiveActions.map((action, i) => {
                const isPrimary = action.variant === "primary";
                const isDisabled = typeof action.onClick !== "function";
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isDisabled}
                    onClick={isDisabled ? undefined : action.onClick}
                    className={isPrimary ? "amc-btn-primary" : "amc-btn-secondary"}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
