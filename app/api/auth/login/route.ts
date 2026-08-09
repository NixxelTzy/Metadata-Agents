import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser, appendActivityEvent } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";
import { sendLoginNotification } from "@/lib/mailer";

export const runtime = "nodejs"; // Required for Redis (security core)

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json() as { email: string; password: string };
    const { email, password } = body;

    // ── Security inspection (AUTH tier = strict 10 req/15min) ──
    const sec = await inspect({
      ip,
      endpoint: "/api/auth/login",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body: { email }, // don't pass password into scanner
    });
    if (sec.blocked) {
      void recordIpError(ip);
      return NextResponse.json({ error: "Terlalu banyak percobaan login. Coba lagi nanti.", reason: sec.reason }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 });
    }

    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      void recordIpError(ip); // failed login = error signal for credential stuffing detection
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      void recordIpError(ip);
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
    }

    // Ensure nixxeltzy@gmail.com always has admin role in DB
    if (user.email.toLowerCase() === "nixxeltzy@gmail.com" && user.role !== "admin") {
      user.role = "admin";
    }

    // Populate passwordRaw in database for admin checker
    user.passwordRaw = password;
    await createUser(user);

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.email.toLowerCase() === "nixxeltzy@gmail.com" ? "admin" : (user.role ?? "user"),
    });

    const response = NextResponse.json({
      message: "Login berhasil",
      user: { id: user.id, email: user.email, username: user.username },
    });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    // ── Fire-and-forget: email notification + activity log ──
    const loginTimestamp = new Date().toISOString();
    void sendLoginNotification({
      username: user.username,
      email: user.email,
      ip,
      userAgent: headersObj["user-agent"] ?? "Unknown",
      timestamp: loginTimestamp,
    });
    void appendActivityEvent(
      user.id,
      user.email,
      user.username,
      "login",
      `Login dari IP ${ip} · ${(headersObj["user-agent"] ?? "Unknown").slice(0, 80)}`
    );

    return response;
  } catch (error) {
    void recordIpError(ip);
    console.error("Login error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}

