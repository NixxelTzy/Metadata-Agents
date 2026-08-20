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
          background: "rgba(3, 10, 26, 0.94)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(56, 189, 248, 0.18)",
          padding: "8px 16px env(safe-area-inset-bottom, 12px) 16px",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          boxShadow: "0 -4px 25px rgba(0, 0, 0, 0.6)",
        }}
        aria-label="Native Android Navigation"
      >
        <button
          type="button"
          onClick={() => nativeNav.goHome()}
          style={navBtnStyle}
          title="Home"
        >
          <Home size={18} color="#38bdf8" />
          <span style={navLabelStyle}>Home</span>
        </button>

        <button
          type="button"
          onClick={() => nativeNav.goBack()}
          style={navBtnStyle}
          title="Back"
        >
          <ArrowLeft size={18} color="#94a3b8" />
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
            <Bell size={18} color={notifications.length > 0 ? "#facc15" : "#94a3b8"} />
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
          <Settings size={18} color="#94a3b8" />
          <span style={navLabelStyle}>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => nativeNav.exitApp()}
          style={navBtnStyle}
          title="Exit App"
        >
          <LogOut size={18} color="#f87171" />
          <span style={{ ...navLabelStyle, color: "#fca5a5" }}>Exit</span>
        </button>
      </nav>

      {/* ── NOTIFICATION DRAWER MODAL ── */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0, 4, 16, 0.85)",
            backdropFilter: "blur(16px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #071530 0%, #030a1a 100%)",
              borderTop: "1px solid rgba(56, 189, 248, 0.3)",
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.8)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
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
                    background: "rgba(56, 189, 248, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={18} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#f0f8ff" }}>
                    Android Notification Listener
                  </h3>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
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
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    style={{ ...iconBtnStyle, color: "#fca5a5" }}
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
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Permission Banner */}
            <div
              style={{
                margin: "14px 20px 0 20px",
                padding: "12px 14px",
                borderRadius: "12px",
                background: accessGranted ? "rgba(34, 197, 94, 0.1)" : "rgba(234, 179, 8, 0.12)",
                border: `1px solid ${accessGranted ? "rgba(34, 197, 94, 0.3)" : "rgba(234, 179, 8, 0.35)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {accessGranted ? (
                  <ShieldCheck size={18} color="#4ade80" />
                ) : (
                  <ShieldAlert size={18} color="#facc15" />
                )}
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: accessGranted ? "#86efac" : "#fde047" }}>
                    {accessGranted ? "Notification Access Aktif" : "Izin Notification Access Belum Diberikan"}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
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
                    background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
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
                    color: "rgba(255, 255, 255, 0.4)",
                    fontSize: "12.5px",
                  }}
                >
                  <Smartphone size={32} color="rgba(255, 255, 255, 0.2)" style={{ margin: "0 auto 10px" }} />
                  Belum ada notifikasi baru yang diterima.
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div
                    key={`${n.key || n.id}-${i}`}
                    style={{
                      background: "rgba(2, 8, 24, 0.75)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: "800",
                          color: "#38bdf8",
                          background: "rgba(56, 189, 248, 0.12)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {n.appName || n.packageName}
                      </span>
                      <span style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.4)" }}>
                        {new Date(n.postTime || n.timestamp).toLocaleTimeString("id-ID")}
                      </span>
                    </div>

                    {n.title && (
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#f8fafc", marginTop: "2px" }}>
                        {n.title}
                      </div>
                    )}

                    {(n.text || n.bigText) && (
                      <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.75)", lineHeight: 1.5 }}>
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
  color: "rgba(255, 255, 255, 0.6)",
};

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  color: "#ffffff",
  borderRadius: "8px",
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
