import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDownloadLinks, setDownloadLink, deleteDownloadLink } from "@/lib/db";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin" }, { status: 403 });
  }

  try {
    const links = await getDownloadLinks();
    return NextResponse.json({ links });
  } catch (error) {
    console.error("Failed to get download links:", error);
    return NextResponse.json({ error: "Gagal mengambil link download" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin" }, { status: 403 });
  }

  try {
    const body = await request.json() as { type: "apk" | "exe"; link: string };
    const { type, link } = body;

    if (!type || !link) {
      return NextResponse.json({ error: "Tipe dan link wajib diisi" }, { status: 400 });
    }

    if (type !== "apk" && type !== "exe") {
      return NextResponse.json({ error: "Tipe tidak valid" }, { status: 400 });
    }

    if (link.trim() !== "" && !/^https?:\/\/.+/i.test(link)) {
      return NextResponse.json({ error: "Format link tidak valid (harus diawali http/https)" }, { status: 400 });
    }

    await setDownloadLink(type, link.trim());
    return NextResponse.json({ message: `Link ${type.toUpperCase()} berhasil disimpan` });
  } catch (error) {
    console.error("Failed to set download link:", error);
    return NextResponse.json({ error: "Gagal menyimpan link download" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden — Khusus Admin" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "apk" | "exe";

    if (!type || (type !== "apk" && type !== "exe")) {
      return NextResponse.json({ error: "Tipe tidak valid (harus 'apk' atau 'exe')" }, { status: 400 });
    }

    await deleteDownloadLink(type);
    return NextResponse.json({ message: `Link ${type.toUpperCase()} berhasil dihapus` });
  } catch (error) {
    console.error("Failed to delete download link:", error);
    return NextResponse.json({ error: "Gagal menghapus link download" }, { status: 500 });
  }
}
