# Adobe Stock Metadata AI

Web app untuk generate **title** dan **keywords** Adobe Stock secara otomatis menggunakan **DeepSeek AI**.

## Fitur

- Upload hingga **15 foto** sekaligus (drag & drop)
- Kompresi otomatis sebelum dikirim ke AI
- Analisis gambar dengan model vision DeepSeek
- Generate title & keywords relevan dalam bahasa Inggris (standar Adobe Stock)
- Salin per field atau export semua hasil ke file `.txt`
- Siap deploy di **Vercel**

## Tech Stack

- **Frontend & Backend:** Next.js 15 (App Router)
- **AI:** DeepSeek (multimodal vision)
- **Deploy:** Vercel

## Setup

1. Buat file `.env.local` di root project dan tambahkan API key DeepSeek Anda:

```
DEEPSEEK_API_KEY="sk-..."
```

2. Jalankan:

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Deploy ke Vercel

1. Push project ke GitHub
2. Import di [vercel.com](https://vercel.com)
3. Set environment variable: `DEEPSEEK_API_KEY`
4. Deploy

## Cara Pakai

1. Upload foto (maks 15)
2. Klik **Generate Metadata**
3. Salin title & keywords ke Adobe Stock Contributor portal
4. Atau export semua hasil sekaligus
