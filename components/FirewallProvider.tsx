"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const FirewallGate = dynamic(() => import("./FirewallGate"), { ssr: false });

/**
 * FirewallProvider — wraps the entire app.
 *
 * Shows the FirewallGate challenge page to all visitors until they pass
 * the automatic verification. After passing, the gate disappears and the
 * app renders normally. The bypass cookie lasts 12 hours.
 *
 * Excluded paths:
 * - API routes (verified separately in each route handler)
 * - Static assets handled by Next.js
 */
export default function FirewallProvider({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [bypassChecked, setBypassChecked] = useState(false);

  // Check if we already have a valid bypass cookie/token
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/firewall/verify", { method: "GET" });
        const data = await res.json() as { verified?: boolean };
        setVerified(!!data.verified);
      } catch {
        // On network error, show the gate anyway
        setVerified(false);
      } finally {
        setBypassChecked(true);
      }
    };
    check();
  }, []);

  const handlePassed = useCallback(() => {
    setVerified(true);
  }, []);

  // During initial bypass check — show nothing (prevents flash)
  if (!bypassChecked) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#040410", zIndex: 99998,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 16, height: 16, border: "2px solid rgba(99,102,241,0.3)",
          borderTopColor: "#6366f1", borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {!verified && <FirewallGate onPassed={handlePassed} />}
      {/* Render children even while gate is showing — but gate overlay blocks interaction */}
      <div style={{ visibility: verified ? "visible" : "hidden", height: "100%" }}>
        {children}
      </div>
    </>
  );
}
