import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllUsers } from "@/lib/db";
import { sendBroadcastEmail } from "@/lib/auth";

const ADMIN_EMAIL = "nixxeltzy@gmail.com";

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
    const body = await request.json() as { subject: string; message: string };
    const { subject, message } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: "Subjek dan pesan wajib diisi" }, { status: 400 });
    }

    if (subject.trim().length < 3) {
      return NextResponse.json({ error: "Subjek terlalu pendek (minimal 3 karakter)" }, { status: 400 });
    }

    if (message.trim().length < 5) {
      return NextResponse.json({ error: "Isi pesan terlalu pendek (minimal 5 karakter)" }, { status: 400 });
    }

    const users = await getAllUsers();
    
    // Saring user dengan email valid
    const targets = users.filter(u => u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email));

    if (targets.length === 0) {
      return NextResponse.json({
        message: "Tidak ada penerima dengan email valid.",
        successCount: 0,
        failureCount: 0,
        totalCount: 0
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Kirim secara paralel agar cepat
    const results = await Promise.allSettled(
      targets.map(target => sendBroadcastEmail(target.email, subject.trim(), message.trim()))
    );

    results.forEach((res) => {
      if (res.status === "fulfilled" && res.value === true) {
        successCount++;
      } else {
        failureCount++;
      }
    });

    return NextResponse.json({
      message: "Broadcast selesai dikirim",
      successCount,
      failureCount,
      totalCount: targets.length
    });
  } catch (error) {
    console.error("Failed to run broadcast:", error);
    return NextResponse.json({ error: "Gagal memproses broadcast email" }, { status: 500 });
  }
}
