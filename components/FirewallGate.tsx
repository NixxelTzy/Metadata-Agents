"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STEPS = [
  { label: "Menginisialisasi pemeriksaan keamanan", duration: 380 },
  { label: "Memverifikasi sumber koneksi",          duration: 450 },
  { label: "Menganalisis data klien",               duration: 400 },
  { label: "Memeriksa integritas protokol",         duration: 420 },
  { label: "Memvalidasi sesi pengguna",             duration: 350 },
  { label: "Menjalankan pemeriksaan lanjutan",      duration: 500 },
  { label: "Menganalisis pola aktivitas",           duration: 600 },
  { label: "Memproses data lokasi akses",           duration: 380 },
  { label: "Membuat identifikasi perangkat",        duration: 480 },
  { label: "Menyelesaikan proses keamanan",         duration: 650 },
];

type GateStatus = "idle" | "checking" | "passed" | "failed" | "blocked";

export default function FirewallGate({ onPassed, mode = "normal" }: { onPassed?: () => void; mode?: "strict" | "normal" | "off" }) {
  const [status, setStatus]         = useState<GateStatus>("idle");
  const [stepIdx, setStepIdx]       = useState(0);
  const [stepVisible, setStepVisible] = useState(true);
  const [progress, setProgress]     = useState(0);
  const [errorMsg, setErrorMsg]     = useState("");
  const [dots, setDots]             = useState("");
  const mountedRef                  = useRef(true);
  const timingsRef                  = useRef<number[]>([]);

  // Collect interaction timings for bot detection
  useEffect(() => {
    const rec = () => { timingsRef.current.push(Date.now()); if (timingsRef.current.length > 20) timingsRef.current.shift(); };
    window.addEventListener("mousemove", rec, { passive: true });
    window.addEventListener("touchstart", rec, { passive: true });
    return () => { window.removeEventListener("mousemove", rec); window.removeEventListener("touchstart", rec); };
  }, []);

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => {
      if (mountedRef.current && status === "checking") setDots(d => d.length >= 3 ? "" : d + ".");
    }, 400);
    return () => clearInterval(t);
  }, [status]);

  const run = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("checking");
    setProgress(0);
    setStepIdx(0);
    setErrorMsg("");
    setDots("");

    // Phase 1: Get challenge token
    let challengeToken: string | null = null;
    try {
      const res  = await fetch("/api/firewall/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "init" }) });
      const data = await res.json() as { status: string; token?: string; reason?: string };
      if (data.status === "bypass") { if (mountedRef.current) { setStatus("passed"); onPassed?.(); } return; }
      if (data.status === "blocked") { if (mountedRef.current) { setStatus("blocked"); setErrorMsg(data.reason ?? "Akses ditolak oleh sistem keamanan"); } return; }
      if (!data.token) throw new Error("no token");
      challengeToken = data.token;
    } catch {
      if (mountedRef.current) { setStatus("failed"); setErrorMsg("Tidak dapat terhubung ke server keamanan"); }
      return;
    }

    // Phase 2: Animated verification steps
    for (let i = 0; i < STEPS.length; i++) {
      if (!mountedRef.current) return;
      setStepVisible(true);
      setStepIdx(i);
      setProgress(Math.round(((i + 0.5) / STEPS.length) * 100));
      await new Promise(r => setTimeout(r, STEPS[i]?.duration ?? 400));
      if (!mountedRef.current) return;
      if (i < STEPS.length - 1) { setStepVisible(false); await new Promise(r => setTimeout(r, 200)); }
      setProgress(Math.round(((i + 1) / STEPS.length) * 100));
    }

    // Phase 3: Submit verification
    try {
      const intervals = timingsRef.current.length > 1
        ? timingsRef.current.slice(1).map((t, i) => t - (timingsRef.current[i] ?? t))
        : [];
      const res  = await fetch("/api/firewall/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: challengeToken, phase: "verify", timings: intervals.slice(-10),
          browserFingerprint: await getFingerprint(), screenW: window.screen.width, screenH: window.screen.height,
          colorDepth: window.screen.colorDepth, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          plugins: navigator.plugins?.length ?? 0, touchPoints: navigator.maxTouchPoints ?? 0 }),
      });
      const data = await res.json() as { status: string; reason?: string };
      if (!mountedRef.current) return;
      if (data.status === "passed") { setStatus("passed"); setProgress(100); onPassed?.(); }
      else { setStatus("failed"); setErrorMsg(data.reason ?? "Verifikasi tidak berhasil"); }
    } catch {
      if (mountedRef.current) { setStatus("failed"); setErrorMsg("Terjadi kesalahan jaringan"); }
    }
  }, [onPassed]);

  useEffect(() => {
    mountedRef.current = true;
    const t = setTimeout(run, 400);
    return () => { mountedRef.current = false; clearTimeout(t); };
  }, [run]);

  if ((status as string) === "passed") return null;

  const step = STEPS[stepIdx];

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        {/* Logo / header */}
        <div style={S.header}>
          <div style={S.logoBox}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6L12 2z"
                fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="1.8" />
              {status === "passed"
                ? <path d="M9 12l2 2 4-4" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M12 8v4m0 2h.01" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </div>
          <div style={S.headerText}>
            <span style={S.title}>Pemeriksaan Keamanan</span>
            <span style={S.subtitle}>Sedang memverifikasi akses Anda</span>
          </div>
        </div>

        <div style={S.divider} />

        {/* Loading spinner + step text */}
        {status === "checking" && (
          <div style={S.body}>
            <div style={S.spinnerWrap}>
              <svg style={S.spinner} viewBox="0 0 50 50" width="40" height="40">
                <circle cx="25" cy="25" r="20" fill="none" stroke="#e5e7eb" strokeWidth="4"/>
                <circle cx="25" cy="25" r="20" fill="none" stroke="#2563eb" strokeWidth="4"
                  strokeDasharray="94" strokeDashoffset="70" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ ...S.stepText, opacity: stepVisible ? 1 : 0, transition: "opacity 0.2s" }}>
              {step?.label ?? ""}{dots}
            </div>
            <div style={S.progressWrap}>
              <div style={S.progressBg}>
                <div style={{ ...S.progressFill, width: `${progress}%` }} />
              </div>
              <span style={S.progressPct}>{progress}%</span>
            </div>
          </div>
        )}

        {/* Error / blocked state */}
        {(status === "failed" || status === "blocked") && (
          <div style={S.errorBody}>
            <div style={S.errorIcon}>{status === "blocked" ? "🚫" : "⚠️"}</div>
            <div style={S.errorTitle}>{status === "blocked" ? "Akses Diblokir" : "Verifikasi Gagal"}</div>
            <div style={S.errorMsg}>{errorMsg}</div>
            {status === "failed" && (
              <button style={S.retryBtn} onClick={run}>↺ Coba Lagi</button>
            )}
          </div>
        )}

        <div style={S.divider} />

        <div style={S.footer}>
          <div style={{ ...S.footerDot, background: status === "checking" ? "#2563eb" : status === "passed" ? "#16a34a" : "#ef4444" }} />
          <span style={S.footerText}>
            {status === "checking" ? "Pemeriksaan berjalan..." : status === "passed" ? "Terverifikasi" : "Pemeriksaan dihentikan"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes fw-spin { to { transform: rotate(360deg); } }
        @keyframes fw-blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
      `}</style>
    </div>
  );
}

async function getFingerprint(): Promise<string> {
  try {
    const data = new TextEncoder().encode([navigator.userAgent, navigator.language, screen.colorDepth, screen.width+"x"+screen.height, new Date().getTimezoneOffset(), Intl.DateTimeFormat().resolvedOptions().timeZone].join("|"));
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return "unknown"; }
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 99999,
    background: "rgba(255,255,255,0.97)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    width: "100%", maxWidth: 360,
    padding: "28px 28px 20px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 0 },
  logoBox: {
    width: 44, height: 44, borderRadius: 12,
    background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  headerText: { display: "flex", flexDirection: "column" as const, gap: 2 },
  title: { fontSize: 15, fontWeight: 700, color: "#111827" },
  subtitle: { fontSize: 12, color: "#6b7280" },
  divider: { height: 1, background: "#f3f4f6", margin: "20px 0" },
  body: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16, padding: "4px 0 8px" },
  spinnerWrap: { position: "relative" as const },
  spinner: { animation: "fw-spin 1s linear infinite", display: "block" },
  stepText: {
    fontSize: 13, color: "#374151", textAlign: "center" as const,
    lineHeight: 1.6, minHeight: 22, fontWeight: 500,
    transition: "opacity 0.2s ease",
  },
  progressWrap: { display: "flex", alignItems: "center", gap: 8, width: "100%" },
  progressBg: { flex: 1, height: 4, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" },
  progressFill: {
    height: "100%", background: "#2563eb", borderRadius: 999,
    transition: "width 0.5s ease",
  },
  progressPct: { fontSize: 11, color: "#6b7280", minWidth: 30, textAlign: "right" as const, fontFamily: "monospace" },
  errorBody: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8, padding: "4px 0" },
  errorIcon: { fontSize: 28 },
  errorTitle: { fontSize: 15, fontWeight: 700, color: "#111827" },
  errorMsg: { fontSize: 12, color: "#6b7280", textAlign: "center" as const, lineHeight: 1.5 },
  retryBtn: {
    marginTop: 4, background: "#2563eb", color: "#fff",
    border: "none", borderRadius: 8, padding: "8px 20px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  footer: { display: "flex", alignItems: "center", gap: 8 },
  footerDot: {
    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
    animation: "fw-blink 2s ease-in-out infinite",
  } as React.CSSProperties,
  footerText: { fontSize: 11, color: "#9ca3af" },
};
