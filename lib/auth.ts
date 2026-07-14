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

export async function sendBroadcastEmail(to: string, subject: string, content: string): Promise<boolean> {
  const { user } = getGmailConfig();
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: `"Stock AI Studio" <${user}>`,
      to,
      subject,
      html: `
        <div style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 16px; color: #f3f4f6; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 32px; border-bottom: 1px solid #1e293b; padding-bottom: 24px;">
            <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.35);">✨</div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: -0.5px;">Stock AI Studio</h1>
            <p style="font-size: 13px; color: #9ca3af; margin: 4px 0 0 0;">Pengumuman & Update Resmi</p>
          </div>
          
          <!-- Content Body -->
          <div style="font-size: 15px; color: #d1d5db; line-height: 1.8; margin-bottom: 32px;">
            <p style="margin: 0 0 16px 0; font-weight: 500; color: #ffffff;">Halo Pengguna Stock AI Studio,</p>
            <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 20px; color: #e5e7eb; font-family: inherit; font-size: 14.5px; white-space: pre-wrap; line-height: 1.7;">${content}</div>
          </div>
          
          <!-- CTA/Footer info -->
          <div style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 8px; padding: 14px; margin-bottom: 32px; text-align: center;">
            <span style="font-size: 13px; color: #60a5fa; font-weight: 500;">Buka aplikasi untuk melihat fitur-fitur baru lainnya!</span>
          </div>

          <!-- Footer -->
          <div style="text-align: center; border-top: 1px solid #1e293b; padding-top: 24px; font-size: 11.5px; color: #6b7280; line-height: 1.6;">
            <p style="margin: 0 0 4px 0;">Email ini dikirimkan secara resmi kepada seluruh anggota terdaftar.</p>
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Stock AI Studio. Hak Cipta Dilindungi.</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error(`Gagal mengirim broadcast email ke ${to}:`, error);
    return false;
  }
}
