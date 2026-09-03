import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  getGiveawayConfig, updateGiveawayConfig, getGiveawayCandidates,
  executeGiveawayDraw, getActiveGiveawayWinners, getGiveawayHistory,
  checkAndAutoExecuteIfDue, evaluateSundayGiveawayEligibility,
} from "@/lib/giveaway";
import { revokeUserPremium } from "@/lib/prem-access";
import { checkAllUsersPremiumExpiry } from "@/lib/db";

export const runtime = "nodejs";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

function checkAdmin(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return null;
  return payload;
}

export async function GET(request: NextRequest) {
  const auth = checkAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin Developer" }, { status: 403 });
  }

  try {
    // Check auto-expiry
    await checkAllUsersPremiumExpiry().catch(() => {});

    // ── Auto-execute if scheduled draw time has arrived ──
    let autoResult: Awaited<ReturnType<typeof checkAndAutoExecuteIfDue>> | null = null;
    try {
      autoResult = await checkAndAutoExecuteIfDue();
    } catch (err) {
      console.error("Error in auto-execute check:", err);
    }

    const [config, candidates, activeWinners, history, eligibilityStatus] = await Promise.all([
      getGiveawayConfig(),
      getGiveawayCandidates(),
      getActiveGiveawayWinners(),
      getGiveawayHistory(),
      evaluateSundayGiveawayEligibility(),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      candidates,
      activeWinners,
      history,
      eligibilityStatus,
      // Report auto-execution to client so it can show a notification
      autoExecuted: autoResult?.executed ?? false,
      autoResult: autoResult?.executed ? autoResult.result : undefined,
    });
  } catch (err) {
    console.error("GET /api/admin/giveaway error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan server saat memuat data giveaway" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = checkAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin Developer" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    // 1. TOGGLE ON / OFF
    if (action === "toggle") {
      const isEnabled = Boolean(body.isEnabled);
      const updatedConfig = await updateGiveawayConfig({ isEnabled });
      return NextResponse.json({
        ok: true,
        message: isEnabled
          ? `Sistem Giveaway Aktif (ON) — Pengundian otomatis dijadwalkan setiap Hari Minggu pukul 10:00 WIB.`
          : "Sistem Giveaway Dinonaktifkan (OFF) — Jadwal otomatis dihentikan.",
        config: updatedConfig,
      });
    }

    // 2. UPDATE WINNER COUNT
    if (action === "update_count") {
      const count = parseInt(body.winnerCount, 10);
      if (isNaN(count) || count < 1 || count > 50) {
        return NextResponse.json({ error: "Jumlah pemenang harus antara 1 sampai 50 orang" }, { status: 400 });
      }
      const updatedConfig = await updateGiveawayConfig({ winnerCount: count });
      return NextResponse.json({
        ok: true,
        message: `Jumlah target pemenang diubah menjadi ${count} orang`,
        config: updatedConfig,
      });
    }

    // 3. MANUAL LUCKY DRAW
    if (action === "draw") {
      const customCount = body.winnerCount ? parseInt(body.winnerCount, 10) : undefined;
      const result = await executeGiveawayDraw(auth.email, customCount, false);

      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      const [candidates, activeWinners, history] = await Promise.all([
        getGiveawayCandidates(),
        getActiveGiveawayWinners(),
        getGiveawayHistory(),
      ]);

      return NextResponse.json({
        ok: true,
        message: result.message,
        winners: result.winners,
        config: result.config,
        emailSent: result.emailSent,
        emailError: result.emailError,
        candidates,
        activeWinners,
        history,
      });
    }

    // 4. REVOKE WINNER
    if (action === "revoke_winner") {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: "Email target wajib diisi" }, { status: 400 });
      }
      const revokeRes = await revokeUserPremium(email, auth.email);
      const activeWinners = await getActiveGiveawayWinners();

      return NextResponse.json({
        ok: revokeRes.ok,
        message: revokeRes.message,
        activeWinners,
      });
    }

    // 5. TEST EMAIL NOTIFIKASI KE nixxeltzy@gmail.com
    if (action === "test_email") {
      const { sendGiveawayReportEmail } = await import("@/lib/mailer");
      const testWinners = [
        {
          id: "test-sample-id",
          username: "SampleWinner (Test)",
          email: "pemenang.sample@gmail.com",
          luckPercentage: 88,
          grantedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      ];

      const sent = await sendGiveawayReportEmail({
        winnerCount: 1,
        winners: testWinners,
        executedAt: new Date().toISOString(),
        totalCandidates: 25,
        isAutoScheduled: false,
      });

      if (!sent) {
        return NextResponse.json({
          ok: false,
          error: "Email gagal dikirim. Pastikan GMAIL_USER dan GMAIL_APP_PASSWORD telah terpasang dengan benar.",
        }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: "Email test laporan giveaway berhasil dikirim ke nixxeltzy@gmail.com! Silakan periksa Inbox atau folder Spam Anda.",
      });
    }

    return NextResponse.json({ error: `Action "${action}" tidak dikenali` }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/giveaway error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
