"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Dashboard from "@/components/Dashboard";
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
import PremiumPricingModal from "@/components/PremiumPricingModal";
import { useRouter } from "next/navigation";
import {
  getUsage, getUsagePercent, getDailyLimit,
  formatTokens, openPremiumModal, isUserAdminOrPremium,
  type Platform,
} from "@/lib/tokenStore";
import {
  Tag, ZoomIn, Eraser, Search, Sparkles, Bot, Clapperboard,
  MessageSquare, ShieldCheck, Mail, Lock, Megaphone, Database,
  Radio, Power, Zap, LogOut, Loader2, ArrowLeft, Layers,
  ChevronRight, Crown,
} from "lucide-react";

type Tab =
  | "dashboard" | "metadata" | "chat" | "research" | "vector"
  | "upscale" | "watermark" | "accounts" | "feedback"
  | "admin-messages" | "storage" | "motion" | "messageweb"
  | "closing" | "shutdown" | "monitor";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

interface TabMeta {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  isAdmin?: boolean;
  isDanger?: boolean;
}

const SZ = 15;

const TAB_META: TabMeta[] = [
  { id: "metadata",       label: "Metadata Generator",         icon: <Tag size={SZ} /> },
  { id: "upscale",        label: "AI Upscaler",                icon: <ZoomIn size={SZ} /> },
  { id: "watermark",      label: "Hapus Watermark",            icon: <Eraser size={SZ} /> },
  { id: "research",       label: "Keyword Research",           icon: <Search size={SZ} /> },
  { id: "vector",         label: "Vector Creator",             icon: <Sparkles size={SZ} /> },
  { id: "chat",           label: "AI Assistant",               icon: <Bot size={SZ} /> },
  { id: "motion",         label: "Motion Studio",              icon: <Clapperboard size={SZ} /> },
  { id: "feedback",       label: "Laporan & Saran",            icon: <MessageSquare size={SZ} /> },
  { id: "accounts",       label: "Account Checker",            icon: <ShieldCheck size={SZ} />, isAdmin: true },
  { id: "messageweb",     label: "Message Broadcast",          icon: <Mail size={SZ} />, isAdmin: true },
  { id: "closing",        label: "Closing Features",           icon: <Lock size={SZ} />, isAdmin: true },
  { id: "admin-messages", label: "Broadcast & Email",          icon: <Megaphone size={SZ} />, isAdmin: true },
  { id: "storage",        label: "Redis Monitor",              icon: <Database size={SZ} />, isAdmin: true },
  { id: "shutdown",       label: "Server Control",             icon: <Power size={SZ} />, isAdmin: true, isDanger: true },
  { id: "monitor",        label: "Server Monitor",             icon: <Radio size={SZ} />, isAdmin: true },
];

interface UserInfo {
  userId: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(() => getUsage());
  const [tokenPct, setTokenPct] = useState(() => getUsagePercent());
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [closingMap, setClosingMap] = useState<Record<string, ClosingEntry>>({});

  const isAdmin = user?.email === ADMIN_EMAIL || user?.role === "admin";
  const isPremium = user?.role === "premium";
  const isUnlimited = isAdmin || isPremium;

  const refreshTokens = useCallback(() => {
    setTokenUsage(getUsage());
    setTokenPct(getUsagePercent(user?.role, user?.email));
  }, [user]);

  const fetchClosing = useCallback(() => {
    fetch("/api/closing-features")
      .then(r => r.json())
      .then((d: { closing?: Record<string, ClosingEntry> }) => { if (d.closing) setClosingMap(d.closing); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchClosing();
    const id = setInterval(fetchClosing, 15000);
    return () => clearInterval(id);
  }, [fetchClosing]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then((d: { user?: UserInfo }) => {
        if (d.user) {
          setUser(d.user);
          setTokenPct(getUsagePercent(d.user.role, d.user.email));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleUsageUpdated = () => refreshTokens();
    window.addEventListener("token_usage_updated", handleUsageUpdated);
    return () => window.removeEventListener("token_usage_updated", handleUsageUpdated);
  }, [refreshTokens]);

  useEffect(() => {
    if (!user) return;
    const send = (f: string) => fetch("/api/user/activity", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: f })
    }).catch(() => {});
    send(activeTab);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => send(activeTab), 30000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [user, activeTab]);

  useEffect(() => {
    if (profileOpen) {
      setTokenUsage(getUsage());
      setTokenPct(getUsagePercent(user?.role, user?.email));
    }
  }, [profileOpen, user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        profileBtnRef.current && !profileBtnRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) setProfileOpen(false);
    };
    if (profileOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  const handleTabChange = (tab: Tab) => { setActiveTab(tab); setProfileOpen(false); };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/api; SameSite=Lax";
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    } catch { /**/ }
    window.location.href = "/login";
  }, []);

  const pctColor = isUnlimited ? "#38bdf8" : tokenPct >= 85 ? "#f87171" : tokenPct >= 60 ? "#fbbf24" : "#4ade80";
  const userInitial = user?.username?.charAt(0)?.toUpperCase() ?? "?";
  const isOnDashboard = activeTab === "dashboard";
  const currentTabMeta = TAB_META.find(t => t.id === activeTab);

  return (
    <>
      <style>{`
        @keyframes headerSlide { from{opacity:0;transform:translateY(-100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-10px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(0.85)} }

        *, *::before, *::after { box-sizing: border-box; }

        body { margin: 0; }

        /* ══ ROOT ══ */
        .app-root {
          min-height: 100dvh;
          background: #020b18;
          display: flex;
          flex-direction: column;
          position: relative;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        /* Ambient glow layer */
        .app-root::before {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 50% at 15% 0%, rgba(14,165,233,0.09) 0%, transparent 65%),
            radial-gradient(ellipse 50% 40% at 85% 100%, rgba(56,189,248,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 50% 50%, rgba(2,6,23,0.8) 0%, transparent 80%);
        }

        /* ══ HEADER ══ */
        .app-header {
          position: fixed;
          top: 0; left: 0; right: 0; z-index: 900;
          height: 56px;
          background: rgba(2, 8, 20, 0.9);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(56, 189, 248, 0.1);
          display: flex; align-items: center;
          padding: 0 14px; gap: 10px;
          animation: headerSlide 0.35s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 1px 0 rgba(56,189,248,0.06), 0 4px 24px rgba(0,0,0,0.3);
        }

        /* Back button */
        .hdr-back {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          background: rgba(56, 189, 248, 0.06);
          border: 1px solid rgba(56, 189, 248, 0.15);
          border-radius: 9px;
          color: #7dd3fc;
          font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.17s ease;
          white-space: nowrap; flex-shrink: 0;
          font-family: inherit;
        }
        .hdr-back:hover {
          background: rgba(56, 189, 248, 0.14);
          border-color: rgba(56, 189, 248, 0.4);
          color: #bae6fd;
          transform: translateX(-2px);
          box-shadow: 0 0 16px rgba(56,189,248,0.15);
        }
        .hdr-back:active { transform: translateX(-4px); }

        /* Platform name strip */
        .hdr-platform {
          display: flex; align-items: center; gap: 8px;
          flex: 1; min-width: 0;
        }
        .hdr-platform-icon {
          width: 28px; height: 28px; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.22);
        }
        .hdr-platform-icon.danger {
          color: #f87171;
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.25);
        }
        .hdr-platform-name {
          font-size: 13px; font-weight: 700; color: #e2e8f0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hdr-admin-pill {
          font-size: 9px; font-weight: 800; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 2px 7px;
          border-radius: 999px; flex-shrink: 0;
        }
        .hdr-admin-pill.danger {
          background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5;
        }
        .hdr-admin-pill.info {
          background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25); color: #38bdf8;
        }

        /* Brand (dashboard mode) */
        .hdr-brand {
          display: flex; align-items: center; gap: 10px;
          flex: 1; min-width: 0; text-decoration: none;
        }
        .hdr-logo {
          width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
          background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 12px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .hdr-brand-text { display: flex; flex-direction: column; }
        .hdr-brand-name { font-size: 13px; font-weight: 800; color: #f0f8ff; letter-spacing: -0.01em; line-height: 1.2; }
        .hdr-brand-sub  { font-size: 9px; color: rgba(255,255,255,0.35); line-height: 1; }

        /* Right controls */
        .hdr-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .token-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', 'Fira Code', monospace;
          transition: all 0.2s;
          cursor: pointer;
        }
        .token-pill:hover {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.35);
          transform: translateY(-1px);
        }
        .token-dot {
          width: 6px; height: 6px; border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .avatar-btn {
          width: 32px; height: 32px; border-radius: 9px;
          background: linear-gradient(135deg, #0ea5e9, #0369a1);
          color: #ffffff; font-size: 12px; font-weight: 800;
          border: 2px solid transparent;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.17s ease;
          box-shadow: 0 2px 8px rgba(14,165,233,0.25);
          font-family: inherit;
        }
        .avatar-btn:hover { transform: scale(1.05); box-shadow: 0 4px 16px rgba(14,165,233,0.4); }
        .avatar-btn.open {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.2), 0 4px 16px rgba(14,165,233,0.4);
        }

        /* ══ PROFILE DROPDOWN ══ */
        .profile-drop {
          position: fixed; top: 63px; right: 12px; width: 280px;
          background: rgba(3, 10, 26, 0.97);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          border: 1px solid rgba(56, 189, 248, 0.18);
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(56,189,248,0.05);
          animation: dropIn 0.2s cubic-bezier(0.16,1,0.3,1);
          z-index: 2000; overflow: hidden;
        }
        .pd-header {
          padding: 16px 16px 14px;
          display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .pd-avatar {
          width: 40px; height: 40px; border-radius: 11px;
          background: linear-gradient(135deg, #0ea5e9, #0369a1);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 800; color: #ffffff;
          box-shadow: 0 4px 14px rgba(14,165,233,0.3); flex-shrink: 0;
        }
        .pd-name  { font-size: 13px; font-weight: 700; color: #f0f8ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pd-email { font-size: 10.5px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

        .pd-tokens {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .pd-tokens-label {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px; font-size: 10px;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        }

        .pd-premium-btn {
          width: 100%;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(14,165,233,0.18), rgba(99,102,241,0.18));
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 10px;
          color: #bae6fd;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.17s;
          margin-top: 10px;
          font-family: inherit;
        }
        .pd-premium-btn:hover {
          background: linear-gradient(135deg, rgba(14,165,233,0.32), rgba(99,102,241,0.32));
          border-color: rgba(56, 189, 248, 0.55);
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.25);
        }

        .pd-logout {
          width: 100%; padding: 12px 16px;
          background: transparent; border: none;
          color: rgba(248, 113, 113, 0.8); font-size: 12.5px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 7px;
          transition: all 0.15s; font-family: inherit;
        }
        .pd-logout:hover { background: rgba(239,68,68,0.08); color: #f87171; }

        /* ══ MAIN CONTENT ══ */
        .app-main {
          flex: 1; min-height: 0;
          padding-top: 56px;
          overflow-y: auto; overflow-x: hidden;
          position: relative; z-index: 1;
          -webkit-overflow-scrolling: touch;
        }
        .app-main > * { animation: fadeUp 0.3s cubic-bezier(0.16,1,0.3,1); }

        /* ══ RESPONSIVE ══ */
        @media (max-width: 480px) {
          .app-header { padding: 0 10px; gap: 8px; }
          .hdr-back { padding: 5px 9px; font-size: 11px; gap: 4px; }
          .hdr-brand-sub { display: none; }
          .token-pill { padding: 4px 8px; font-size: 10.5px; }
          .hdr-platform-name { font-size: 12px; }
        }
        @media (max-width: 360px) {
          .hdr-back-label { display: none; }
        }

        .vector-content-wrap { width: 100%; }
      `}</style>

      <div className="app-root">
        <UserInboxBanner />
        <PremiumPricingModal userEmail={user?.email} username={user?.username} />

        {/* ══ HEADER ══ */}
        <header className="app-header">
          {isOnDashboard ? (
            <div className="hdr-brand">
              <div className="hdr-logo">
                <Layers size={17} color="#ffffff" />
              </div>
              <div className="hdr-brand-text">
                <div className="hdr-brand-name">Stock AI Studio</div>
                <div className="hdr-brand-sub">Creative Microstock Toolkit</div>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="hdr-back" onClick={() => handleTabChange("dashboard")}>
                <ArrowLeft size={13} />
                <span className="hdr-back-label">Dashboard</span>
              </button>
              <div className="hdr-platform">
                <div className={`hdr-platform-icon${currentTabMeta?.isDanger ? " danger" : ""}`}>
                  {currentTabMeta?.icon}
                </div>
                <span className="hdr-platform-name">{currentTabMeta?.label ?? activeTab}</span>
                {currentTabMeta?.isDanger && <span className="hdr-admin-pill danger">Admin</span>}
                {currentTabMeta?.isAdmin && !currentTabMeta?.isDanger && (
                  <span className="hdr-admin-pill info">Admin</span>
                )}
              </div>
            </>
          )}

          <div className="hdr-right">
            {/* Clickable token pill -> opens Premium Modal */}
            <div
              className="token-pill"
              style={{ color: pctColor }}
              onClick={() => openPremiumModal()}
              title={isUnlimited ? "Akun Unlimited Token (Admin/Premium)" : "Token Harian: Klik untuk lihat Paket Premium Unlimited"}
            >
              <span className="token-dot" style={{ background: pctColor, boxShadow: `0 0 6px ${pctColor}` }} />
              {isUnlimited ? "Unlimited" : `${tokenPct}%`}
            </div>
            <NotificationBellButton />
            <button
              ref={profileBtnRef}
              type="button"
              className={`avatar-btn${profileOpen ? " open" : ""}`}
              onClick={() => setProfileOpen(v => !v)}
            >
              {userInitial}
            </button>
          </div>
        </header>

        {/* ══ PROFILE DROPDOWN ══ */}
        {profileOpen && (
          <div ref={dropRef} className="profile-drop">
            <div className="pd-header">
              <div className="pd-avatar">{userInitial}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="pd-name">{user?.username ?? "Pengguna"}</div>
                <div className="pd-email">{user?.email ?? ""}</div>
              </div>
              {isUnlimited && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
                  background: isAdmin ? "rgba(239,68,68,0.15)" : "rgba(56,189,248,0.15)",
                  border: `1px solid ${isAdmin ? "rgba(239,68,68,0.3)" : "rgba(56,189,248,0.3)"}`,
                  color: isAdmin ? "#fca5a5" : "#38bdf8", textTransform: "uppercase"
                }}>
                  {isAdmin ? "Admin" : "Premium"}
                </span>
              )}
            </div>

            <div className="pd-tokens" onClick={() => openPremiumModal()} style={{ cursor: "pointer" }} title="Klik untuk lihat paket token unlimited">
              <div className="pd-tokens-label">
                <span style={{ display:"flex",alignItems:"center",gap:4,color:"rgba(255,255,255,0.4)" }}>
                  <Zap size={10} color="#38bdf8" /> Token Hari Ini
                </span>
                <span style={{ fontWeight:800, color: pctColor }}>
                  {isUnlimited ? "Unlimited" : `${tokenPct}%`}
                </span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden", display: "flex", marginBottom: 6 }}>
                {(["metadata","chat","vector","motion"] as Platform[]).map(p => {
                  const pu = tokenUsage.byPlatform?.[p];
                  const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens / tokenUsage.totalTokens) * (isUnlimited ? 25 : tokenPct) : 0;
                  const c: Record<Platform,string> = { metadata:"#38bdf8", chat:"#0ea5e9", vector:"#7dd3fc", motion:"#0284c7" };
                  return <div key={p} style={{ width:`${w}%`,height:"100%",background:c[p],transition:"width 0.6s ease" }} />;
                })}
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"monospace" }}>
                <span>{formatTokens(tokenUsage.totalTokens)}</span>
                <span>/ {formatTokens(getDailyLimit(user?.role, user?.email))}</span>
              </div>

              {/* Button Akses Premium di Profile Dropdown */}
              {!isUnlimited && (
                <button
                  type="button"
                  className="pd-premium-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileOpen(false);
                    openPremiumModal();
                  }}
                >
                  <Crown size={14} color="#38bdf8" />
                  <span>Akses Premium? Token Unlimited</span>
                </button>
              )}
            </div>

            <button
              type="button"
              className="pd-logout"
              onMouseDown={e => { e.stopPropagation(); e.preventDefault(); void handleLogout(); }}
              onClick={e => { e.stopPropagation(); void handleLogout(); }}
            >
              {loggingOut
                ? <><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }} /> Keluar...</>
                : <><LogOut size={13} /> Keluar dari Akun</>
              }
            </button>
          </div>
        )}

        {/* ══ MAIN CONTENT ══ */}
        <main className="app-main" key={activeTab}>
          {activeTab === "dashboard" ? (
            <Dashboard onNavigate={(t) => handleTabChange(t as Tab)} username={user?.username} isAdmin={isAdmin} />
          ) : !isAdmin && closingMap[activeTab]?.closed ? (
            <FeatureClosedNotice featureName={currentTabMeta?.label} message={closingMap[activeTab]?.message} />
          ) : activeTab === "monitor" && isAdmin ? <ServerMonitor />
          : activeTab === "accounts" && isAdmin ? <AdminAccountChecker />
          : activeTab === "messageweb" && isAdmin ? <MessageWebPanel />
          : activeTab === "closing" && isAdmin ? <ClosingFeaturesPanel />
          : activeTab === "admin-messages" && isAdmin ? <AdminMessagesPanel />
          : activeTab === "storage" && isAdmin ? <StoragePanel />
          : activeTab === "shutdown" && isAdmin ? <ServerShutdownPanel />
          : activeTab === "feedback" ? <FeedbackPanel />
          : activeTab === "metadata" ? <ImageUploader onTokensUpdated={refreshTokens} />
          : activeTab === "upscale" ? <ImageUpscaler />
          : activeTab === "watermark" ? <WatermarkRemover />
          : activeTab === "motion" ? <MotionStudio onTokensUpdated={refreshTokens} />
          : activeTab === "research" ? <ResearchPanel />
          : activeTab === "vector" ? (
            <div className="vector-content-wrap"><VectorCreator onTokensUpdated={refreshTokens} /></div>
          ) : (
            <AIChat onTokensUpdated={refreshTokens} />
          )}
        </main>
      </div>
    </>
  );
}
