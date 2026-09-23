import { NextResponse } from "next/server";
import { getGlobalPhotoStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getGlobalPhotoStats();

    return NextResponse.json({
      success: true,
      todayCount: stats.todayCount || 0,
      totalCount: stats.totalCount || 0,
      leaderboard: stats.leaderboard || [],
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    return NextResponse.json({
      success: true,
      todayCount: 0,
      totalCount: 0,
      leaderboard: [],
    });
  }
}
