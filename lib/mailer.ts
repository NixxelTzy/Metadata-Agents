/**
 * lib/mailer.ts
 * Email notification system using Nodemailer with Gmail SMTP.
 * Sends admin alert emails to nixxeltzy@gmail.com on user login and activity events.
 * Configure: GMAIL_USER and GMAIL_APP_PASSWORD in environment variables.
 */

import nodemailer from "nodemailer";
import { getGmailConfig } from "@/lib/config";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

function createTransporter() {
  const { user, appPassword } = getGmailConfig();
  if (!user || !appPassword) {
    console.warn("[Mailer] GMAIL_USER atau GMAIL_APP_PASSWORD tidak ditemukan. Email notification dinonaktifkan.");
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
}

export interface LoginNotifPayload {
  username: string;
  email: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

export interface ActivityNotifPayload {
  username: string;
  email: string;
  action: string;
  detail: string;
  timestamp: string;
}

/** Send login notification email to admin */
export async function sendLoginNotification(payload: LoginNotifPayload): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:24px 28px">
        <h2 style="margin:0;font-size:20px;color:#fff">🔐 Login Baru Terdeteksi</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Notifikasi Admin · NixelStudio</p>
      </div>
      <div style="padding:24px 28px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px;width:130px">👤 Username</td>
            <td style="padding:8px 0;font-weight:600;color:#f1f5f9">${payload.username}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">📧 Email</td>
            <td style="padding:8px 0;color:#f1f5f9">${payload.email}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">🌐 IP Address</td>
            <td style="padding:8px 0;color:#f1f5f9;font-family:monospace">${payload.ip}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">🕐 Waktu</td>
            <td style="padding:8px 0;color:#f1f5f9">${new Date(payload.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">💻 Device</td>
            <td style="padding:8px 0;color:#f1f5f9;font-size:12px">${payload.userAgent.slice(0, 100)}...</td>
          </tr>
        </table>
      </div>
      <div style="padding:16px 28px;background:rgba(255,255,255,0.04);font-size:12px;color:#64748b;border-top:1px solid rgba(255,255,255,0.06)">
        Email ini dikirim secara otomatis oleh sistem NixelStudio. Jika kamu tidak mengenali aktivitas ini, segera periksa akun kamu.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NixelStudio Admin" <${getGmailConfig().user}>`,
      to: ADMIN_EMAIL,
      subject: `🔐 Login: ${payload.username} (${payload.email})`,
      html,
    });
  } catch (err) {
    console.error("[Mailer] Gagal kirim login notification:", err);
  }
}

/** Send activity/action notification email to admin */
export async function sendActivityNotification(payload: ActivityNotifPayload): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return;

  const actionEmoji: Record<string, string> = {
    metadata_upload: "📸",
    upscale: "🔍",
    vector: "🎨",
    motion: "🎬",
    research: "🔬",
    watermark: "🪣",
    download: "⬇️",
    login: "🔐",
    logout: "🚪",
  };
  const emoji = actionEmoji[payload.action] ?? "⚡";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f1a;color:#e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0ea5e9,#7c3aed);padding:24px 28px">
        <h2 style="margin:0;font-size:20px;color:#fff">${emoji} Aktivitas Pengguna</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Notifikasi Admin · NixelStudio</p>
      </div>
      <div style="padding:24px 28px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px;width:130px">👤 Pengguna</td>
            <td style="padding:8px 0;font-weight:600;color:#f1f5f9">${payload.username}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">📧 Email</td>
            <td style="padding:8px 0;color:#f1f5f9">${payload.email}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">⚡ Aksi</td>
            <td style="padding:8px 0;color:#a78bfa;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:0.05em">${payload.action.replace(/_/g, " ")}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px;vertical-align:top">📝 Detail</td>
            <td style="padding:8px 0;color:#f1f5f9">${payload.detail}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#94a3b8;font-size:13px">🕐 Waktu</td>
            <td style="padding:8px 0;color:#f1f5f9">${new Date(payload.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</td>
          </tr>
        </table>
      </div>
      <div style="padding:16px 28px;background:rgba(255,255,255,0.04);font-size:12px;color:#64748b;border-top:1px solid rgba(255,255,255,0.06)">
        Email ini dikirim secara otomatis oleh sistem NixelStudio.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NixelStudio Admin" <${getGmailConfig().user}>`,
      to: ADMIN_EMAIL,
      subject: `${emoji} ${payload.username} · ${payload.action.replace(/_/g, " ")}`,
      html,
    });
  } catch (err) {
    console.error("[Mailer] Gagal kirim activity notification:", err);
  }
}

export interface AiEmailReplyPayload {
  toEmail: string;
  toUsername: string;
  subject: string;
  aiMessage: string;
  replyType: "general" | "block_notice" | "support_reply";
}

/** Send AI-generated response directly to user's email */
export async function sendAiEmailReply(payload: AiEmailReplyPayload): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) return false;

  const typeConfig = {
    general: { title: "🤖 AI Support Response", color: "#2563eb", bg: "linear-gradient(135deg,#1e3a8a,#2563eb)" },
    block_notice: { title: "🚫 Pemberitahuan Status Akun", color: "#dc2626", bg: "linear-gradient(135deg,#7f1d1d,#dc2626)" },
    support_reply: { title: "💬 Balasan Laporan / Usulan", color: "#0284c7", bg: "linear-gradient(135deg,#075985,#0284c7)" },
  }[payload.replyType];

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f8fafc;border-radius:16px;overflow:hidden;border:1px solid #334155;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
      <div style="background:${typeConfig.bg};padding:28px 32px">
        <h2 style="margin:0;font-size:22px;color:#ffffff;font-weight:800">${typeConfig.title}</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Respon Otomatis Sistem · NixelStudio AI Assistant</p>
      </div>
      <div style="padding:32px">
        <div style="font-size:14px;color:#94a3b8;margin-bottom:16px">Halo <strong style="color:#ffffff">${payload.toUsername}</strong>,</div>
        <div style="background:#1e293b;border-left:4px solid ${typeConfig.color};padding:20px;border-radius:8px;font-size:14px;line-height:1.7;color:#e2e8f0;white-space:pre-wrap;margin-bottom:24px">
${payload.aiMessage}
        </div>
        <div style="font-size:12px;color:#64748b;line-height:1.5">
          Pesan ini dibuat dan dikirim secara otomatis oleh <strong>Groq AI System</strong> atas nama Tim NixelStudio Admin. Jika ada pertanyaan lebih lanjut, silakan balas email ini atau gunakan menu Lapor & Usulan di aplikasi.
        </div>
      </div>
      <div style="padding:16px 32px;background:#020617;font-size:12px;color:#475569;border-top:1px solid #1e293b;text-align:center">
        © 2026 NixelStudio · Advanced AI System Powered by Groq & Llama 3.3 70B
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NixelStudio AI Assistant" <${getGmailConfig().user}>`,
      to: payload.toEmail,
      subject: payload.subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[Mailer] Gagal kirim AI email reply:", err);
    return false;
  }
}

export interface GiveawayWinnerReport {
  id: string;
  username: string;
  email: string;
  luckPercentage: number;
  grantedUntil: string;
}

export interface GiveawayEmailPayload {
  winnerCount: number;
  winners: GiveawayWinnerReport[];
  executedAt: string;
  totalCandidates: number;
}

/** Send giveaway summary report email to nixxeltzy@gmail.com */
export async function sendGiveawayReportEmail(payload: GiveawayEmailPayload): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) return false;

  const rows = payload.winners.map((w, idx) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: ${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}">
      <td style="padding: 10px 12px; font-weight: 700; color: #ec4899;">#${idx + 1}</td>
      <td style="padding: 10px 12px; color: #f8fafc; font-weight: 600;">${w.username}</td>
      <td style="padding: 10px 12px; color: #38bdf8; font-family: monospace;">${w.email}</td>
      <td style="padding: 10px 12px; text-align: center;">
        <span style="background: rgba(236,72,153,0.2); color: #f472b6; border: 1px solid rgba(236,72,153,0.4); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800;">
          ${w.luckPercentage}% Hoki
        </span>
      </td>
      <td style="padding: 10px 12px; color: #4ade80; font-size: 12px;">7 Hari (s/d ${new Date(w.grantedUntil).toLocaleDateString('id-ID')})</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#0b0f19;color:#f8fafc;border-radius:16px;overflow:hidden;border:1px solid #1e293b;box-shadow:0 25px 50px rgba(0,0,0,0.5)">
      <div style="background:linear-gradient(135deg,#ec4899 0%,#8b5cf6 50%,#3b82f6 100%);padding:28px 32px">
        <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:900;letter-spacing:-0.02em">🎁 Giveaway Berhasil Dieksekusi</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px">Laporan Resmi Pemenang Giveaway Token Unlimited 1 Minggu · NixelStudio</p>
      </div>

      <div style="padding:28px 32px">
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:14px;border-radius:10px;text-align:center">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Total Pemenang</div>
            <div style="font-size:22px;color:#ec4899;font-weight:900;margin-top:4px">${payload.winners.length} Orang</div>
          </div>
          <div style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:14px;border-radius:10px;text-align:center">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Hadiah</div>
            <div style="font-size:16px;color:#4ade80;font-weight:900;margin-top:8px">Unlimited 7 Hari</div>
          </div>
          <div style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:14px;border-radius:10px;text-align:center">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700">Total Kandidat</div>
            <div style="font-size:22px;color:#38bdf8;font-weight:900;margin-top:4px">${payload.totalCandidates} User</div>
          </div>
        </div>

        <h3 style="margin:0 0 12px;font-size:15px;color:#f1f5f9;font-weight:700">📋 Daftar Akun Penerima Hadiah:</h3>

        <div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">
          <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left">
            <thead>
              <tr style="background:rgba(255,255,255,0.05);color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.1)">
                <th style="padding:10px 12px">No</th>
                <th style="padding:10px 12px">Username</th>
                <th style="padding:10px 12px">Email Akun</th>
                <th style="padding:10px 12px;text-align:center">Rasio Hoki</th>
                <th style="padding:10px 12px">Masa Aktif</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <div style="margin-top:20px;padding:14px 18px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:10px;font-size:12px;color:#86efac;line-height:1.6">
          ✅ <strong>Semua akun di atas telah otomatis diaktifkan dengan status Premium Unlimited selama 7 hari.</strong><br/>
          📬 Notifikasi in-app telah dikirimkan secara langsung ke kotak masuk masing-masing pemenang (tanpa popup tengah layar).
        </div>
      </div>

      <div style="padding:16px 32px;background:#030712;font-size:12px;color:#475569;border-top:1px solid #1e293b;text-align:center">
        Laporan otomatis ini dikirim ke ${ADMIN_EMAIL} · NixelStudio Admin Control Center
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NixelStudio Giveaway" <${getGmailConfig().user}>`,
      to: ADMIN_EMAIL,
      subject: `🎁 Giveaway Berhasil: ${payload.winners.length} Pemenang Token Unlimited 7 Hari`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[Mailer] Gagal kirim giveaway report email:", err);
    return false;
  }
}
