/**
 * scripts/wa-bot.js
 * ──────────────────────────────────────────────────────────────────────────
 * WhatsApp Bot Asli menggunakan @whiskeysockets/baileys
 * 
 * Cara menjalankan:
 *   node scripts/wa-bot.js
 *   node scripts/wa-bot.js --pairing-code    (gunakan pairing code)
 *   node scripts/wa-bot.js --qr              (gunakan QR code)
 *   node scripts/wa-bot.js --number 6282343769190 --pairing-code
 *
 * Jalankan TERPISAH dari Next.js (terminal berbeda), lalu buka admin panel.
 * Bot ini terhubung langsung ke server WhatsApp dan sync status ke Upstash Redis.
 * ──────────────────────────────────────────────────────────────────────────
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { createInterface } = require("readline");
const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// ── Konfigurasi ────────────────────────────────────────────────────────────
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const AUTH_DIR = path.join(__dirname, "../.wa-session");
const ADMIN_NUMBER = process.env.BOT_ADMIN_NUMBER || "6282343769190";

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const usePairingCode = args.includes("--pairing-code") || args.includes("--code");
const useQr = args.includes("--qr") || !usePairingCode;
const numberArgIdx = args.indexOf("--number");
const targetNumber = numberArgIdx !== -1 ? args[numberArgIdx + 1] : ADMIN_NUMBER;

// ── Redis Helper ────────────────────────────────────────────────────────────
async function redisSet(key, value) {
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const url = new URL(`${REDIS_URL}/set/${encodeURIComponent(key)}`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function redisGet(key) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${REDIS_URL}/get/${encodeURIComponent(key)}`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "GET", headers: { Authorization: `Bearer ${REDIS_TOKEN}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed?.result ?? null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function redisLPush(key, value) {
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const url = new URL(`${REDIS_URL}/lpush/${encodeURIComponent(key)}`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function redisLTrim(key, start, stop) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${REDIS_URL}/ltrim/${encodeURIComponent(key)}/${start}/${stop}`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}` } },
      (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(JSON.parse(d))); }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Update status bot ke Redis ──────────────────────────────────────────────
async function updateBotStatus(status, extra = {}) {
  const config = await redisGet("botwa:config") || {};
  await redisSet("botwa:config", {
    ...config,
    ...extra,
    status,
    lastActive: new Date().toISOString(),
  });
  console.log(`[Bot] Status diperbarui: ${status}`);
}

// ── Simpan log ke Redis ─────────────────────────────────────────────────────
async function saveLog(entry) {
  const existingRaw = await redisGet("botwa:logs");
  let existing = Array.isArray(existingRaw) ? existingRaw : [];
  existing.unshift(entry);
  if (existing.length > 100) existing = existing.slice(0, 100);
  await redisSet("botwa:logs", existing);
}

// ── Parse durasi premium dari text command ──────────────────────────────────
function parseDuration(durText) {
  const dur = durText.toLowerCase().trim();
  if (dur.includes("7 hari") || dur === "7d") return 7;
  if (dur.includes("30 hari") || dur === "30d") return 30;
  if (dur.includes("5 hari") || dur === "5d") return 5;
  if (dur.includes("1 tahun") || dur === "1y") return 365;
  const match = dur.match(/^(\d+)\s*(hari|day|days?)$/);
  if (match) return parseInt(match[1]);
  return null;
}

// ── Update user premium via Redis ───────────────────────────────────────────
async function grantPremium(email, durationDays, grantedByNumber) {
  const usersRaw = await redisGet("users");
  const users = Array.isArray(usersRaw) ? usersRaw : [];
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) return { ok: false, message: `❌ User dengan email *${email}* tidak ditemukan.` };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  users[idx].role = "premium";
  users[idx].premiumPlan = `${durationDays} Hari`;
  users[idx].premiumExpiresAt = expiresAt.toISOString();
  users[idx].premiumGrantedAt = now.toISOString();
  users[idx].premiumGrantedBy = grantedByNumber;

  await redisSet("users", users);

  // Kirim notif in-app ke user
  const notifKey = `adminmsg:user:${users[idx].id}`;
  const notif = {
    id: `prem_${Date.now()}`,
    title: "Selamat! Akses Premium Aktif",
    body: `Akses Premium ${durationDays} hari Anda kini aktif hingga ${expiresAt.toLocaleString("id-ID")}. Nikmati token unlimited dan semua fitur premium!`,
    type: "premium_activated",
    createdAt: now.toISOString(),
    read: false,
  };
  const existingNotifs = await redisGet(notifKey) || [];
  const notifList = Array.isArray(existingNotifs) ? [notif, ...existingNotifs] : [notif];
  await redisSet(notifKey, notifList);

  return {
    ok: true,
    message: `✅ *PREMIUM AKTIF!*\n\n👤 Email: *${email}*\n⏱️ Durasi: *${durationDays} hari*\n📅 Berakhir: *${expiresAt.toLocaleDateString("id-ID")}*\n🔑 Diberikan oleh: +${grantedByNumber}\n\n🎉 User sekarang dapat menikmati token *Unlimited* dan seluruh fitur premium!`,
  };
}

async function revokePremium(email, revokedByNumber) {
  const usersRaw = await redisGet("users");
  const users = Array.isArray(usersRaw) ? usersRaw : [];
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) return { ok: false, message: `❌ User dengan email *${email}* tidak ditemukan.` };

  users[idx].role = "user";
  users[idx].premiumPlan = null;
  users[idx].premiumExpiresAt = null;

  await redisSet("users", users);

  // Notif ke user
  const notifKey = `adminmsg:user:${users[idx].id}`;
  const notif = {
    id: `unprem_${Date.now()}`,
    title: "Akses Premium Dinonaktifkan",
    body: `Akses Premium Anda telah dinonaktifkan oleh admin. Anda kembali ke akun reguler dengan batas 100k token per hari.`,
    type: "premium_revoked",
    createdAt: new Date().toISOString(),
    read: false,
  };
  const existingNotifs = await redisGet(notifKey) || [];
  const notifList = Array.isArray(existingNotifs) ? [notif, ...existingNotifs] : [notif];
  await redisSet(notifKey, notifList);

  return {
    ok: true,
    message: `✅ *PREMIUM DINONAKTIFKAN*\n\n👤 Email: *${email}*\n🔕 User kembali ke akun reguler (100k token/hari).\n\nDiproses oleh: +${revokedByNumber}`,
  };
}

// ── Dapatkan daftar nomor admin berwenang ───────────────────────────────────
async function getAdminNumbers() {
  const raw = await redisGet("botwa:admin_numbers");
  const nums = Array.isArray(raw) ? raw : [ADMIN_NUMBER];
  return nums;
}

// ── Proses perintah masuk ───────────────────────────────────────────────────
async function processCommand(rawText, senderJid, sock) {
  const senderNumber = senderJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  const adminNumbers = await getAdminNumbers();
  const isAuthorized = adminNumbers.includes(senderNumber);

  const logEntry = {
    id: `log_${Date.now()}`,
    timestamp: new Date().toISOString(),
    senderNumber,
    rawText,
    command: rawText.split(" ")[0],
    status: isAuthorized ? "info" : "unauthorized",
    replyText: "",
  };

  if (!isAuthorized) {
    const reply = `⛔ *AKSES DITOLAK*\n\nNomor +${senderNumber} tidak terdaftar sebagai admin bot.\nHubungi admin sistem untuk mendapatkan akses.`;
    logEntry.replyText = reply;
    logEntry.status = "unauthorized";
    await saveLog(logEntry);
    await sock.sendMessage(senderJid, { text: reply });
    return;
  }

  const parts = rawText.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  let reply = "";

  // .prem <durasi> <email>
  if (cmd === ".prem") {
    if (parts.length < 3) {
      reply = `❌ *Format Salah!*\n\nGunakan:\n*.prem 7 hari email@domain.com*\n*.prem 30 hari email@domain.com*\n*.prem 1 tahun email@domain.com*`;
    } else {
      // Ambil email (selalu argumen terakhir)
      const email = parts[parts.length - 1];
      const durText = parts.slice(1, parts.length - 1).join(" ");
      const days = parseDuration(durText);

      if (!days) {
        reply = `❌ Durasi tidak valid: *${durText}*\n\nGunakan: *7 hari*, *30 hari*, *1 tahun*`;
      } else {
        const result = await grantPremium(email, days, senderNumber);
        reply = result.message;
        logEntry.status = result.ok ? "success" : "error";
        logEntry.targetEmail = email;
        logEntry.targetPlan = `${days} hari`;
      }
    }
  }
  // .unprem <email>
  else if (cmd === ".unprem") {
    if (parts.length < 2) {
      reply = `❌ *Format Salah!*\n\nGunakan:\n*.unprem email@domain.com*`;
    } else {
      const email = parts[1];
      const result = await revokePremium(email, senderNumber);
      reply = result.message;
      logEntry.status = result.ok ? "success" : "error";
      logEntry.targetEmail = email;
    }
  }
  // .status
  else if (cmd === ".status") {
    const usersRaw = await redisGet("users");
    const users = Array.isArray(usersRaw) ? usersRaw : [];
    const premiumUsers = users.filter(u => u.role === "premium");
    const now = new Date();
    const active = premiumUsers.filter(u => u.premiumExpiresAt && new Date(u.premiumExpiresAt) > now);
    reply = `📊 *STATUS BOT & SISTEM*\n━━━━━━━━━━━━━━━━━━━━━\n🤖 *Bot State*: Online & Siap Memproses\n👥 *Total User*: ${users.length}\n💎 *Premium Aktif*: ${active.length}\n⚡ *Role Handler*: .prem & .unprem Ready\n🔑 *Nomor Bot*: +${ADMIN_NUMBER}\n━━━━━━━━━━━━━━━━━━━━━`;
    logEntry.status = "info";
  }
  // .listprem
  else if (cmd === ".listprem") {
    const usersRaw = await redisGet("users");
    const users = Array.isArray(usersRaw) ? usersRaw : [];
    const now = new Date();
    const active = users.filter(u => u.role === "premium" && u.premiumExpiresAt && new Date(u.premiumExpiresAt) > now);
    if (active.length === 0) {
      reply = "💎 Belum ada pengguna premium aktif saat ini.";
    } else {
      reply = `💎 *DAFTAR PREMIUM AKTIF* (${active.length} akun)\n━━━━━━━━━━━━━━━━━━━━━\n`;
      active.forEach((u, i) => {
        const exp = new Date(u.premiumExpiresAt);
        const diffMs = exp - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        reply += `${i + 1}. *${u.email}*\n   Paket: ${u.premiumPlan || "?"} | Sisa: ${diffDays} hari\n   Habis: ${exp.toLocaleDateString("id-ID")}\n\n`;
      });
    }
    logEntry.status = "info";
  }
  // .help
  else if (cmd === ".help") {
    reply = `🤖 *BANTUAN PERINTAH BOT PREMIUM*\n━━━━━━━━━━━━━━━━━━━━━\n\n📌 *Pemberian Premium:*\n*.prem 7 hari email@domain.com*\n*.prem 30 hari email@domain.com*\n*.prem 1 tahun email@domain.com*\n\n📌 *Pencabutan Premium:*\n*.unprem email@domain.com*\n\n📌 *Informasi:*\n*.status* — Status bot & jumlah premium\n*.listprem* — Daftar semua premium aktif\n*.help* — Tampilkan bantuan ini\n\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ Hanya nomor admin berwenang yang dapat menggunakan perintah ini.`;
    logEntry.status = "info";
  }
  else {
    reply = `❓ Perintah tidak dikenal: *${cmd}*\n\nKetik *.help* untuk melihat daftar perintah yang tersedia.`;
    logEntry.status = "error";
  }

  logEntry.replyText = reply;
  await saveLog(logEntry);

  if (reply) {
    await sock.sendMessage(senderJid, { text: reply });
  }
}

// ── Main Bot Loop ───────────────────────────────────────────────────────────
async function startBot() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Stock AI Studio — WhatsApp Bot Asli (Baileys)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Metode: ${usePairingCode ? "Pairing Code" : "QR Code"}`);
  console.log(`  Nomor Target: +${targetNumber}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("❌ REDIS tidak dikonfigurasi. Pastikan .env.local berisi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN");
    process.exit(1);
  }

  // Buat folder session jika belum ada
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[Bot] Menggunakan Baileys WA v${version.join(".")}`);

  const logger = pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: !usePairingCode,
    browser: ["Stock AI Studio", "Chrome", "126.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  // ── Pairing Code Request ──
  if (usePairingCode && !sock.authState.creds.registered) {
    const cleanNumber = targetNumber.replace(/[^0-9]/g, "");
    console.log(`\n[Bot] Meminta pairing code untuk nomor +${cleanNumber}...\n`);
    await updateBotStatus("connecting", { pairingMethod: "code", targetNumber: cleanNumber });

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(cleanNumber);
        const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
        console.log("\n╔══════════════════════════════════════╗");
        console.log("║     KODE PENGAITAN WHATSAPP ANDA     ║");
        console.log(`║         ✦  ${formatted}  ✦          ║`);
        console.log("╚══════════════════════════════════════╝\n");
        console.log("Langkah selanjutnya:");
        console.log("  1. Buka WhatsApp di HP");
        console.log("  2. Ketuk Titik 3 (⋮) → Perangkat Tertaut");
        console.log("  3. Pilih Tautkan Perangkat → Tautkan via Nomor Telepon");
        console.log(`  4. Masukkan kode: ${formatted}\n`);

        // Simpan pairing code asli ke Redis agar panel admin bisa menampilkannya
        await updateBotStatus("code_ready", {
          pairingMethod: "code",
          targetNumber: cleanNumber,
          pairingCode: formatted,
        });
      } catch (err) {
        console.error("[Bot] Gagal mendapatkan pairing code:", err.message);
        await updateBotStatus("disconnected");
      }
    }, 3000);
  } else if (!usePairingCode) {
    // QR akan dicetak di terminal oleh printQRInTerminal: true
    await updateBotStatus("qr_ready", { pairingMethod: "qr", targetNumber });
    console.log("[Bot] Pindai QR Code di atas menggunakan kamera WhatsApp Anda.\n");
  }

  // ── Event: Credential Update ──
  sock.ev.on("creds.update", saveCreds);

  // ── Event: Connection Update ──
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Jika muncul QR Code baru, simpan ke Redis agar panel admin bisa render
    if (qr) {
      try {
        const QRCode = require("qrcode");
        const dataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: "H",
          margin: 2,
          scale: 8,
          color: { dark: "#030c1e", light: "#ffffff" },
        });
        await updateBotStatus("qr_ready", {
          pairingMethod: "qr",
          qrData: dataUrl,
          qrPayload: qr,
          qrGeneratedAt: new Date().toISOString(),
        });
        console.log("[Bot] QR Code baru disimpan ke Redis — buka panel admin untuk melihatnya.");
      } catch (e) {
        console.error("[Bot] Gagal generate QR dataUrl:", e.message);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`\n[Bot] Koneksi terputus (kode: ${statusCode}). Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log("[Bot] Mencoba reconnect dalam 5 detik...");
        await updateBotStatus("disconnected");
        setTimeout(startBot, 5000);
      } else {
        console.log("[Bot] Sesi dilogout. Hapus folder .wa-session dan jalankan ulang.");
        await updateBotStatus("disconnected");
        // Hapus session agar bisa pair ulang
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        process.exit(0);
      }
    } else if (connection === "open") {
      const myJid = sock.user?.id || "";
      const myNumber = myJid.split(":")[0].split("@")[0];
      console.log(`\n✅ [Bot] TERHUBUNG KE WHATSAPP! Nomor bot: +${myNumber}\n`);
      await updateBotStatus("connected", {
        connectedAt: new Date().toISOString(),
        qrData: null,
        pairingCode: null,
      });
    } else if (connection === "connecting") {
      console.log("[Bot] Menghubungkan ke server WhatsApp...");
      await updateBotStatus("connecting");
    }
  });

  // ── Event: Pesan Masuk ──
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      if (isJidBroadcast(msg.key.remoteJid)) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text.startsWith(".")) continue;

      console.log(`[Bot] Pesan masuk dari ${msg.key.remoteJid}: "${text}"`);
      await processCommand(text, msg.key.remoteJid, sock);
    }
  });
}

// ── Graceful Exit ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n[Bot] Menghentikan bot...");
  await updateBotStatus("disconnected");
  process.exit(0);
});

startBot().catch((err) => {
  console.error("[Bot] Fatal error:", err);
  process.exit(1);
});
