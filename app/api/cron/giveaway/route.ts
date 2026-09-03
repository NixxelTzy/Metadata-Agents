import { NextRequest, NextResponse } from "next/server";
import { checkAndAutoExecuteIfDue, evaluateSundayGiveawayEligibility } from "@/lib/giveaway";

export const runtime = "nodejs";

/**
 * Endpoint Cron Vercel / External Scheduler
 * Dijadwalkan otomatis di vercel.json: "0 3 * * 0"
 * Memeriksa hari, jam, dan kelayakan secara otomatis tanpa perlu campur tangan admin.
 */
export async function GET(request: NextRequest) {
  try {
    const status = await evaluateSundayGiveawayEligibility();

    if (!status.isEligible) {
      return NextResponse.json({
        ok: true,
        executed: false,
        reason: status.reason,
        wibNow: status.wibNow,
        checkedAt: new Date().toISOString(),
      });
    }

    const autoRes = await checkAndAutoExecuteIfDue();

    return NextResponse.json({
      ok: true,
      executed: autoRes.executed,
      reason: autoRes.reason,
      details: autoRes.result
        ? {
            winnersCount: autoRes.result.winners.length,
            emailSent: autoRes.result.emailSent,
            emailError: autoRes.result.emailError,
            nextDrawAt: autoRes.result.config.nextDrawAt,
          }
        : undefined,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRON] Error eksekusi cron giveaway:", err);
    return NextResponse.json(
      { error: "Gagal mengeksekusi cron giveaway", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
