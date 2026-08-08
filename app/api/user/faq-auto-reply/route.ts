import { NextRequest, NextResponse } from "next/server";

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const FAQ_DATABASE: FaqItem[] = [
  {
    id: "faq-1",
    category: "Notifikasi",
    question: "Bagaimana cara melihat pesan dari Admin?",
    answer: "Pesan dari Admin akan otomatis muncul di atas layar web (Sticky Notice Bar) dan dalam bentuk popup modal. Anda juga bisa mengeklik lonceng notifikasi 🔔 di navigasi header kapan saja.",
  },
  {
    id: "faq-2",
    category: "Akun & Keamanan",
    question: "Apa yang harus dilakukan jika akun diblokir sementara?",
    answer: "Gunakan fitur 'Ajukan Banding & Unblock Otomatis oleh AI' pada layar blokir. Tuliskan alasan banding Anda dan AI akan mengevaluasi serta memulihkan akses akun Anda dalam hitungan detik.",
  },
  {
    id: "faq-3",
    category: "Metadata AI",
    question: "Berapa banyak foto yang bisa di-generate sekaligus?",
    answer: "Sistem mendukung pemrosesan batch hingga 15 foto sekaligus dengan Groq Vision AI untuk menghasilkan judul & 49 kata kunci SEO Adobe Stock secara instan.",
  },
  {
    id: "faq-4",
    category: "Pembaruan Web",
    question: "Mengapa muncul pesan 'Buka Ulang Sekarang'?",
    answer: "Pesan tersebut dikirimkan admin saat ada pembaruan fitur atau perbaikan sistem baru. Klik tombol 'Buka Ulang Sekarang' untuk memuat versi aplikasi paling terbaru.",
  },
];

/**
 * GET /api/user/faq-auto-reply
 * Returns list of system FAQs and automated help guides.
 */
export async function GET() {
  return NextResponse.json({ faqs: FAQ_DATABASE });
}

/**
 * POST /api/user/faq-auto-reply
 * Intelligent query matcher for instant automated answers.
 */
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json() as { query?: string };
    if (!query?.trim()) {
      return NextResponse.json({ ok: false, answer: "Mohon tuliskan pertanyaan Anda." });
    }

    const qLower = query.toLowerCase();
    const match = FAQ_DATABASE.find((item) =>
      qLower.includes(item.question.toLowerCase()) ||
      qLower.includes(item.category.toLowerCase()) ||
      qLower.split(" ").some((w) => w.length > 3 && item.answer.toLowerCase().includes(w))
    );

    if (match) {
      return NextResponse.json({
        ok: true,
        matched: true,
        answer: match.answer,
        category: match.category,
      });
    }

    return NextResponse.json({
      ok: true,
      matched: false,
      answer: "Pertanyaan Anda telah diteruskan ke Admin. Admin akan meninjau dan merespon melalui pesan inbox Anda.",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Gagal memproses FAQ" }, { status: 500 });
  }
}
