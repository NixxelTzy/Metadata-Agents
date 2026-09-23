"use client";

import { Lock } from "lucide-react";

interface FeatureClosedNoticeProps {
  featureName?: string;
  message?: string;
}

export default function FeatureClosedNotice({ featureName, message }: FeatureClosedNoticeProps) {
  const defaultMsg = "Fitur ini sedang dalam pemeliharaan sistem berkala untuk optimalisasi performa dan peningkatan keamanan. Akses akan dibuka kembali secara otomatis setelah proses selesai.";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "480px",
        width: "100%",
        padding: "24px",
        boxSizing: "border-box",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes noticeFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 35px rgba(239, 68, 68, 0.08), 0 20px 40px rgba(0, 0, 0, 0.5); }
          50% { box-shadow: 0 0 50px rgba(239, 68, 68, 0.16), 0 20px 40px rgba(0, 0, 0, 0.6); }
        }
      `}</style>

      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background: "linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderRadius: "24px",
          padding: "40px 36px",
          textAlign: "center",
          animation: "noticeFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1), pulseGlow 4s ease-in-out infinite",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, #ef4444, #f43f5e, #dc2626)",
          }}
        />

        {/* Icon Badge */}
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            color: "#f87171",
          }}
        >
          <Lock size={26} color="#f87171" />
        </div>

        {/* Header Status Badge */}
        <div style={{ marginBottom: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#f87171",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              padding: "5px 14px",
              borderRadius: "20px",
            }}
          >
            Pemeliharaan Fitur
          </span>
        </div>

        {/* Title */}
        <h2
          style={{
            margin: "0 0 16px",
            fontSize: "22px",
            fontWeight: "800",
            color: "#ffffff",
            letterSpacing: "-0.02em",
            lineHeight: 1.3,
          }}
        >
          {featureName ? `Fitur ${featureName} Ditutup Sementara` : "Layanan Ditutup Sementara"}
        </h2>

        {/* Message Container */}
        <div
          style={{
            background: "rgba(2, 6, 23, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "14px",
            padding: "20px 22px",
            marginBottom: "28px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            Pesan Pengumuman
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#e2e8f0",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              fontWeight: "400",
            }}
          >
            {message && message.trim() ? message.trim() : defaultMsg}
          </p>
        </div>

        {/* Footer Info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444" }} />
          <span>Sistem Audit & Kontrol Akses · NixelStudio</span>
        </div>
      </div>
    </div>
  );
}
