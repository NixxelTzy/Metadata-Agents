// ─── Image Processing Pipeline ─────────────────────────────────────────────────
// Pure browser-side canvas functions for upscaling images.
// All functions run in the browser (client-side only).

import { ENGINE_PROFILES } from "./engines";
import type { EngineProfile, UpscaleEngine } from "./types";

// ─── Bilateral Denoise (Edge-Preserving Detail Cleaner) ───────────────────────
// Smooths flat regions and removes compression artifacts while locking down edge sharpness.

export function applyBilateralDenoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number
): void {
  if (intensity <= 0) return;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const data = imgData.data;
  const sigma = (intensity / 100) * 45;
  const radius = intensity > 50 ? 2 : 1;
  const twoSigSq = 2 * sigma * sigma;

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const ci = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[ci + c]!;
        let weightSum = 0;
        let colorSum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ni = ((y + dy) * w + (x + dx)) * 4 + c;
            const nb = src[ni]!;
            const diff = center - nb;
            const wt = Math.exp(-(diff * diff) / twoSigSq);
            colorSum += nb * wt;
            weightSum += wt;
          }
        }
        data[ci + c] = Math.min(255, Math.max(0, Math.round(colorSum / weightSum)));
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ─── Unsharp Mask (Adaptive Halo-Free Micro-Contrast) ────────────────────────
// Sharpens real textures without amplifying noise or causing white halo borders.

export function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
  threshold: number = 3 // Minimum difference to sharpen (prevents sharpening noise)
): void {
  if (amount <= 0) return;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const data = imgData.data;
  const factor = (amount / 100) * 0.65; // Balanced crisp factor

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ci = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[ci + c]!;
        // 4-neighborhood average
        const avg = (
          src[((y - 1) * w + x) * 4 + c]! +
          src[((y + 1) * w + x) * 4 + c]! +
          src[(y * w + (x - 1)) * 4 + c]! +
          src[(y * w + (x + 1)) * 4 + c]!
        ) * 0.25;

        const diff = center - avg;
        // Only sharpen real edges/textures exceeding threshold (avoids noise grain)
        if (Math.abs(diff) >= threshold) {
          const v = center + diff * factor;
          data[ci + c] = Math.min(255, Math.max(0, Math.round(v)));
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ─── Scale Step ───────────────────────────────────────────────────────────────
// Draws one scale step using imageSmoothingQuality + contrast/saturation filter.

export function drawScaleStep(
  src: HTMLImageElement | HTMLCanvasElement,
  targetW: number,
  targetH: number,
  profile: EngineProfile
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = profile.smoothing === "high" ? "high" : "low";
  ctx.filter = `contrast(${profile.contrast}) saturate(${profile.saturation})`;
  ctx.drawImage(src, 0, 0, targetW, targetH);
  ctx.filter = "none";
  return canvas;
}

// ─── Calculate Target Dimensions (Aspect-Preserving & Stock-Safe) ─────────────
// Scales uniformly so the longer side hits the preset target.
// If minPixels is specified (e.g. 4.1 MP for Adobe Stock), ensures total
// resolution (w * h) meets or exceeds the platform threshold, eliminating rejections.

export function calcTargetDimensions(
  srcW: number,
  srcH: number,
  presetPx: number,
  minPixels: number = 0
): { targetW: number; targetH: number } {
  const srcLonger = Math.max(srcW, srcH);
  let scaleFactor = presetPx / srcLonger;
  let targetW = Math.round(srcW * scaleFactor);
  let targetH = Math.round(srcH * scaleFactor);

  // Guarantee minimum Megapixel requirement (Adobe Stock: ≥ 4.0 MP)
  if (minPixels > 0 && targetW * targetH < minPixels) {
    const boostFactor = Math.sqrt(minPixels / (targetW * targetH));
    targetW = Math.round(targetW * boostFactor);
    targetH = Math.round(targetH * boostFactor);
  }

  // Never downscale below original image if original already exceeds target
  if (srcLonger > presetPx && (srcW * srcH >= minPixels)) {
    return { targetW: srcW, targetH: srcH };
  }

  return { targetW, targetH };
}

// ─── Main Upscale Pipeline ────────────────────────────────────────────────────
// Multi-pass or single-pass depending on the engine profile.
// Returns a base64 JPEG data URL at the target resolution.

export async function runUpscalePipeline(
  imgEl: HTMLImageElement,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  engine: UpscaleEngine,
  onStep: (msg: string) => void
): Promise<string> {
  const profile = ENGINE_PROFILES[engine];

  if (profile.multiPass) {
    // ── Multi-pass: double size iteratively until we reach target ──────────
    let cur: HTMLImageElement | HTMLCanvasElement = imgEl;
    let curW = srcW;
    let curH = srcH;
    let pass = 1;

    while (curW < targetW * 0.92 || curH < targetH * 0.92) {
      const nextW = Math.min(Math.round(curW * 2), targetW);
      const nextH = Math.min(Math.round(curH * 2), targetH);
      onStep(`Pass ${pass}: ${curW}×${curH} → ${nextW}×${nextH}px`);

      const stepped = drawScaleStep(cur, nextW, nextH, profile);
      const isIntermediate = nextW < targetW || nextH < targetH;

      if (isIntermediate) {
        const ctx = stepped.getContext("2d")!;
        applyBilateralDenoise(ctx, nextW, nextH, Math.round(profile.denoise * 0.55));
      }

      cur = stepped;
      curW = nextW;
      curH = nextH;
      pass++;
      await new Promise((r) => setTimeout(r, 0));
    }

    onStep("Final pass: denoise & unsharp masking...");
    const final = drawScaleStep(cur, targetW, targetH, profile);
    const ctx = final.getContext("2d")!;
    await new Promise((r) => setTimeout(r, 0));
    applyBilateralDenoise(ctx, targetW, targetH, profile.denoise);
    await new Promise((r) => setTimeout(r, 0));
    applyUnsharpMask(ctx, targetW, targetH, profile.sharpen);
    return final.toDataURL("image/jpeg", profile.quality / 100);

  } else {
    // ── Single-pass ────────────────────────────────────────────────────────
    onStep(`Upscaling ${srcW}×${srcH} → ${targetW}×${targetH}px...`);
    const canvas = drawScaleStep(imgEl, targetW, targetH, profile);
    const ctx = canvas.getContext("2d")!;
    await new Promise((r) => setTimeout(r, 0));
    if (profile.denoise > 0) applyBilateralDenoise(ctx, targetW, targetH, profile.denoise);
    await new Promise((r) => setTimeout(r, 0));
    if (profile.sharpen > 0) applyUnsharpMask(ctx, targetW, targetH, profile.sharpen);
    return canvas.toDataURL("image/jpeg", profile.quality / 100);
  }
}

// ─── Server-Side Sharp Upscale ────────────────────────────────────────────────
// Calls the /api/upscale endpoint which uses Sharp (Node.js) for Lanczos3
// resampling — significantly sharper than browser Canvas API.
// Falls back to browser pipeline if server returns error.

export async function runServerUpscalePipeline(
  dataUrl: string,
  targetW: number,
  targetH: number,
  engine: UpscaleEngine,
  onStep: (msg: string) => void
): Promise<string> {
  onStep(`Server upscale: Kirim ke Sharp engine (${targetW}×${targetH}px)...`);

  try {
    const res = await fetch("/api/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, targetWidth: targetW, targetHeight: targetH, engine }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(errData.error || `Server error ${res.status}`);
    }

    const result = await res.json() as { dataUrl: string; width: number; height: number; sizeKb: number };
    onStep(`✅ Server upscale selesai: ${result.width}×${result.height}px (${result.sizeKb}KB)`);
    return result.dataUrl;

  } catch (err) {
    console.warn("[runServerUpscalePipeline] Fallback ke browser pipeline:", err);
    onStep("⚠️ Server tidak tersedia, fallback ke browser pipeline...");
    // Can't call browser pipeline here without HTMLImageElement — caller handles fallback
    throw err;
  }
}
