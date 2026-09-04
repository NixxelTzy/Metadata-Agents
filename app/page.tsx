"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Dashboard from "@/components/Dashboard";
import ImageUploader from "@/components/ImageUploader";
import ImageUpscaler from "@/components/ImageUpscaler";
import ServerMonitor from "@/components/ServerMonitor";
import AdminAccountChecker from "@/components/AdminAccountChecker";
import FeedbackPanel from "@/components/FeedbackPanel";
import AdminMessagesPanel from "@/components/AdminMessagesPanel";
import StoragePanel from "@/components/StoragePanel";
import MessageWebPanel from "@/components/MessageWebPanel";
import ClosingFeaturesPanel, { ClosingEntry } from "@/components/ClosingFeaturesPanel";
import FeatureClosedNotice from "@/components/FeatureClosedNotice";
import UserInboxBanner, { NotificationBellButton } from "@/components/UserInboxBanner";
import ServerShutdownPanel from "@/components/ServerShutdownPanel";
import PremAccessPanel from "@/components/PremAccessPanel";
import GiveawayPanel from "@/components/GiveawayPanel";
import PremiumPricingModal from "@/components/PremiumPricingModal";
import NativeNavBar from "@/components/NativeNavBar";
import { useRouter } from "next/navigation";
import {
  getUsage, getUsagePercent, getDailyLimit,
  formatTokens, openPremiumModal, isUserAdminOrPremium,
  setCurrentUserCache,
  type Platform,
} from "@/lib/tokenStore";
import {
  Tag, ZoomIn, MessageSquare, ShieldCheck, Mail, Lock, Megaphone, Database,
  Radio, Power, Zap, LogOut, Loader2, ArrowLeft, Layers,
  ChevronRight, Crown, Gift,
} from "lucide-react";

type Tab =
  | "dashboard" | "metadata" | "upscale" | "feedback"
  | "accounts" | "admin-messages" | "storage" | "messageweb"
  | "closing" | "shutdown" | "monitor" | "prem_access" | "giveaway";

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
  { id: "feedback",       label: "Laporan & Saran",            icon: <MessageSquare size={SZ} /> },
  { id: "accounts",       label: "Account Checker",            icon: <ShieldCheck size={SZ} />, isAdmin: true },
  { id: "messageweb",     label: "Message Broadcast",          icon: <Mail size={SZ} />, isAdmin: true },
  { id: "closing",        label: "Closing Features",           icon: <Lock size={SZ} />, isAdmin: true },
  { id: "admin-messages", label: "Broadcast & Email",          icon: <Megaphone size={SZ} />, isAdmin: true },
  { id: "storage",        label: "Redis Monitor",              icon: <Database size={SZ} />, isAdmin: true },
  { id: "shutdown",       label: "Server Control",             icon: <Power size={SZ} />, isAdmin: true, isDanger: true },
  { id: "monitor",        label: "Server Monitor",             icon: <Radio size={SZ} />, isAdmin: true },
  { id: "prem_access",    label: "Prem Access",                icon: <Crown size={SZ} />, isAdmin: true },
  { id: "giveaway",       label: "Giveaway Platform",          icon: <Gift size={SZ} />, isAdmin: true },
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
          setCurrentUserCache(d.user);
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
      setCurrentUserCache(null);
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
          background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 30%, #e0f2fe 60%, #f0f9ff 100%);
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
            radial-gradient(ellipse 70% 50% at 15% 0%, rgba(59,130,246,0.08) 0%, transparent 65%),
            radial-gradient(ellipse 50% 40% at 85% 100%, rgba(96,165,250,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 50% 50%, rgba(219,234,254,0.3) 0%, transparent 80%);
        }

        /* ══ HEADER ══ */
        .app-header {
          position: fixed;
          top: 0; left: 0; right: 0; z-index: 900;
          height: 56px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid rgba(147, 197, 253, 0.45);
          display: flex; align-items: center;
          padding: 0 14px; gap: 10px;
          animation: headerSlide 0.35s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.08);
        }

        /* Back button */
        .hdr-back {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          background: rgba(219, 234, 254, 0.7);
          border: 1px solid rgba(147, 197, 253, 0.5);
          border-radius: 9px;
          color: #1e40af;
          font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.17s ease;
          white-space: nowrap; flex-shrink: 0;
          font-family: inherit;
        }
        .hdr-back:hover {
          background: rgba(191, 219, 254, 0.85);
          border-color: rgba(59, 130, 246, 0.6);
          color: #1d4ed8;
          transform: translateX(-2px);
          box-shadow: 0 2px 12px rgba(59,130,246,0.18);
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
          flex-shrink: 0; color: #2563eb;
          background: rgba(219, 234, 254, 0.7);
          border: 1px solid rgba(147, 197, 253, 0.5);
        }
        .hdr-platform-icon.danger {
          color: #dc2626;
          background: rgba(254, 226, 226, 0.7);
          border-color: rgba(252, 165, 165, 0.5);
        }
        .hdr-platform-name {
          font-size: 13px; font-weight: 700; color: #0f172a;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hdr-admin-pill {
          font-size: 9px; font-weight: 800; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 2px 7px;
          border-radius: 999px; flex-shrink: 0;
        }
        .hdr-admin-pill.danger {
          background: rgba(254, 226, 226, 0.7); border: 1px solid rgba(252, 165, 165, 0.5); color: #dc2626;
        }
        .hdr-admin-pill.info {
          background: rgba(219, 234, 254, 0.7); border: 1px solid rgba(147, 197, 253, 0.5); color: #1e40af;
        }

        /* Brand (dashboard mode) */
        .hdr-brand {
          display: flex; align-items: center; gap: 10px;
          flex: 1; min-width: 0; text-decoration: none;
        }
        .hdr-logo {
          width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 12px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.3);
        }
        .hdr-brand-text { display: flex; flex-direction: column; }
        .hdr-brand-name { font-size: 13px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 1.2; }
        .hdr-brand-sub  { font-size: 9px; color: #64748b; line-height: 1; }

        /* Right controls */
        .hdr-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .token-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 10px;
          background: rgba(219, 234, 254, 0.6);
          border: 1px solid rgba(147, 197, 253, 0.5);
          border-radius: 999px;
          font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', 'Fira Code', monospace;
          color: #1e40af;
          transition: all 0.2s;
          cursor: pointer;
        }
        .token-pill:hover {
          background: rgba(191, 219, 254, 0.8);
          border-color: rgba(59, 130, 246, 0.5);
          transform: translateY(-1px);
        }
        .token-dot {
          width: 6px; height: 6px; border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .avatar-btn {
          width: 32px; height: 32px; border-radius: 9px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: #ffffff; font-size: 12px; font-weight: 800;
          border: 2px solid transparent;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.17s ease;
          box-shadow: 0 2px 8px rgba(59,130,246,0.3);
          font-family: inherit;
        }
        .avatar-btn:hover { transform: scale(1.05); box-shadow: 0 4px 16px rgba(59,130,246,0.45); }
        .avatar-btn.open {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.25), 0 4px 16px rgba(59,130,246,0.4);
        }

        /* ══ PROFILE DROPDOWN ══ */
        .profile-drop {
          position: fixed; top: 63px; right: 12px; width: 330px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          border: 1px solid rgba(147, 197, 253, 0.6);
          border-radius: 18px;
          box-shadow: 0 20px 48px rgba(59, 130, 246, 0.18), 0 2px 10px rgba(0,0,0,0.06);
          animation: dropIn 0.2s cubic-bezier(0.16,1,0.3,1);
          z-index: 2000; overflow: hidden;
        }
        .pd-header {
          padding: 16px 18px 14px;
          display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid rgba(147, 197, 253, 0.35);
        }
        .pd-avatar {
          width: 44px; height: 44px; border-radius: 13px;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; font-weight: 800; color: #ffffff;
          box-shadow: 0 4px 14px rgba(37,99,235,0.35); flex-shrink: 0;
        }
        .pd-name  { font-size: 14px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pd-email { font-size: 11.5px; color: #64748b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

        .pd-tokens {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(147, 197, 253, 0.35);
        }
        .pd-tokens-label {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px; font-size: 11px;
          font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
          color: #334155;
        }

        .pd-premium-btn {
          width: 100%;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(219,234,254,0.8), rgba(254,243,199,0.8));
          border: 1px solid rgba(245, 158, 11, 0.5);
          border-radius: 10px;
          color: #92400e;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.17s;
          margin-top: 12px;
          font-family: inherit;
        }
        .pd-premium-btn:hover {
          background: linear-gradient(135deg, rgba(191,219,254,0.95), rgba(253,230,138,0.95));
          border-color: rgba(245, 158, 11, 0.7);
          color: #78350f;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25);
        }

        .pd-logout {
          width: 100%; padding: 13px 18px;
          background: transparent; border: none;
          color: #dc2626; font-size: 13px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 8px;
          transition: all 0.15s; font-family: inherit;
        }
        .pd-logout:hover { background: rgba(254,226,226,0.65); color: #b91c1c; }

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
                <div className="pd-email" title={user?.email ?? ""}>{user?.email ?? ""}</div>
              </div>
              {isUnlimited && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                  background: user?.email === "nixxeltzy@gmail.com" ? "rgba(99,102,241,0.12)" : isAdmin ? "rgba(239,68,68,0.12)" : "rgba(37,99,235,0.12)",
                  border: `1px solid ${user?.email === "nixxeltzy@gmail.com" ? "rgba(99,102,241,0.3)" : isAdmin ? "rgba(239,68,68,0.3)" : "rgba(37,99,235,0.3)"}`,
                  color: user?.email === "nixxeltzy@gmail.com" ? "#4f46e5" : isAdmin ? "#dc2626" : "#2563eb",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  flexShrink: 0
                }}>
                  {user?.email === "nixxeltzy@gmail.com" ? "👑 Developer" : isAdmin ? "Admin" : "Premium"}
                </span>
              )}
            </div>

            <div className="pd-tokens" onClick={() => openPremiumModal()} style={{ cursor: "pointer" }} title="Klik untuk lihat paket token unlimited">
              <div className="pd-tokens-label">
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#1e293b", fontWeight: 800 }}>
                  <Zap size={13} color="#2563eb" fill="#2563eb" />
                  <span>TOKEN HARI INI</span>
                </span>
                <span style={{
                  fontWeight: 800,
                  fontSize: 11,
                  color: isUnlimited ? "#1d4ed8" : pctColor,
                  background: isUnlimited ? "rgba(219, 234, 254, 0.85)" : "rgba(241, 245, 249, 0.9)",
                  border: `1px solid ${isUnlimited ? "rgba(147, 197, 253, 0.8)" : "rgba(203, 213, 225, 0.7)"}`,
                  padding: "2px 8px",
                  borderRadius: 999,
                  letterSpacing: "0.02em"
                }}>
                  {isUnlimited ? "⚡ UNLIMITED" : `${tokenPct}%`}
                </span>
              </div>

              {/* Progress bar track: highly visible clean slate background */}
              <div style={{ height: 6, background: "rgba(203, 213, 225, 0.6)", borderRadius: 999, overflow: "hidden", margin: "8px 0" }}>
                <div style={{ width: `${isUnlimited ? 25 : tokenPct}%`, height: "100%", background: "#2563eb", transition: "width 0.6s ease" }} />
              </div>

              {/* Numbers row: crisp, high contrast dark slate font */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", fontWeight: 600, fontFamily: "inherit" }}>
                <span>{formatTokens(tokenUsage.totalTokens)} terpakai</span>
                <span style={{ color: isUnlimited ? "#2563eb" : "#475569", fontWeight: 700 }}>
                  {isUnlimited ? "Akses Unlimited" : `/ ${formatTokens(getDailyLimit(user?.role, user?.email))}`}
                </span>
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
                  <Crown size={14} color="#d97706" />
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
                ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }} /> Keluar...</>
                : <><LogOut size={14} /> Keluar dari Akun</>
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
          : activeTab === "prem_access" && isAdmin ? <PremAccessPanel />
          : activeTab === "giveaway" && isAdmin ? <GiveawayPanel />
          : activeTab === "feedback" ? <FeedbackPanel />
          : activeTab === "metadata" ? (
            <ImageUploader
              onTokensUpdated={refreshTokens}
              userEmail={user?.email}
              userRole={user?.role}
              isUnlimited={isUnlimited}
            />
          )
          : <ImageUpscaler />
          }
        </main>

        {/* Native Android / Mobile Navigation Bar & Notification Listener Drawer */}
        <NativeNavBar />
      </div>
    </>
  );
}
