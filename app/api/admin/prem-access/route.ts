import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  executePremCommand, getActivePremList, getPremLogs,
  grantUserPremium, revokeUserPremium, parseDurationString
} from "@/lib/prem-access";
import { checkAllUsersPremiumExpiry, getAllUsers } from "@/lib/db";

export const runtime = "nodejs";

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
    // 1. Run automatic expiration check on every GET call
    const expiryResult = await checkAllUsersPremiumExpiry().catch(() => ({ expiredCount: 0, expiredUsers: [] }));

    // 2. Fetch active premium users and logs concurrently
    const [activeUsers, logs, allUsers] = await Promise.all([
      getActivePremList(),
      getPremLogs(),
      getAllUsers().catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      activeUsers,
      logs,
      stats: {
        totalUsers: allUsers.length,
        activePremiumCount: activeUsers.length,
        totalLogs: logs.length,
        recentlyExpiredCount: expiryResult.expiredCount,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Prem Access GET error:", err);
    return NextResponse.json({ error: "Gagal memuat data Prem Access" }, { status: 500 });
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
      commandText?: string;
      email?: string;
      durationDays?: number;
      planLabel?: string;
    };

    const action = body.action || "exec_command";

    // ── 1. Execute Command ───────────────────────────────────────────────────
    if (action === "exec_command") {
      const cmd = body.commandText || "";
      if (!cmd.trim()) {
        return NextResponse.json({ error: "Command tidak boleh kosong" }, { status: 400 });
      }

      const result = await executePremCommand(cmd, auth.email);
      return NextResponse.json(result);
    }

    // ── 2. Quick Grant / Extend ──────────────────────────────────────────────
    if (action === "quick_grant") {
      const email = body.email || "";
      const days = body.durationDays || 30;
      const planLabel = body.planLabel || `${days} Hari`;

      if (!email.trim()) {
        return NextResponse.json({ error: "Email diperlukan" }, { status: 400 });
      }

      const res = await grantUserPremium(email, days, planLabel, auth.email);
      return NextResponse.json(res);
    }

    // ── 3. Quick Revoke ──────────────────────────────────────────────────────
    if (action === "quick_revoke") {
      const email = body.email || "";
      if (!email.trim()) {
        return NextResponse.json({ error: "Email diperlukan" }, { status: 400 });
      }

      const res = await revokeUserPremium(email, auth.email);
      return NextResponse.json(res);
    }

    // ── 4. Check Expiries On Demand ─────────────────────────────────────────
    if (action === "check_expiries") {
      const res = await checkAllUsersPremiumExpiry();
      return NextResponse.json({ ok: true, ...res });
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (err) {
    console.error("Prem Access POST error:", err);
    return NextResponse.json({ error: "Gagal memproses aksi Prem Access" }, { status: 500 });
  }
}
