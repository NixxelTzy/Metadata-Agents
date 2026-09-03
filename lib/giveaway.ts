/**
 * lib/giveaway.ts
 * Engine Platform Giveaway Otomatis (Token AI Unlimited 1 Minggu / 7 Hari)
 *
 * Fitur:
 * - Kontrol Saklar ON / OFF
 * - Input Jumlah Pemenang (Default: 5 Orang)
 * - Perhitungan Rasio Hoki Dinamis (Luck Percentage)
 * - Upgrade Akun Pemenang ke Status Premium Unlimited 7 Hari
 * - Notifikasi In-App Langsung ke Kotak Masuk (Tanpa popup di tengah layar)
 * - Pengiriman Email Laporan Otomatis ke nixxeltzy@gmail.com
 * - Audit Trail & Riwayat Pengundian Tersimpan di Redis
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

export interface GiveawayConfig {
  isEnabled: boolean;
  winnerCount: number;
  lastRunAt?: string;
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

/**
 * Get current giveaway configuration
 */
export async function getGiveawayConfig(): Promise<GiveawayConfig> {
  try {
    const raw = await redis.get<GiveawayConfig>(REDIS_KEY_GIVEAWAY_CONFIG);
    if (raw && typeof raw.isEnabled === "boolean") {
      return {
        isEnabled: raw.isEnabled,
        winnerCount: Number(raw.winnerCount) || 5,
        lastRunAt: raw.lastRunAt,
        totalDraws: Number(raw.totalDraws) || 0,
        totalWinnersAwarded: Number(raw.totalWinnersAwarded) || 0,
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error("Error reading giveaway config:", err);
  }

  // Default initial configuration
  return {
    isEnabled: false,
    winnerCount: 5,
    totalDraws: 0,
    totalWinnersAwarded: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update giveaway config (Toggle ON/OFF, change winner count)
 */
export async function updateGiveawayConfig(
  updates: Partial<Pick<GiveawayConfig, "isEnabled" | "winnerCount">>
): Promise<GiveawayConfig> {
  const current = await getGiveawayConfig();
  const nextConfig: GiveawayConfig = {
    ...current,
    ...updates,
    winnerCount: updates.winnerCount !== undefined ? Math.max(1, Math.min(50, updates.winnerCount)) : current.winnerCount,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(REDIS_KEY_GIVEAWAY_CONFIG, nextConfig);
  return nextConfig;
}

/**
 * Deterministically and semi-randomly calculate luck percentage (1% - 99%)
 * Every candidate receives a distinct luck ratio based on their identity + current cycle seed
 */
export function calculateCandidateLuck(user: User, cycleSeed: number): number {
  const combined = `${user.id}-${user.email}-${cycleSeed}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }

  // Generate luck percentage between 15% and 98%
  const normalized = Math.abs(hash) % 84; // 0 - 83
  const luck = 15 + normalized;
  return luck;
}

/**
 * Fetch candidates and compute dynamic luck rates
 */
export async function getGiveawayCandidates(): Promise<CandidateUser[]> {
  const allUsers = await getAllUsers();
  const cycleSeed = Math.floor(Date.now() / (1000 * 60 * 10)); // updates slightly every 10 mins

  const candidates: CandidateUser[] = [];

  for (const u of allUsers) {
    // Admins are not candidates for regular user giveaways
    const isDeveloperOrAdmin = u.email.toLowerCase() === "nixxeltzy@gmail.com" || u.role === "admin";
    if (isDeveloperOrAdmin) continue;

    const luck = calculateCandidateLuck(u, cycleSeed);

    candidates.push({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      luckPercentage: luck,
      isEligible: true,
      createdAt: u.createdAt,
    });
  }

  // Sort descending by luck percentage
  candidates.sort((a, b) => b.luckPercentage - a.luckPercentage);
  return candidates;
}

/**
 * Execute Lucky Draw Giveaway
 * - Checks if ON
 * - Picks top N candidates sorted by luck roll
 * - Grants 7 days Unlimited token access (role: premium)
 * - Sends non-intrusive in-app notification directly into user inbox
 * - Sends report email to nixxeltzy@gmail.com
 * - Logs to history
 */
export async function executeGiveawayDraw(
  adminEmail: string,
  targetWinnerCount?: number
): Promise<{
  ok: boolean;
  message: string;
  winners: GiveawayWinnerReport[];
  config: GiveawayConfig;
}> {
  const config = await getGiveawayConfig();

  if (!config.isEnabled) {
    return {
      ok: false,
      message: "Sistem Giveaway sedang OFF. Silakan aktifkan tombol ON terlebih dahulu.",
      winners: [],
      config,
    };
  }

  const winnerQuota = targetWinnerCount !== undefined ? targetWinnerCount : config.winnerCount;
  const allUsers = await getAllUsers();

  // Filter eligible non-admin candidates
  const candidates = allUsers.filter(
    (u) => u.email.toLowerCase() !== "nixxeltzy@gmail.com" && u.role !== "admin"
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      message: "Tidak ada user terdaftar yang memenuhi syarat untuk giveaway.",
      winners: [],
      config,
    };
  }

  // Roll luck with high-entropy RNG + candidate base luck
  const seed = Date.now();
  const scoredCandidates = candidates.map((u) => {
    const baseLuck = calculateCandidateLuck(u, seed);
    // Add random dice roll bonus (0 to 20)
    const rollBonus = Math.floor(Math.random() * 20);
    const finalLuck = Math.min(99, Math.max(1, baseLuck + rollBonus));
    return { user: u, luck: finalLuck };
  });

  // Sort by highest luck score
  scoredCandidates.sort((a, b) => b.luck - a.luck);

  // Take top N winners
  const selected = scoredCandidates.slice(0, Math.min(winnerQuota, scoredCandidates.length));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days (1 week)
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
    u.premiumGrantedBy = "Automated Giveaway Platform";

    await createUser(u);

    // Send in-app notification directly into user's private message inbox
    // (Non-intrusive: appears in inbox / bell banner, NEVER modal popup in center of screen)
    await sendUserInAppNotification(
      u,
      "🎉 Selamat! Kamu Memenangkan Giveaway Token Unlimited 1 Minggu!",
      `Hoki berpihak padamu! Kamu berhasil terpilih dalam undian Giveaway Otomatis dengan tingkat hoki ${item.luck}%. Akunmu kini aktif dengan status Premium & Token AI Unlimited tanpa batas harian selama 7 hari penuh (hingga ${expiryStr}). Nikmati pembuatan ribuan metadata, vector, dan upscale sepuasnya!`,
      "Giveaway Token Unlimited 7 Hari"
    );

    // Log user activity
    await appendActivityEvent(
      u.id,
      u.email,
      u.username,
      "giveaway_won",
      `Memenangkan Giveaway Token Unlimited 7 Hari (${item.luck}% Hoki). Aktif hingga ${expiryStr}.`
    );

    winnersReport.push({
      id: u.id,
      username: u.username,
      email: u.email,
      luckPercentage: item.luck,
      grantedUntil: expiresAt.toISOString(),
    });
  }

  // Send email report to nixxeltzy@gmail.com
  let emailSent = false;
  try {
    emailSent = await sendGiveawayReportEmail({
      winnerCount: winnersReport.length,
      winners: winnersReport,
      executedAt: now.toISOString(),
      totalCandidates: candidates.length,
    });
  } catch (err) {
    console.error("Failed to send giveaway email report:", err);
  }

  // Update config stats
  const nextConfig: GiveawayConfig = {
    ...config,
    lastRunAt: now.toISOString(),
    totalDraws: config.totalDraws + 1,
    totalWinnersAwarded: config.totalWinnersAwarded + winnersReport.length,
    updatedAt: now.toISOString(),
  };
  await redis.set(REDIS_KEY_GIVEAWAY_CONFIG, nextConfig);

  // Save draw record to history
  const historyEntry: GiveawayHistoryEntry = {
    id: `gw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    executedAt: now.toISOString(),
    executedBy: adminEmail,
    winnerCount: winnersReport.length,
    totalCandidates: candidates.length,
    winners: winnersReport,
    emailSentToAdmin: emailSent,
  };

  try {
    const rawHist = await redis.get<GiveawayHistoryEntry[]>(REDIS_KEY_GIVEAWAY_HISTORY);
    let hist: GiveawayHistoryEntry[] = Array.isArray(rawHist) ? rawHist : [];
    hist.unshift(historyEntry);
    if (hist.length > 50) hist = hist.slice(0, 50);
    await redis.set(REDIS_KEY_GIVEAWAY_HISTORY, hist);
  } catch (err) {
    console.error("Failed to save giveaway history:", err);
  }

  return {
    ok: true,
    message: `Berhasil mengundi dan memberikan Giveaway Token Unlimited 7 Hari kepada ${winnersReport.length} pemenang! Email laporan telah dikirimkan ke nixxeltzy@gmail.com.`,
    winners: winnersReport,
    config: nextConfig,
  };
}

/**
 * Get list of currently active giveaway winners
 */
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
      const isExpired = now >= expDate;

      if (!isExpired) {
        const diffMs = expDate.getTime() - now.getTime();
        const totalMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
        const totalHours = Math.floor(totalMinutes / 60);
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
          luckPercentage: 85, // estimate
          isExpired: false,
        });
      }
    }
  }

  return active;
}

/**
 * Get past giveaway history
 */
export async function getGiveawayHistory(): Promise<GiveawayHistoryEntry[]> {
  try {
    const raw = await redis.get<GiveawayHistoryEntry[]>(REDIS_KEY_GIVEAWAY_HISTORY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
