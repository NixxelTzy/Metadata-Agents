"use client";

import { useEffect } from "react";

/**
 * GiveawayAutoRunner
 * Komponen invisible background heartbeat.
 * Berjalan otomatis di browser setiap pengguna aktif (admin, user, maupun pengunjung).
 * Melakukan ping berkala ke /api/cron/giveaway setiap 3 menit.
 * Begitu waktu mencapai Hari Minggu >= 10:00 WIB, request ini akan otomatis
 * memicu pengundian giveaway di server tanpa admin harus membuka panel giveaway.
 */
export default function GiveawayAutoRunner() {
  useEffect(() => {
    // Jalankan ping pertama setelah 3 detik agar tidak menghambat initial render
    const initialTimer = setTimeout(() => {
      fetch("/api/cron/giveaway", { method: "GET" }).catch(() => {});
    }, 3000);

    // Heartbeat berulang setiap 3 menit (180 detik)
    const interval = setInterval(() => {
      fetch("/api/cron/giveaway", { method: "GET" }).catch(() => {});
    }, 180_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  return null;
}
