"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Home, ArrowLeft, Bell, Settings, LogOut,
  ShieldCheck, ShieldAlert, Trash2, X, RefreshCw,
  ExternalLink, Sparkles, Smartphone, Check
} from "lucide-react";
import {
  isNativePlatform, checkNotificationAccess, requestNotificationAccess,
  getRecentNotifications, clearNotifications, onNotificationReceived,
  nativeNav, type NativeNotification
} from "@/lib/native-bridge";

export default function NativeNavBar() {
  const [isNative, setIsNative] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [notifications, setNotifications] = useState<NativeNotification[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check native status and initial permissions
  useEffect(() => {
    const native = isNativePlatform();
    setIsNative(native);

    if (native) {
      checkNotificationAccess().then(setAccessGranted);
      getRecentNotifications().then(setNotifications);

      // Listen to live notification events
      const unsubscribe = onNotificationReceived((notif) => {
        setNotifications((prev) => [notif, ...prev.filter((n) => n.key !== notif.key)].slice(0, 50));
      });

      return () => {
        unsubscribe();
      };
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const granted = await checkNotificationAccess();
      setAccessGranted(granted);
      const list = await getRecentNotifications();
      setNotifications(list);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenSettings = async () => {
    await requestNotificationAccess();
    setTimeout(refreshStatus, 2000);
  };

  const handleClear = async () => {
    await clearNotifications();
    setNotifications([]);
  };

  return (
    <>
      {/* ── NATIVE / MOBILE BOTTOM NAVIGATION BAR ── */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 99990,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(147, 197, 253, 0.45)",
          padding: "8px 16px env(safe-area-inset-bottom, 12px) 16px",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          boxShadow: "0 -4px 25px rgba(59, 130, 246, 0.12)",
        }}
        aria-label="Native Android Navigation"
      >
        <button
          type="button"
          onClick={() => nativeNav.goHome()}
          style={navBtnStyle}
          title="Home"
        >
          <Home size={18} color="#2563eb" />
          <span style={navLabelStyle}>Home</span>
        </button>

        <button
          type="button"
          onClick={() => nativeNav.goBack()}
          style={navBtnStyle}
          title="Back"
        >
          <ArrowLeft size={18} color="#64748b" />
          <span style={navLabelStyle}>Back</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDrawerOpen(true);
            refreshStatus();
          }}
          style={{ ...navBtnStyle, position: "relative" }}
          title="Notifications"
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <Bell size={18} color={notifications.length > 0 ? "#d97706" : "#64748b"} />
            {notifications.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-7px",
                  background: "#ef4444",
                  color: "#ffffff",
                  fontSize: "9px",
                  fontWeight: "900",
                  padding: "1px 4px",
                  borderRadius: "999px",
                  minWidth: "14px",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {notifications.length > 99 ? "99+" : notifications.length}
              </span>
            )}
          </div>
          <span style={navLabelStyle}>Notif</span>
        </button>

        <button
          type="button"
          onClick={() => nativeNav.openSettings()}
          style={navBtnStyle}
          title="Settings"
        >
          <Settings size={18} color="#64748b" />
          <span style={navLabelStyle}>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => nativeNav.exitApp()}
          style={navBtnStyle}
          title="Exit App"
        >
          <LogOut size={18} color="#dc2626" />
          <span style={{ ...navLabelStyle, color: "#dc2626" }}>Exit</span>
        </button>
      </nav>

      {/* ── NOTIFICATION DRAWER MODAL ── */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%)",
              borderTop: "1px solid rgba(147, 197, 253, 0.6)",
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -10px 40px rgba(59, 130, 246, 0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(147, 197, 253, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(219, 234, 254, 0.8)",
                    border: "1px solid rgba(147, 197, 253, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={18} color="#2563eb" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                    Android Notification Listener
                  </h3>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {notifications.length} notifikasi terdeteksi
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={refreshStatus}
                  style={iconBtnStyle}
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} color="#1e40af" />
                </button>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    style={{ ...iconBtnStyle, color: "#dc2626" }}
                    title="Clear All"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  style={iconBtnStyle}
                  title="Close"
                >
                  <X size={16} color="#64748b" />
                </button>
              </div>
            </div>

            {/* Permission Banner */}
            <div
              style={{
                margin: "14px 20px 0 20px",
                padding: "12px 14px",
                borderRadius: "12px",
                background: accessGranted ? "rgba(220, 252, 231, 0.8)" : "rgba(254, 243, 199, 0.8)",
                border: `1px solid ${accessGranted ? "rgba(134, 239, 172, 0.8)" : "rgba(252, 211, 77, 0.8)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {accessGranted ? (
                  <ShieldCheck size={18} color="#16a34a" />
                ) : (
                  <ShieldAlert size={18} color="#d97706" />
                )}
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: accessGranted ? "#15803d" : "#92400e" }}>
                    {accessGranted ? "Notification Access Aktif" : "Izin Notification Access Belum Diberikan"}
                  </div>
                  <div style={{ fontSize: "11px", color: accessGranted ? "#166534" : "#78350f" }}>
                    {accessGranted
                      ? "Aplikasi siap mendengarkan notifikasi secara real-time."
                      : "Buka pengaturan untuk mengizinkan aplikasi membaca notifikasi."}
                  </div>
                </div>
              </div>

              {!accessGranted && (
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  style={{
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
                  }}
                >
                  <ExternalLink size={12} />
                  Buka Izin
                </button>
              )}
            </div>

            {/* Notification List */}
            <div
              style={{
                padding: "16px 20px 24px 20px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: "36px 16px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "12.5px",
                  }}
                >
                  <Smartphone size={32} color="#94a3b8" style={{ margin: "0 auto 10px" }} />
                  Belum ada notifikasi baru yang diterima.
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div
                    key={`${n.key || n.id}-${i}`}
                    style={{
                      background: "rgba(255, 255, 255, 0.8)",
                      border: "1px solid rgba(147, 197, 253, 0.4)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      boxShadow: "0 2px 8px rgba(59, 130, 246, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: "800",
                          color: "#1e40af",
                          background: "rgba(219, 234, 254, 0.7)",
                          border: "1px solid rgba(147, 197, 253, 0.5)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {n.appName || n.packageName}
                      </span>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                        {new Date(n.postTime || n.timestamp).toLocaleTimeString("id-ID")}
                      </span>
                    </div>

                    {n.title && (
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", marginTop: "2px" }}>
                        {n.title}
                      </div>
                    )}

                    {(n.text || n.bigText) && (
                      <div style={{ fontSize: "12px", color: "#334155", lineHeight: 1.5 }}>
                        {n.bigText || n.text}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "3px",
  cursor: "pointer",
  padding: "4px 8px",
  minWidth: "48px",
};

const navLabelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: "700",
  color: "#1e40af",
};

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(219, 234, 254, 0.6)",
  border: "1px solid rgba(147, 197, 253, 0.5)",
  color: "#1e40af",
  borderRadius: "8px",
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
