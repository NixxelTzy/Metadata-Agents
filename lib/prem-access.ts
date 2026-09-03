/**
 * lib/prem-access.ts
 * Dedicated Premium Access Management Engine
 * Handles:
 * - Command Execution:
 *   - prem <7 hari / 30 hari / 1 tahun> <email target>
 *   - unprem <email target>
 *   - list prem / listprem
 *   - help / status
 * - Automatic Expiration & Role Demotion
 * - Real-Time In-App Expiration Notifications
 * - Audit Logs & History
 */

import { Redis } from "@upstash/redis";
import { getRedisConfig } from "@/lib/config";
import {
  getUserByEmail, createUser, getAllUsers,
  appendActivityEvent, sendUserInAppNotification,
  checkAllUsersPremiumExpiry, type User
} from "@/lib/db";

const { url, token } = getRedisConfig();
const redis = new Redis({ url, token });

export const REDIS_KEY_PREM_LOGS = "prem_access:logs";

export interface ActivePremUser {
  id: string;
  email: string;
  username: string;
  role: string;
  premiumPlan: string;
  premiumExpiresAt: string;
  premiumGrantedAt?: string;
  premiumGrantedBy?: string;
  remainingDays: number;
  remainingHours: number;
  remainingMinutes: number;
  isExpired: boolean;
}

export interface PremLog {
  id: string;
  timestamp: string;
  adminEmail: string;
  command: string;
  rawText: string;
  status: "success" | "error" | "info";
  targetEmail?: string;
  targetPlan?: string;
  replyText: string;
}

export interface CommandResult {
  ok: boolean;
  status: "success" | "error" | "info";
  reply: string;
  targetEmail?: string;
  targetPlan?: string;
  log?: PremLog;
}

/**
 * Parse duration string into days and a clean label
 * Examples:
 * - "7 hari" / "7d" / "7 days" -> { days: 7, planLabel: "7 Hari" }
 * - "30 hari" / "30d" / "30 days" / "1 bulan" -> { days: 30, planLabel: "30 Hari" }
 * - "1 tahun" / "1y" / "1 year" / "365 hari" -> { days: 365, planLabel: "1 Tahun" }
 * - "5 hari" / "14 hari" -> { days: 5/14, planLabel: "N Hari" }
 */
export function parseDurationString(text: string): { days: number; planLabel: string } | null {
  const clean = text.trim().toLowerCase();

  if (clean === "7 hari" || clean === "7d" || clean === "7 days" || clean === "7hari") {
    return { days: 7, planLabel: "7 Hari" };
  }
  if (clean === "30 hari" || clean === "30d" || clean === "30 days" || clean === "30hari" || clean === "1 bulan") {
    return { days: 30, planLabel: "30 Hari" };
  }
  if (clean === "1 tahun" || clean === "1y" || clean === "1 year" || clean === "1thn" || clean === "12 bulan" || clean === "365 hari") {
    return { days: 365, planLabel: "1 Tahun" };
  }

  // Generic custom days: e.g. "5 hari", "14 hari", "90 hari"
  const match = clean.match(/^(\d+)\s*(hari|day|days|d)?$/);
  if (match) {
    const days = parseInt(match[1], 10);
    if (!isNaN(days) && days > 0 && days <= 3650) {
      return { days, planLabel: `${days} Hari` };
    }
  }

  return null;
}

/**
 * Grant premium access to a user
 */
export async function grantUserPremium(
  email: string,
  days: number,
  planLabel: string,
  adminEmail: string
): Promise<{ ok: boolean; user?: User; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  let user = await getUserByEmail(cleanEmail);

  const now = new Date();
  // If user is already premium and not expired, extend from existing expiry date
  let baseDate = now;
  if (user && user.role === "premium" && user.premiumExpiresAt) {
    const currentExpiry = new Date(user.premiumExpiresAt);
    if (currentExpiry > now) {
      baseDate = currentExpiry;
    }
  }

  const expiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

  if (cleanEmail === "nixxeltzy@gmail.com" || user?.role === "admin") {
    return {
      ok: true,
      user: user || undefined,
      message: `Akun ${cleanEmail} adalah Developer / Admin (Token AI Unlimited Permanen). Status akun ini dilindungi dan tidak dapat diubah.`,
    };
  }

  if (!user) {
    // If user does not exist yet, create a pending/registered user record
    const baseUsername = cleanEmail.split("@")[0] || "user";
    const tempId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    user = {
      id: tempId,
      email: cleanEmail,
      username: baseUsername,
      passwordHash: "",
      role: "premium",
      premiumPlan: planLabel,
      premiumExpiresAt: expiresAt.toISOString(),
      premiumGrantedAt: now.toISOString(),
      premiumGrantedBy: adminEmail,
      createdAt: now.toISOString(),
    };
  } else {
    user.role = "premium";
    user.premiumPlan = planLabel;
    user.premiumExpiresAt = expiresAt.toISOString();
    user.premiumGrantedAt = now.toISOString();
    user.premiumGrantedBy = adminEmail;
  }

  await createUser(user);

  // Send in-app notification to the recipient
  await sendUserInAppNotification(
    user,
    "Selamat! Akses Premium Anda Telah Aktif",
    `Akun Anda telah diaktifkan dengan Paket Premium (${planLabel}) oleh Admin hingga ${expiresAt.toLocaleString("id-ID")}. Nikmati pembuatan metadata dan token AI Unlimited tanpa batas harian!`,
    "Aktivasi Paket Premium"
  );

  // Append activity event
  await appendActivityEvent(
    user.id,
    user.email,
    user.username,
    "premium_granted",
    `Paket Premium (${planLabel}) aktif hingga ${expiresAt.toLocaleString("id-ID")} oleh ${adminEmail}`
  );

  return {
    ok: true,
    user,
    message: `Akses Premium (${planLabel}) berhasil diberikan kepada ${cleanEmail}. Aktif hingga ${expiresAt.toLocaleString("id-ID")}.`,
  };
}

/**
 * Revoke premium access immediately
 */
export async function revokeUserPremium(
  email: string,
  adminEmail: string
): Promise<{ ok: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(cleanEmail);

  if (!user) {
    return { ok: false, message: `User dengan email "${cleanEmail}" tidak ditemukan dalam database.` };
  }

  if (user.role === "admin" || cleanEmail === "nixxeltzy@gmail.com") {
    return { ok: false, message: `Akun ${cleanEmail} adalah Developer / Admin (Token AI Unlimited Permanen). Status akun ini dilindungi dan tidak dapat di-unprem atau diubah.` };
  }

  const oldPlan = user.premiumPlan || "Premium";
  user.role = "user";
  user.premiumPlan = undefined;
  user.premiumExpiresAt = undefined;

  await createUser(user);

  // Send notification to user
  await sendUserInAppNotification(
    user,
    "Akses Premium Anda Telah Dinonaktifkan",
    `Status paket premium Anda telah dinonaktifkan oleh administrator. Akun Anda kembali ke paket standar (200k token/hari). Anda dapat melakukan upgrade kembali sewaktu-waktu.`,
    "Pencabutan Akses Premium"
  );

  // Log activity
  await appendActivityEvent(
    user.id,
    user.email,
    user.username,
    "premium_revoked",
    `Akses premium (${oldPlan}) dicabut oleh ${adminEmail}. Role dikembalikan ke regular user.`
  );

  return {
    ok: true,
    message: `Akses Premium untuk ${cleanEmail} telah berhasil dicabut. Role dikembalikan ke regular user (200k token/hari).`,
  };
}

/**
 * Retrieve list of all currently active premium users with live countdowns
 */
export async function getActivePremList(): Promise<ActivePremUser[]> {
  // First run auto-expiration check
  await checkAllUsersPremiumExpiry().catch(() => {});

  const allUsers = await getAllUsers();
  const now = new Date();
  const active: ActivePremUser[] = [];

  for (const u of allUsers) {
    if (u.role === "premium" && u.premiumExpiresAt) {
      const expDate = new Date(u.premiumExpiresAt);
      const isExpired = now >= expDate;

      if (!isExpired) {
        const diffMs = expDate.getTime() - now.getTime();
        const totalMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingDays = Math.floor(totalHours / 24);
        const remainingHours = totalHours % 24;
        const remainingMinutes = totalMinutes % 60;

        active.push({
          id: u.id,
          email: u.email,
          username: u.username,
          role: u.role,
          premiumPlan: u.premiumPlan || "Custom",
          premiumExpiresAt: u.premiumExpiresAt,
          premiumGrantedAt: u.premiumGrantedAt,
          premiumGrantedBy: u.premiumGrantedBy,
          remainingDays,
          remainingHours,
          remainingMinutes,
          isExpired: false,
        });
      }
    }
  }

  // Sort by expiration ascending (soonest to expire first)
  active.sort((a, b) => new Date(a.premiumExpiresAt).getTime() - new Date(b.premiumExpiresAt).getTime());

  return active;
}

/**
 * Save execution log to Redis
 */
export async function appendPremLog(log: Omit<PremLog, "id">): Promise<PremLog> {
  const fullLog: PremLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...log,
  };

  try {
    const raw = await redis.get<PremLog[]>(REDIS_KEY_PREM_LOGS);
    let list: PremLog[] = Array.isArray(raw) ? raw : [];
    list.unshift(fullLog);
    if (list.length > 150) list = list.slice(0, 150);
    await redis.set(REDIS_KEY_PREM_LOGS, list);
  } catch (err) {
    console.error("appendPremLog error:", err);
  }

  return fullLog;
}

/**
 * Retrieve execution logs from Redis
 */
export async function getPremLogs(): Promise<PremLog[]> {
  try {
    const raw = await redis.get<PremLog[]>(REDIS_KEY_PREM_LOGS);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Main Command Executor for Prem Access Console
 * Commands:
 * - prem <7 hari / 30 hari / 1 tahun> <email>
 * - unprem <email>
 * - list prem / listprem
 * - help / status
 */
export async function executePremCommand(
  rawInput: string,
  adminEmail: string
): Promise<CommandResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: "error",
      reply: "Silakan masukkan perintah. Contoh: prem 30 hari user@gmail.com atau ketik 'help'.",
    };
  }

  // Normalize leading dots or slashes (e.g. ".prem", "/prem" -> "prem")
  let normalized = trimmed;
  if (normalized.startsWith(".") || normalized.startsWith("/")) {
    normalized = normalized.slice(1).trim();
  }

  const parts = normalized.split(/\s+/);
  const mainCmd = parts[0]?.toLowerCase();

  // ── 1. COMMAND: PREM <durasi> <email> ──────────────────────────────────────
  if (mainCmd === "prem") {
    if (parts.length < 3) {
      const reply = `❌ Format perintah tidak lengkap!\n\nFormat yang benar:\n• prem 7 hari <email target>\n• prem 30 hari <email target>\n• prem 1 tahun <email target>\n\nContoh: prem 30 hari user@gmail.com`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "prem",
        rawText: trimmed,
        status: "error",
        replyText: reply,
      });
      return { ok: false, status: "error", reply, log };
    }

    // Email is always the last parameter
    const targetEmail = parts[parts.length - 1]!.toLowerCase();
    const durationText = parts.slice(1, parts.length - 1).join(" ");

    // Basic email validation
    if (!targetEmail.includes("@") || !targetEmail.includes(".")) {
      const reply = `❌ Format email "${targetEmail}" tidak valid. Pastikan menulis alamat email yang benar.`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "prem",
        rawText: trimmed,
        status: "error",
        targetEmail,
        replyText: reply,
      });
      return { ok: false, status: "error", reply, targetEmail, log };
    }

    const parsedDur = parseDurationString(durationText);
    if (!parsedDur) {
      const reply = `❌ Durasi "${durationText}" tidak valid.\n\nPilihan durasi yang tersedia:\n• 7 hari (5k)\n• 30 hari (20k)\n• 1 tahun (80k)`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "prem",
        rawText: trimmed,
        status: "error",
        targetEmail,
        replyText: reply,
      });
      return { ok: false, status: "error", reply, targetEmail, log };
    }

    if (targetEmail === "nixxeltzy@gmail.com") {
      const reply = `👑 AKUN DEVELOPER TERLINDUNGI\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Email: nixxeltzy@gmail.com\n🛡️ Role: DEVELOPER / ADMIN\n⚡ Token AI: UNLIMITED PERMANEN\n🔒 Status akun Developer tidak dapat diubah atau dipengaruhi oleh perintah prem/unprem.`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "prem",
        rawText: trimmed,
        status: "info",
        targetEmail,
        replyText: reply,
      });
      return { ok: true, status: "info", reply, targetEmail, log };
    }

    const res = await grantUserPremium(targetEmail, parsedDur.days, parsedDur.planLabel, adminEmail);
    const expiresDate = res.user?.premiumExpiresAt
      ? new Date(res.user.premiumExpiresAt).toLocaleString("id-ID")
      : "-";

    const reply = `✅ BERHASIL MEMBERIKAN AKSES PREMIUM\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Email: ${targetEmail}\n📦 Paket: ${parsedDur.planLabel} (${parsedDur.days} Hari)\n⏳ Masa Berlaku Hingga: ${expiresDate}\n⚡ Token AI: UNLIMITED\n👑 Diberikan Oleh: ${adminEmail}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nNotifikasi in-app telah dikirimkan secara otomatis ke akun pengguna.`;

    const log = await appendPremLog({
      timestamp: new Date().toISOString(),
      adminEmail,
      command: "prem",
      rawText: trimmed,
      status: "success",
      targetEmail,
      targetPlan: parsedDur.planLabel,
      replyText: reply,
    });

    return {
      ok: true,
      status: "success",
      reply,
      targetEmail,
      targetPlan: parsedDur.planLabel,
      log,
    };
  }

  // ── 2. COMMAND: UNPREM <email> ─────────────────────────────────────────────
  if (mainCmd === "unprem") {
    if (parts.length < 2) {
      const reply = `❌ Format perintah tidak lengkap!\n\nFormat:\n• unprem <email target>\n\nContoh: unprem user@gmail.com`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "unprem",
        rawText: trimmed,
        status: "error",
        replyText: reply,
      });
      return { ok: false, status: "error", reply, log };
    }

    const targetEmail = parts[1]!.toLowerCase();

    if (targetEmail === "nixxeltzy@gmail.com") {
      const reply = `👑 AKUN DEVELOPER TERLINDUNGI\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Email: nixxeltzy@gmail.com\n🛡️ Role: DEVELOPER / ADMIN\n⚡ Token AI: UNLIMITED PERMANEN\n🔒 Akun Developer memiliki akses permanen penuh dan tidak dapat di-unprem.`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "unprem",
        rawText: trimmed,
        status: "info",
        targetEmail,
        replyText: reply,
      });
      return { ok: false, status: "info", reply, targetEmail, log };
    }

    const res = await revokeUserPremium(targetEmail, adminEmail);

    const reply = res.ok
      ? `✅ BERHASIL MENCABUT AKSES PREMIUM\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Email: ${targetEmail}\n🔕 Status: Regular User (Batas 200k token/hari)\n🛡️ Dicabut Oleh: ${adminEmail}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nNotifikasi in-app telah dikirimkan ke pengguna.`
      : `❌ GAGAL MENCABUT: ${res.message}`;

    const log = await appendPremLog({
      timestamp: new Date().toISOString(),
      adminEmail,
      command: "unprem",
      rawText: trimmed,
      status: res.ok ? "success" : "error",
      targetEmail,
      replyText: reply,
    });

    return {
      ok: res.ok,
      status: res.ok ? "success" : "error",
      reply,
      targetEmail,
      log,
    };
  }

  // ── 3. COMMAND: LIST PREM / LISTPREM / LIST ────────────────────────────────
  if (
    mainCmd === "listprem" ||
    mainCmd === "list" ||
    (mainCmd === "list" && parts[1]?.toLowerCase() === "prem") ||
    (parts[0]?.toLowerCase() === "list" && parts[1]?.toLowerCase() === "prem")
  ) {
    const list = await getActivePremList();

    if (list.length === 0) {
      const reply = `📋 DAFTAR PENGGUNA PREMIUM AKTIF (0 Akun)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSaat ini belum ada pengguna dengan akses premium yang aktif.`;
      const log = await appendPremLog({
        timestamp: new Date().toISOString(),
        adminEmail,
        command: "list prem",
        rawText: trimmed,
        status: "info",
        replyText: reply,
      });
      return { ok: true, status: "info", reply, log };
    }

    let reply = `📋 DAFTAR PENGGUNA PREMIUM AKTIF (${list.length} Akun)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    list.forEach((u, i) => {
      const exp = new Date(u.premiumExpiresAt).toLocaleString("id-ID");
      const remaining = u.remainingDays > 0
        ? `${u.remainingDays} hari ${u.remainingHours} jam`
        : `${u.remainingHours} jam ${u.remainingMinutes} menit`;

      reply += `${i + 1}. 👤 ${u.email}\n   📦 Paket: ${u.premiumPlan} | ⏳ Sisa: ${remaining}\n   📅 Expire: ${exp}\n\n`;
    });
    reply += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTotal: ${list.length} pengguna aktif`;

    const log = await appendPremLog({
      timestamp: new Date().toISOString(),
      adminEmail,
      command: "list prem",
      rawText: trimmed,
      status: "info",
      replyText: reply,
    });

    return { ok: true, status: "info", reply, log };
  }

  // ── 4. COMMAND: HELP / STATUS ──────────────────────────────────────────────
  if (mainCmd === "help" || mainCmd === "status") {
    const list = await getActivePremList();
    const reply = `⚡ PANDUAN COMMAND PREM ACCESS CONSOLE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1️⃣ Memberikan Akses Premium:\n   • prem 7 hari <email>\n   • prem 30 hari <email>\n   • prem 1 tahun <email>\n\n2️⃣ Mencabut Akses Premium:\n   • unprem <email>\n\n3️⃣ Melihat Daftar Premium Aktif:\n   • list prem\n\n4️⃣ Bantuan:\n   • help\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Status: ${list.length} akun premium sedang aktif. Sistem otomatis mencabut akses saat masa aktif habis.`;

    const log = await appendPremLog({
      timestamp: new Date().toISOString(),
      adminEmail,
      command: mainCmd,
      rawText: trimmed,
      status: "info",
      replyText: reply,
    });

    return { ok: true, status: "info", reply, log };
  }

  // ── Unknown Command ────────────────────────────────────────────────────────
  const reply = `❓ Perintah "${trimmed}" tidak dikenali.\n\nGunakan format:\n• prem <7 hari / 30 hari / 1 tahun> <email>\n• unprem <email>\n• list prem\n• help`;
  const log = await appendPremLog({
    timestamp: new Date().toISOString(),
    adminEmail,
    command: "unknown",
    rawText: trimmed,
    status: "error",
    replyText: reply,
  });

  return { ok: false, status: "error", reply, log };
}
