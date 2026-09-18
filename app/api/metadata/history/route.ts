import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  getUserMetadataHistory,
  saveUserMetadataHistory,
  deleteUserMetadataHistory,
  recordPhotoProcessing,
  MetadataHistoryEntry,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const history = await getUserMetadataHistory(payload.userId, 50);
    return NextResponse.json({ success: true, history });
  } catch (err) {
    console.error("GET /api/metadata/history error:", err);
    return NextResponse.json({ error: "Gagal mengambil riwayat" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      platform: string;
      items: any[];
      jobId?: string;
    };

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Items tidak boleh kosong" }, { status: 400 });
    }

    const entryId = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const historyEntry: MetadataHistoryEntry = {
      id: entryId,
      jobId: body.jobId,
      platform: body.platform || "adobe_stock",
      photoCount: body.items.length,
      createdAt: new Date().toISOString(),
      items: body.items,
    };

    await saveUserMetadataHistory(payload.userId, historyEntry);

    // Record photo processing to increment total counter & leaderboard
    await recordPhotoProcessing(payload.userId, payload.username || "Kreator", body.items.length);

    return NextResponse.json({ success: true, entry: historyEntry });
  } catch (err) {
    console.error("POST /api/metadata/history error:", err);
    return NextResponse.json({ error: "Gagal menyimpan riwayat" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("id");
    if (!entryId) return NextResponse.json({ error: "ID riwayat harus disertakan" }, { status: 400 });

    await deleteUserMetadataHistory(payload.userId, entryId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/metadata/history error:", err);
    return NextResponse.json({ error: "Gagal menghapus riwayat" }, { status: 500 });
  }
}
