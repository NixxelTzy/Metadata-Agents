"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Steps (teks aman — tidak mengungkap detail teknis) ───────────────────────

const STEPS = [
  { label: "Mempersiapkan sistem keamanan",    detail: "Sedang memulai lapisan perlindungan...",   duration: 400  },
  { label: "Menjalankan pemeriksaan jaringan", detail: "Memverifikasi sumber koneksi...",          duration: 500  },
  { label: "Memvalidasi sesi pengguna",        detail: "Memeriksa identitas klien...",             duration: 380  },
  { label: "Menganalisis protokol komunikasi", detail: "Menelusuri integritas data...",            duration: 450  },
  { label: "Memeriksa tanda tangan digital",   detail: "Memproses informasi keamanan...",          duration: 420  },
  { label: "Mengukur respons sistem",          detail: "Menguji stabilitas koneksi...",            duration: 550  },
  { label: "Menjalankan analisis perilaku",    detail: "Memproses pola aktivitas...",              duration: 600  },
  { label: "Memverifikasi lokasi akses",       detail: "Memeriksa konsistensi data lokasi...",     duration: 380  },
  { label: "Membuat identifikasi perangkat",   detail: "Memproses sidik jari browser...",          duration: 500  },
  { label: "Menyelesaikan proses keamanan",    detail: "Mengemas token akses terenkripsi...",      duration: 700  },
  { label: "Membuka akses",                    detail: "Semua pemeriksaan berhasil diselesaikan.", duration: 400  },
];

type GateStatus = "idle" | "checking" | "passed" | "failed" | "blocked";

export default function FirewallGate({ onPassed, mode = "normal" }: { onPassed?: () => void; mode?: "strict" | "normal" | "off" }) {
  const [status, setStatus]         = useState<GateStatus>("idle");
  const [stepIndex, setStepIndex]   = useState(0);       // which step is active
  const [stepVisible, setStepVisible] = useState(true);  // controls fade
  const [progress, setProgress]     = useState(0);
  const [errorMsg, setErrorMsg]     = useState("");
  const mountedRef                  = useRef(true);
  const timingsRef                  = useRef<number[]>([]);

  // Collect mouse/touch timings for bot detection
  useEffect(() => {
    const rec = () => { timingsRef.current.push(Date.now()); if (timingsRef.current.length > 20) timingsRef.current.shift(); };
    window.addEventListener("mousemove", rec, { passive: true });
    window.addEventListener("touchstart", rec, { passive: true });
    return () => { window.removeEventListener("mousemove", rec); window.removeEventListener("touchstart", rec); };
  }, []);

  const run = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("checking");
    setProgress(0);
    setStepIndex(0);
    setErrorMsg("");

    // ── Phase 1: Get challenge token
    let challengeToken: string | null = null;
    try {
      const res  = await fetch("/api/firewall/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "init" }) });
      const data = await res.json() as { status: string; token?: string; reason?: string };
      if (data.status === "bypass") { if (mountedRef.current) { setStatus("passed"); onPassed?.(); } return; }
      if (data.status === "blocked") { if (mountedRef.current) { setStatus("blocked"); setErrorMsg(data.reason ?? "Akses ditolak"); } return; }
      if (!data.token) throw new Error("no token");
      challengeToken = data.token;
    } catch {
      if (mountedRef.current) { setStatus("failed"); setErrorMsg("Tidak dapat terhubung — coba lagi"); }
      return;
    }

    // ── Phase 2: Animated steps — one at a time, fade transition
    for (let i = 0; i < STEPS.length; i++) {
      if (!mountedRef.current) return;

      // Fade in current step
      setStepVisible(true);
      setStepIndex(i);
      setProgress(Math.round(((i + 0.5) / STEPS.length) * 100));

      await sleep(STEPS[i].duration);
      if (!mountedRef.current) return;

      // Fade out before next step
      if (i < STEPS.length - 1) {
        setStepVisible(false);
        await sleep(220);
        if (!mountedRef.current) return;
      }

      setProgress(Math.round(((i + 1) / STEPS.length) * 100));
    }

    // ── Phase 3: Submit verification
    try {
      const intervals = timingsRef.current.length > 1
        ? timingsRef.current.slice(1).map((t, i) => t - (timingsRef.current[i] ?? t))
        : [];

      const res  = await fetch("/api/firewall/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: challengeToken,
          phase: "verify",
          timings: intervals.slice(-10),
          browserFingerprint: await getFingerprint(),
          screenW:     window.screen.width,
          screenH:     window.screen.height,
          colorDepth:  window.screen.colorDepth,
          timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
          plugins:     navigator.plugins?.length ?? 0,
          touchPoints: navigator.maxTouchPoints ?? 0,
        }),
      });
      const data = await res.json() as { status: string; reason?: string };

      if (!mountedRef.current) return;
      if (data.status === "passed") { setStatus("passed"); setProgress(100); onPassed?.(); }
      else { setStatus("failed"); setErrorMsg(data.reason ?? "Verifikasi gagal"); }
    } catch {
      if (mountedRef.current) { setStatus("failed"); setErrorMsg("Terjadi kesalahan jaringan"); }
    }
  }, [onPassed]);

  useEffect(() => {
    mountedRef.current = true;
    const t = setTimeout(run, 500);
    return () => { mountedRef.current = false; clearTimeout(t); };
  }, [run]);

  if (status === "passed" as string) return null;

  const step = STEPS[stepIndex];

  return (
    <div style={S.overlay}>
      {/* Background */}
      <div style={S.grid} />
      <div style={S.orb1} />
      <div style={S.orb2} />
      <div style={S.orb3} />

      {/* Card */}
      <div style={S.card}>

        {/* Top badge */}
        <div style={S.badge}>
          <span style={S.badgeDot} />
          <span style={S.badgeText}>Sistem Keamanan Aktif</span>
        </div>

        {/* Shield icon */}
        <div style={S.iconWrap}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ position: "relative", zIndex: 1 }}>
            <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6L12 2z"
              fill="rgba(99,102,241,0.25)" stroke="rgba(99,102,241,0.8)" strokeWidth="1.5" />
            <path d="M9 12l2 2 4-4" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: status === "checking" ? 0.4 : 1, transition: "opacity 0.4s" }} />
          </svg>
          {status === "checking" && <div style={S.iconPulse} />}
        </div>

        {/* Title */}
        <div style={S.title}>Verifikasi Keamanan</div>
        <div style={S.subtitle}>Pemeriksaan otomatis sedang berjalan</div>

        {/* Progress bar */}
        <div style={S.barWrap}>
          <div style={{ ...S.barFill, width: `${progress}%`,
            background: status === "failed" || status === "blocked"
              ? "linear-gradient(90deg,#ef4444,#dc2626)"
              : "linear-gradient(90deg,#4f46e5,#7c3aed,#06b6d4)" }} />
        </div>

        {/* Single-step display */}
        {status === "checking" && (
          <div style={{ ...S.stepBox, opacity: stepVisible ? 1 : 0, transform: stepVisible ? "translateY(0)" : "translateY(6px)" }}>
            <div style={S.stepLabel}>{step?.label ?? ""}</div>
            <div style={S.stepDetail}>{step?.detail ?? ""}</div>
            <div style={S.stepPct}>{progress}%</div>
          </div>
        )}

        {/* Success state */}
        {status === "passed" && (
          <div style={S.successBox}>
            <span style={S.successIcon}>✓</span>
            <span style={S.successText}>Akses diberikan</span>
          </div>
        )}

        {/* Error / blocked state */}
        {(status === "failed" || status === "blocked") && (
          <div style={S.errorBox}>
            <div style={S.errorIcon}>{status === "blocked" ? "🚫" : "⚠️"}</div>
            <div style={S.errorTitle}>{status === "blocked" ? "Akses Diblokir" : "Verifikasi Gagal"}</div>
            <div style={S.errorMsg}>{errorMsg}</div>
            {status === "failed" && (
              <button style={S.retryBtn} onClick={run}>Coba Lagi</button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={S.footer}>
          <span style={S.footerDot} />
          <span style={S.footerText}>Dilindungi enkripsi end-to-end</span>
        </div>
      </div>

      <style>{`
        @keyframes orbDrift1 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(40px,-30px);} }
        @keyframes orbDrift2 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(-35px,25px);} }
        @keyframes orbDrift3 { 0%,100%{transform:translate(0,0);} 60%{transform:translate(20px,35px);} }
        @keyframes pulsering { 0%{transform:scale(1);opacity:0.7;} 100%{transform:scale(2.2);opacity:0;} }
        @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function getFingerprint(): Promise<string> {
  try {
    const data = new TextEncoder().encode(
      [navigator.userAgent, navigator.language, screen.colorDepth, screen.width + "x" + screen.height,
       new Date().getTimezoneOffset(), navigator.hardwareConcurrency ?? 0,
       Intl.DateTimeFormat().resolvedOptions().timeZone].join("|")
    );
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return "unknown"; }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 99999,
    background: "#050510",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    overflow: "hidden",
  },
  grid: {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: [
      "repeating-linear-gradient(0deg,rgba(99,102,241,0.04) 0,transparent 1px,transparent 64px)",
      "repeating-linear-gradient(90deg,rgba(99,102,241,0.04) 0,transparent 1px,transparent 64px)",
    ].join(","),
  },
  orb1: {
    position: "absolute", width: 520, height: 520, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(79,70,229,0.28) 0%,transparent 70%)",
    top: -140, right: -120, filter: "blur(80px)", pointerEvents: "none",
    animation: "orbDrift1 20s ease-in-out infinite",
  },
  orb2: {
    position: "absolute", width: 440, height: 440, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(124,58,237,0.22) 0%,transparent 70%)",
    bottom: -100, left: -100, filter: "blur(80px)", pointerEvents: "none",
    animation: "orbDrift2 24s ease-in-out infinite",
  },
  orb3: {
    position: "absolute", width: 280, height: 280, borderRadius: "50%",
    background: "radial-gradient(circle,rgba(6,182,212,0.15) 0%,transparent 70%)",
    top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    filter: "blur(60px)", pointerEvents: "none",
    animation: "orbDrift3 16s ease-in-out infinite",
  },
  card: {
    position: "relative", zIndex: 1,
    background: "rgba(8,8,22,0.88)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 24,
    padding: "36px 40px 28px",
    width: "100%", maxWidth: 420,
    boxShadow: "0 0 0 1px rgba(99,102,241,0.08), 0 40px 80px rgba(0,0,0,0.7)",
    backdropFilter: "blur(24px)",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 0,
  },

  // Badge
  badge: {
    display: "flex", alignItems: "center", gap: 7,
    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
    borderRadius: 999, padding: "5px 14px", marginBottom: 28,
  },
  badgeDot: {
    width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
    boxShadow: "0 0 6px rgba(34,197,94,0.8)", flexShrink: 0,
    animation: "blink 2s ease-in-out infinite",
  } as React.CSSProperties,
  badgeText: { fontSize: 11, fontWeight: 600, color: "rgba(167,139,250,0.9)", letterSpacing: "0.04em" },

  // Icon
  iconWrap: {
    position: "relative", width: 72, height: 72,
    background: "linear-gradient(135deg,rgba(79,70,229,0.2),rgba(124,58,237,0.2))",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  iconPulse: {
    position: "absolute", inset: -4, borderRadius: 24,
    border: "2px solid rgba(99,102,241,0.4)",
    animation: "pulsering 2s ease-out infinite",
  } as React.CSSProperties,

  // Heading
  title: { fontSize: 20, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 28 },

  // Progress bar
  barWrap: {
    width: "100%", height: 4, background: "rgba(255,255,255,0.07)",
    borderRadius: 999, overflow: "hidden", marginBottom: 28,
  },
  barFill: {
    height: "100%", borderRadius: 999,
    transition: "width 0.55s cubic-bezier(0.4,0,0.2,1), background 0.4s",
    boxShadow: "0 0 10px rgba(99,102,241,0.5)",
  },

  // Step (single, fading)
  stepBox: {
    width: "100%", textAlign: "center",
    transition: "opacity 0.22s ease, transform 0.22s ease",
    marginBottom: 8, minHeight: 70,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  } as React.CSSProperties,
  stepLabel:  { fontSize: 15, fontWeight: 600, color: "#e2e8f0" },
  stepDetail: { fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: "1.5" },
  stepPct:    { fontSize: 11, color: "rgba(99,102,241,0.7)", fontFamily: "monospace", marginTop: 4 },

  // Success
  successBox: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 12, padding: "12px 20px", marginBottom: 8, width: "100%",
    justifyContent: "center",
  },
  successIcon: { fontSize: 18, color: "#22c55e" },
  successText: { fontSize: 14, fontWeight: 600, color: "#22c55e" },

  // Error
  errorBox: {
    width: "100%", textAlign: "center",
    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 14, padding: "18px 20px", marginBottom: 8,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  } as React.CSSProperties,
  errorIcon:  { fontSize: 26 },
  errorTitle: { fontSize: 15, fontWeight: 700, color: "#ef4444" },
  errorMsg:   { fontSize: 12, color: "rgba(252,165,165,0.8)", lineHeight: "1.5" },
  retryBtn: {
    marginTop: 4, background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.35)", color: "#a78bfa",
    fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "8px 20px",
    cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s",
  },

  // Footer
  footer: {
    display: "flex", alignItems: "center", gap: 8, marginTop: 24,
    paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)",
    width: "100%", justifyContent: "center",
  },
  footerDot: {
    width: 6, height: 6, borderRadius: "50%", background: "#6366f1",
    boxShadow: "0 0 6px rgba(99,102,241,0.6)", flexShrink: 0,
  } as React.CSSProperties,
  footerText: { fontSize: 11, color: "rgba(255,255,255,0.2)" },
};
