"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import ServerMonitor from "@/components/ServerMonitor";
import AIChat from "@/components/AIChat";
import ResearchPanel from "@/components/ResearchPanel";
import VectorCreator from "@/components/VectorCreator";
import { useDevice } from "@/lib/useDevice";
import { useRouter } from "next/navigation";
import { getUsage, getUsagePercent, getDailyLimit, formatTokens, resetUsage } from "@/lib/tokenStore";

type Tab = "metadata" | "chat" | "research" | "vector";
const ADMIN_EMAIL = "nixxeltzy@gmail.com";

const TAB_CONFIG: { id: Tab; icon: string; label: string }[] = [
  { id: "metadata", icon: "🏷️", label: "Metadata" },
  { id: "research", icon: "🔎", label: "Riset" },
  { id: "vector",   icon: "🎨", label: "Vector" },
  { id: "chat",     icon: "🤖", label: "AI Chat" },
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
  // Token usage state — di-refresh setiap kali ada chat baru atau dropdown dibuka
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

  // Refresh token saat dropdown dibuka
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

  // Progress bar color
  const pctColor = tokenPct >= 85 ? "#dc2626" : tokenPct >= 60 ? "#d97706" : "#16a34a";

  const currentTitle = monitorOpen
    ? "📡 Server Monitoring"
    : TAB_CONFIG.find((t) => t.id === activeTab)?.label ?? "";

  const userInitial = user?.username?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div className="workspace">
      {sidebarOpen && !device.isDesktop && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── Sidebar ── */}
      <aside className={["sidebar", device.isDesktop ? "sidebar--desktop" : sidebarOpen ? "sidebar--open" : ""].join(" ")}>
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">🎨</div>
          <div>
            <div className="sidebar__logo-text">Stock AI Studio</div>
            <div className="sidebar__logo-sub">Powered by Groq AI</div>
          </div>
          {!device.isDesktop && (
            <button type="button" className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Tutup">✕</button>
          )}
        </div>

        <div className="sidebar__section-label">Tools</div>
        <nav className="sidebar__nav">
          {TAB_CONFIG.map((tab) => (
            <button key={tab.id} type="button"
              className={`sidebar__item ${activeTab === tab.id && !monitorOpen ? "sidebar__item--active" : ""}`}
              onClick={() => handleTabChange(tab.id)}>
              <span className="sidebar__icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {isAdmin && (
          <>
            <div className="sidebar__section-label">Admin</div>
            <nav className="sidebar__nav">
              <button type="button"
                className={`sidebar__item ${monitorOpen ? "sidebar__item--active" : ""}`}
                onClick={() => { setMonitorOpen((v) => !v); if (!device.isDesktop) setSidebarOpen(false); }}>
                <span className="sidebar__icon">📡</span>
                Server Monitor
              </button>
            </nav>
          </>
        )}

        {/* ── Profile section ── */}
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

              {/* Tipe akun */}
              <div className="sidebar__dropdown-row">
                <span className="sidebar__dropdown-label">Tipe Akun</span>
                <span className={`sidebar__profile-badge sidebar__profile-badge--${user?.role ?? "user"}`}>
                  {user?.role === "admin" ? "👑 Admin" : user?.role === "premium" ? "✦ Premium" : "Free"}
                </span>
              </div>

              <div className="sidebar__dropdown-divider" />

              {/* Token Usage Section */}
              <div className="sidebar__token-section">
                <div className="sidebar__token-header">
                  <span className="sidebar__token-title">⚡ Token Hari Ini</span>
                  <span className="sidebar__token-pct" style={{ color: pctColor }}>{tokenPct}%</span>
                </div>

                {/* Progress bar */}
                <div className="sidebar__token-bar">
                  <div className="sidebar__token-bar-fill"
                    style={{ width: `${tokenPct}%`, background: pctColor }} />
                </div>

                {/* Stats */}
                <div className="sidebar__token-stats">
                  <div className="sidebar__token-stat">
                    <span className="sidebar__token-stat-label">Total</span>
                    <span className="sidebar__token-stat-val">{formatTokens(tokenUsage.totalTokens)}</span>
                  </div>
                  <div className="sidebar__token-stat">
                    <span className="sidebar__token-stat-label">Input</span>
                    <span className="sidebar__token-stat-val">{formatTokens(tokenUsage.promptTokens)}</span>
                  </div>
                  <div className="sidebar__token-stat">
                    <span className="sidebar__token-stat-label">Output</span>
                    <span className="sidebar__token-stat-val">{formatTokens(tokenUsage.completionTokens)}</span>
                  </div>
                  <div className="sidebar__token-stat">
                    <span className="sidebar__token-stat-label">Limit</span>
                    <span className="sidebar__token-stat-val">{formatTokens(getDailyLimit())}</span>
                  </div>
                </div>

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
                {loggingOut ? "⏳ Logging out..." : "→ Keluar"}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="workspace__main">
        {!device.isDesktop && (
          <header className="topbar">
            <button type="button" className="topbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Menu">☰</button>
            <div className="topbar__title">{currentTitle}</div>
            <button type="button" className="topbar__avatar"
              onClick={() => setProfileOpen((v) => !v)} aria-label="Profile">
              {userInitial}
            </button>
          </header>
        )}

        <main className="workspace__content">
          {isAdmin && monitorOpen ? (
            <ServerMonitor />
          ) : activeTab === "metadata" ? (
            <ImageUploader onTokensUpdated={refreshTokens} />
          ) : activeTab === "research" ? (
            <ResearchPanel />
          ) : activeTab === "vector" ? (
            <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>🎨 Vector Creator AI</h1>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0 0" }}>Buat prompt vector art komersial berkualitas tinggi dengan AI — siap upload ke Adobe Stock</p>
              </div>
              <VectorCreator />
            </div>
          ) : (
            <AIChat onTokensUpdated={refreshTokens} />
          )}
        </main>
      </div>
    </div>
  );
}
