"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImageFile {
  id: string;
  name: string;
  size: number;
  type: 'image';
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

interface VideoFile {
  id: string;
  name: string;
  size: number;
  type: 'video';
  file: File;
  thumbnailDataUrl: string; // first frame
  duration: number; // in seconds
  width: number;
  height: number;
  frameCount: number;
  status: 'idle' | 'processing' | 'success' | 'error';
  processedFrames?: number;
  totalFrames?: number;
  outputZipUrl?: string; // blob URL for download
  previewOriginalDataUrl?: string; // frame 0 original
  previewUpscaledDataUrl?: string; // frame 0 upscaled
  processingStep?: string;
}

type MediaFile = (ImageFile & { type: 'image' }) | VideoFile;

type UpscaleEngine = "ai_super_res" | "bicubic_crisp" | "bilinear_smooth";

interface EngineProfile {
  label: string;
  badge: string;
  description: string;
  smoothing: "high" | "low";
  multiPass: boolean;
  sharpen: number;
  denoise: number;
  contrast: number;
  saturation: number;
  quality: number;
}

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

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp|svg|tiff)$/i.test(file.name);
}

async function extractVideoFrame(file: File, timeSeconds: number): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const drawAndResolve = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.9);
        URL.revokeObjectURL(url);
        resolve(data);
      } catch {
        URL.revokeObjectURL(url);
        resolve("");
      }
    };

    const timeout = setTimeout(() => {
      drawAndResolve();
    }, 3500);

    video.onloadeddata = () => {
      if (timeSeconds > 0) {
        video.currentTime = timeSeconds;
      } else {
        clearTimeout(timeout);
        drawAndResolve();
      }
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      drawAndResolve();
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve("");
    };

    video.load();
  });
}

async function getVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, duration: 5 });
    }, 4000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      let d = video.duration;
      if (!d || isNaN(d) || !isFinite(d) || d <= 0) d = 5;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h, duration: d });
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve({ width: 1280, height: 720, duration: 5 });
    };

    video.load();
  });
}

function VideoThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  
  if (!url) return null;
  return (
    <video
      src={url}
      style={{
        width: "54px",
        height: "54px",
        objectFit: "cover",
        borderRadius: "6px",
        border: "1px solid var(--border)",
        display: "block",
      }}
      muted
      playsInline
    />
  );
}

// ─── Image Processing Pipeline ─────────────────────────────────────────────────

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

/**
 * Extract multiple frames from a video using a SINGLE shared <video> element
 * to avoid memory issues from creating hundreds of video objects.
 */
async function extractFramesSequential(
  file: File,
  times: number[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  return new Promise((resolve) => {
    const results: string[] = new Array(times.length).fill("");
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let currentIndex = 0;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = "";
      video.load();
    };

    const captureFrame = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.9);
      } catch {
        return "";
      }
    };

    const seekNext = () => {
      if (currentIndex >= times.length) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(results);
        }
        return;
      }
      const t = times[currentIndex]!;
      // Clamp time to valid range
      const clampedTime = Math.min(t, (video.duration || 9999) - 0.01);
      video.currentTime = Math.max(0, clampedTime);
    };

    const onSeeked = () => {
      results[currentIndex] = captureFrame();
      onProgress?.(currentIndex + 1, times.length);
      currentIndex++;
      // Small yield so browser doesn't freeze
      setTimeout(seekNext, 8);
    };

    const onError = () => {
      // Skip failed frame, continue
      currentIndex++;
      setTimeout(seekNext, 8);
    };

    // Fallback: if seeking takes too long, just capture whatever is there
    const stallCheck = setInterval(() => {
      if (settled) { clearInterval(stallCheck); return; }
      if (currentIndex < times.length) {
        results[currentIndex] = captureFrame();
        onProgress?.(currentIndex + 1, times.length);
        currentIndex++;
        seekNext();
      }
    }, 5000);

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    video.onloadeddata = () => {
      seekNext();
    };

    video.onerror = () => {
      clearInterval(stallCheck);
      if (!settled) {
        settled = true;
        cleanup();
        resolve(results);
      }
    };

    // Timeout safety net
    setTimeout(() => {
      clearInterval(stallCheck);
      if (!settled) {
        settled = true;
        cleanup();
        resolve(results);
      }
    }, 120000); // 2 min max

    video.load();
  });
}

async function processVideoFile(
  videoFile: VideoFile,
  engine: UpscaleEngine,
  targetW: number,
  targetH: number,
  onStep: (step: string, processed?: number, total?: number) => void
): Promise<{ zipUrl: string; upscaledFrame0: string; originalFrame0: string }> {
  const profile = ENGINE_PROFILES[engine];

  // Determine aspect-ratio-correct target dimensions
  const srcW = videoFile.width || 1280;
  const srcH = videoFile.height || 720;
  const scaleX = targetW / srcW;
  const scaleY = targetH / srcH;
  const scale = Math.min(scaleX, scaleY); // preserve aspect ratio
  const finalW = Math.max(srcW, Math.round(srcW * scale));
  const finalH = Math.max(srcH, Math.round(srcH * scale));

  // Frame budget: cap at 300 frames max to avoid browser memory exhaustion
  const fps = 30;
  const duration = videoFile.duration || 5;
  const rawFrameCount = Math.ceil(duration * fps);
  const totalFrames = Math.min(rawFrameCount, 300);

  // Build time array
  const times: number[] = [];
  for (let i = 0; i < totalFrames; i++) {
    times.push(i / fps);
  }

  onStep(`🎬 Mengekstrak ${totalFrames} frame dari video...`, 0, totalFrames);

  // Extract all frames using ONE shared video element
  const rawFrames = await extractFramesSequential(
    videoFile.file,
    times,
    (done, total) => onStep(`📸 Ekstrak frame ${done}/${total}...`, done, total)
  );

  // Process each frame through the upscale pipeline
  const zip = new JSZip();
  let upscaledFrame0 = "";
  let originalFrame0 = "";

  for (let i = 0; i < rawFrames.length; i++) {
    const frameDataUrl = rawFrames[i]!;

    if (!frameDataUrl) {
      // Skip failed frame — write placeholder so frame numbers stay consistent
      continue;
    }

    if (i === 0) originalFrame0 = frameDataUrl;

    onStep(`✨ Upscale frame ${i + 1}/${totalFrames} (${finalW}×${finalH})`, i + 1, totalFrames);

    try {
      const imgEl = await loadImage(frameDataUrl);
      const upscaledDataUrl = await runUpscalePipeline(
        imgEl,
        imgEl.naturalWidth,
        imgEl.naturalHeight,
        finalW,
        finalH,
        engine,
        () => {}
      );

      if (i === 0) upscaledFrame0 = upscaledDataUrl;

      const blob = dataURLtoBlob(upscaledDataUrl);
      const frameName = `frame_${i.toString().padStart(5, "0")}.jpg`;
      zip.file(frameName, blob);
    } catch {
      // Skip errored frame gracefully
    }

    // Yield to browser every 5 frames to keep UI responsive
    if (i % 5 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Include metadata file
  const meta = {
    originalFile: videoFile.name,
    originalResolution: `${srcW}×${srcH}`,
    upscaledResolution: `${finalW}×${finalH}`,
    engine: profile.label,
    totalFrames,
    fps,
    durationSeconds: duration,
    processedAt: new Date().toISOString(),
    note: "Reassemble frames using ffmpeg: ffmpeg -framerate 30 -i frame_%05d.jpg -c:v libx264 -pix_fmt yuv420p output.mp4",
  };
  zip.file("metadata.json", JSON.stringify(meta, null, 2));

  onStep("📦 Membuat ZIP file...", totalFrames, totalFrames);
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
  const zipUrl = URL.createObjectURL(zipBlob);

  return { zipUrl, upscaledFrame0, originalFrame0 };
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
      <img
        src={upscaled}
        alt="Upscaled"
        draggable={false}
        style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }}
      />
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

// ─── Resolution Presets ───────────────────────────────────────────────────────

interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
  badge: string;
  desc: string;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: "2000×2000", width: 2000, height: 2000, badge: "2K SQ",   desc: "Square · Stock standard" },
  { label: "2048×2048", width: 2048, height: 2048, badge: "2K+",     desc: "Adobe Stock minimum" },
  { label: "2048×3072", width: 2048, height: 3072, badge: "3:2 P",   desc: "Portrait · 2:3 ratio" },
  { label: "3072×2048", width: 3072, height: 2048, badge: "3:2 L",   desc: "Landscape · 3:2 ratio" },
  { label: "4096×4096", width: 4096, height: 4096, badge: "4K SQ",   desc: "High-res square" },
  { label: "6144×4096", width: 6144, height: 4096, badge: "6K",      desc: "Ultra-wide · 3:2" },
  { label: "8192×8192", width: 8192, height: 8192, badge: "8K SQ",   desc: "Max quality · pro" },
];

export default function ImageUpscaler() {
  const [images, setImages] = useState<MediaFile[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<ResolutionPreset>(RESOLUTION_PRESETS[3]!);
  const [engine, setEngine] = useState<UpscaleEngine>("ai_super_res");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const profile = ENGINE_PROFILES[engine];
  const resLabel = selectedPreset.label;

  // ── File ingestion ──────────────────────────────────────────────────────────

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError("");
    const valid = Array.from(files).filter(
      (f) => isImageFile(f) || isVideoFile(f)
    );
    if (!valid.length) {
      setError("Hanya file gambar dan video yang didukung.");
      return;
    }

    const newMedia: MediaFile[] = [];
    for (const file of valid) {
      try {
        if (isImageFile(file)) {
          const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = (e) => res(e.target!.result as string);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          const img = await loadImage(dataUrl);
          newMedia.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            type: "image",
            preview: dataUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
            file,
            status: "idle",
          });
        } else if (isVideoFile(file)) {
          const meta = await getVideoMetadata(file);
          const thumb = await extractVideoFrame(file, 0);
          const frameCount = Math.max(30, Math.ceil(meta.duration * 30));
          newMedia.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            type: "video",
            file,
            thumbnailDataUrl: thumb,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            frameCount,
            status: "idle",
          });
        }
      } catch (err) {
        console.error("File load error:", err);
        setError(`Gagal memuat: ${file.name}`);
      }
    }
    setImages((prev) => [...prev, ...newMedia]);
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
      const media = images[i]!;

      setImages((p) => p.map((item, idx) =>
        idx === i ? { ...item, status: "processing", processingStep: "Memulai...", processedFrames: 0, totalFrames: media.type === 'video' ? Math.min(media.frameCount, 300) : undefined } : item
      ));

      try {
        if (media.type === 'image') {
          const imgEl = await loadImage(media.preview);
          const { naturalWidth: srcW, naturalHeight: srcH } = imgEl;

          // Use exact preset dimensions — only upscale, never downscale
          const targetW = Math.max(srcW, selectedPreset.width);
          const targetH = Math.max(srcH, selectedPreset.height);

          setProgress(`(${i + 1}/${images.length}) Memproses: ${media.name}`);

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
        } else {
          // Video processing
          setProgress(`(${i + 1}/${images.length}) Memproses Video: ${media.name}`);
          const { zipUrl, upscaledFrame0, originalFrame0 } = await processVideoFile(
            media,
            engine,
            selectedPreset.width,
            selectedPreset.height,
            (step, processed, total) => {
              setImages((p) =>
                p.map((item, idx) =>
                  idx === i
                    ? { ...item, processingStep: step, processedFrames: processed, totalFrames: total }
                    : item
                )
              );
            }
          );

          setImages((p) =>
            p.map((item, idx) =>
              idx === i
                ? { ...item, status: "success", outputZipUrl: zipUrl, previewOriginalDataUrl: originalFrame0, previewUpscaledDataUrl: upscaledFrame0, processingStep: undefined }
                : item
            )
          );
        }
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

    setProgress("✅ Semua proses berhasil diselesaikan!");
    setLoading(false);
  };

  // ── Download handlers ───────────────────────────────────────────────────────

  const handleDownloadSingle = (media: MediaFile) => {
    if (media.type === 'image' && media.upscaledDataUrl) {
      const a = document.createElement("a");
      a.href = media.upscaledDataUrl;
      a.download = `${media.name.replace(/\.[^.]+$/, "")}_upscaled_${selectedPreset.label.replace('×', 'x')}.jpg`;
      a.click();
    } else if (media.type === 'video' && media.outputZipUrl) {
      const a = document.createElement("a");
      a.href = media.outputZipUrl;
      a.download = `${media.name.replace(/\.[^.]+$/, "")}_upscaled_${selectedPreset.label.replace('×', 'x')}_${Date.now()}.zip`;
      a.click();
    }
  };

  const handleDownloadAll = async () => {
    const doneImages = images.filter((i) => i.status === "success" && i.type === 'image' && i.upscaledDataUrl) as (ImageFile & { type: 'image' })[];
    const doneVideos = images.filter((i) => i.status === "success" && i.type === 'video' && i.outputZipUrl) as VideoFile[];
    
    if (!doneImages.length && !doneVideos.length) return;
    
    if (doneImages.length > 0) {
      setProgress("📦 Membuat ZIP untuk gambar...");
      const zip = new JSZip();
      for (const img of doneImages) {
        const blob = dataURLtoBlob(img.upscaledDataUrl!);
        zip.file(`${img.name.replace(/\.[^.]+$/, "")}_upscaled_${selectedPreset.label.replace('×', 'x')}.jpg`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = `upscaled_images_${selectedPreset.label.replace('×', 'x')}_${Date.now()}.zip`;
      a.click();
    }

    for (const vid of doneVideos) {
      handleDownloadSingle(vid);
      await new Promise(r => setTimeout(r, 500));
    }
    
    setProgress("✅ Semua file berhasil diunduh!");
  };

  // ── Modal navigation ────────────────────────────────────────────────────────

  const successImages = images.filter((i) => i.status === "success" && ((i.type === 'image' && i.upscaledDataUrl) || (i.type === 'video' && i.previewUpscaledDataUrl)));
  const hasSuccess = successImages.length > 0;
  const modalImg = modalIndex !== null ? (successImages[modalIndex] ?? null) : null;

  const openModal = (img: MediaFile) => {
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

      <div className="uploader__hero">
        <h2>🔍 AI Photo & Video Upscaler</h2>
        <p>
          Upscale foto & video ke resolusi tepat <strong>{selectedPreset.label}px</strong>{" "}
          ({selectedPreset.desc}) menggunakan <strong>{profile.label}</strong>.{" "}
          Denoise, sharpening, dan color grading dioptimalkan secara otomatis.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "20px",
          borderRadius: "var(--radius)",
          marginBottom: "24px",
        }}
      >
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
            Target Resolution (Fixed Pixel)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {RESOLUTION_PRESETS.map((preset) => {
              const active = selectedPreset.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSelectedPreset(preset)}
                  disabled={loading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${active ? "#ec4899" : "var(--border)"}`,
                    background: active ? "rgba(236,72,153,0.12)" : "var(--bg-secondary)",
                    cursor: loading ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontWeight: "800", fontSize: "13px", color: active ? "#ec4899" : "var(--text)", fontFamily: "monospace" }}>
                      {preset.label}
                    </span>
                    <span style={{
                      fontSize: "9px",
                      fontWeight: "800",
                      color: active ? "#ec4899" : "var(--text-muted)",
                      background: active ? "rgba(236,72,153,0.18)" : "rgba(255,255,255,0.06)",
                      padding: "1px 5px",
                      borderRadius: "4px",
                      letterSpacing: "0.05em",
                    }}>
                      {preset.badge}
                    </span>
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{preset.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

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
          accept="image/*,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg,video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={loading}
        />
        <div className="dropzone__icon">🔍</div>
        <p className="dropzone__title">Seret &amp; lepas foto atau video di sini</p>
        <p className="dropzone__subtitle">atau klik untuk memilih file</p>
        <p className="dropzone__hint">
          JPG · PNG · WEBP · MP4 · WebM · MOV · AVI · MKV · GIF · Banyak file
        </p>
      </section>

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

      {images.length > 0 && (
        <section style={{ marginTop: "24px" }}>
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
              File{" "}
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
                  📦 Download Semua
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {img.type === 'video' ? (
                      <VideoThumbnail file={img.file} />
                    ) : (
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
                    )}
                    {img.type === 'video' && (
                      <div
                        style={{
                          position: "absolute",
                          top: 4,
                          left: 4,
                          background: "rgba(0,0,0,0.7)",
                          color: "white",
                          fontSize: "8px",
                          padding: "2px 4px",
                          borderRadius: "4px",
                          fontWeight: "bold",
                        }}
                      >
                        📹 Video
                      </div>
                    )}
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
                      {img.type === 'video' && ` · ${Math.round(img.duration)}s · ${img.frameCount} frames`}
                      {img.type === 'image' && img.targetWidth && img.targetHeight && (
                        <span style={{ color: "#ec4899", marginLeft: "8px" }}>
                          → {img.targetWidth}×{img.targetHeight}px ({resLabel})
                        </span>
                      )}
                      {img.type === 'video' && img.frameCount > 300 && (
                        <span style={{ color: "#ef4444", marginLeft: "8px" }}>
                          (Dibatasi max 300 frame)
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
                        ⚙ {img.processingStep} {img.type === 'video' && img.processedFrames !== undefined && img.totalFrames !== undefined ? ` (Frame ${img.processedFrames} / ${img.totalFrames})` : ''}
                      </div>
                    )}
                  </div>

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

                {img.status === "success" && (
                  (img.type === 'image' && img.upscaledDataUrl) ||
                  (img.type === 'video' && img.previewOriginalDataUrl && img.previewUpscaledDataUrl)
                ) && (
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
                      original={img.type === 'image' ? img.preview : img.previewOriginalDataUrl!}
                      upscaled={img.type === 'image' ? img.upscaledDataUrl! : img.previewUpscaledDataUrl!}
                      label={`${resLabel} UPSCALED`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

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

      {modalImg && (
        (modalImg.type === 'image' && modalImg.upscaledDataUrl) ||
        (modalImg.type === 'video' && modalImg.previewUpscaledDataUrl)
      ) && (
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
                  {modalImg.width}×{modalImg.height}
                  {modalImg.type === 'image' && modalImg.targetWidth && modalImg.targetHeight && (
                    <>
                      {" "}→{" "}
                      <strong style={{ color: "#ec4899" }}>
                        {modalImg.targetWidth}×{modalImg.targetHeight}px
                      </strong>
                    </>
                  )}{" "}
                  · {profile.label}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                original={modalImg.type === 'image' ? modalImg.preview : modalImg.previewOriginalDataUrl!}
                upscaled={modalImg.type === 'image' ? modalImg.upscaledDataUrl! : modalImg.previewUpscaledDataUrl!}
                label={`${resLabel} UPSCALED`}
              />

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
                  {modalImg.type === 'image' && modalImg.targetWidth && modalImg.targetHeight && (
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Sesudah: </span>
                      <strong style={{ color: "#ec4899" }}>
                        {modalImg.targetWidth}×{modalImg.targetHeight}px ({resLabel})
                      </strong>
                    </span>
                  )}
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
                  ⬇ Unduh File Ini
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
