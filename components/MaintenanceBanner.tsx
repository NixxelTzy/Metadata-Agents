"use client";

import { useEffect, useRef, useState } from "react";

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string;
  allowedEmails: string[];
}

interface AuthUser {
  email: string;
  role: string;
}

/**
 * MaintenanceBanner
 * Polls /api/admin/maintenance every 30s. If maintenance mode is enabled
 * and the current user's email is not in allowedEmails, renders a full-screen
 * maintenance overlay. Admins see a dismissible notice bar instead.
 */
export default function MaintenanceBanner() {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fetch current auth user
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: AuthUser } | null) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {});

    const poll = async () => {
      try {
        const res = await fetch("/api/admin/maintenance");
        if (res.ok) {
          const data = await res.json() as MaintenanceConfig;
          setConfig(data);
        }
      } catch { /* silent */ }
    };

    void poll();
    intervalRef.current = setInterval(poll, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (!config?.enabled) return null;

  // ── Always allow login page to be accessible during maintenance ──────────
  if (typeof window !== "undefined" && window.location.pathname === "/login") return null;

  const isAllowed =
    user?.role === "admin" ||
    user?.email === "nixxeltzy@gmail.com" ||
    (user?.email && config.allowedEmails.includes(user.email));

  // Admin/allowed → small dismissible top notice
  if (isAllowed) {
    if (dismissed) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999970,
          background: "linear-gradient(135deg,#78350f,#92400e)",
          borderBottom: "2px solid #f59e0b",
          padding: "10px 20px",
          color: "#fef3c7",
          fontFamily: "'Inter',system-ui,sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          🔧 MAINTENANCE MODE AKTIF — Pengguna tidak dapat mengakses situs. (Hanya admin yang melihat ini)
        </span>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: "transparent", border: "1px solid #f59e0b", color: "#fef3c7", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
        >
          Sembunyikan
        </button>
      </div>
    );
  }

  // Regular user → full-screen maintenance overlay
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999998,
        background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* Animated gear */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#7c3aed,#2563eb)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 38,
            margin: "0 auto 24px",
            boxShadow: "0 0 40px rgba(124,58,237,0.4)",
            animation: "spin 4s linear infinite",
          }}
        >
          🔧
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 900, color: "#ffffff" }}>
          {config.title}
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 15, color: "#94a3b8", lineHeight: 1.7 }}>
          {config.message}
        </p>

        {config.estimatedEnd && (
          <div
            style={{
              display: "inline-block",
              background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 10,
              padding: "10px 20px",
              color: "#a78bfa",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 24,
            }}
          >
            ⏰ Estimasi selesai:{" "}
            {new Date(config.estimatedEnd).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            WIB
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg,#2563eb,#7c3aed)",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
          }}
        >
          🔄 Cek Kembali
        </button>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
