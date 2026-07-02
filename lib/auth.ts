/**
 * lib/auth.ts
 * JWT auth dan OTP email.
 * Semua credentials dari environment variables.
 */
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { getJwtSecret, getGmailConfig } from "@/lib/config";

const OTP_EXPIRE_MINUTES = 15;

// ── JWT ───────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  role: "user" | "premium" | "admin";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

// ── OTP ───────────────────────────────────────────────────────────────────────

export function generateOtp(): string {
  return crypto.randomInt(10000000, 99999999).toString();
}

export function getOtpExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OTP_EXPIRE_MINUTES);
  return d;
}

export function isOtpExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt);
}

// ── Email ─────────────────────────────────────────────────────────────────────

function createTransporter() {
  const { user, appPassword } = getGmailConfig();
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
}

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const { user } = getGmailConfig();
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Stock AI Studio" <${user}>`,
    to: email,
    subject: "Kode Verifikasi — Stock AI Studio",
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <div style="width: 40px; height: 40px; background: #0d0d0d; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">🎨</div>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #0d0d0d; margin: 0 0 8px;">Verifikasi akun kamu</h2>
        <p style="font-size: 14px; color: #666; margin: 0 0 24px; line-height: 1.6;">
          Masukkan kode 8 digit berikut untuk menyelesaikan pendaftaran. Kode berlaku selama <strong>15 menit</strong>.
        </p>
        <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #0d0d0d; font-family: monospace;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #999; margin: 0; line-height: 1.6;">
          Jika kamu tidak meminta kode ini, abaikan email ini. Kode akan otomatis tidak valid setelah 15 menit.
        </p>
      </div>
    `,
  });
}
