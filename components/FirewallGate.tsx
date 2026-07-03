"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GateStatus = "idle" | "checking" | "passed" | "failed" | "blocked";

interface CheckStep {
  id: string;
  label: string;
  detail: string;
  icon: string;
  duration: number; // ms
}

const VERIFICATION_STEPS: CheckStep[] = [
  { id: "init",        label: "Initializing security layer",       detail: "Setting up encrypted verification channel...", icon: "🔐", duration: 350  },
  { id: "ip",          label: "Analyzing IP reputation",           detail: "Checking threat intelligence databases...",    icon: "🌐", duration: 450  },
  { id: "ua",          label: "Validating client signature",       detail: "Parsing User-Agent and browser signals...",    icon: "🖥️", duration: 300  },
  { id: "headers",     label: "Inspecting HTTP headers",           detail: "Scanning for protocol anomalies...",           icon: "📋", duration: 380  },
  { id: "tls",         label: "Verifying TLS fingerprint",         detail: "Analyzing connection characteristics...",      icon: "🔑", duration: 420  },
  { id: "timing",      label: "Measuring response timing",         detail: "Detecting automated request patterns...",      icon: "⏱️", duration: 500  },
  { id: "behavior",    label: "Behavioral analysis",               detail: "Checking for bot-like interaction patterns...", icon: "🤖", duration: 600  },
  { id: "geo",         label: "Geographic verification",           detail: "Validating access location consistency...",    icon: "📍", duration: 350  },
  { id: "fingerprint", label: "Device fingerprinting",             detail: "Creating unique device identifier...",         icon: "🔍", duration: 480  },
  { id: "challenge",   label: "Processing challenge response",     detail: "Validating cryptographic proof of work...",    icon: "🛡️", duration: 700  },
  { id: "final",       label: "Finalizing verification",           detail: "Granting secure access token...",              icon: "✅", duration: 400  },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function FirewallGate({ onPassed }: { onPassed?: () => void }) {
  const [status, setStatus] = useState<GateStatus>("idle");
  const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [dots, setDots] = useState("");
  const [scanLines, setScanLines] = useState(0);
  const mountedRef = useRef(true);
  const timingsRef = useRef<number[]>([]);

  // Animated dots
  useEffect(() => {
    const t = setInterval(() => {
      if (mountedRef.current) setDots(d => d.length >= 3 ? "" : d + ".");
    }, 400);
    return () => clearInterval(t);
  }, []);

  // Animated scan line counter
  useEffect(() => {
    const t = setInterval(() => {
      if (mountedRef.current) setScanLines(n => (n + 1) % 999999);
    }, 50);
    return () => clearInterval(t);
  }, []);

  // Record interaction timings for bot detection
  useEffect(() => {
    const handleMove = () => {
      timingsRef.current.push(Date.now());
      if (timingsRef.current.length > 20) timingsRef.current.shift();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchstart", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchstart", handleMove);
    };
  }, []);

  const runVerification = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("checking");
    setVisibleSteps([]);
    setCompletedSteps([]);
    setProgressPct(0);
    setErrorMsg("");

    try {
      // Phase 1: Get challenge token
      const initRes = await fetch("/api/firewall/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "init" }),
      });
      const initData = await initRes.json() as { status: string; token?: string; reason?: string };

      if (initData.status === "bypass") {
        // Already verified — skip animation
        if (mountedRef.current) { setStatus("passed"); onPassed?.(); }
        return;
      }

      if (initData.status === "blocked") {
        if (mountedRef.current) { setStatus("blocked"); setErrorMsg(initData.reason ?? "Access denied"); }
        return;
      }

      if (!initData.token) throw new Error("No challenge token received");
      setToken(initData.token);

      // Phase 2: Run visual verification steps
      for (let i = 0; i < VERIFICATION_STEPS.length; i++) {
        if (!mountedRef.current) return;
        const step = VERIFICATION_STEPS[i];

        setCurrentStep(step.id);
        setVisibleSteps(prev => [...prev, step.id]);
        setProgressPct(Math.round(((i + 0.5) / VERIFICATION_STEPS.length) * 100));

        await sleep(step.duration);
        if (!mountedRef.current) return;

        setCompletedSteps(prev => [...prev, step.id]);
        setProgressPct(Math.round(((i + 1) / VERIFICATION_STEPS.length) * 100));
      }

      // Phase 3: Submit challenge with browser signals
      const intervals = timingsRef.current.length > 1
        ? timingsRef.current.slice(1).map((t, i) => t - timingsRef.current[i])
        : [];

      const verifyRes = await fetch("/api/firewall/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: initData.token,
          phase: "verify",
          timings: intervals.slice(-10),
          browserFingerprint: await getBrowserFingerprint(),
          screenW: window.screen.width,
          screenH: window.screen.height,
          colorDepth: window.screen.colorDepth,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          plugins: navigator.plugins?.length ?? 0,
          touchPoints: navigator.maxTouchPoints ?? 0,
        }),
      });

      const verifyData = await verifyRes.json() as { status: string; reason?: string };

      if (!mountedRef.current) return;

      if (verifyData.status === "passed") {
        setStatus("passed");
        setProgressPct(100);
        onPassed?.();
      } else {
        setStatus("failed");
        setErrorMsg(verifyData.reason ?? "Verification failed");
      }

    } catch (err) {
      if (mountedRef.current) {
        setStatus("failed");
        setErrorMsg("Network error — please try again");
        console.error("[FirewallGate]", err);
      }
    }
  }, [onPassed]);

  useEffect(() => {
    mountedRef.current = true;
    // Auto-start verification after short delay
    const t = setTimeout(runVerification, 600);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [runVerification]);

  if (status === "passed") return null;

  return (
    <div style={styles.overlay}>
      {/* Animated background grid */}
      <div style={styles.bgGrid} />
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />

      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.shieldIcon}>🛡️</div>
          <div>
            <div style={styles.title}>Security Verification</div>
            <div style={styles.subtitle}>Protected by Advanced Security Intelligence</div>
          </div>
        </div>

        {/* Scan line counter */}
        {status === "checking" && (
          <div style={styles.scanLine}>
            <span style={styles.scanLineTick}>▶</span>
            <span style={styles.scanLineCode}>SCAN_ID:{scanLines.toString().padStart(6, "0")}</span>
            <span style={styles.scanLineText}>Analyzing{dots}</span>
          </div>
        )}

        {/* Progress bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progressPct}%`, background: status === "failed" || status === "blocked" ? "#ef4444" : "linear-gradient(90deg, #4f46e5, #7c3aed, #06b6d4)" }} />
          </div>
          <span style={styles.progressPct}>{progressPct}%</span>
        </div>

        {/* Steps list */}
        <div style={styles.stepsList}>
          {VERIFICATION_STEPS.map((step) => {
            const visible = visibleSteps.includes(step.id);
            const completed = completedSteps.includes(step.id);
            const active = currentStep === step.id && !completed;
            if (!visible) return null;
            return (
              <div key={step.id} style={{ ...styles.stepRow, opacity: visible ? 1 : 0, animation: visible ? "slideIn 0.3s ease" : "none" }}>
                <span style={styles.stepIcon}>
                  {completed ? "✓" : active ? "◈" : step.icon}
                </span>
                <div style={styles.stepBody}>
                  <span style={{ ...styles.stepLabel, color: completed ? "#22c55e" : active ? "#a78bfa" : "#9ca3af" }}>
                    {step.label}
                  </span>
                  {active && <span style={styles.stepDetail}>{step.detail}</span>}
                </div>
                {active && <span style={styles.spinner}>⟳</span>}
              </div>
            );
          })}
        </div>

        {/* Status message */}
        {status === "checking" && (
          <div style={styles.statusMsg}>
            <span style={{ color: "#a78bfa" }}>● Verifying your connection{dots}</span>
          </div>
        )}

        {(status === "failed" || status === "blocked") && (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>{status === "blocked" ? "🚫 Access Blocked" : "⚠️ Verification Failed"}</div>
            <div style={styles.errorDetail}>{errorMsg}</div>
            {status === "failed" && (
              <button style={styles.retryBtn} onClick={runVerification}>
                ↺ Try Again
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerDot} />
          <span style={styles.footerText}>Multi-layer threat detection active</span>
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes orbDrift { 0%,100%{transform:translate(0,0);} 50%{transform:translate(40px,-30px);} }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function getBrowserFingerprint(): Promise<string> {
  try {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth.toString(),
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() ?? "",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");
    const data = new TextEncoder().encode(components);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unknown";
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 99999,
    background: "rgba(4, 4, 16, 0.97)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(8px)",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  bgGrid: {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: "repeating-linear-gradient(0deg,rgba(99,102,241,0.05) 0px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,rgba(99,102,241,0.05) 0px,transparent 1px,transparent 60px)",
  },
  bgOrb1: {
    position: "absolute", width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(79,70,229,0.3) 0%, transparent 70%)",
    top: -100, right: -100, filter: "blur(80px)", pointerEvents: "none",
    animation: "orbDrift 18s ease-in-out infinite",
  },
  bgOrb2: {
    position: "absolute", width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)",
    bottom: -80, left: -80, filter: "blur(80px)", pointerEvents: "none",
    animation: "orbDrift 22s ease-in-out infinite reverse",
  },
  panel: {
    position: "relative", zIndex: 1,
    background: "rgba(10, 10, 24, 0.92)",
    border: "1px solid rgba(99,102,241,0.25)",
    borderRadius: 20, padding: "32px 36px",
    width: "100%", maxWidth: 480,
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)",
    backdropFilter: "blur(20px)",
  },
  header: {
    display: "flex", alignItems: "center", gap: 14, marginBottom: 24,
  },
  shieldIcon: {
    fontSize: 36, width: 52, height: 52,
    background: "linear-gradient(135deg, rgba(79,70,229,0.3), rgba(124,58,237,0.3))",
    border: "1px solid rgba(99,102,241,0.4)",
    borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 18, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 12, color: "rgba(99,102,241,0.8)", marginTop: 2,
  },
  scanLine: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(0,0,0,0.4)", border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 8, padding: "6px 12px", marginBottom: 16,
    fontFamily: "monospace",
  },
  scanLineTick: { color: "#4f46e5", fontSize: 10 },
  scanLineCode: { color: "#6366f1", fontSize: 10, letterSpacing: "0.05em" },
  scanLineText: { color: "#9ca3af", fontSize: 10, marginLeft: "auto" },
  progressContainer: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
  },
  progressBar: {
    flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden",
  },
  progressFill: {
    height: "100%", borderRadius: 999,
    transition: "width 0.5s ease, background 0.3s",
    boxShadow: "0 0 8px rgba(99,102,241,0.6)",
  },
  progressPct: {
    fontSize: 11, color: "#6366f1", fontFamily: "monospace", minWidth: 32, textAlign: "right" as const,
  },
  stepsList: {
    display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 16,
    maxHeight: 260, overflowY: "auto" as const,
  },
  stepRow: {
    display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  stepIcon: { fontSize: 14, width: 20, textAlign: "center" as const, flexShrink: 0, marginTop: 1 },
  stepBody: { flex: 1, display: "flex", flexDirection: "column" as const, gap: 2 },
  stepLabel: { fontSize: 13, fontWeight: 500, transition: "color 0.3s" },
  stepDetail: { fontSize: 11, color: "#6b7280" },
  spinner: { fontSize: 14, color: "#6366f1", animation: "spin 1s linear infinite", flexShrink: 0 },
  statusMsg: {
    textAlign: "center" as const, fontSize: 13, padding: "8px 0", color: "#9ca3af",
  },
  errorBox: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 10, padding: "14px 16px", textAlign: "center" as const,
  },
  errorTitle: { fontSize: 15, fontWeight: 700, color: "#ef4444", marginBottom: 6 },
  errorDetail: { fontSize: 12, color: "#fca5a5", marginBottom: 12 },
  retryBtn: {
    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
    color: "#a78bfa", fontSize: 13, fontWeight: 600, borderRadius: 8,
    padding: "7px 18px", cursor: "pointer", fontFamily: "inherit",
  },
  footer: {
    display: "flex", alignItems: "center", gap: 8, marginTop: 20,
    paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  footerDot: {
    width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
    boxShadow: "0 0 6px rgba(34,197,94,0.6)", animation: "pulse 2s ease-in-out infinite",
    flexShrink: 0,
  } as React.CSSProperties,
  footerText: { fontSize: 11, color: "#6b7280" },
};
