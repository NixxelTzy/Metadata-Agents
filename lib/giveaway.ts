/**
 * lib/giveaway.ts
 * Engine Platform Giveaway Otomatis (Token AI Unlimited 1 Minggu / 7 Hari)
 *
 * Fitur Utama:
 * - Kontrol Saklar ON / OFF
 * - Autonomous Server Daemon: Berjalan mandiri di server tanpa admin harus membuka dashboard
 * - Deteksi Hari & Jam Real-Time (WIB / Asia/Jakarta, UTC+7)
 * - Jadwal Otomatis: Setiap Hari Minggu pukul 10:00 WIB
 * - Proteksi Siklus: Tepat 1x seminggu (anti duplikasi via atomic Redis cycle lock)
 * - Hitungan Mundur (Countdown) ke Hari Minggu berikutnya
 * - Perhitungan Rasio Hoki Dinamis (Luck Percentage)
 * - Pemenang otomatis upgrade ke role "premium" (Unlimited Token 7 Hari)
 * - Notifikasi In-App langsung ke Kotak Masuk (Inbox) pemenang (tanpa popup tengah layar)
 * - Email laporan resmi otomatis terkirim ke nixxeltzy@gmail.com
 * - Audit Trail & Riwayat Pengundian tersimpan di Redis
 */

import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import {
  getAllUsers, createUser, sendUserInAppNotification,
  appendActivityEvent, type User
} from "@/lib/db";
import { sendGiveawayReportEmail, type GiveawayWinnerReport } from "@/lib/mailer";

const { url, token } = getRedisConfig();
const redis = new Redis({ url, token });

const REDIS_KEY_GIVEAWAY_CONFIG = "giveaway:config";
const REDIS_KEY_GIVEAWAY_HISTORY = "giveaway:history";
const ADMIN_EMAIL_PROTECTED = "nixxeltzy@gmail.com";

export interface GiveawayConfig {
  isEnabled: boolean;
  winnerCount: number;
  lastRunAt?: string;
  nextDrawAt?: string; // ISO — jadwal pengundian Hari Minggu berikutnya
  totalDraws: number;
  totalWinnersAwarded: number;
  updatedAt: string;
}

export interface CandidateUser {
  id: string;
  email: string;
  username: string;
  role: string;
  luckPercentage: number;
  isEligible: boolean;
  createdAt: string;
}

export interface GiveawayHistoryEntry {
  id: string;
  executedAt: string;
  executedBy: string;
  winnerCount: number;
  totalCandidates: number;
  winners: GiveawayWinnerReport[];
  emailSentToAdmin: boolean;
  emailError?: string;
  isAutoScheduled: boolean;
}

export interface ActiveGiveawayWinner {
  id: string;
  email: string;
  username: string;
  grantedAt: string;
  expiresAt: string;
  remainingDays: number;
  remainingHours: number;
  luckPercentage: number;
  isExpired: boolean;
}

export interface SundayEligibilityStatus {
  isEligible: boolean;
  reason: string;
  wibNow: {
    dayName: string;
    dayOfWeek: number; // 0=Minggu, 1=Senin, ..., 6=Sabtu
    hour: number;
    minute: number;
    dateKey: string; // "YYYY-MM-DD"
    fullFormatted: string;
  };
  isSunday: boolean;
  isTargetHourReached: boolean;
  alreadyExecutedThisSunday: boolean;
  isEnabled: boolean;
}

// ══════════════════════════════════════════════════════
//  TIME & FORENSIC ELIGIBILITY HELPERS (WIB / UTC+7)
// ══════════════════════════════════════════════════════

/**
 * Hitung target Hari Minggu berikutnya pukul 10:00 WIB (03:00 UTC)
 */
export function calculateNextSundayDraw(from?: Date): Date {
  const now = from ?? new Date();
  const wibOffset = 7 * 60; // +7 jam dalam menit
  const wibNow = new Date(now.getTime() + wibOffset * 60 * 1000);

  const dayOfWeek = wibNow.getUTCDay(); // 0 = Minggu
  const hourWIB = wibNow.getUTCHours();
  const minuteWIB = wibNow.getUTCMinutes();

  let daysUntilSunday: number;
  if (dayOfWeek === 0) {
    // Hari ini adalah Hari Minggu
    const isPastDrawTime = hourWIB > 10 || (hourWIB === 10 && minuteWIB >= 0);
    daysUntilSunday = isPastDrawTime ? 7 : 0; // Jika lewat 10:00 WIB, target Minggu depan
  } else {
    daysUntilSunday = 7 - dayOfWeek; // Sisa hari menuju Hari Minggu
  }

  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysUntilSunday);
  const targetWIB = new Date(target.getTime() + wibOffset * 60 * 1000);
  targetWIB.setUTCHours(3, 0, 0, 0); // 03:00 UTC = 10:00 WIB
  const nextSundayUTC = new Date(targetWIB.getTime() - wibOffset * 60 * 1000);

  return nextSundayUTC;
}

/**
 * Deteksi forensik waktu real-time:
 * Mengecek hari apa sekarang, jam berapa, menit berapa (dalam zona waktu WIB),
 * dan apakah sudah memenuhi semua syarat pengundian otomatis.
 */
export async function evaluateSundayGiveawayEligibility(): Promise<SundayEligibilityStatus> {
  const config = await getGiveawayConfig();

  const now = new Date();
  const wibOffsetMs = 7 * 60 * 60 * 1000;
  const wibDate = new Date(now.getTime() + wibOffsetMs);

  const dayOfWeek = wibDate.getUTCDay(); // 0 = Minggu, 1 = Senin, ...
  const hourWIB = wibDate.getUTCHours();
  const minuteWIB = wibDate.getUTCMinutes();
  const dateKey = wibDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = dayNames[dayOfWeek] || "Minggu";

  const isSunday = dayOfWeek === 0;
  const isTargetHourReached = isSunday && (hourWIB >= 10);

  // Cek apakah siklus hari Minggu ini sudah pernah dieksekusi
  const cycleLockKey = `giveaway:cycle:${dateKey}`;
  const cycleStatus = await redis.get<string>(cycleLockKey);
  const alreadyExecutedThisSunday = Boolean(cycleStatus);

  const fullFormatted = `${dayName}, ${wibDate.getUTCDate()} ${wibDate.toLocaleString("id-ID", { month: "long" })} ${wibDate.getUTCFullYear()} pukul ${String(hourWIB).padStart(2, "0")}:${String(minuteWIB).padStart(2, "0")} WIB`;

  let isEligible = false;
  let reason = "";

  if (!config.isEnabled) {
    reason = "Sistem giveaway sedang dinonaktifkan (OFF). Tekan tombol ON untuk mengaktifkan.";
  } else if (!isSunday) {
    reason = `Sekarang hari ${dayName} (bukan Hari Minggu). Sistem menunggu jadwal Hari Minggu pukul 10:00 WIB.`;
  } else if (!isTargetHourReached) {
    reason = `Hari ini Hari Minggu, namun jam saat ini (${String(hourWIB).padStart(2, "0")}:${String(minuteWIB).padStart(2, "0")} WIB) belum mencapai jam 10:00 WIB. Menunggu hitungan mundur selesai.`;
  } else if (alreadyExecutedThisSunday) {
    reason = `Pengundian giveaway untuk Hari Minggu ini (${dateKey}) telah sukses dieksekusi. Jadwal berikutnya Minggu depan.`;
  } else {
    isEligible = true;
    reason = `Semua syarat terpenuhi! Hari Minggu pukul ${String(hourWIB).padStart(2, "0")}:${String(minuteWIB).padStart(2, "0")} WIB dan belum diundi untuk siklus ${dateKey}.`;
  }

  return {
    isEligible,
    reason,
    wibNow: {
      dayName,
      dayOfWeek,
      hour: hourWIB,
      minute: minuteWIB,
      dateKey,
      fullFormatted,
    },
    isSunday,
    isTargetHourReached,
    alreadyExecutedThisSunday,
    isEnabled: config.isEnabled,
  };
}

// ══════════════════════════════════════════════════════
//  CONFIG CRUD
// ══════════════════════════════════════════════════════

export async function getGiveawayConfig(): Promise<GiveawayConfig> {
  try {
    const raw = await redis.get<GiveawayConfig>(REDIS_KEY_GIVEAWAY_CONFIG);
    if (raw && typeof raw.isEnabled === "boolean") {
      return {
        isEnabled: raw.isEnabled,
        winnerCount: Number(raw.winnerCount) || 5,
        lastRunAt: raw.lastRunAt,
        nextDrawAt: raw.nextDrawAt || calculateNextSundayDraw().toISOString(),
        totalDraws: Number(raw.totalDraws) || 0,
        totalWinnersAwarded: Number(raw.totalWinnersAwarded) || 0,
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error("[Giveaway] Error reading config:", err);
  }

  return {
    isEnabled: false,
    winnerCount: 5,
    nextDrawAt: calculateNextSundayDraw().toISOString(),
    totalDraws: 0,
    totalWinnersAwarded: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateGiveawayConfig(
  updates: Partial<Pick<GiveawayConfig, "isEnabled" | "winnerCount" | "nextDrawAt">>
): Promise<GiveawayConfig> {
  const current = await getGiveawayConfig();

  let nextDrawAt = current.nextDrawAt;
  if (updates.isEnabled === true) {
    nextDrawAt = calculateNextSundayDraw().toISOString();
  } else if (updates.isEnabled === false) {
    nextDrawAt = current.nextDrawAt;
  }

  const nextConfig: GiveawayConfig = {
    ...current,
    ...updates,
    nextDrawAt: updates.nextDrawAt ?? nextDrawAt,
    winnerCount: updates.winnerCount !== undefined
      ? Math.max(1, Math.min(50, updates.winnerCount))
      : current.winnerCount,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(REDIS_KEY_GIVEAWAY_CONFIG, nextConfig);
  return nextConfig;
}

// ══════════════════════════════════════════════════════
//  CANDIDATE & LUCK CALCULATION
// ══════════════════════════════════════════════════════

export function calculateCandidateLuck(user: User, cycleSeed: number): number {
  const combined = `${user.id}-${user.email}-${cycleSeed}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash) % 84;
  return 15 + normalized; // 15% – 98%
}

export async function getGiveawayCandidates(): Promise<CandidateUser[]> {
  const allUsers = await getAllUsers();
  const cycleSeed = Math.floor(Date.now() / (1000 * 60 * 10));

  const candidates: CandidateUser[] = [];

  for (const u of allUsers) {
    const isProtected =
      u.email.toLowerCase() === ADMIN_EMAIL_PROTECTED.toLowerCase() ||
      u.role === "admin";
    if (isProtected) continue;

    candidates.push({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      luckPercentage: calculateCandidateLuck(u, cycleSeed),
      isEligible: true,
      createdAt: u.createdAt,
    });
  }

  candidates.sort((a, b) => b.luckPercentage - a.luckPercentage);
  return candidates;
}

// ══════════════════════════════════════════════════════
//  CORE DRAW ENGINE
// ══════════════════════════════════════════════════════

export async function executeGiveawayDraw(
  adminEmail: string,
  targetWinnerCount?: number,
  isAutoScheduled = false
): Promise<{
  ok: boolean;
  message: string;
  winners: GiveawayWinnerReport[];
  config: GiveawayConfig;
  emailSent: boolean;
  emailError?: string;
}> {
  const config = await getGiveawayConfig();

  if (!config.isEnabled) {
    return {
      ok: false,
      message: "Sistem Giveaway sedang OFF. Aktifkan tombol ON terlebih dahulu.",
      winners: [],
      config,
      emailSent: false,
    };
  }

  const winnerQuota = targetWinnerCount ?? config.winnerCount;
  const allUsers = await getAllUsers();

  const candidates = allUsers.filter(
    (u) =>
      u.email.toLowerCase() !== ADMIN_EMAIL_PROTECTED.toLowerCase() &&
      u.role !== "admin"
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      message: "Tidak ada user yang memenuhi syarat untuk giveaway.",
      winners: [],
      config,
      emailSent: false,
    };
  }

  // Pengundian berdasarkan rasio hoki + RNG entropy
  const seed = Date.now();
  const scored = candidates.map((u) => {
    const base = calculateCandidateLuck(u, seed);
    const bonus = Math.floor(Math.random() * 20);
    return { user: u, luck: Math.min(99, Math.max(1, base + bonus)) };
  });

  scored.sort((a, b) => b.luck - a.luck);
  const selected = scored.slice(0, Math.min(winnerQuota, scored.length));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 Hari (1 Minggu)
  const expiryStr = expiresAt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const winnersReport: GiveawayWinnerReport[] = [];

  for (const item of selected) {
    const u = item.user;
    u.role = "premium";
    u.premiumPlan = "Giveaway Unlimited 7 Hari";
    u.premiumExpiresAt = expiresAt.toISOString();
    u.premiumGrantedAt = now.toISOString();
    u.premiumGrantedBy = isAutoScheduled ? "Auto Sunday Background Engine" : "Manual Lucky Draw";

    await createUser(u);

    // Notifikasi in-app privat di kotak masuk (tanpa popup tengah layar)
    await sendUserInAppNotification(
      u,
      "🎉 Selamat! Kamu Memenangkan Giveaway Token Unlimited 1 Minggu!",
      `Hoki berpihak padamu! Kamu terpilih dalam undian Giveaway${isAutoScheduled ? " Otomatis Hari Minggu" : " Lucky Draw"} dengan tingkat keberuntungan ${item.luck}%.\n\nAkunmu kini aktif dengan status Premium & Token AI Unlimited tanpa batas harian selama 7 hari penuh (hingga ${expiryStr}).\n\nNikmati pembuatan ribuan metadata microstock, vector AI, dan upscaler sepuasnya! 🎁`,
      "Giveaway Token Unlimited 7 Hari"
    );

    // Catat log aktivitas user
    await appendActivityEvent(
      u.id,
      u.email,
      u.username,
      "giveaway_won",
      `Menang Giveaway Token Unlimited 7 Hari (${item.luck}% Hoki). Aktif hingga ${expiryStr}.`
    );

    winnersReport.push({
      id: u.id,
      username: u.username,
      email: u.email,
      luckPercentage: item.luck,
      grantedUntil: expiresAt.toISOString(),
    });
  }

  // Kirim email laporan ke developer (nixxeltzy@gmail.com)
  let emailSent = false;
  let emailError: string | undefined;
  try {
    console.log("[Giveaway] Mengirim email laporan ke nixxeltzy@gmail.com ...");
    emailSent = await sendGiveawayReportEmail({
      winnerCount: winnersReport.length,
      winners: winnersReport,
      executedAt: now.toISOString(),
      totalCandidates: candidates.length,
      isAutoScheduled,
    });
    if (emailSent) {
      console.log("[Giveaway] ✅ Email laporan berhasil terkirim ke nixxeltzy@gmail.com");
    } else {
      emailError = "Email gagal terkirim — periksa GMAIL_USER & GMAIL_APP_PASSWORD di environment variables.";
      console.error("[Giveaway] ❌", emailError);
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error("[Giveaway] ❌ Exception saat kirim email laporan:", emailError);
  }

  // Jadwalkan Hari Minggu berikutnya
  const nextSunday = calculateNextSundayDraw(new Date(now.getTime() + 1000));
  const nextConfig: GiveawayConfig = {
    ...config,
    lastRunAt: now.toISOString(),
    nextDrawAt: nextSunday.toISOString(),
    totalDraws: config.totalDraws + 1,
    totalWinnersAwarded: config.totalWinnersAwarded + winnersReport.length,
    updatedAt: now.toISOString(),
  };
  await redis.set(REDIS_KEY_GIVEAWAY_CONFIG, nextConfig);

  // Simpan riwayat
  const historyEntry: GiveawayHistoryEntry = {
    id: `gw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    executedAt: now.toISOString(),
    executedBy: adminEmail,
    winnerCount: winnersReport.length,
    totalCandidates: candidates.length,
    winners: winnersReport,
    emailSentToAdmin: emailSent,
    emailError,
    isAutoScheduled,
  };

  try {
    const rawHist = await redis.get<GiveawayHistoryEntry[]>(REDIS_KEY_GIVEAWAY_HISTORY);
    let hist: GiveawayHistoryEntry[] = Array.isArray(rawHist) ? rawHist : [];
    hist.unshift(historyEntry);
    if (hist.length > 100) hist = hist.slice(0, 100);
    await redis.set(REDIS_KEY_GIVEAWAY_HISTORY, hist);
  } catch (err) {
    console.error("[Giveaway] Gagal simpan history:", err);
  }

  const nextSundayStr = nextSunday.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return {
    ok: true,
    message: `🎁 Giveaway berhasil! ${winnersReport.length} pemenang menerima Token Unlimited 7 Hari. Jadwal berikutnya: ${nextSundayStr}.`,
    winners: winnersReport,
    config: nextConfig,
    emailSent,
    emailError,
  };
}

// ══════════════════════════════════════════════════════
//  AUTONOMOUS ENGINE (Mendeteksi Hari, Jam & Eksekusi)
// ══════════════════════════════════════════════════════

/**
 * Memeriksa hari & jam secara otomatis.
 * Jika hari Minggu $\ge$ 10:00 WIB dan belum pernah dieksekusi di siklus Minggu ini,
 * sistem langsung mengeksekusi pengundian otomatis tanpa admin harus buka panel!
 */
export async function checkAndAutoExecuteIfDue(): Promise<{
  executed: boolean;
  reason: string;
  result?: Awaited<ReturnType<typeof executeGiveawayDraw>>;
}> {
  try {
    const status = await evaluateSundayGiveawayEligibility();

    if (!status.isEligible) {
      return { executed: false, reason: status.reason };
    }

    // Gunakan atomic Redis lock untuk mencegah race condition
    const cycleLockKey = `giveaway:cycle:${status.wibNow.dateKey}`;
    const acquired = await redis.set(cycleLockKey, "in_progress", { nx: true, ex: 86400 * 14 });

    if (!acquired) {
      return {
        executed: false,
        reason: `Siklus Hari Minggu ${status.wibNow.dateKey} sedang atau telah diproses oleh worker lain.`,
      };
    }

    console.log(`[GiveawayAuto] 🎯 Kriteria terpenuhi! Otomatis menjalankan Giveaway Hari Minggu (${status.wibNow.dateKey} pukul ${status.wibNow.hour}:${status.wibNow.minute} WIB) secara mandiri di background server...`);

    const result = await executeGiveawayDraw("Sistem Otomatis Server (Auto Sunday Engine)", undefined, true);
    await redis.set(cycleLockKey, "completed", { ex: 86400 * 14 });

    return { executed: true, reason: status.reason, result };
  } catch (err) {
    console.error("[GiveawayAuto] Error auto-execute check:", err);
    return { executed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ══════════════════════════════════════════════════════
//  BACKGROUND DAEMON RUNNER (Memeriksa setiap 60 detik)
// ══════════════════════════════════════════════════════

let daemonStarted = false;
let daemonInterval: NodeJS.Timeout | null = null;

/**
 * Menjalankan background worker di runtime server Node.js.
 * Berjalan terus menerus setiap 60 detik untuk mendeteksi hari dan jam secara otomatis.
 */
export function startGiveawayAutonomousDaemon(): void {
  if (daemonStarted) return;
  daemonStarted = true;

  console.log("[GiveawayDaemon] 🤖 Autonomous Sunday Giveaway Daemon diaktifkan (memeriksa hari & jam setiap 60 detik)...");

  // Pemeriksaan saat server pertama kali hidup
  setTimeout(() => {
    checkAndAutoExecuteIfDue().catch((e) => console.error("[GiveawayDaemon] Startup check error:", e));
  }, 5000);

  // Pemeriksaan berulang setiap 60 detik
  daemonInterval = setInterval(async () => {
    try {
      await checkAndAutoExecuteIfDue();
    } catch (err) {
      console.error("[GiveawayDaemon] Interval tick error:", err);
    }
  }, 60_000);

  if (daemonInterval && typeof daemonInterval.unref === "function") {
    daemonInterval.unref();
  }
}

// Inisialisasi otomatis jika dijalankan di environment Node.js
if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs") {
  startGiveawayAutonomousDaemon();
}

// ══════════════════════════════════════════════════════
//  QUERY HELPERS
// ══════════════════════════════════════════════════════

export async function getActiveGiveawayWinners(): Promise<ActiveGiveawayWinner[]> {
  const allUsers = await getAllUsers();
  const now = new Date();
  const active: ActiveGiveawayWinner[] = [];

  for (const u of allUsers) {
    if (
      u.role === "premium" &&
      u.premiumPlan?.includes("Giveaway") &&
      u.premiumExpiresAt
    ) {
      const expDate = new Date(u.premiumExpiresAt);
      if (now >= expDate) continue;

      const diffMs = expDate.getTime() - now.getTime();
      const totalHours = Math.floor(diffMs / (1000 * 3600));
      const remainingDays = Math.floor(totalHours / 24);
      const remainingHours = totalHours % 24;

      active.push({
        id: u.id,
        email: u.email,
        username: u.username,
        grantedAt: u.premiumGrantedAt || u.createdAt,
        expiresAt: u.premiumExpiresAt,
        remainingDays,
        remainingHours,
        luckPercentage: 0,
        isExpired: false,
      });
    }
  }

  return active;
}

export async function getGiveawayHistory(): Promise<GiveawayHistoryEntry[]> {
  try {
    const raw = await redis.get<GiveawayHistoryEntry[]>(REDIS_KEY_GIVEAWAY_HISTORY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
