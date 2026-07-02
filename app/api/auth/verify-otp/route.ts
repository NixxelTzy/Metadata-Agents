import { NextRequest, NextResponse } from "next/server";
import { getOtpByEmail, markOtpUsed, getUserByEmail } from "@/lib/db";
import { isOtpExpired, signToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json() as { email: string; code: string };

    if (!email || !code) {
      return NextResponse.json({ error: "Email dan kode wajib diisi" }, { status: 400 });
    }

    const otpRecord = await getOtpByEmail(email.toLowerCase());

    if (!otpRecord) {
      return NextResponse.json({ error: "Kode tidak ditemukan atau sudah expired" }, { status: 400 });
    }

    if (otpRecord.used) {
      return NextResponse.json({ error: "Kode sudah digunakan" }, { status: 400 });
    }

    if (isOtpExpired(otpRecord.expiresAt)) {
      return NextResponse.json({ error: "Kode sudah expired (15 menit)" }, { status: 400 });
    }

    if (otpRecord.code !== code.trim()) {
      return NextResponse.json({ error: "Kode tidak valid" }, { status: 400 });
    }

    await markOtpUsed(email.toLowerCase());

    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 400 });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role ?? "user",
    });

    const response = NextResponse.json({
      message: "Verifikasi berhasil",
      user: { id: user.id, email: user.email, username: user.username },
    });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

