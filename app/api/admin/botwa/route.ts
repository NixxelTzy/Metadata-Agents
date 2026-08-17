import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  getBotConfig, updateBotConfig, getAdminNumbers,
  addAdminNumber, removeAdminNumber, executeBotCommand,
  getBotLogs, getActivePremiumUsers, generateRealPairingCode,
  generateRealQrDataUrl, type PairingMethod
} from "@/lib/botwa";
import { checkAllUsersPremiumExpiry, getUserByEmail, createUser, sendUserInAppNotification } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

function checkAdmin(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) return null;
  return payload;
}

export async function GET(request: NextRequest) {
  const auth = checkAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden — Admin Access Required" }, { status: 403 });
  }

  try {
    // Run automated expiry check on GET
    await checkAllUsersPremiumExpiry().catch(() => {});

    let config = await getBotConfig();

    // If QR data is missing and in QR mode, generate real QR data url
    if (!config.qrData || !config.pairingCode) {
      const qrRes = await generateRealQrDataUrl(config.targetNumber);
      const pairingCode = config.pairingCode || generateRealPairingCode();
      config = await updateBotConfig({
        qrData: qrRes.dataUrl,
        qrPayload: qrRes.payload,
        qrGeneratedAt: new Date().toISOString(),
        pairingCode,
      });
    }

    const [adminNumbers, activePremiumUsers, logs] = await Promise.all([
      getAdminNumbers(),
      getActivePremiumUsers(),
      getBotLogs(),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      adminNumbers,
      activePremiumUsers,
      logs,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Bot WA GET error:", err);
    return NextResponse.json({ error: "Gagal memuat status bot" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = checkAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden — Admin Access Required" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action?: string;
      pairingMethod?: PairingMethod;
      targetNumber?: string;
      adminNumber?: string;
      commandText?: string;
      senderNumber?: string;
      email?: string;
      durationDays?: number;
    };

    const action = body.action;

    // ── Update Config / Pairing Method & Target Number ─────────────────────────
    if (action === "update_config") {
      const targetNumber = body.targetNumber || "6282343769190";
      const pairingMethod = body.pairingMethod || "code";
      const qrRes = await generateRealQrDataUrl(targetNumber);
      const pairingCode = generateRealPairingCode();

      const updated = await updateBotConfig({
        pairingMethod,
        targetNumber,
        qrData: qrRes.dataUrl,
        qrPayload: qrRes.payload,
        qrGeneratedAt: new Date().toISOString(),
        pairingCode,
      });
      return NextResponse.json({ ok: true, config: updated });
    }

    // ── Connect / Initiate Session ───────────────────────────────────────────
    if (action === "connect") {
      const method = body.pairingMethod || "code";
      const targetNumber = body.targetNumber || "6282343769190";
      const qrRes = await generateRealQrDataUrl(targetNumber);
      const pairingCode = generateRealPairingCode();

      const updated = await updateBotConfig({
        pairingMethod: method,
        targetNumber,
        status: "connected",
        pairingCode,
        qrData: qrRes.dataUrl,
        qrPayload: qrRes.payload,
        qrGeneratedAt: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, config: updated, message: "Bot WhatsApp berhasil dikaitkan dan aktif" });
    }

    // ── Refresh QR Code ───────────────────────────────────────────────────────
    if (action === "refresh_qr") {
      const cfg = await getBotConfig();
      const qrRes = await generateRealQrDataUrl(cfg.targetNumber);
      const updated = await updateBotConfig({
        qrData: qrRes.dataUrl,
        qrPayload: qrRes.payload,
        qrGeneratedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, config: updated, qrData: qrRes.dataUrl });
    }

    // ── Refresh Pairing Code ─────────────────────────────────────────────────
    if (action === "refresh_code") {
      const pairingCode = generateRealPairingCode();
      const updated = await updateBotConfig({
        pairingCode,
        lastActive: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, config: updated, pairingCode });
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    if (action === "disconnect") {
      const updated = await updateBotConfig({
        status: "disconnected",
        pairingCode: undefined,
        qrData: undefined,
      });
      return NextResponse.json({ ok: true, config: updated, message: "Bot diputuskan" });
    }

    // ── Add Admin Number ──────────────────────────────────────────────────────
    if (action === "add_admin_number") {
      if (!body.adminNumber) return NextResponse.json({ error: "Nomor admin wajib diisi" }, { status: 400 });
      const updated = await addAdminNumber(body.adminNumber);
      return NextResponse.json({ ok: true, adminNumbers: updated });
    }

    // ── Remove Admin Number ───────────────────────────────────────────────────
    if (action === "remove_admin_number") {
      if (!body.adminNumber) return NextResponse.json({ error: "Nomor admin wajib diisi" }, { status: 400 });
      const updated = await removeAdminNumber(body.adminNumber);
      return NextResponse.json({ ok: true, adminNumbers: updated });
    }

    // ── Execute / Test Bot Command ────────────────────────────────────────────
    if (action === "exec_command") {
      if (!body.commandText) return NextResponse.json({ error: "Command wajib diisi" }, { status: 400 });
      const sender = body.senderNumber || "6282343769190";
      const result = await executeBotCommand(sender, body.commandText);
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Check Expiries ────────────────────────────────────────────────────────
    if (action === "check_expiries") {
      const res = await checkAllUsersPremiumExpiry();
      return NextResponse.json({ ok: true, ...res });
    }

    // ── Quick Revoke Premium ─────────────────────────────────────────────────
    if (action === "revoke_prem") {
      if (!body.email) return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
      const res = await executeBotCommand("6282343769190", `.unprem ${body.email}`);
      return NextResponse.json({ ok: true, ...res });
    }

    // ── Quick Extend Premium ─────────────────────────────────────────────────
    if (action === "extend_prem") {
      if (!body.email) return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
      const days = body.durationDays || 30;
      const res = await executeBotCommand("6282343769190", `.prem ${days} hari ${body.email}`);
      return NextResponse.json({ ok: true, ...res });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (err) {
    console.error("Bot WA POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
