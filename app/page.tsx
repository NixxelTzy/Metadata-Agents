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
  { id: "upscale",   icon: "🔍", label: "Upscale",     desc: "Super Resolution",            color: "#ec4899" },
  { id: "watermark", icon: "🧹", label: "Hapus WM",    desc: "Watermark Remover",           color: "#14b8a6" },
  { id: "research",  icon: "🔎", label: "Riset",        desc: "Keyword Research",            color: "#7b5ae0" },
  { id: "vector",    icon: "✨", label: "Vector",       desc: "AI Ideas Gen",                color: "#22c55e" },
  { id: "chat",      icon: "🤖", label: "AI Chat",      desc: "Groq Assistant",              color: "#f59e0b" },
  { id: "motion",    icon: "🎬", label: "Motion",       desc: "AI Canvas Animation",         color: "#a78bfa" },
  { id: "feedback",  icon: "💬", label: "Laporan",      desc: "Kirim Bug & Usulan Fitur",    color: "#ec4899" },
  { id: "accounts",  icon: "🛡️", label: "Accounts",    desc: "Account Checker",             color: "#ef4444" },
  { id: "messageweb",icon: "📨", label: "Message Web",  desc: "Kirim Pesan ke User",         color: "#a78bfa" },
  { id: "closing",   icon: "🔒", label: "Closing",      desc: "Tutup Fitur Sementara",       color: "#ef4444" },
  { id: "admin-messages", icon: "📬", label: "Broadcast", desc: "Feedback & Mass Email",    color: "#f59e0b" },
  { id: "storage",   icon: "🗄️", label: "Storage",     desc: "Redis DB Monitor",            color: "#10b981" },
];

// Bottom nav tabs for mobile (5 most used + more)
const MOBILE_BOTTOM_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "metadata",  icon: "🏷️", label: "Metadata"  },
  { id: "upscale",   icon: "🔍", label: "Upscale"   },
  { id: "watermark", icon: "🧹", label: "Hapus WM"  },
  { id: "chat",      icon: "🤖", label: "AI Chat"   },
  { id: "research",  icon: "🔎", label: "Riset"     },
];

interface UserInfo {
  userId: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
}

function NavBtn({ icon, label, isActive, danger, onClick }: {
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

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("metadata");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(() => getUsage());
  const [tokenPct, setTokenPct] = useState(() => getUsagePercent());
  const device = useDevice();
  const profileRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [closingMap, setClosingMap] = useState<Record<string, ClosingEntry>>({});

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
      .then((d: { user?: UserInfo }) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const send = (f: string) => fetch("/api/user/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: f }) }).catch(() => {});
    send(activeTab);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => send(activeTab), 30000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [user, activeTab]);

  useEffect(() => {
    if (profileOpen) { setTokenUsage(getUsage()); setTokenPct(getUsagePercent()); }
  }, [profileOpen]);

  const refreshTokens = useCallback(() => { setTokenUsage(getUsage()); setTokenPct(getUsagePercent()); }, []);
  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        profileRef.current && !profileRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setMonitorOpen(false);
    setMoreOpen(false);
  };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/api; SameSite=Lax";

      try { localStorage.clear(); sessionStorage.clear(); } catch {}

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    } catch { /* ignore */ }

    window.location.href = "/login";
  }, []);

  const pctColor = tokenPct >= 85 ? "#f87171" : tokenPct >= 60 ? "#fbbf24" : "#4ade80";
  const userInitial = user?.username?.charAt(0)?.toUpperCase() ?? "?";
  const currentTab = TAB_CONFIG.find(t => t.id === activeTab);
  const isMobile = !device.isDesktop;

  // All non-bottom-nav tabs for "More" drawer on mobile
  const MORE_TABS = TAB_CONFIG.filter(t => !MOBILE_BOTTOM_TABS.find(b => b.id === t.id));

  return (
    <>
      <style>{`
        @keyframes navIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tipFade { from{opacity:0;transform:translateX(-50%) translateY(-4px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes profileIn { from{opacity:0;transform:translateY(-8px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes drawerUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

        .nav-pill-btn {
          position:relative; width:40px; height:40px; border-radius:12px; border:none;
          background:transparent; display:flex; align-items:center; justify-content:center;
          font-size:19px; cursor:pointer; transition:background 0.18s,transform 0.15s;
          color:rgba(255,255,255,0.5); flex-shrink:0;
        }
        .nav-pill-btn:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.9); transform:scale(1.07); }
        .nav-pill-btn.active { background:rgba(14,165,233,0.2); color:#38bdf8; box-shadow:0 0 0 1px rgba(14,165,233,0.3); }
        .nav-pill-tooltip {
          position:absolute; bottom:-34px; left:50%; transform:translateX(-50%);
          background:rgba(10,10,20,0.96); border:1px solid rgba(255,255,255,0.1);
          color:#f1f5f9; font-size:10px; font-weight:600; padding:4px 9px;
          border-radius:7px; white-space:nowrap; pointer-events:none;
          animation:tipFade 0.16s ease forwards; z-index:200;
          backdrop-filter:blur(12px); box-shadow:0 4px 14px rgba(0,0,0,0.4);
        }

        .workspace-root {
          min-height:100dvh;
          background:linear-gradient(160deg,#000814 0%,#001a35 50%,#000814 100%);
          display:flex; flex-direction:column; overflow:hidden; position:relative;
        }
        .workspace-root::before {
          content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
          background:radial-gradient(ellipse 60% 40% at 20% 10%,rgba(14,165,233,0.07) 0%,transparent 60%),
                     radial-gradient(ellipse 40% 30% at 80% 80%,rgba(56,189,248,0.05) 0%,transparent 55%);
        }

        /* ── Desktop top navbar ── */
        .top-navbar {
          position:fixed; top:12px; left:50%; transform:translateX(-50%);
          z-index:1000; display:flex; align-items:center; gap:3px;
          padding:5px 9px;
          background:rgba(12,12,24,0.85); backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(255,255,255,0.1); border-radius:999px;
          box-shadow:0 8px 28px rgba(0,0,0,0.5),0 1px 0 rgba(255,255,255,0.05) inset;
          animation:navIn 0.4s cubic-bezier(0.16,1,0.3,1);
          max-width:calc(100vw - 24px);
        }
        .top-navbar__div { width:1px; height:22px; background:rgba(255,255,255,0.09); margin:0 3px; flex-shrink:0; }
        .top-navbar__section { display:flex; align-items:center; gap:1px; }

        .main-content { flex:1; padding-top:72px; overflow:auto; position:relative; z-index:1; animation:fadeUp 0.3s ease; }

        /* ── Profile dropdown ── */
        .profile-drop {
          position:fixed; top:66px; right:12px; width:272px;
          background:rgba(0,15,45,0.97); backdrop-filter:blur(28px) saturate(180%);
          border:1px solid rgba(0,120,255,0.2); border-radius:16px;
          box-shadow:0 20px 55px rgba(0,0,0,0.6);
          animation:profileIn 0.2s cubic-bezier(0.16,1,0.3,1);
          z-index:2000; overflow:hidden;
        }

        /* ── Mobile bottom nav ── */
        .mobile-bottom-nav {
          display:none;
          position:fixed; bottom:0; left:0; right:0; z-index:900;
          background:rgba(0,15,40,0.88); backdrop-filter:blur(24px) saturate(180%);
          -webkit-backdrop-filter:blur(24px) saturate(180%);
          border-top:1px solid rgba(0,120,255,0.18);
          padding:6px 0 calc(6px + env(safe-area-inset-bottom));
          box-shadow:0 -4px 24px rgba(0,0,0,0.4);
        }
        .mobile-bottom-nav__inner {
          display:flex; align-items:stretch; justify-content:space-around;
          max-width:480px; margin:0 auto; padding:0 4px;
        }
        .mbn-tab {
          display:flex; flex-direction:column; align-items:center; gap:3px;
          padding:6px 8px; border-radius:12px; border:none;
          background:transparent; cursor:pointer; transition:background 0.15s;
          min-width:52px; flex:1;
          font-family:system-ui,sans-serif;
        }
        .mbn-tab__icon { font-size:20px; line-height:1; }
        .mbn-tab__label { font-size:9.5px; font-weight:600; color:rgba(255,255,255,0.4); letter-spacing:0.01em; }
        .mbn-tab.active .mbn-tab__label { color:#38bdf8; }
        .mbn-tab.active { background:rgba(14,165,233,0.15); }
        .mbn-tab__dot {
          width:4px; height:4px; border-radius:50%; background:#0ea5e9;
          margin-top:2px;
        }

        /* ── Mobile header (top bar on mobile) ── */
        .mobile-header {
          display:none; position:fixed; top:0; left:0; right:0; z-index:900;
          height:52px; background:rgba(0,25,60,0.85); backdrop-filter:blur(24px) saturate(180%);
          -webkit-backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.07);
          align-items:center; justify-content:space-between; padding:0 14px;
          box-shadow:0 2px 12px rgba(0,0,0,0.3);
        }
        .mobile-header__brand {
          display:flex; align-items:center; gap:8px;
        }
        .mobile-header__right {
          display:flex; align-items:center; gap:8px;
        }

        /* ── More drawer on mobile ── */
        .more-drawer-backdrop {
          position:fixed; inset:0; z-index:1800; background:rgba(0,0,0,0.5);
          backdrop-filter:blur(4px);
        }
        .more-drawer {
          position:fixed; bottom:0; left:0; right:0; z-index:1900;
          background:rgba(0,15,45,0.98); backdrop-filter:blur(24px);
          border-top:1px solid rgba(0,120,255,0.2);
          border-radius:20px 20px 0 0;
          padding:16px 16px calc(16px + env(safe-area-inset-bottom));
          animation:drawerUp 0.22s cubic-bezier(0.16,1,0.3,1);
          max-height:80dvh; overflow-y:auto;
        }
        .more-drawer__handle {
          width:36px; height:4px; border-radius:2px;
          background:rgba(255,255,255,0.15); margin:0 auto 16px;
        }
        .more-drawer__title {
          font-size:11px; font-weight:700; text-transform:uppercase;
          letter-spacing:0.08em; color:rgba(255,255,255,0.3);
          margin-bottom:12px; padding:0 4px;
        }
        .more-drawer__grid {
          display:grid; grid-template-columns:repeat(4,1fr); gap:8px;
        }
        .more-drawer__item {
          display:flex; flex-direction:column; align-items:center; gap:5px;
          padding:12px 6px; border-radius:12px; border:none;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
          cursor:pointer; transition:all 0.15s;
          font-family:system-ui,sans-serif;
        }
        .more-drawer__item.active {
          background:rgba(14,165,233,0.15);
          border-color:rgba(14,165,233,0.3);
        }
        .more-drawer__item__icon { font-size:22px; }
        .more-drawer__item__label {
          font-size:10px; font-weight:600; color:rgba(255,255,255,0.55);
          text-align:center; line-height:1.3;
        }
        .more-drawer__item.active .more-drawer__item__label { color:#38bdf8; }

        /* ── Responsive switching ── */
        @media (max-width: 768px) {
          .top-navbar { display:none !important; }
          .mobile-bottom-nav { display:block; }
          .mobile-header { display:flex; }
          .main-content {
            padding-top:52px;
            padding-bottom:calc(70px + env(safe-area-inset-bottom));
          }
          .uploader { top:52px; }
          .pl-root { top:52px; }
          .mon-panel { top:52px; }
        }
      `}</style>

      <div className="workspace-root">

        {/* ── DESKTOP: Top Navbar ── */}
        <nav className="top-navbar" ref={profileRef}>
          <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#0ea5e9,#0369a1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,boxShadow:"0 3px 10px rgba(14,165,233,0.4)"}}>✨</div>
          <div className="top-navbar__div" />
          <div className="top-navbar__section">
            {TAB_CONFIG.filter(t => !["accounts","admin-messages","storage","messageweb","closing","shutdown"].includes(t.id)).map(tab => (
              <NavBtn key={tab.id} icon={tab.icon} label={tab.label}
                isActive={activeTab === tab.id && !monitorOpen}
                onClick={() => handleTabChange(tab.id)} />
            ))}
          </div>
          {isAdmin && (
            <>
              <div className="top-navbar__div" />
              <div className="top-navbar__section">
                {[
                  { id:"monitor", icon:"📡", label:"Monitor", isMonitor:true },
                  { id:"accounts", icon:"🛡️", label:"Accounts" },
                  { id:"messageweb", icon:"📨", label:"Message Web" },
                  { id:"closing", icon:"🔒", label:"Closing" },
                  { id:"admin-messages", icon:"📬", label:"Broadcast" },
                  { id:"storage", icon:"🗄️", label:"Storage" },
                  { id:"shutdown", icon:"🔌", label:"Shutdown", danger:true },
                ].map(item => (
                  <NavBtn key={item.id} icon={item.icon} label={item.label}
                    isActive={item.isMonitor ? monitorOpen : (activeTab === item.id as Tab && !monitorOpen)}
                    danger={item.danger}
                    onClick={() => { if(item.isMonitor){setMonitorOpen(true);setActiveTab("metadata");}else handleTabChange(item.id as Tab); }} />
                ))}
              </div>
            </>
          )}
          <div className="top-navbar__div" />
          <div className="top-navbar__section" style={{gap:5}}>
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:999,fontSize:10,fontWeight:700,color:pctColor,fontFamily:"monospace",flexShrink:0}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:pctColor,boxShadow:`0 0 5px ${pctColor}`}} />{tokenPct}%
            </div>
            <NotificationBellButton />
            <button type="button" onClick={() => setProfileOpen(v => !v)}
              style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"white",fontSize:12,fontWeight:800,border:profileOpen?"2px solid rgba(99,102,241,0.6)":"2px solid transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0}}>
              {userInitial}
            </button>
          </div>
        </nav>

        {/* ── MOBILE: Top Header ── */}
        <header className="mobile-header">
          <div className="mobile-header__brand">
            <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✨</div>
            <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>
              {monitorOpen ? "Monitor" : currentTab?.label ?? "Stock AI"}
            </div>
          </div>
          <div className="mobile-header__right">
            <div style={{fontSize:10,fontWeight:700,color:pctColor,fontFamily:"monospace"}}>{tokenPct}%</div>
            <NotificationBellButton />
            <button type="button" onClick={() => setProfileOpen(v => !v)}
              style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"white",fontSize:11,fontWeight:800,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {userInitial}
            </button>
          </div>
        </header>


        {/* ── Profile Dropdown ── */}
        {profileOpen && (
          <>
            <div style={{position:"fixed",inset:0,zIndex:1999}} onClick={() => setProfileOpen(false)} />
            <div className="profile-drop" ref={dropRef} onClick={e => e.stopPropagation()}>
              <div style={{padding:"14px 16px",background:"linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.05))",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",gap:11}}>
                <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"white",fontSize:16,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{userInitial}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{user?.username}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:1}}>{user?.email}</div>
                </div>
              </div>
              <div style={{padding:"11px 15px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.35)",textTransform:"uppercase",letterSpacing:"0.06em"}}>⚡ Token Hari Ini</span>
                  <span style={{fontSize:11,fontWeight:800,color:pctColor}}>{tokenPct}%</span>
                </div>
                <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:999,overflow:"hidden",display:"flex",marginBottom:7}}>
                  {(["metadata","chat","vector","motion"] as Platform[]).map(p => {
                    const pu = tokenUsage.byPlatform?.[p];
                    const w = tokenUsage.totalTokens > 0 && pu ? (pu.totalTokens/tokenUsage.totalTokens)*tokenPct : 0;
                    const c: Record<Platform,string> = {metadata:"#4a90e2",chat:"#7b5ae0",vector:"#22c55e",motion:"#a78bfa"};
                    return <div key={p} style={{width:`${w}%`,height:"100%",background:c[p]}} />;
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.3)",fontFamily:"monospace"}}>
                  <span>{formatTokens(tokenUsage.totalTokens)}</span>
                  <span>/ {formatTokens(getDailyLimit())}</span>
                </div>
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); void handleLogout(); }}
                onClick={(e) => { e.stopPropagation(); void handleLogout(); }}
                style={{width:"100%",padding:"12px",background:"transparent",border:"none",color:"#f87171",fontSize:13,fontWeight:700,cursor:"pointer",borderTop:"1px solid rgba(255,255,255,0.06)"}}
              >
                {loggingOut ? "⏳ Keluar..." : "→ Keluar"}
              </button>
            </div>
          </>
        )}

        {/* ── MOBILE: Bottom Navigation ── */}
        <nav className="mobile-bottom-nav">
          <div className="mobile-bottom-nav__inner">
            {MOBILE_BOTTOM_TABS.map(tab => (
              <button key={tab.id} type="button"
                className={`mbn-tab${activeTab === tab.id && !monitorOpen ? " active" : ""}`}
                onClick={() => handleTabChange(tab.id)}>
                <span className="mbn-tab__icon">{tab.icon}</span>
                <span className="mbn-tab__label">{tab.label}</span>
                {activeTab === tab.id && !monitorOpen && <span className="mbn-tab__dot" />}
              </button>
            ))}
            {/* More button */}
            <button type="button"
              className={`mbn-tab${moreOpen ? " active" : ""}`}
              onClick={() => setMoreOpen(v => !v)}>
              <span className="mbn-tab__icon">⋯</span>
              <span className="mbn-tab__label">Lainnya</span>
            </button>
          </div>
        </nav>


        {/* ── MOBILE: More Drawer ── */}
        {moreOpen && (
          <>
            <div className="more-drawer-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="more-drawer">
              <div className="more-drawer__handle" />
              <div className="more-drawer__title">Semua Fitur</div>
              <div className="more-drawer__grid">
                {MORE_TABS.filter(t => !["accounts","admin-messages","storage","messageweb","closing","shutdown"].includes(t.id)).map(tab => (
                  <button key={tab.id} type="button"
                    className={`more-drawer__item${activeTab === tab.id ? " active" : ""}`}
                    onClick={() => handleTabChange(tab.id)}>
                    <span className="more-drawer__item__icon">{tab.icon}</span>
                    <span className="more-drawer__item__label">{tab.label}</span>
                  </button>
                ))}
                {isAdmin && (
                  <>
                    <div style={{gridColumn:"1/-1",height:"1px",background:"rgba(255,255,255,0.07)",margin:"4px 0"}} />
                    <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(255,255,255,0.2)",padding:"0 2px 6px"}}>Admin</div>
                    {[
                      {id:"monitor",icon:"📡",label:"Monitor",isMonitor:true},
                      {id:"accounts",icon:"🛡️",label:"Accounts"},
                      {id:"messageweb",icon:"📨",label:"Message Web"},
                      {id:"closing",icon:"🔒",label:"Closing"},
                      {id:"admin-messages",icon:"📬",label:"Broadcast"},
                      {id:"storage",icon:"🗄️",label:"Storage"},
                      {id:"shutdown",icon:"🔌",label:"Shutdown"},
                    ].map(item => (
                      <button key={item.id} type="button"
                        className={`more-drawer__item${(item.isMonitor ? monitorOpen : activeTab === item.id as Tab && !monitorOpen) ? " active" : ""}`}
                        style={item.id === "shutdown" ? {borderColor:"rgba(239,68,68,0.25)"} : {}}
                        onClick={() => {
                          if(item.isMonitor){setMonitorOpen(true);setActiveTab("metadata");setMoreOpen(false);}
                          else handleTabChange(item.id as Tab);
                        }}>
                        <span className="more-drawer__item__icon">{item.icon}</span>
                        <span className="more-drawer__item__label" style={item.id==="shutdown"?{color:"#fca5a5"}:{}}>{item.label}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Main Content ── */}
        <main className="main-content">
          {!isAdmin && closingMap[activeTab]?.closed ? (
            <FeatureClosedNotice featureName={currentTab?.label} message={closingMap[activeTab]?.message} />
          ) : isAdmin && monitorOpen ? <ServerMonitor />
          : isAdmin && activeTab === "accounts" ? <AdminAccountChecker />
          : isAdmin && activeTab === "messageweb" ? <MessageWebPanel />
          : isAdmin && activeTab === "closing" ? <ClosingFeaturesPanel />
          : isAdmin && activeTab === "admin-messages" ? <AdminMessagesPanel />
          : isAdmin && activeTab === "storage" ? <StoragePanel />
          : isAdmin && activeTab === "shutdown" ? <ServerShutdownPanel />
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
