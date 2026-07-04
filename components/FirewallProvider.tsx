"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const FirewallGate = dynamic(() => import("./FirewallGate"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationMode = "strict" | "normal" | "off";

interface FirewallState {
  verified: boolean;
  verificationMode: VerificationMode;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  showBanner: boolean;
  bannerMsg: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export default function FirewallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FirewallState>({
    verified: false,
    verificationMode: "normal",
    riskLevel: "none",
    showBanner: false,
    bannerMsg: "",
  });
  const [checked, setChecked] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Initial bypass check + fetch AI mode ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const init = async () => {
      try {
        const res  = await fetch("/api/firewall/verify", { method: "GET" });
        const data = await res.json() as {
          verified?: boolean;
          verificationMode?: VerificationMode;
          riskLevel?: string;
        };

        if (!mountedRef.current) return;

        const mode  = data.verificationMode ?? "normal";
        const risk  = (data.riskLevel ?? "none") as FirewallState["riskLevel"];
        const verified = !!data.verified;

        setState(s => ({
          ...s,
          verified,
          verificationMode: mode,
          riskLevel: risk,
          showBanner: risk === "high" || risk === "critical",
          bannerMsg: risk === "critical"
            ? "⚠️ Tingkat ancaman kritis terdeteksi. Sistem perlindungan aktif."
            : risk === "high"
            ? "🛡️ Aktivitas mencurigakan terdeteksi. Pemantauan diperketat."
            : "",
        }));
      } catch {
        if (mountedRef.current) setState(s => ({ ...s, verified: false }));
      } finally {
        if (mountedRef.current) setChecked(true);
      }
    };
    init();
    return () => { mountedRef.current = false; };
  }, []);

  // ── Poll AI state every 60s (re-challenge if mode tightened) ──────────────
  useEffect(() => {
    if (!checked) return;

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res  = await fetch("/api/firewall/verify", { method: "GET" });
        const data = await res.json() as {
          verified?: boolean;
          verificationMode?: VerificationMode;
          riskLevel?: string;
          forceReVerify?: boolean;
        };

        if (!mountedRef.current) return;

        const mode = data.verificationMode ?? "normal";
        const risk = (data.riskLevel ?? "none") as FirewallState["riskLevel"];

        setState(s => {
          // If AI switched to strict mode — force re-verification
          const needsReverify = data.forceReVerify === true
            || (mode === "strict" && s.verificationMode !== "strict" && s.verified);

          return {
            ...s,
            verified: needsReverify ? false : s.verified,
            verificationMode: mode,
            riskLevel: risk,
            showBanner: risk === "high" || risk === "critical",
            bannerMsg: risk === "critical"
              ? "⚠️ Tingkat ancaman kritis. Sistem perlindungan penuh aktif."
              : risk === "high"
              ? "🛡️ Aktivitas mencurigakan terpantau. Sistem waspada."
              : "",
          };
        });
      } catch { /* silent */ }
    };

    pollRef.current = setInterval(poll, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checked]);

  const handlePassed = useCallback(() => {
    setState(s => ({ ...s, verified: true }));
  }, []);

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (!checked) {
    return <FirewallLoadingScreen />;
  }

  return (
    <>
      {/* Challenge gate */}
      {!state.verified && (
        <FirewallGate
          onPassed={handlePassed}
          mode={state.verificationMode}
        />
      )}

      {/* App content */}
      <div style={{ visibility: state.verified ? "visible" : "hidden", height: "100%" }}>
        {/* Threat level banner */}
        {state.verified && state.showBanner && (
          <ThreatBanner
            msg={state.bannerMsg}
            level={state.riskLevel}
            onDismiss={() => setState(s => ({ ...s, showBanner: false }))}
          />
        )}
        {children}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FirewallLoadingScreen() {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#050510", zIndex: 99998,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        width: 18, height: 18,
        border: "2px solid rgba(99,102,241,0.3)",
        borderTopColor: "#6366f1",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
        Menginisialisasi sistem keamanan...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ThreatBanner({
  msg, level, onDismiss,
}: {
  msg: string;
  level: "high" | "critical" | string;
  onDismiss: () => void;
}) {
  const isCritical = level === "critical";
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: isCritical
        ? "linear-gradient(90deg,rgba(239,68,68,0.95),rgba(220,38,38,0.95))"
        : "linear-gradient(90deg,rgba(245,158,11,0.95),rgba(217,119,6,0.95))",
      color: "white",
      padding: "10px 20px",
      display: "flex", alignItems: "center", gap: 12,
      fontSize: 13, fontWeight: 500,
      backdropFilter: "blur(8px)",
      boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
          color: "white", borderRadius: 6, padding: "3px 10px", fontSize: 11,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Tutup
      </button>
    </div>
  );
}
