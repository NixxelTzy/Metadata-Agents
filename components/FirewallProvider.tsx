"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const FirewallGate = dynamic(() => import("./FirewallGate"), { ssr: false });

// Public paths — langsung bypass verifikasi
const PUBLIC_PATHS = ["/login", "/register"];

export default function FirewallProvider({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const isPublic    = PUBLIC_PATHS.some(p => pathname?.startsWith(p));
  const [verified, setVerified] = useState(false);
  const [checked,  setChecked]  = useState(false);
  const mountedRef = useRef(true);

  // Cek auth session saat mount
  useEffect(() => {
    mountedRef.current = true;

    // Public pages — langsung lolos tanpa verifikasi
    if (isPublic) { setVerified(true); setChecked(true); return; }

    const check = async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" });
        if (!mountedRef.current) return;
        if (res.ok) {
          // Sudah login → tampilkan app, FirewallGate akan muncul sebentar lalu pass
          setVerified(false); // Akan di-pass oleh FirewallGate
        } else {
          // Belum login → FirewallGate akan redirect ke login setelah selesai
          setVerified(false);
        }
      } catch {
        setVerified(false);
      } finally {
        if (mountedRef.current) setChecked(true);
      }
    };

    check();
    return () => { mountedRef.current = false; };
  }, [isPublic]);

  const handlePassed = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { method: "GET" });
      if (mountedRef.current) {
        if (res.ok) {
          setVerified(true);
        } else {
          // Belum login → redirect ke login
          window.location.replace("/login");
        }
      }
    } catch {
      if (mountedRef.current) window.location.replace("/login");
    }
  }, []);

  // Public pages — render langsung
  if (isPublic) return <>{children}</>;

  return (
    <>
      {/* Platform verifikasi putih — muncul saat belum verified */}
      {checked && !verified && (
        <FirewallGate onPassed={handlePassed} mode="normal" />
      )}

      {/* Konten app — tersembunyi sampai verified */}
      <div style={{ visibility: (checked && verified) ? "visible" : "hidden", height: "100%" }}>
        {children}
      </div>
    </>
  );
}
