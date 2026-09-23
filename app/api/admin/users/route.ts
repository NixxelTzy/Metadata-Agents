import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getUserByEmail, deleteUser } from "@/lib/db";
import { GET as masterGET } from "../messenger/route";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set("view", "presence");
  const subReq = new NextRequest(url.toString(), {
    headers: request.headers,
  });
  return masterGET(subReq);
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email } = await request.json() as { email: string };
    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    if (email.toLowerCase() === ADMIN_EMAIL) {
      return NextResponse.json({ error: "Tidak dapat menghapus akun admin utama" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    await deleteUser(user.email, user.id);
    return NextResponse.json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
