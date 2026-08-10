"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import ImageUpscaler from "@/components/ImageUpscaler";
import WatermarkRemover from "@/components/WatermarkRemover";
import ServerMonitor from "@/components/ServerMonitor";
import AdminAccountChecker from "@/components/AdminAccountChecker";
import AIChat from "@/components/AIChat";
import ResearchPanel from "@/components/ResearchPanel";
import VectorCreator from "@/components/VectorCreator";
import FeedbackPanel from "@/components/FeedbackPanel";
import AdminMessagesPanel from "@/components/AdminMessagesPanel";
import StoragePanel from "@/components/StoragePanel";
import MotionStudio from "@/components/MotionStudio";
import MessageWebPanel from "@/components/MessageWebPanel";
import ClosingFeaturesPanel, { ClosingEntry } from "@/components/ClosingFeaturesPanel";
import FeatureClosedNotice from "@/components/FeatureClosedNotice";
import UserInboxBanner, { NotificationBellButton } from "@/components/UserInboxBanner";
import ServerShutdownPanel from "@/components/ServerShutdownPanel";
import { useDevice } from "@/lib/useDevice";
import { useRouter } from "next/navigation";
import {
  getUsage, getUsagePercent, getDailyLimit,
  formatTokens, resetUsage, getPlatformLabel,
  estimateCost, type Platform,
} from "@/lib/tokenStore";

type Tab = "metadata" | "chat" | "research" | "vector" | "upscale" | "watermark" | "accounts" | "feedback" | "admin-messages" | "storage" | "motion" | "messageweb" | "closing" | "shutdown";
const ADMIN_EMAIL = "nixxeltzy@gmail.com";

const TAB_CONFIG: { id: Tab; icon: string; label: string; desc: string; color: string }[] = [
  { id: "metadata",  icon: "🏷️", label: "Metadata",    desc: "Adobe Stock & Shutterstock", color: "#4a90e2" },
  { id: "upscale",   icon: "🔍", label: "Upscale",     desc: "Super Resolution", color: "#ec4899" },
  { id: "watermark", icon: "🧹", label: "Hapus WM",    desc: "Watermark Remover",color: "#14b8a6" },
  { id: "research",  icon: "🔎", label: "Riset",        desc: "Keyword Research", color: "#7b5ae0" },
  { id: "vector",    icon: "✨", label: "Vector Ideas", desc: "AI Ideas Gen",    color: "#22c55e" },
  { id: "chat",      icon: "🤖", label: "AI Chat",      desc: "Groq Assistant",   color: "#f59e0b" },
  { id: "motion",    icon: "🎬", label: "Motion Studio", desc: "AI Canvas Animation", color: "#a78bfa" },
  { id: "feedback",  icon: "💬", label: "Lapor & Usulan", desc: "Kirim Bug & Usulan Fitur", color: "#ec4899" },
  { id: "accounts",  icon: "🛡️", label: "Accounts",    desc: "Account Checker",  color: "#ef4444" },
  { id: "messageweb", icon: "📨", label: "Message Web",  desc: "Kirim Pesan ke User", color: "#a78bfa" },
  { id: "closing",   icon: "🔒", label: "Closing Features", desc: "Tutup Fitur Sementara", color: "#ef4444" },
  { id: "admin-messages", icon: "📬", label: "Pesan & Broadcast", desc: "Feedback & Mass Email", color: "#f59e0b" },
  { id: "storage",   icon: "🗄️", label: "Storage",     desc: "Redis DB Monitor",  color: "#10b981" },
];

interface UserInfo {
  userId: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
}

// ── NavBtn: isolated component so useState isn't called inside .map() ─────────
function NavBtn({
  icon, label, isActive, danger, onClick,
}: {
  icon: string; label: string; isActive: boolean; danger?: boolean; onClick: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <button
      type="button"
      className={`nav-pill-btn${isActive ? " active" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={danger ? { color: "rgba(248,113,113,0.7)" } : {}}
      title={label}
    >
      {icon}
      {showTip && <span className="nav-pill-tooltip">{label}</span>}
    </button>
  );
}

interface UserInfo {
  userId: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("metadata");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(() => getUsage());
  const [tokenPct, setTokenPct] = useState(() => getUsagePercent());
  const device = useDevice();
  const profileRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [closingMap, setClosingMap] = useState<Record<string, ClosingEntry>>({});

  const fetchClosing = useCallback(() => {
    fetch("/api/closing-features")
      .then((r) => r.json())
      .then((d: { closing?: Record<string, ClosingEntry> }) => {
        if (d.closing) setClosingMap(d.closing);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchClosing();
    const id = setInterval(fetchClosing, 15000);
    return () => clearInterval(id);
  }, [fetchClosing]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: UserInfo }) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  // ── Heartbeat: kirim aktivitas user ke server setiap 30 detik ──────────────
  useEffect(() => {
    if (!user) return;
    const sendHeartbeat = (feature: string) => {
      fetch("/api/user/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature }),
      }).catch(() => {});
    };
    // Kirim langsung saat tab berubah atau user pertama kali load
    sendHeartbeat(activeTab);
    // Setup interval 30 detik
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(activeTab);
    }, 30000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user, activeTab]);

  useEffect(() => {
    if (profileOpen) {
      setTokenUsage(getUsage());
      setTokenPct(getUsagePercent());
    }
  }, [profileOpen]);

  const refreshTokens = useCallback(() => {
    setTokenUsage(getUsage());
    setTokenPct(getUsagePercent());
  }, []);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  useEffect(() => {
    if (device.isDesktop) setSidebarOpen(false);
  }, [device.isDesktop]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setMonitorOpen(false);
    if (!device.isDesktop) setSidebarOpen(false);
  };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }, [router]);

  const pctColor = tokenPct >= 85 ? "#f87171" : tokenPct >= 60 ? "#fbbf24" : "#4ade80";
  const userInitial = user?.username?.charAt(0)?.toUpperCase() ?? "?";
  const currentTab = TAB_CONFIG.find((t) => t.id === activeTab);

  return (
    <>
      <style>{`
        @keyframes navItemIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tooltipFade {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes contentFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes profileDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nav-pill-btn {
          position: relative;
          width: 44px; height: 44px;
          border-radius: 14px;
          border: none;
          background: transparent;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.18s, transform 0.15s;
          color: rgba(255,255,255,0.55);
          flex-shrink: 0;
        }
        .nav-pill-btn:hover {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.95);
          transform: scale(1.08);
        }
        .nav-pill-btn.active {
          background: rgba(99,102,241,0.25);
          color: #a5b4fc;
          box-shadow: 0 0 0 1px rgba(99,102,241,0.35);
        }
        .nav-pill-tooltip {
          position: absolute;
          bottom: -36px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15,15,25,0.95);
          border: 1px solid rgba(255,255,255,0.1);
          color: #f1f5f9;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          animation: tooltipFade 0.18s ease forwards;
          z-index: 100;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .nav-pill-btn:hover .nav-pill-tooltip,
        .nav-pill-btn:focus .nav-pill-tooltip { display: block !important; }
        .workspace-new {
          min-height: 100vh;
          background: linear-gradient(135deg, #06060f 0%, #0a0a1a 50%, #06060f 100%);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        .workspace-new::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 40% at 20% 10%, rgba(99,102,241,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(139,92,246,0.06) 0%, transparent 55%);
          pointer-events: none;
          z-index: 0;
        }
        .top-navbar {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          background: rgba(12,12,24,0.82);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
          animation: navItemIn 0.4s cubic-bezier(0.16,1,0.3,1);
          max-width: calc(100vw - 24px);
        }
        .top-navbar__divider {
          width: 1px; height: 24px;
          background: rgba(255,255,255,0.1);
          margin: 0 4px;
          flex-shrink: 0;
        }
        .top-navbar__section {
          display: flex; align-items: center; gap: 2px;
        }
        .main-content-area {
          flex: 1;
          padding-top: 76px;
          overflow: auto;
          position: relative;
          z-index: 1;
          animation: contentFadeIn 0.3s ease;
        }
        .profile-dropdown-new {
          position: fixed;
          top: 70px;
          right: 12px;
          width: 280px;
          background: rgba(12,12,24,0.97);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 18px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          animation: profileDropIn 0.22s cubic-bezier(0.16,1,0.3,1);
          z-index: 2000;
          overflow: hidden;
        }
      `}</style>

      <div className="workspace-new">
        {/* ── TOP NAVBAR ── */}
        <nav className="top-navbar" ref={profileRef}>
          {/* Brand */}
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
            boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
          }}>✨</div>

          <div className="top-navbar__divider" />

          {/* Main nav tabs */}
          <div className="top-navbar__section">
            {TAB_CONFIG.filter((t) => !["accounts","admin-messages","storage","messageweb","closing"].includes(t.id)).map((tab) => (
              <NavBtn
                key={tab.id}
                icon={tab.icon}
                label={tab.label}
                isActive={activeTab === tab.id && !monitorOpen}
                onClick={() => handleTabChange(tab.id)}
              />
            ))}
          </div>

          {/* Admin tabs */}
          {isAdmin && (
            <>
              <div className="top-navbar__divider" />
              <div className="top-navbar__section">
                {[
                  { id: "monitor", icon: "📡", label: "Server Monitor", isMonitor: true },
                  { id: "accounts", icon: "🛡️", label: "Accounts" },
                  { id: "messageweb", icon: "📨", label: "Message Web" },
                  { id: "closing", icon: "🔒", label: "Closing" },
                  { id: "admin-messages", icon: "📬", label: "Broadcasts" },
                  { id: "storage", icon: "🗄️", label: "Storage" },
                  { id: "shutdown", icon: "🔌", label: "Shutdown", danger: true },
                ].map((item) => (
                  <NavBtn
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    isActive={item.isMonitor ? monitorOpen : (activeTab === item.id as Tab && !monitorOpen)}
                    danger={item.danger}
                    onClick={() => {
                      if (item.isMonitor) { setMonitorOpen(true); setActiveTab("metadata"); }
                      else handleTabChange(item.id as Tab);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="top-navbar__divider" />

          {/* Right side */}
          <div className="top-navbar__section" style={{ gap: "6px" }}>
            {/* Token pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "999px",
              fontSize: 10, fontWeight: 700, color: pctColor,
              fontFamily: "monospace",
              flexShrink: 0,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: pctColor, boxShadow: `0 0 6px ${pctColor}` }} />
              {tokenPct}%
            </div>

            <NotificationBellButton />

            {/* User avatar */}
            <button
              type="button"
              onClick={() => setProfileOpen(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                color: "white", fontSize: 13, fontWeight: 800,
                border: profileOpen ? "2px solid rgba(99,102,241,0.6)" : "2px solid transparent",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", flexShrink: 0,
                boxShadow: profileOpen ? "0 0 0 3px rgba(99,102,241,0.25)" : "none",
              }}
            >
              {userInitial}
            </button>
          </div>
        </nav>

        {/* Profile Dropdown */}
        {profileOpen && (
          <div className="profile-dropdown-new" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: "16px",
              background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                color: "white", fontSize: 18, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>{userInitial}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{user?.username}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{user?.email}</div>
              </div>
            </div>

            {/* Token section */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>⚡ Token Hari Ini</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: pctColor }}>{tokenPct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden", display: "flex", marginBottom: 8 }}>
                {(["metadata", "chat", "vector", "motion"] as Platform[]).map(p => {
                  const pu = tokenUsage.byPlatform?.[p];
                  const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * tokenPct : 0;
                  const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e", motion: "#a78bfa" };
                  return <div key={p} style={{ width: `${w}%`, height: "100%", background: colors[p] }} />;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                <span>{formatTokens(tokenUsage.totalTokens)}</span>
                <span>/ {formatTokens(getDailyLimit())}</span>
              </div>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                width: "100%", padding: "13px",
                background: "transparent", border: "none",
                color: "#f87171", fontSize: 13, fontWeight: 700,
                cursor: loggingOut ? "not-allowed" : "pointer",
                opacity: loggingOut ? 0.5 : 1,
                transition: "background 0.15s",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {loggingOut ? "⏳ Keluar..." : "→ Keluar"}
            </button>
          </div>
        )}

        {/* Click outside to close profile */}
        {profileOpen && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1999 }}
            onClick={() => setProfileOpen(false)}
          />
        )}

        {/* ── MAIN CONTENT ── */}
        <main className="main-content-area">
          {!isAdmin && closingMap[activeTab]?.closed ? (
            <FeatureClosedNotice featureName={currentTab?.label} message={closingMap[activeTab]?.message} />
          ) : isAdmin && monitorOpen ? (
            <ServerMonitor />
          ) : isAdmin && activeTab === "accounts" ? (
            <AdminAccountChecker />
          ) : isAdmin && activeTab === "messageweb" ? (
            <MessageWebPanel />
          ) : isAdmin && activeTab === "closing" ? (
            <ClosingFeaturesPanel />
          ) : isAdmin && activeTab === "admin-messages" ? (
            <AdminMessagesPanel />
          ) : isAdmin && activeTab === "storage" ? (
            <StoragePanel />
          ) : isAdmin && activeTab === "shutdown" ? (
            <ServerShutdownPanel />
          ) : activeTab === "feedback" ? (
            <FeedbackPanel />
          ) : activeTab === "metadata" ? (
            <ImageUploader onTokensUpdated={refreshTokens} />
          ) : activeTab === "upscale" ? (
            <ImageUpscaler />
          ) : activeTab === "watermark" ? (
            <WatermarkRemover />
          ) : activeTab === "motion" ? (
            <MotionStudio onTokensUpdated={refreshTokens} />
          ) : activeTab === "research" ? (
            <ResearchPanel />
          ) : activeTab === "vector" ? (
            <div className="vector-content-wrap">
              <VectorCreator onTokensUpdated={refreshTokens} />
            </div>
          ) : (
            <AIChat onTokensUpdated={refreshTokens} />
          )}
        </main>
      </div>
    </>
  );
}


        {/* Admin */}
        {isAdmin && (
          <>
            <div className="sidebar__section-label">Admin</div>
            <nav className="sidebar__nav">
              <button type="button"
                className={`sidebar__item ${monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { setMonitorOpen(true); if (!device.isDesktop) setSidebarOpen(false); }}>
                <span className="sidebar__icon">📡</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Server Monitor</span>
                  <span className="sidebar__item-desc">System Health</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "accounts" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("accounts"); }}>
                <span className="sidebar__icon">🛡️</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Account Checker</span>
                  <span className="sidebar__item-desc">User Management</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "messageweb" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("messageweb"); }}>
                <span className="sidebar__icon">📨</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Message Web</span>
                  <span className="sidebar__item-desc">Kirim Pesan ke User</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "closing" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("closing"); }}>
                <span className="sidebar__icon">🔒</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Closing Features</span>
                  <span className="sidebar__item-desc">Tutup Fitur Sementara</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "admin-messages" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("admin-messages"); }}>
                <span className="sidebar__icon">📬</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Pesan & Broadcast</span>
                  <span className="sidebar__item-desc">Feedback & Broadcast</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "storage" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("storage"); }}>
                <span className="sidebar__icon">🗄️</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label">Storage</span>
                  <span className="sidebar__item-desc">Redis DB Monitor</span>
                </span>
              </button>
              <button type="button"
                className={`sidebar__item ${activeTab === "shutdown" && !monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { handleTabChange("shutdown"); }}
                style={{ borderTop: "1px solid rgba(239,68,68,0.2)", marginTop: 4 }}
              >
                <span className="sidebar__icon">🔌</span>
                <span className="sidebar__item-content">
                  <span className="sidebar__item-label" style={{ color: activeTab === "shutdown" ? "var(--text)" : "#f87171" }}>Server Shutdown</span>
                  <span className="sidebar__item-desc">Tutup / Buka Server</span>
                </span>
              </button>
            </nav>
          </>
        )}

        {/* Token mini-bar in sidebar */}
        <div className="sidebar__token-mini">
          <div className="sidebar__token-mini-top">
            <span className="sidebar__token-mini-label">⚡ Token Hari Ini</span>
            <span className="sidebar__token-mini-pct" style={{ color: pctColor }}>{tokenPct}%</span>
          </div>
          <div className="sidebar__token-mini-bar">
            {(["metadata", "chat", "vector", "motion"] as Platform[]).map(p => {
              const pu = tokenUsage.byPlatform?.[p];
              const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * tokenPct : 0;
              const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e", motion: "#a78bfa" };
              return <div key={p} style={{ width: `${w}%`, height: "100%", background: colors[p], transition: "width 0.5s ease" }} />;
            })}
            <div style={{ flex: 1 }} />
          </div>
          <div className="sidebar__token-mini-nums">
            <span>{formatTokens(tokenUsage.totalTokens)}</span>
            <span style={{ color: "var(--text-muted)" }}>/ {formatTokens(getDailyLimit())}</span>
          </div>
        </div>

        {/* Profile */}
        <div className="sidebar__profile-area" ref={profileRef}>
          <button type="button" className="sidebar__profile-btn"
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen} aria-haspopup="menu">
            <div className="sidebar__avatar">{userInitial}</div>
            <div className="sidebar__profile-info">
              <span className="sidebar__profile-name">{user?.username ?? "Loading..."}</span>
              <span className={`sidebar__profile-badge sidebar__profile-badge--${user?.role ?? "user"}`}>
                {user?.role === "admin" ? "👑 Admin" : user?.role === "premium" ? "✦ Premium" : "● Free"}
              </span>
            </div>
            <span className="sidebar__profile-chevron">{profileOpen ? "▴" : "▾"}</span>
          </button>

          {profileOpen && (
            <div className="sidebar__profile-dropdown">
              {/* Header */}
              <div className="sidebar__profile-dropdown-header">
                <div className="sidebar__avatar sidebar__avatar--lg">{userInitial}</div>
                <div>
                  <div className="sidebar__dropdown-name">{user?.username}</div>
                  <div className="sidebar__dropdown-email">{user?.email}</div>
                </div>
              </div>

              <div className="sidebar__dropdown-divider" />

              {/* Account type */}
              <div className="sidebar__dropdown-row">
                <span className="sidebar__dropdown-label">Tipe Akun</span>
                <span className={`sidebar__profile-badge sidebar__profile-badge--${user?.role ?? "user"}`}>
                  {user?.role === "admin" ? "👑 Admin" : user?.role === "premium" ? "✦ Premium" : "Free"}
                </span>
              </div>

              <div className="sidebar__dropdown-divider" />

              {/* Token Usage */}
              <div className="sidebar__token-section">
                <div className="sidebar__token-header">
                  <span className="sidebar__token-title">⚡ Token Hari Ini</span>
                  <span className="sidebar__token-pct" style={{ color: pctColor }}>{tokenPct}%</span>
                </div>
                <div className="sidebar__token-bar" style={{ display: "flex", gap: 1, overflow: "hidden" }}>
                  {(["metadata", "chat", "vector", "motion"] as Platform[]).map(p => {
                    const pu = tokenUsage.byPlatform?.[p];
                    const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * tokenPct : 0;
                    const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e", motion: "#a78bfa" };
                    return <div key={p} style={{ width: `${w}%`, height: "100%", background: colors[p], transition: "width 0.4s" }} />;
                  })}
                  <div style={{ flex: 1, background: "var(--border)" }} />
                </div>

                <div className="sidebar__token-stats">
                  {[
                    { label: "Total",  val: formatTokens(tokenUsage.totalTokens) },
                    { label: "Input",  val: formatTokens(tokenUsage.promptTokens) },
                    { label: "Output", val: formatTokens(tokenUsage.completionTokens) },
                    { label: "Limit",  val: formatTokens(getDailyLimit()) },
                  ].map(item => (
                    <div key={item.label} className="sidebar__token-stat">
                      <span className="sidebar__token-stat-label">{item.label}</span>
                      <span className="sidebar__token-stat-val">{item.val}</span>
                    </div>
                  ))}
                </div>

                {tokenUsage.byPlatform && tokenUsage.totalTokens > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {(["metadata", "chat", "vector", "motion"] as Platform[]).map(p => {
                      const pu = tokenUsage.byPlatform![p];
                      if (!pu || pu.totalTokens === 0) return null;
                      const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e", motion: "#a78bfa" };
                      return (
                        <div key={p} className="sidebar__token-platform">
                          <span className="sidebar__token-platform-label" style={{ color: colors[p] }}>{getPlatformLabel(p)}</span>
                          <span className="sidebar__token-platform-val">{formatTokens(pu.totalTokens)}</span>
                        </div>
                      );
                    })}
                    <div className="sidebar__token-platform" style={{ borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 2 }}>
                      <span className="sidebar__token-platform-label">Est. Cost</span>
                      <span className="sidebar__token-platform-val" style={{ color: "#4ade80" }}>{estimateCost(tokenUsage.promptTokens, tokenUsage.completionTokens)}</span>
                    </div>
                  </div>
                )}

                <div className="sidebar__token-footer">
                  <span className="sidebar__token-note">Reset otomatis tiap hari</span>
                  <button type="button" className="sidebar__token-reset"
                    onClick={() => { resetUsage(); refreshTokens(); }}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="sidebar__dropdown-divider" />

              <button type="button" className="sidebar__logout-btn"
                onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? "⏳ Keluar..." : "→ Keluar"}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ══════════════════════════════════════════════════════ */}
      <div className="workspace__main">

        {/* Mobile topbar */}
        {!device.isDesktop && (
          <header className="topbar">
            <button type="button" className="topbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Menu">☰</button>
            <div className="topbar__title">
              {monitorOpen ? "📡 Server Monitor" : `${currentTab?.icon} ${currentTab?.label}`}
            </div>
            <NotificationBellButton />
            <button type="button" className="topbar__avatar"
              onClick={() => setProfileOpen((v) => !v)} aria-label="Profile">
              {userInitial}
            </button>
          </header>
        )}

        {/* Desktop content header bar */}
        {device.isDesktop && !monitorOpen && (
          <div className="content-header">
            <div className="content-header__left">
              <div className="content-header__breadcrumb">
                <span className="content-header__brand">Stock AI Studio</span>
                <span className="content-header__sep">›</span>
                <span className="content-header__page">{currentTab?.label}</span>
              </div>
              <div className="content-header__title">
                {currentTab?.icon}&nbsp;{currentTab?.label}
                <span className="content-header__desc">{currentTab?.desc}</span>
              </div>
            </div>
            <div className="content-header__right">
              {/* Admin Notification Bell Icon */}
              <NotificationBellButton />

              {/* Live token mini-display */}
              <div className="content-header__token-pill">
                <div className="content-header__token-dot" style={{ background: pctColor }} />
                <span className="content-header__token-text">{formatTokens(tokenUsage.totalTokens)} tokens</span>
                <span className="content-header__token-sep">·</span>
                <span className="content-header__token-pct" style={{ color: pctColor }}>{tokenPct}%</span>
              </div>
              {/* User pill */}
              <div className="content-header__user-pill" onClick={() => setProfileOpen(v => !v)}>
                <div className="content-header__avatar">{userInitial}</div>
                <span className="content-header__username">{user?.username ?? "..."}</span>
                <span className={`sidebar__profile-badge sidebar__profile-badge--${user?.role ?? "user"}`}>
                  {user?.role === "admin" ? "👑 Admin" : user?.role === "premium" ? "✦" : "Free"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="workspace__content">
          {!isAdmin && closingMap[activeTab]?.closed ? (
            <FeatureClosedNotice featureName={currentTab?.label} message={closingMap[activeTab]?.message} />
          ) : isAdmin && monitorOpen ? (
            <ServerMonitor />
          ) : isAdmin && activeTab === "accounts" ? (
            <AdminAccountChecker />
          ) : isAdmin && activeTab === "messageweb" ? (
            <MessageWebPanel />
          ) : isAdmin && activeTab === "closing" ? (
            <ClosingFeaturesPanel />
          ) : isAdmin && activeTab === "admin-messages" ? (
            <AdminMessagesPanel />
          ) : isAdmin && activeTab === "storage" ? (
            <StoragePanel />
          ) : isAdmin && activeTab === "shutdown" ? (
            <ServerShutdownPanel />
          ) : activeTab === "feedback" ? (
            <FeedbackPanel />
          ) : activeTab === "metadata" ? (
            <ImageUploader onTokensUpdated={refreshTokens} />
          ) : activeTab === "upscale" ? (
            <ImageUpscaler />
          ) : activeTab === "watermark" ? (
            <WatermarkRemover />
          ) : activeTab === "motion" ? (
            <MotionStudio onTokensUpdated={refreshTokens} />
          ) : activeTab === "research" ? (
            <ResearchPanel />
          ) : activeTab === "vector" ? (
            <div className="vector-content-wrap">
              <VectorCreator onTokensUpdated={refreshTokens} />
            </div>
          ) : (
            <AIChat onTokensUpdated={refreshTokens} />
          )}
        </main>
      </div>
    </div>
  );
}
