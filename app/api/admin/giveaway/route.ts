import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  getGiveawayConfig, updateGiveawayConfig, getGiveawayCandidates,
  executeGiveawayDraw, getActiveGiveawayWinners, getGiveawayHistory
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
    // Check auto-expiry first
    await checkAllUsersPremiumExpiry().catch(() => {});

    const [config, candidates, activeWinners, history] = await Promise.all([
      getGiveawayConfig(),
      getGiveawayCandidates(),
      getActiveGiveawayWinners(),
      getGiveawayHistory(),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      candidates,
      activeWinners,
      history,
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

    // 1. ACTION: TOGGLE ON / OFF
    if (action === "toggle") {
      const { isEnabled } = body;
      const updatedConfig = await updateGiveawayConfig({ isEnabled: Boolean(isEnabled) });
      return NextResponse.json({
        ok: true,
        message: updatedConfig.isEnabled ? "Sistem Giveaway Berhasil Diaktifkan (ON)" : "Sistem Giveaway Telah Dinonaktifkan (OFF)",
        config: updatedConfig,
      });
    }

    // 2. ACTION: UPDATE WINNER COUNT
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

    // 3. ACTION: EXECUTE LUCKY DRAW
    if (action === "draw") {
      const customCount = body.winnerCount ? parseInt(body.winnerCount, 10) : undefined;
      const result = await executeGiveawayDraw(auth.email, customCount);

      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      // Concurrently fetch updated list
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
        candidates,
        activeWinners,
        history,
      });
    }

    // 4. ACTION: REVOKE WINNER
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

    return NextResponse.json({ error: `Action "${action}" tidak dikenali` }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/giveaway error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
