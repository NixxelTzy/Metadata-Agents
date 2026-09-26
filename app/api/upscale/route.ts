/**
 * app/api/upscale/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-Side Image Upscale API using Sharp (Node.js)
 *
 * Delivers significantly sharper results than browser Canvas API:
 *   - Lanczos3 resampling (much sharper than bicubic)
 *   - Real unsharp mask with precise sigma/threshold control
 *   - Noise reduction via median filter
 *   - Color-accurate sRGB pipeline
 *   - Near-lossless JPEG output (quality 97)
 *
 * POST /api/upscale
 * Body: { dataUrl: string, targetWidth: number, targetHeight: number, engine?: string }
 * Returns: { dataUrl: string, width: number, height: number, sizeKb: number }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max input image size: 30MB base64 (~22MB binary)
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

// Upscale engine profiles
const ENGINE_CONFIGS = {
  ai_super_res: {
    kernel: "lanczos3" as const,         // Lanczos3: sharpest resampling
    sharpenSigma: 0.8,                   // Moderate unsharp mask sigma
    sharpenFlat: 1.0,                    // Flat area sharpening
    sharpenJagged: 2.0,                  // Edge sharpening
    medianSize: 0,                       // No median (preserve texture)
    quality: 97,
  },
  bicubic_crisp: {
    kernel: "cubic" as const,
    sharpenSigma: 1.0,
    sharpenFlat: 0.8,
    sharpenJagged: 2.5,
    medianSize: 0,
    quality: 97,
  },
  bilinear_smooth: {
    kernel: "mitchell" as const,
    sharpenSigma: 0.5,
    sharpenFlat: 0.5,
    sharpenJagged: 1.0,
    medianSize: 3,                       // Light median blur for smooth result
    quality: 97,
  },
} as const;

type EngineKey = keyof typeof ENGINE_CONFIGS;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      dataUrl: string;
      targetWidth: number;
      targetHeight: number;
      engine?: string;
    };

    const { dataUrl, targetWidth, targetHeight } = body;
    const engine: EngineKey =
      (body.engine as EngineKey) in ENGINE_CONFIGS
        ? (body.engine as EngineKey)
        : "ai_super_res";

    // ── Validate input ────────────────────────────────────────────────────
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "dataUrl tidak valid" }, { status: 400 });
    }
    if (!targetWidth || !targetHeight || targetWidth < 100 || targetHeight < 100) {
      return NextResponse.json({ error: "Target dimensi tidak valid" }, { status: 400 });
    }
    if (targetWidth > 16000 || targetHeight > 16000) {
      return NextResponse.json({ error: "Target terlalu besar (max 16000px)" }, { status: 400 });
    }

    // ── Decode base64 to buffer ───────────────────────────────────────────
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) {
      return NextResponse.json({ error: "Format dataUrl tidak valid" }, { status: 400 });
    }
    const base64Data = dataUrl.slice(commaIdx + 1);

    if (base64Data.length > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: "Gambar terlalu besar (max 30MB)" }, { status: 413 });
    }

    const inputBuffer = Buffer.from(base64Data, "base64");
    const cfg = ENGINE_CONFIGS[engine];

    // ── Sharp pipeline ────────────────────────────────────────────────────
    let pipeline = sharp(inputBuffer, { failOnError: false });

    // Get metadata for smart upscale decision
    const meta = await pipeline.metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;

    // Don't upscale if source is already larger than target
    const finalW = srcW > targetWidth ? srcW : targetWidth;
    const finalH = srcH > targetHeight ? srcH : targetHeight;

    pipeline = sharp(inputBuffer, { failOnError: false });

    // Step 1: Resize with high-quality kernel
    pipeline = pipeline.resize(finalW, finalH, {
      kernel: cfg.kernel,
      fit: "fill",
      withoutEnlargement: false,
    });

    // Step 2: Unsharp mask (sharpens real edges without halos)
    if (cfg.sharpenSigma > 0) {
      pipeline = pipeline.sharpen({
        sigma: cfg.sharpenSigma,
        m1: cfg.sharpenFlat,
        m2: cfg.sharpenJagged,
        x1: 2,
        y2: 10,
        y3: 20,
      });
    }

    // Step 3: Median filter for smooth engines
    if (cfg.medianSize > 0) {
      pipeline = pipeline.median(cfg.medianSize);
    }

    // Step 4: Ensure sRGB color space for accurate colors
    pipeline = pipeline.toColorspace("srgb");

    // Step 5: Output high-quality JPEG
    const outputBuffer = await pipeline
      .jpeg({
        quality: cfg.quality,
        progressive: true,
        mozjpeg: true,       // Mozilla JPEG encoder — smaller file, same quality
        chromaSubsampling: "4:4:4", // Full chroma — no color detail loss
      })
      .toBuffer();

    // ── Encode output ─────────────────────────────────────────────────────
    const outputBase64 = outputBuffer.toString("base64");
    const outputDataUrl = `data:image/jpeg;base64,${outputBase64}`;
    const sizeKb = Math.round(outputBuffer.length / 1024);

    return NextResponse.json({
      success: true,
      dataUrl: outputDataUrl,
      width: finalW,
      height: finalH,
      sizeKb,
      engine,
    });

  } catch (err) {
    console.error("[upscale API] Error:", err);
    const msg = err instanceof Error ? err.message : "Gagal memproses gambar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
