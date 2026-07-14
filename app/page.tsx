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
import { useDevice } from "@/lib/useDevice";
import { useRouter } from "next/navigation";
import {
  getUsage, getUsagePercent, getDailyLimit,
  formatTokens, resetUsage, getPlatformLabel,
  estimateCost, type Platform,
} from "@/lib/tokenStore";

type Tab = "metadata" | "chat" | "research" | "vector" | "upscale" | "watermark" | "accounts";
const ADMIN_EMAIL = "nixxeltzy@gmail.com";

const TAB_CONFIG: { id: Tab; icon: string; label: string; desc: string; color: string }[] = [
  { id: "metadata",  icon: "🏷️", label: "Metadata",    desc: "Adobe Stock & Shutterstock", color: "#4a90e2" },
  { id: "upscale",   icon: "🔍", label: "Upscale",     desc: "Super Resolution", color: "#ec4899" },
  { id: "watermark", icon: "🧹", label: "Hapus WM",    desc: "Watermark Remover",color: "#14b8a6" },
  { id: "research",  icon: "🔎", label: "Riset",        desc: "Keyword Research", color: "#7b5ae0" },
  { id: "vector",    icon: "✨", label: "Vector Ideas", desc: "AI Ideas Gen",    color: "#22c55e" },
  { id: "chat",      icon: "🤖", label: "AI Chat",      desc: "Groq Assistant",   color: "#f59e0b" },
  { id: "accounts",  icon: "🛡️", label: "Accounts",    desc: "Account Checker",  color: "#ef4444" },
];

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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: UserInfo }) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

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
    <div className="workspace">
      {sidebarOpen && !device.isDesktop && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ══════════════════════════════════════════════════════
          PREMIUM SIDEBAR
      ══════════════════════════════════════════════════════ */}
      <aside className={["sidebar", device.isDesktop ? "sidebar--desktop" : sidebarOpen ? "sidebar--open" : ""].join(" ")}>

        {/* Logo */}
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">✨</div>
          <div>
            <div className="sidebar__logo-text">Stock AI Studio</div>
            <div className="sidebar__logo-sub">Powered by Groq AI</div>
          </div>
          {!device.isDesktop && (
            <button type="button" className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Tutup">✕</button>
          )}
        </div>

        {/* Nav */}
        <div className="sidebar__section-label">Navigation</div>
        <nav className="sidebar__nav">
          {TAB_CONFIG.filter((t) => t.id !== "accounts").map((tab) => (
            <button key={tab.id} type="button"
              className={`sidebar__item ${activeTab === tab.id && !monitorOpen ? "sidebar__item--active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
              style={{ "--tab-color": tab.color } as React.CSSProperties}
            >
              <span className="sidebar__icon">{tab.icon}</span>
              <span className="sidebar__item-content">
                <span className="sidebar__item-label">{tab.label}</span>
                <span className="sidebar__item-desc">{tab.desc}</span>
              </span>
            </button>
          ))}
        </nav>

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
            {(["metadata", "chat", "vector"] as Platform[]).map(p => {
              const pu = tokenUsage.byPlatform?.[p];
              const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * tokenPct : 0;
              const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e" };
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
                  {(["metadata", "chat", "vector"] as Platform[]).map(p => {
                    const pu = tokenUsage.byPlatform?.[p];
                    const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * tokenPct : 0;
                    const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e" };
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
                    {(["metadata", "chat", "vector"] as Platform[]).map(p => {
                      const pu = tokenUsage.byPlatform![p];
                      if (!pu || pu.totalTokens === 0) return null;
                      const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#22c55e" };
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
          {isAdmin && monitorOpen ? (
            <ServerMonitor />
          ) : isAdmin && activeTab === "accounts" ? (
            <AdminAccountChecker />
          ) : activeTab === "metadata" ? (
            <ImageUploader onTokensUpdated={refreshTokens} />
          ) : activeTab === "upscale" ? (
            <ImageUpscaler />
          ) : activeTab === "watermark" ? (
            <WatermarkRemover />
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
