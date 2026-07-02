import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser, saveOtp } from "@/lib/db";
import { generateOtp, getOtpExpiry, sendOtpEmail } from "@/lib/auth";
import crypto from "crypto";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json() as { email: string; username: string; password: string };
    const { email, username, password } = body;

    // ── Security inspection (AUTH tier) ──
    const sec = await inspect({
      ip,
      endpoint: "/api/auth/register",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body: { email, username }, // don't pass password
    });
    if (sec.blocked) {
      void recordIpError(ip);
      return NextResponse.json({ error: "Terlalu banyak percobaan pendaftaran. Coba lagi nanti.", reason: sec.reason }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
    }

    if (!email || !username || !password) {
      return NextResponse.json({ error: "Semua field wajib diisi" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
    }

    if (username.length < 3) {
      return NextResponse.json({ error: "Username minimal 3 karakter" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await createUser({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      username,
      passwordHash,
      role: "user",
      createdAt: new Date().toISOString(),
    });

    const otp = generateOtp();
    const expiresAt = getOtpExpiry();

    await saveOtp({
      email: email.toLowerCase(),
      code: otp,
      expiresAt: expiresAt.toISOString(),
      used: false,
    });

    await sendOtpEmail(email.toLowerCase(), otp);

    return NextResponse.json({ message: "OTP dikirim ke email" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error("Register error:", msg, stack);

    // Deteksi error spesifik untuk pesan lebih jelas
    if (msg.includes("UPSTASH") || msg.includes("redis") || msg.includes("Redis")) {
      return NextResponse.json({ error: "Database error — cek env UPSTASH_REDIS_REST_URL & TOKEN di Vercel" }, { status: 500 });
    }
    if (msg.includes("GMAIL") || msg.includes("nodemailer") || msg.includes("auth") || msg.includes("SMTP")) {
      return NextResponse.json({ error: "Email error — cek env GMAIL_USER & GMAIL_APP_PASSWORD di Vercel" }, { status: 500 });
    }

    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
