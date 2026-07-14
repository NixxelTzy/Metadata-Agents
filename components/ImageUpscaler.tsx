"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImageFile {
  id: string;
  name: string;
  size: number;
  preview: string;
  width: number;
  height: number;
  file: File;
  status: "idle" | "processing" | "success" | "error";
  upscaledDataUrl?: string;
  targetWidth?: number;
  targetHeight?: number;
  processingStep?: string;
}

type UpscaleEngine = "ai_super_res" | "bicubic_crisp" | "bilinear_smooth";

interface EngineProfile {
  label: string;
  badge: string;
  description: string;
  smoothing: "high" | "low";
  multiPass: boolean;   // iterative 2× passes before final
  sharpen: number;      // 0–100, applied as unsharp mask on final pass
  denoise: number;      // 0–100, bilateral weight sigma
  contrast: number;     // CSS filter value (1.0 = neutral)
  saturation: number;   // CSS filter value (1.0 = neutral)
  quality: number;      // JPEG output quality 0–100
}

// ─── Engine Profiles — all parameters applied automatically ────────────────────

const ENGINE_PROFILES: Record<UpscaleEngine, EngineProfile> = {
  ai_super_res: {
    label: "AI Super Resolution",
    badge: "MULTI-PASS",
    description: "Iterative 2× upscaling with bilateral denoise & adaptive unsharp masking",
    smoothing: "high",
    multiPass: true,
    sharpen: 55,
    denoise: 38,
    contrast: 1.03,
    saturation: 1.06,
    quality: 94,
  },
  bicubic_crisp: {
    label: "Bicubic Crisp",
    badge: "HIGH-DETAIL",
    description: "Single-pass cubic resampling with strong sharpening for photography & portraits",
    smoothing: "high",
    multiPass: false,
    sharpen: 72,
    denoise: 18,
    contrast: 1.05,
    saturation: 1.02,
    quality: 92,
  },
  bilinear_smooth: {
    label: "Bilinear Smooth",
    badge: "ANTI-ALIAS",
    description: "Smooth interpolation — ideal for vector art, illustrations, and graphic design",
    smoothing: "low",
    multiPass: false,
    sharpen: 0,
    denoise: 12,
    contrast: 1.0,
    saturation: 1.0,
    quality: 90,
  },
};

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function dataURLtoBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",");
  const mime = header!.match(/:(.*?);/)![1]!;
  const bstr = atob(body!);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = src;
  });
}

// ─── Image Processing Pipeline ─────────────────────────────────────────────────

/**
 * Bilateral-style edge-preserving denoise.
 * Uses a range-weighted Gaussian kernel: neighbors with similar color are blended,
 * while edges (high color delta) are preserved.
 */
function applyBilateralDenoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number
): void {
  if (intensity <= 0) return;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const data = imgData.data;
  const sigma = (intensity / 100) * 52;
  const radius = intensity > 55 ? 2 : 1;
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

/**
 * Unsharp masking: amplifies high-frequency edge detail.
 * Uses a discrete Laplacian kernel blended by `amount`.
 */
function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number
): void {
  if (amount <= 0) return;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const data = imgData.data;
  const mix = (amount / 100) * 0.52;
  const cw = 1 + 4 * mix;
  const ew = -mix;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ci = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          src[ci + c]! * cw +
          src[((y - 1) * w + x) * 4 + c]! * ew +
          src[((y + 1) * w + x) * 4 + c]! * ew +
          src[(y * w + (x - 1)) * 4 + c]! * ew +
          src[(y * w + (x + 1)) * 4 + c]! * ew;
        data[ci + c] = Math.min(255, Math.max(0, Math.round(v)));
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Draw one scale step: resizes `src` to (targetW × targetH) on a fresh canvas.
 * Applies contrast + saturation CSS filter during draw for color grading.
 */
function drawScaleStep(
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

/**
 * Full upscale pipeline for one image.
 *
 * ── AI Super Resolution (multi-pass) ──────────────────────────────────────
 *   Doubles resolution iteratively (2×, 2×, …) until target is reached.
 *   Bilateral denoise applied between intermediate passes to prevent
 *   staircase artifacts. Unsharp mask applied only on the final pass.
 *
 * ── Bicubic Crisp (single-pass) ───────────────────────────────────────────
 *   One jump to target with high-quality smoothing, then strong sharpening
 *   and mild denoise for razor-sharp photography results.
 *
 * ── Bilinear Smooth (single-pass) ─────────────────────────────────────────
 *   Gentle single jump with soft interpolation. No sharpening — preserves
 *   the clean look of vector / illustrative content.
 */
async function runUpscalePipeline(
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
    // ── Iterative 2× passes ───────────────────────────────────────────────
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
        // Light denoise between passes to reduce blocky artifacts
        const ctx = stepped.getContext("2d")!;
        applyBilateralDenoise(ctx, nextW, nextH, Math.round(profile.denoise * 0.55));
      }

      cur = stepped;
      curW = nextW;
      curH = nextH;
      pass++;
      await new Promise((r) => setTimeout(r, 0)); // yield to keep UI responsive
    }

    // Final pass: ensure exact target size, then denoise + sharpen
    onStep("Final pass: denoise & unsharp masking...");
    const final = drawScaleStep(cur, targetW, targetH, profile);
    const ctx = final.getContext("2d")!;
    await new Promise((r) => setTimeout(r, 0));
    applyBilateralDenoise(ctx, targetW, targetH, profile.denoise);
    await new Promise((r) => setTimeout(r, 0));
    applyUnsharpMask(ctx, targetW, targetH, profile.sharpen);
    return final.toDataURL("image/jpeg", profile.quality / 100);
  } else {
    // ── Single pass ──────────────────────────────────────────────────────
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

// ─── SliderCompare Component ───────────────────────────────────────────────────

function SliderCompare({
  original,
  upscaled,
  label,
}: {
  original: string;
  upscaled: string;
  label: string;
}) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePos = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPos(Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100)));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging) updatePos(e.clientX); };
    const onUp = () => setDragging(false);
    const onTouch = (e: TouchEvent) => { if (dragging && e.touches[0]) updatePos(e.touches[0].clientX); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        borderRadius: "8px",
        cursor: "ew-resize",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onMouseDown={(e) => { e.preventDefault(); setDragging(true); updatePos(e.clientX); }}
      onTouchStart={(e) => { setDragging(true); if (e.touches[0]) updatePos(e.touches[0].clientX); }}
    >
      {/* ── Upscaled: sets natural container height ── */}
      <img
        src={upscaled}
        alt="Upscaled"
        draggable={false}
        style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }}
      />

      {/* ── Original overlay: clipPath keeps left portion visible ── */}
      <img
        src={original}
        alt="Original"
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          clipPath: `inset(0 ${100 - pos}% 0 0)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Divider + handle ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${pos}%`,
          width: "2px",
          background: "white",
          transform: "translateX(-1px)",
          boxShadow: "0 0 12px rgba(0,0,0,0.7)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 3px 18px rgba(0,0,0,0.5)",
            fontSize: "14px",
            fontWeight: "800",
            color: "#111",
          }}
        >
          ⇔
        </div>
      </div>

      {/* ── Labels ── */}
      <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.72)", color: "white", padding: "3px 9px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", zIndex: 11, pointerEvents: "none", letterSpacing: "0.04em" }}>
        SEBELUM
      </div>
      <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(236,72,153,0.9)", color: "white", padding: "3px 9px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", zIndex: 11, pointerEvents: "none", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ImageUpscaler() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [targetSize, setTargetSize] = useState<3000 | 4000 | 8000>(4000);
  const [engine, setEngine] = useState<UpscaleEngine>("ai_super_res");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const profile = ENGINE_PROFILES[engine];
  const resLabel = targetSize === 3000 ? "3K" : targetSize === 4000 ? "4K" : "8K";

  // ── File ingestion ──────────────────────────────────────────────────────────

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError("");
    const valid = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!valid.length) { setError("Hanya file gambar (JPG, PNG, WEBP) yang didukung."); return; }

    const newImgs: ImageFile[] = [];
    for (const file of valid) {
      try {
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = (e) => res(e.target!.result as string);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const img = await loadImage(dataUrl);
        newImgs.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          preview: dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          file,
          status: "idle",
        });
      } catch {
        setError(`Gagal memuat: ${file.name}`);
      }
    }
    setImages((prev) => [...prev, ...newImgs]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeImage = (id: string) => setImages((p) => p.filter((i) => i.id !== id));
  const clearAll = () => { setImages([]); setError(""); setProgress(""); setModalIndex(null); };

  // ── Upscale runner ──────────────────────────────────────────────────────────

  const handleUpscale = async () => {
    if (!images.length) return;
    setLoading(true);
    setError("");
    setModalIndex(null);

    for (let i = 0; i < images.length; i++) {
      const imgFile = images[i]!;

      setImages((p) => p.map((item, idx) =>
        idx === i ? { ...item, status: "processing", processingStep: "Memuat gambar..." } : item
      ));

      try {
        const imgEl = await loadImage(imgFile.preview);
        const { naturalWidth: srcW, naturalHeight: srcH } = imgEl;
        const maxEdge = Math.max(srcW, srcH);

        // Calculate target dimensions maintaining aspect ratio
        let targetW = srcW;
        let targetH = srcH;
        if (maxEdge < targetSize) {
          const scale = targetSize / maxEdge;
          targetW = Math.round(srcW * scale);
          targetH = Math.round(srcH * scale);
        }

        setProgress(`(${i + 1}/${images.length}) Memproses: ${imgFile.name}`);

        const dataUrl = await runUpscalePipeline(
          imgEl,
          srcW,
          srcH,
          targetW,
          targetH,
          engine,
          (step) =>
            setImages((p) =>
              p.map((item, idx) =>
                idx === i ? { ...item, processingStep: step } : item
              )
            )
        );

        setImages((p) =>
          p.map((item, idx) =>
            idx === i
              ? { ...item, status: "success", upscaledDataUrl: dataUrl, targetWidth: targetW, targetHeight: targetH, processingStep: undefined }
              : item
          )
        );
      } catch (err) {
        console.error(err);
        setImages((p) =>
          p.map((item, idx) =>
            idx === i ? { ...item, status: "error", processingStep: undefined } : item
          )
        );
      }

      await new Promise((r) => setTimeout(r, 80));
    }

    setProgress("✅ Semua gambar berhasil di-upscale!");
    setLoading(false);
  };

  // ── Download handlers ───────────────────────────────────────────────────────

  const handleDownloadSingle = (img: ImageFile) => {
    if (!img.upscaledDataUrl) return;
    const a = document.createElement("a");
    a.href = img.upscaledDataUrl;
    a.download = `${img.name.replace(/\.[^.]+$/, "")}_upscaled_${resLabel.toLowerCase()}.jpg`;
    a.click();
  };

  const handleDownloadAll = async () => {
    const done = images.filter((i) => i.status === "success" && i.upscaledDataUrl);
    if (!done.length) return;
    setProgress("📦 Membuat ZIP...");
    const zip = new JSZip();
    for (const img of done) {
      const blob = dataURLtoBlob(img.upscaledDataUrl!);
      zip.file(`${img.name.replace(/\.[^.]+$/, "")}_upscaled_${resLabel.toLowerCase()}.jpg`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `upscaled_${resLabel.toLowerCase()}_${Date.now()}.zip`;
    a.click();
    setProgress("✅ ZIP berhasil diunduh!");
  };

  // ── Modal navigation ────────────────────────────────────────────────────────

  const successImages = images.filter((i) => i.status === "success" && i.upscaledDataUrl);
  const hasSuccess = successImages.length > 0;
  const modalImg = modalIndex !== null ? (successImages[modalIndex] ?? null) : null;

  const openModal = (img: ImageFile) => {
    const idx = successImages.findIndex((s) => s.id === img.id);
    if (idx !== -1) setModalIndex(idx);
  };

  useEffect(() => {
    if (modalIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")
        setModalIndex((p) => (p !== null && p > 0 ? p - 1 : p));
      if (e.key === "ArrowRight")
        setModalIndex((p) =>
          p !== null && p < successImages.length - 1 ? p + 1 : p
        );
      if (e.key === "Escape") setModalIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalIndex, successImages.length]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="uploader">

      {/* ── Hero ── */}
      <div className="uploader__hero">
        <h2>🔍 AI Photo Upscaler</h2>
        <p>
          Upscale foto ke resolusi <strong>{resLabel}</strong> dengan{" "}
          <strong>{profile.label}</strong>. Denoise, sharpening, dan color
          grading dioptimalkan secara otomatis.
        </p>
      </div>

      {/* ── Control Panel: Resolution + Engine ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "20px",
          borderRadius: "var(--radius)",
          marginBottom: "24px",
        }}
      >
        {/* Resolution picker */}
        <div>
          <label
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              letterSpacing: "0.07em",
              display: "block",
              marginBottom: "10px",
            }}
          >
            Target Resolution
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {([3000, 4000, 8000] as const).map((sz) => {
              const active = targetSize === sz;
              const lbl = sz === 3000 ? "3K" : sz === 4000 ? "4K" : "8K";
              const sub =
                sz === 3000
                  ? "≈3000px sisi terpanjang"
                  : sz === 4000
                  ? "≈4000px sisi terpanjang"
                  : "≈8000px sisi terpanjang";
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setTargetSize(sz)}
                  disabled={loading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${active ? "#ec4899" : "var(--border)"}`,
                    background: active
                      ? "rgba(236,72,153,0.12)"
                      : "var(--bg-secondary)",
                    cursor: loading ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: "800",
                      fontSize: "18px",
                      color: active ? "#ec4899" : "var(--text)",
                      minWidth: "28px",
                    }}
                  >
                    {lbl}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Engine picker */}
        <div>
          <label
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              letterSpacing: "0.07em",
              display: "block",
              marginBottom: "10px",
            }}
          >
            Upscale Engine
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(
              Object.entries(ENGINE_PROFILES) as [UpscaleEngine, EngineProfile][]
            ).map(([key, p]) => {
              const active = engine === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEngine(key)}
                  disabled={loading}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: `1px solid ${active ? "#ec4899" : "var(--border)"}`,
                    background: active
                      ? "rgba(236,72,153,0.08)"
                      : "var(--bg-secondary)",
                    cursor: loading ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  {/* Radio dot */}
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      border: `2px solid ${active ? "#ec4899" : "var(--border)"}`,
                      background: active ? "#ec4899" : "transparent",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        color: active ? "#ec4899" : "var(--text)",
                      }}
                    >
                      {p.label}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                        lineHeight: 1.4,
                      }}
                    >
                      {p.description}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: "800",
                      padding: "3px 7px",
                      borderRadius: "4px",
                      background: active
                        ? "rgba(236,72,153,0.18)"
                        : "var(--surface)",
                      color: active ? "#ec4899" : "var(--text-muted)",
                      border: `1px solid ${
                        active ? "rgba(236,72,153,0.45)" : "var(--border)"
                      }`,
                      flexShrink: 0,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {p.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Dropzone ── */}
      <section
        className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={loading}
        />
        <div className="dropzone__icon">🔍</div>
        <p className="dropzone__title">Seret &amp; lepas foto di sini</p>
        <p className="dropzone__subtitle">atau klik untuk memilih file</p>
        <p className="dropzone__hint">
          JPG · PNG · WEBP · Banyak file sekaligus
        </p>
      </section>

      {/* ── Status bar ── */}
      {progress && !error && (
        <p className="status status--info" style={{ marginTop: "16px" }}>
          {progress}
        </p>
      )}
      {error && (
        <p className="status status--error" style={{ marginTop: "16px" }}>
          {error}
        </p>
      )}

      {/* ── Image list ── */}
      {images.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          {/* Section header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <h2
              style={{
                fontSize: "14px",
                fontWeight: "700",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Gambar{" "}
              <span className="badge">{images.length}</span>
              {hasSuccess && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "400",
                    color: "var(--text-muted)",
                  }}
                >
                  · {successImages.length} selesai di-upscale
                </span>
              )}
            </h2>
            <div style={{ display: "flex", gap: "10px" }}>
              {hasSuccess && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  style={{
                    padding: "7px 14px",
                    background: "#ec4899",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  📦 Download ZIP
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={clearAll}
                disabled={loading}
              >
                Hapus Semua
              </button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${
                    img.status === "success"
                      ? "rgba(236,72,153,0.25)"
                      : img.status === "error"
                      ? "rgba(239,68,68,0.25)"
                      : "var(--border)"
                  }`,
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  transition: "border-color 0.2s",
                }}
              >
                {/* ── File row ── */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "12px 16px",
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <img
                      src={img.preview}
                      alt={img.name}
                      style={{
                        width: "54px",
                        height: "54px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        display: "block",
                      }}
                    />
                    {img.status === "processing" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.55)",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          className="spinner"
                          style={{
                            width: "16px",
                            height: "16px",
                            borderWidth: "2px",
                            borderColor:
                              "#ec4899 transparent transparent transparent",
                          }}
                        />
                      </div>
                    )}
                    {img.status === "success" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -5,
                          right: -5,
                          width: "18px",
                          height: "18px",
                          background: "#4ade80",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          border: "2px solid var(--surface)",
                          fontWeight: "700",
                        }}
                      >
                        ✓
                      </div>
                    )}
                  </div>

                  {/* File info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {img.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                      }}
                    >
                      {img.width}×{img.height}px · {formatSize(img.size)}
                      {img.targetWidth && img.targetHeight && (
                        <span style={{ color: "#ec4899", marginLeft: "8px" }}>
                          → {img.targetWidth}×{img.targetHeight}px ({resLabel})
                        </span>
                      )}
                    </div>
                    {img.status === "processing" && img.processingStep && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#f59e0b",
                          marginTop: "4px",
                          fontWeight: "600",
                        }}
                      >
                        ⚙ {img.processingStep}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {img.status === "idle" && (
                      <span
                        style={{ fontSize: "11px", color: "var(--text-muted)" }}
                      >
                        Menunggu
                      </span>
                    )}
                    {img.status === "processing" && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#f59e0b",
                          fontWeight: "700",
                        }}
                      >
                        Memproses...
                      </span>
                    )}
                    {img.status === "error" && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--error)",
                          fontWeight: "700",
                        }}
                      >
                        ✕ Gagal
                      </span>
                    )}
                    {img.status === "success" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openModal(img)}
                          style={{
                            padding: "5px 11px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "rgba(236,72,153,0.12)",
                            border: "1px solid rgba(236,72,153,0.4)",
                            color: "#ec4899",
                            borderRadius: "5px",
                            cursor: "pointer",
                          }}
                        >
                          🔍 Lihat Hasil
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSingle(img)}
                          style={{
                            padding: "5px 11px",
                            fontSize: "11px",
                            fontWeight: "600",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            borderRadius: "5px",
                            cursor: "pointer",
                          }}
                        >
                          ⬇ Unduh
                        </button>
                      </>
                    )}
                    {!loading && img.status !== "processing" && (
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "16px",
                          padding: "4px",
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Inline slider comparison ── */}
                {img.status === "success" && img.upscaledDataUrl && (
                  <div
                    style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: "8px",
                      }}
                    >
                      ← Geser slider untuk membandingkan · Sebelum vs{" "}
                      {resLabel} Upscaled →
                    </div>
                    <SliderCompare
                      original={img.preview}
                      upscaled={img.upscaledDataUrl}
                      label={`${resLabel} UPSCALED`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Run button ── */}
          <div style={{ marginTop: "20px" }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{ width: "100%", padding: "14px", fontSize: "14px" }}
              onClick={handleUpscale}
              disabled={loading || !images.length}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Memproses dengan {profile.label}...
                </>
              ) : (
                <>
                  ✨ Jalankan Upscale — {resLabel} · {profile.label}
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* ── Full-screen comparison modal ── */}
      {modalImg && modalImg.upscaledDataUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.93)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setModalIndex(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              width: "95%",
              maxWidth: "1280px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              maxHeight: "90vh",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0 }}>
                  Before / After — {modalImg.name}
                </h3>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {modalImg.width}×{modalImg.height} →{" "}
                  <strong style={{ color: "#ec4899" }}>
                    {modalImg.targetWidth}×{modalImg.targetHeight}px
                  </strong>{" "}
                  · {profile.label}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Navigation */}
                {successImages.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setModalIndex((p) =>
                          p !== null && p > 0 ? p - 1 : p
                        )
                      }
                      disabled={modalIndex === 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        cursor: modalIndex === 0 ? "not-allowed" : "pointer",
                        opacity: modalIndex === 0 ? 0.35 : 1,
                        fontSize: "18px",
                        fontWeight: "700",
                        color: "var(--text)",
                      }}
                    >
                      ‹
                    </button>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        minWidth: "60px",
                        textAlign: "center",
                      }}
                    >
                      {(modalIndex ?? 0) + 1} / {successImages.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setModalIndex((p) =>
                          p !== null && p < successImages.length - 1
                            ? p + 1
                            : p
                        )
                      }
                      disabled={modalIndex === successImages.length - 1}
                      style={{
                        width: "32px",
                        height: "32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        cursor:
                          modalIndex === successImages.length - 1
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          modalIndex === successImages.length - 1 ? 0.35 : 1,
                        fontSize: "18px",
                        fontWeight: "700",
                        color: "var(--text)",
                      }}
                    >
                      ›
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setModalIndex(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text)",
                    fontSize: "22px",
                    cursor: "pointer",
                    fontWeight: "600",
                    padding: "4px 8px",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div
              style={{
                overflowY: "auto",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <SliderCompare
                original={modalImg.preview}
                upscaled={modalImg.upscaledDataUrl!}
                label={`${resLabel} UPSCALED`}
              />

              {/* Info row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>Sebelum: </span>
                    <strong>
                      {modalImg.width}×{modalImg.height}px
                    </strong>
                  </span>
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>Sesudah: </span>
                    <strong style={{ color: "#ec4899" }}>
                      {modalImg.targetWidth}×{modalImg.targetHeight}px ({resLabel})
                    </strong>
                  </span>
                  <span>
                    <span style={{ color: "var(--text-muted)" }}>Engine: </span>
                    <strong>{profile.label}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(modalImg)}
                  style={{
                    padding: "7px 18px",
                    background: "#ec4899",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ⬇ Unduh Gambar Ini
                </button>
              </div>

              {successImages.length > 1 && (
                <p
                  style={{
                    textAlign: "center",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  ← → untuk berpindah gambar · Esc untuk menutup
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
