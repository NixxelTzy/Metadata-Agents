"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const FirewallGate = dynamic(() => import("./FirewallGate"), { ssr: false });

// Auth pages — tetap tampil verifikasi, tapi TIDAK redirect ke login setelah passed
const AUTH_PATHS = ["/login", "/register"];

export default function FirewallProvider({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const isAuthPage = AUTH_PATHS.some(p => pathname?.startsWith(p));

  // "gatePassed" = FirewallGate sudah selesai animasinya
  const [gatePassed, setGatePassed] = useState(false);
  // "appReady"   = konten boleh ditampilkan (gate passed + auth check selesai)
  const [appReady,   setAppReady]   = useState(false);
  const mountedRef = useRef(true);

  const handlePassed = useCallback(async () => {
    if (!mountedRef.current) return;

    // Auth pages (/login, /register) — langsung tampilkan halaman setelah gate selesai
    if (isAuthPage) {
      setGatePassed(true);
      setAppReady(true);
      return;
    }

    // Protected pages — cek session, redirect ke login kalau belum login
    try {
      const res = await fetch("/api/auth/me", { method: "GET" });
      if (!mountedRef.current) return;
      if (res.ok) {
        setGatePassed(true);
        setAppReady(true);
      } else {
        // Belum login → redirect ke login (gate tetap nutup layar saat redirect)
        window.location.replace("/login");
      }
    } catch {
      if (mountedRef.current) window.location.replace("/login");
    }
  }, [isAuthPage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <>
      {/* FirewallGate — selalu muncul di semua halaman sampai passed */}
      {!gatePassed && (
        <FirewallGate onPassed={handlePassed} mode="normal" />
      )}

      {/* Konten halaman — hanya tampil setelah gate passed & auth check selesai */}
      <div style={{ visibility: appReady ? "visible" : "hidden", height: "100%" }}>
        {children}
      </div>
    </>
  );
}
