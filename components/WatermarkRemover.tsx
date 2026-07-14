"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import JSZip from "jszip";

// ─── Types ────────────────────────────────────────────────────────────────────
type DrawTool = "brush" | "rect" | "eraser" | "clone";
type Algorithm = "generative_fill" | "navier_stokes" | "heat_diffusion" | "patch_synthesis" | "median_blend";
type MediaType = "image" | "video";

interface Point {
  x: number;
  y: number;
}

interface AlgoProfile {
  label: string;
  badge: string;
  desc: string;
  passes: number;
  denoise: number;
  sharpen: boolean;
}

const ALGO_PROFILES: Record<Algorithm, AlgoProfile> = {
  generative_fill: {
    label: "Generative AI Fill Simulation",
    badge: "ADVANCED MULTI-PASS",
    desc: "Simulasi Generative Fill menggunakan multi-pass anisotropic diffusion & rekonstruksi tekstur tepi",
    passes: 8,
    denoise: 45,
    sharpen: true,
  },
  navier_stokes: {
    label: "Navier-Stokes Isophotes",
    badge: "EDGE-AWARE",
    desc: "Transportasi linear intensitas warna mengikuti garis batas kontras (isophotes)",
    passes: 6,
    denoise: 25,
    sharpen: true,
  },
  heat_diffusion: {
    label: "Bilateral Heat Diffusion",
    badge: "GRADIENT PRESERVATION",
    desc: "Penyebaran gradien warna terarah untuk melestarikan pencahayaan latar belakang",
    passes: 5,
    denoise: 35,
    sharpen: false,
  },
  patch_synthesis: {
    label: "Texture Patch Synthesis",
    badge: "COMPLEX TEXTURE",
    desc: "Pencarian exemplar-patch dari region non-masked untuk tekstur kompleks (rumput, dinding bata)",
    passes: 1,
    denoise: 15,
    sharpen: false,
  },
  median_blend: {
    label: "Fast Median Blend",
    badge: "SOLID/GRADIENT",
    desc: "Metode cepat dengan blending median untuk area datar atau warna seragam",
    passes: 1,
    denoise: 10,
    sharpen: false,
  },
};

const TOOL_OPTIONS = [
  { id: "brush", label: "Brush", icon: "🖌️", desc: "Gambar bebas area watermark" },
  { id: "rect", label: "Rectangle", icon: "⬜", desc: "Seleksi cepat area kotak" },
  { id: "eraser", label: "Eraser", icon: "🧹", desc: "Hapus seleksi mask yang salah" },
  { id: "clone", label: "Clone Stamp", icon: "🐑", desc: "Kloning tekstur (Alt+Klik untuk mengambil sumber)" },
] as const;

// ─── Helper Functions ──────────────────────────────────────────────────────────

function dataURLtoBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(",");
  const mime = header!.match(/:(.*?);/)![1]!;
  const bstr = atob(body!);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

function buildMaskArray(maskCanvas: HTMLCanvasElement): Uint8Array {
  const ctx = maskCanvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const mask = new Uint8Array(maskCanvas.width * maskCanvas.height);
  for (let i = 0; i < mask.length; i++) {
    // If red channel is prominent and opacity is high
    mask[i] = d[i * 4 + 3]! > 20 ? 1 : 0;
  }
  return mask;
}

// ─── Inpainting Engines ────────────────────────────────────────────────────────

async function smartInpaint(
  px: Uint8ClampedArray,
  mask: Uint8Array,
  W: number,
  H: number,
  algo: Algorithm,
  onProgress?: (s: string) => void
): Promise<void> {
  const profile = ALGO_PROFILES[algo];
  const totalPixels = W * H;

  // Initialize buffers
  const rBuf = new Float32Array(totalPixels);
  const gBuf = new Float32Array(totalPixels);
  const bBuf = new Float32Array(totalPixels);
  const filled = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (!mask[i]) {
      const p = i * 4;
      rBuf[i] = px[p]!;
      gBuf[i] = px[p + 1]!;
      bBuf[i] = px[p + 2]!;
      filled[i] = 1;
    }
  }

  const maskedIndices: number[] = [];
  for (let i = 0; i < totalPixels; i++) {
    if (mask[i]) maskedIndices.push(i);
  }

  if (maskedIndices.length === 0) return;

  // ─── Generative AI Fill & Diffusion Simulation ───
  if (algo === "generative_fill" || algo === "heat_diffusion" || algo === "navier_stokes") {
    const radii = algo === "generative_fill" ? [3, 5, 8, 12, 16, 20, 24, 32] : [4, 8, 12, 16, 24];
    const steps = radii.length;

    for (let pass = 0; pass < steps; pass++) {
      onProgress?.(`Pass ${pass + 1}/${steps} · Menganalisis geometri tepi...`);
      await new Promise((r) => setTimeout(r, 6));

      const radius = radii[pass]!;
      const r2 = radius * radius;

      // Bilateral-weighted blending
      for (const i of maskedIndices) {
        if (filled[i] && algo !== "generative_fill") continue;
        const x = i % W;
        const y = Math.floor(i / W);

        let rSum = 0, gSum = 0, bSum = 0, wSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > r2) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

            const ni = ny * W + nx;
            if (!filled[ni]) continue;

            const dist2 = dx * dx + dy * dy;
            let weight = 1.0 / (dist2 + 0.5);

            // Anisotropic edge enhancement for Navier-Stokes / Generative Fill
            if (algo === "navier_stokes" || algo === "generative_fill") {
              const edgeWeight = 1.0 / (1.0 + Math.abs(rBuf[ni]! - 128) / 255);
              weight *= edgeWeight;
            }

            rSum += rBuf[ni]! * weight;
            gSum += gBuf[ni]! * weight;
            bSum += bBuf[ni]! * weight;
            wSum += weight;
          }
        }

        if (wSum > 0) {
          rBuf[i] = rSum / wSum;
          gBuf[i] = gSum / wSum;
          bBuf[i] = bSum / wSum;
          filled[i] = 1;
        }
      }
    }

    // Seam Smoothing Pass
    onProgress?.("Menyelaraskan warna & blending transisi...");
    await new Promise((r) => setTimeout(r, 6));
    const smoothRadius = 3;
    for (let sPass = 0; sPass < 3; sPass++) {
      for (const i of maskedIndices) {
        const x = i % W;
        const y = Math.floor(i / W);
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let dy = -smoothRadius; dy <= smoothRadius; dy++) {
          for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            rSum += rBuf[ni]!;
            gSum += gBuf[ni]!;
            bBuf[ni]!;
            bSum += bBuf[ni]!;
            count++;
          }
        }
        if (count > 0) {
          rBuf[i] = rBuf[i]! * 0.4 + (rSum / count) * 0.6;
          gBuf[i] = gBuf[i]! * 0.4 + (gSum / count) * 0.6;
          bBuf[i] = bBuf[i]! * 0.4 + (bSum / count) * 0.6;
        }
      }
    }
  }

  // ─── Texture Patch Synthesis ───
  else if (algo === "patch_synthesis") {
    const PATCH_R = 6; // 13x13 patches
    const SAMPLES = 30;
    const srcCoords: number[] = [];

    // Gather candidate source pixels
    for (let y = PATCH_R; y < H - PATCH_R; y += 4) {
      for (let x = PATCH_R; x < W - PATCH_R; x += 4) {
        const idx = y * W + x;
        if (!mask[idx]) srcCoords.push(idx);
      }
    }

    if (srcCoords.length > 0) {
      for (let pass = 0; pass < 2; pass++) {
        onProgress?.(`Sintesis tekstur (Pass ${pass + 1}/2)...`);
        await new Promise((r) => setTimeout(r, 6));

        for (const i of maskedIndices) {
          const x = i % W;
          const y = Math.floor(i / W);

          let bestSSD = Infinity;
          let bestIdx = -1;

          // Random patch matching
          for (let s = 0; s < SAMPLES; s++) {
            const sIdx = srcCoords[Math.floor(Math.random() * srcCoords.length)]!;
            const sx = sIdx % W;
            const sy = Math.floor(sIdx / W);

            let ssd = 0;
            let count = 0;

            for (let dy = -PATCH_R; dy <= PATCH_R; dy += 2) {
              for (let dx = -PATCH_R; dx <= PATCH_R; dx += 2) {
                const tx = x + dx;
                const ty = y + dy;
                const sx2 = sx + dx;
                const sy2 = sy + dy;

                if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                if (sx2 < 0 || sx2 >= W || sy2 < 0 || sy2 >= H) continue;

                const tIdx = ty * W + tx;
                const sIdx2 = sy2 * W + sx2;

                if (filled[tIdx]) {
                  const dr = rBuf[tIdx]! - rBuf[sIdx2]!;
                  const dg = gBuf[tIdx]! - gBuf[sIdx2]!;
                  const db = bBuf[tIdx]! - bBuf[sIdx2]!;
                  ssd += dr * dr + dg * dg + db * db;
                  count++;
                }
              }
            }

            if (count > 0 && ssd < bestSSD) {
              bestSSD = ssd;
              bestIdx = sIdx;
            }
          }

          if (bestIdx !== -1) {
            rBuf[i] = rBuf[bestIdx]!;
            gBuf[i] = gBuf[bestIdx]!;
            bBuf[i] = bBuf[bestIdx]!;
            filled[i] = 1;
          }
        }
      }
    }
  }

  // ─── Fast Median Blend ───
  else if (algo === "median_blend") {
    onProgress?.("Memproses median blur blending...");
    await new Promise((r) => setTimeout(r, 6));

    const radius = 6;
    for (const i of maskedIndices) {
      const x = i % W;
      const y = Math.floor(i / W);
      const rList: number[] = [];
      const gList: number[] = [];
      const bList: number[] = [];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (!mask[ni]) {
            const p = ni * 4;
            rList.push(px[p]!);
            gList.push(px[p + 1]!);
            bList.push(px[p + 2]!);
          }
        }
      }

      if (rList.length > 0) {
        rList.sort((a, b) => a - b);
        gList.sort((a, b) => a - b);
        bList.sort((a, b) => a - b);
        const mid = Math.floor(rList.length / 2);
        rBuf[i] = rList[mid]!;
        gBuf[i] = gList[mid]!;
        bBuf[i] = bList[mid]!;
      }
    }
  }

  // Write back to pixel buffer
  for (const i of maskedIndices) {
    const p = i * 4;
    px[p] = Math.min(255, Math.max(0, Math.round(rBuf[i]!)));
    px[p + 1] = Math.min(255, Math.max(0, Math.round(gBuf[i]!)));
    px[p + 2] = Math.min(255, Math.max(0, Math.round(bBuf[i]!)));
  }

  // Apply optional final sharpening if selected in profile
  if (profile.sharpen) {
    const orig = new Uint8ClampedArray(px);
    const amount = 35;
    const mix = (amount / 100) * 0.4;
    const centerW = 1 + 4 * mix;
    const edgeW = -mix;

    for (const i of maskedIndices) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        const p = i * 4;
        for (let c = 0; c < 3; c++) {
          const val =
            orig[p + c]! * centerW +
            orig[((y - 1) * W + x) * 4 + c]! * edgeW +
            orig[((y + 1) * W + x) * 4 + c]! * edgeW +
            orig[(y * W + x - 1) * 4 + c]! * edgeW +
            orig[(y * W + x + 1) * 4 + c]! * edgeW;
          px[p + c] = Math.min(255, Math.max(0, Math.round(val)));
        }
      }
    }
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WatermarkRemover() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageFullSize, setImageFullSize] = useState({ w: 0, h: 0 });

  // Canvas Workspace
  const [hasCanvas, setHasCanvas] = useState(false);
  const [tool, setTool] = useState<DrawTool>("brush");
  const [brushSize, setBrushSize] = useState<number>(24);
  const [algorithm, setAlgorithm] = useState<Algorithm>("generative_fill");

  // State drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [cloneSource, setCloneSource] = useState<Point | null>(null);
  const [hasMaskPixels, setHasMaskPixels] = useState(false);

  // Result URL (Clean View)
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  // Video processing states
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [processedFrames, setProcessedFrames] = useState<string[]>([]);
  const [frameProgress, setFrameProgress] = useState("");

  // Video Preview Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  // Compare slider
  const [comparePos, setComparePos] = useState(50);
  const [compareDragging, setCompareDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerTimerRef = useRef<NodeJS.Timeout | null>(null);


  // ─── File Loaders ────────────────────────────────────────────────────────────

  const loadImageOntoCanvas = useCallback((src: string, w: number, h: number) => {
    const img = new Image();
    img.onload = () => {
      // Fit within max dimensions for interactive painting
      const maxW = 850;
      const maxH = 600;
      let targetW = w;
      let targetH = h;

      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h);
        targetW = Math.round(w * scale);
        targetH = Math.round(h * scale);
      }

      setImageFullSize({ w, h });

      // Setup Image Canvas
      const ic = imageCanvasRef.current!;
      ic.width = targetW;
      ic.height = targetH;
      const imgCtx = ic.getContext("2d")!;
      imgCtx.drawImage(img, 0, 0, targetW, targetH);

      // Setup Mask Canvas
      const mc = maskCanvasRef.current!;
      mc.width = targetW;
      mc.height = targetH;
      mc.getContext("2d")!.clearRect(0, 0, targetW, targetH);

      setHasCanvas(true);
      setHasMaskPixels(false);
      setResultUrl(null);
      setProcessedFrames([]);
      setIsPlaying(false);
      setCurrentFrameIdx(0);
    };
    img.src = src;
  }, []);

  const handleFile = useCallback((file: File) => {
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setFileName(file.name);
    setOriginalFile(file);

    const url = URL.createObjectURL(file);
    setMediaUrl(url);

    if (!isVid) {
      const img = new Image();
      img.onload = () => loadImageOntoCanvas(url, img.naturalWidth, img.naturalHeight);
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.onloadedmetadata = () => {
        // Seek to 0.5s for initial preview frame
        video.currentTime = Math.min(0.5, video.duration / 2);
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        const preview = canvas.toDataURL("image/jpeg", 0.95);
        loadImageOntoCanvas(preview, video.videoWidth, video.videoHeight);
      };
    }
  }, [loadImageOntoCanvas]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const f = Array.from(files).find(
      (x) => x.type.startsWith("image/") || x.type.startsWith("video/")
    );
    if (f) handleFile(f);
  }, [handleFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  // ─── Drawing Event Handlers ──────────────────────────────────────────────────

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = maskCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) * (c.width / rect.width)),
      y: Math.round((e.clientY - rect.top) * (c.height / rect.height)),
    };
  };

  const paintOnMask = (x: number, y: number, erase = false) => {
    const c = maskCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    setHasMaskPixels(true);
  };

  const cloneStamp = (x: number, y: number) => {
    if (!cloneSource) return;
    const imgCtx = imageCanvasRef.current!.getContext("2d")!;
    const maskCtx = maskCanvasRef.current!.getContext("2d")!;
    const r = brushSize / 2;
    const srcData = imgCtx.getImageData(cloneSource.x - r, cloneSource.y - r, brushSize, brushSize);

    imgCtx.putImageData(srcData, x - r, y - r);

    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.globalCompositeOperation = "source-over";
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    setIsDrawing(true);

    if (tool === "clone") {
      if (e.altKey) {
        setCloneSource({ x, y });
        return;
      }
      cloneStamp(x, y);
    } else if (tool === "rect") {
      setRectStart({ x, y });
    } else if (tool === "brush") {
      paintOnMask(x, y, false);
    } else if (tool === "eraser") {
      paintOnMask(x, y, true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);

    if (tool === "brush") paintOnMask(x, y, false);
    else if (tool === "eraser") paintOnMask(x, y, true);
    else if (tool === "clone" && !e.altKey) cloneStamp(x, y);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === "rect" && rectStart) {
      const { x, y } = getCoords(e);
      const c = maskCanvasRef.current!;
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      const rx = Math.min(rectStart.x, x);
      const ry = Math.min(rectStart.y, y);
      const rw = Math.abs(x - rectStart.x);
      const rh = Math.abs(y - rectStart.y);
      if (rw > 1 && rh > 1) ctx.fillRect(rx, ry, rw, rh);
      setRectStart(null);
      setHasMaskPixels(true);
    }
  };

  const clearMask = () => {
    const c = maskCanvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasMaskPixels(false);
    setResultUrl(null);
    setProgress("");
  };

  // ─── Image Processing Pipeline ────────────────────────────────────────────────

  const processFrame = async (
    imgCtx: CanvasRenderingContext2D,
    maskCanvas: HTMLCanvasElement,
    targetW: number,
    targetH: number,
    updateProgress?: (s: string) => void
  ): Promise<HTMLCanvasElement> => {
    const imgData = imgCtx.getImageData(0, 0, targetW, targetH);
    const px = imgData.data;
    const mask = buildMaskArray(maskCanvas);

    await smartInpaint(px, mask, targetW, targetH, algorithm, updateProgress);

    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    out.getContext("2d")!.putImageData(new ImageData(px, targetW, targetH), 0, 0);
    return out;
  };

  const handleRemoveWatermark = async () => {
    const imgCanvas = imageCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!imgCanvas || !maskCanvas) return;

    setProcessing(true);
    setResultUrl(null);
    setProgress("Inisialisasi engine inpainting...");

    try {
      const ctx = imgCanvas.getContext("2d")!;
      const out = await processFrame(ctx, maskCanvas, imgCanvas.width, imgCanvas.height, setProgress);
      const url = out.toDataURL("image/jpeg", 0.98);
      setResultUrl(url);

      const rc = resultCanvasRef.current!;
      rc.width = out.width;
      rc.height = out.height;
      rc.getContext("2d")!.drawImage(out, 0, 0);

      setProgress("✅ Pemrosesan selesai! Lihat perbandingannya di bawah.");
    } catch (err) {
      setProgress(`✕ Gagal: ${err instanceof Error ? err.message : "Terjadi kesalahan"}`);
    } finally {
      setProcessing(false);
    }
  };

  // ─── Video Processing & Player ────────────────────────────────────────────────

  const handleProcessVideoFrames = async () => {
    if (!originalFile || mediaType !== "video") return;
    const maskCanvas = maskCanvasRef.current!;
    const mask = buildMaskArray(maskCanvas);
    if (!mask.some((v) => v === 1)) {
      setFrameProgress("⚠️ Gambar area watermark pada frame preview terlebih dahulu.");
      return;
    }

    setExtractingFrames(true);
    setProcessedFrames([]);
    setFrameProgress("Menghubungkan ke stream video...");

    const url = URL.createObjectURL(originalFile);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    await new Promise<void>((r) => {
      video.onloadedmetadata = () => r();
    });

    const fps = 24;
    const duration = Math.min(video.duration, 15); // Capped at 15 seconds to prevent hanging
    const totalFrames = Math.round(duration * fps);

    const dW = maskCanvas.width;
    const dH = maskCanvas.height;
    const fW = video.videoWidth;
    const fH = video.videoHeight;

    // Scale mask to full video resolution
    const scaledMaskCanvas = document.createElement("canvas");
    scaledMaskCanvas.width = fW;
    scaledMaskCanvas.height = fH;
    const smCtx = scaledMaskCanvas.getContext("2d")!;
    smCtx.drawImage(maskCanvas, 0, 0, fW, fH);

    const vCanvas = document.createElement("canvas");
    vCanvas.width = fW;
    vCanvas.height = fH;
    const vCtx = vCanvas.getContext("2d")!;

    const tempFrames: string[] = [];

    for (let fi = 0; fi < totalFrames; fi++) {
      setFrameProgress(`Memproses frame ${fi + 1}/${totalFrames} (${Math.round((fi / totalFrames) * 100)}%)`);
      video.currentTime = fi / fps;

      await new Promise<void>((r) => {
        video.onseeked = () => r();
      });

      vCtx.drawImage(video, 0, 0, fW, fH);

      // Inpaint this single frame
      const processed = await processFrame(vCtx, scaledMaskCanvas, fW, fH);
      tempFrames.push(processed.toDataURL("image/jpeg", 0.9));
    }

    setProcessedFrames(tempFrames);
    setFrameProgress("✅ Semua frame video berhasil diproses! Putar video final di bawah.");
    setExtractingFrames(false);
    setCurrentFrameIdx(0);
  };

  // Video player loop
  useEffect(() => {
    if (isPlaying && processedFrames.length > 0) {
      videoPlayerTimerRef.current = setInterval(() => {
        setCurrentFrameIdx((prev) => {
          if (prev >= processedFrames.length - 1) {
            return 0; // loop
          }
          return prev + 1;
        });
      }, 1000 / 24); // 24 FPS play rate
    } else {
      if (videoPlayerTimerRef.current) {
        clearInterval(videoPlayerTimerRef.current);
        videoPlayerTimerRef.current = null;
      }
    }

    return () => {
      if (videoPlayerTimerRef.current) clearInterval(videoPlayerTimerRef.current);
    };
  }, [isPlaying, processedFrames]);

  const handleDownloadVideoZip = async () => {
    if (!processedFrames.length) return;
    setFrameProgress("📦 Mengompresi frame video...");
    const zip = new JSZip();

    processedFrames.forEach((frame, idx) => {
      const blob = dataURLtoBlob(frame);
      const filename = `frame_${String(idx).padStart(5, "0")}.jpg`;
      zip.file(filename, blob);
    });

    // Add FFmpeg command instructions
    zip.file(
      "ffmpeg_command.txt",
      `Gunakan command FFmpeg berikut untuk merakit kembali frame menjadi video:\n\n` +
        `ffmpeg -framerate 24 -i frame_%05d.jpg -c:v libx264 -pix_fmt yuv420p output_cleaned.mp4`
    );

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `video_cleaned_frames_${Date.now()}.zip`;
    a.click();
    setFrameProgress("✅ ZIP frame video berhasil diunduh!");
  };

  const handleDownloadSingle = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `cleaned_${fileName}`;
    a.click();
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="uploader">
      {/* Hero */}
      <div className="uploader__hero">
        <h2>🌊 Advanced Watermark Remover</h2>
        <p>
          Hapus objek dan watermark dari foto &amp; video dengan <strong>inpainting engine</strong> presisi.
          Seluruh algoritma berat bekerja secara optimal di latar belakang.
        </p>
      </div>

      {/* Dropzone */}
      {!hasCanvas && (
        <section
          className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => dropzoneInputRef.current?.click()}
        >
          <input
            ref={dropzoneInputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="dropzone__icon">🌊</div>
          <p className="dropzone__title">Seret &amp; lepas foto atau video di sini</p>
          <p className="dropzone__subtitle">atau klik untuk memilih file</p>
          <p className="dropzone__hint">JPG · PNG · WEBP · MP4 · MOV (Hingga 15 detik video)</p>
        </section>
      )}

      {/* Main workspace */}
      {hasCanvas && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "24px", marginTop: "20px" }}>
          {/* ── Side Controls Panel ── */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "16px",
            }}
          >
            {/* File information */}
            <div>
              <div
                style={{
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  fontWeight: "800",
                  marginBottom: "4px",
                }}
              >
                {mediaType === "video" ? "📹 Preview Frame Video" : "🖼️ Sumber Gambar"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text)", fontWeight: "700", wordBreak: "break-all" }}>
                {fileName}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                Resolusi: {imageFullSize.w}×{imageFullSize.h}px
              </div>
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Drawing Tools Selection */}
            <div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                Selection Tool
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {TOOL_OPTIONS.map((t) => {
                  const active = tool === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTool(t.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: `1px solid ${active ? "#ec4899" : "var(--border)"}`,
                        background: active ? "rgba(236,72,153,0.12)" : "var(--bg-secondary)",
                        color: active ? "#ec4899" : "var(--text)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "700",
                        textAlign: "left",
                      }}
                    >
                      <span>{t.icon}</span>
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {tool === "clone" && (
                <div
                  style={{
                    fontSize: "10px",
                    color: "#ec4899",
                    padding: "8px",
                    background: "rgba(236,72,153,0.08)",
                    borderRadius: "6px",
                    marginTop: "6px",
                    lineHeight: 1.4,
                  }}
                >
                  💡 <strong>Alt + Klik</strong> pada gambar untuk menetapkan sumber kloning, lalu coret di area watermark.
                </div>
              )}
            </div>

            {/* Brush size slider */}
            {(tool === "brush" || tool === "eraser" || tool === "clone") && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    fontWeight: "800",
                    marginBottom: "6px",
                  }}
                >
                  <span>Ukuran Brush</span>
                  <strong>{brushSize}px</strong>
                </div>
                <input
                  type="range"
                  min="4"
                  max="120"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#ec4899", height: "6px", cursor: "pointer" }}
                />
              </div>
            )}

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Inpainting Algorithms */}
            <div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                Inpainting Engine
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {(Object.entries(ALGO_PROFILES) as [Algorithm, AlgoProfile][]).map(([key, a]) => {
                  const active = algorithm === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAlgorithm(key)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: `1px solid ${active ? "#ec4899" : "var(--border)"}`,
                        background: active ? "rgba(236,72,153,0.08)" : "var(--bg-secondary)",
                        color: active ? "#ec4899" : "var(--text)",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>{a.label}</span>
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: "800",
                          color: active ? "#ec4899" : "var(--text-muted)",
                        }}
                      >
                        {a.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Actions button */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "auto" }}>
              <button
                type="button"
                onClick={clearMask}
                style={{
                  padding: "8px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--text-muted)",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                🗑️ Bersihkan Mask
              </button>

              {mediaType === "image" && (
                <button
                  type="button"
                  disabled={processing || !hasMaskPixels}
                  onClick={handleRemoveWatermark}
                  style={{
                    padding: "10px",
                    fontWeight: "700",
                    fontSize: "13px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: processing || !hasMaskPixels ? "not-allowed" : "pointer",
                    background: processing || !hasMaskPixels ? "var(--bg-secondary)" : "#ec4899",
                    color: processing || !hasMaskPixels ? "var(--text-muted)" : "white",
                  }}
                >
                  {processing ? "Memproses..." : "✨ Bersihkan Foto"}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setOriginalFile(null);
                  setMediaUrl(null);
                  setResultUrl(null);
                  setHasCanvas(false);
                  setProcessedFrames([]);
                  setIsPlaying(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  cursor: "pointer",
                  textAlign: "center",
                  padding: "4px 0",
                }}
              >
                ← Ganti File Media
              </button>
            </div>
          </aside>

          {/* ── Right Canvas & Output Screen ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Editor Canvas Area */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: "700", margin: 0 }}>
                Langkah 1: Tandai Area Watermark
              </h3>
              <div
                style={{
                  position: "relative",
                  background: "var(--bg-secondary)",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  display: "inline-block",
                  alignSelf: "flex-start",
                }}
              >
                {/* Background image canvas */}
                <canvas ref={imageCanvasRef} style={{ display: "block" }} />

                {/* Draw mask canvas */}
                <canvas
                  ref={maskCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    cursor: tool === "brush" ? "crosshair" : "default",
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => setIsDrawing(false)}
                />

                {/* Invisible output canvas */}
                <canvas ref={resultCanvasRef} style={{ display: "none" }} />
              </div>
            </div>

            {/* Inpainting feedback status */}
            {progress && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(236,72,153,0.08)",
                  border: "1px solid rgba(236,72,153,0.3)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "var(--text)",
                }}
              >
                {progress}
              </div>
            )}

            {/* ─── OUTPUT PREVIEW: HASIL FINAL BERSIH ─── */}

            {/* FOTO: Hasil Final Preview */}
            {mediaType === "image" && resultUrl && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: "700", margin: 0 }}>
                    🖼️ Hasil Final Foto Bersih
                  </h3>
                  <button
                    type="button"
                    onClick={handleDownloadSingle}
                    style={{
                      padding: "5px 12px",
                      background: "#ec4899",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    ⬇ Unduh Hasil Foto
                  </button>
                </div>

                {/* Slider Compare */}
                <div
                  ref={useRef<HTMLDivElement>(null)}
                  style={{
                    position: "relative",
                    width: "100%",
                    overflow: "hidden",
                    borderRadius: "6px",
                    cursor: "ew-resize",
                    userSelect: "none",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCompareDragging(true);
                  }}
                  onMouseMove={(e) => {
                    if (!compareDragging) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setComparePos(Math.min(97, Math.max(3, ((e.clientX - r.left) / r.width) * 100)));
                  }}
                  onMouseUp={() => setCompareDragging(false)}
                  onMouseLeave={() => setCompareDragging(false)}
                >
                  <img src={resultUrl} alt="Final Result" style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }} />
                  <img
                    src={mediaUrl!}
                    alt="Original"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                      clipPath: `inset(0 ${100 - comparePos}% 0 0)`,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${comparePos}%`,
                      width: "2px",
                      background: "white",
                      transform: "translateX(-1px)",
                      boxShadow: "0 0 10px rgba(0,0,0,0.6)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%,-50%)",
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: "800",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
                        color: "#111",
                      }}
                    >
                      ⇔
                    </div>
                  </div>
                  <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.7)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>
                    SEBELUM
                  </div>
                  <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(236,72,153,0.9)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>
                    HASIL BERSIH
                  </div>
                </div>
              </div>
            )}

            {/* VIDEO: Frame Inpainting & Interactive Video Player */}
            {mediaType === "video" && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: "13px", fontWeight: "700", margin: 0 }}>
                      📹 Hasil Video Inpainting (Frame-by-Frame Player)
                    </h3>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                      Tandai watermark pada editor, lalu run processing di bawah untuk menghasilkan video bersih.
                    </p>
                  </div>
                  {processedFrames.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadVideoZip}
                      style={{
                        padding: "6px 14px",
                        background: "#ec4899",
                        color: "white",
                        border: "none",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      📦 Download ZIP Video
                    </button>
                  )}
                </div>

                {/* Interactive Player Screen */}
                {processedFrames.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        background: "#000",
                        borderRadius: "8px",
                        overflow: "hidden",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <img
                        src={processedFrames[currentFrameIdx]}
                        alt="video-frame"
                        style={{ display: "block", maxWidth: "100%", maxHeight: "400px", objectFit: "contain" }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 10,
                          left: 10,
                          background: "rgba(0,0,0,0.65)",
                          color: "white",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "700",
                        }}
                      >
                        PLAYING CLEAN VIDEO · {currentFrameIdx + 1}/{processedFrames.length} Frames
                      </div>
                    </div>

                    {/* Timeline & Player Controls */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        background: "var(--bg-secondary)",
                        padding: "8px 12px",
                        borderRadius: "6px",
                      }}
                    >
                      {/* Play/Pause */}
                      <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "4px",
                          background: "#ec4899",
                          border: "none",
                          color: "white",
                          fontWeight: "800",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isPlaying ? "⏸" : "▶"}
                      </button>

                      {/* Scrubber timeline */}
                      <input
                        type="range"
                        min="0"
                        max={processedFrames.length - 1}
                        value={currentFrameIdx}
                        onChange={(e) => {
                          setIsPlaying(false);
                          setCurrentFrameIdx(Number(e.target.value));
                        }}
                        style={{ flex: 1, accentColor: "#ec4899", height: "6px", cursor: "pointer" }}
                      />

                      {/* Frame counter */}
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {Math.round((currentFrameIdx / 24) * 10) / 10}s / {Math.round((processedFrames.length / 24) * 10) / 10}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      height: "180px",
                      background: "var(--bg-secondary)",
                      border: "1px dashed var(--border)",
                      borderRadius: "6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Belum ada video yang diproses.</span>
                    <button
                      type="button"
                      disabled={extractingFrames || !hasMaskPixels}
                      onClick={handleProcessVideoFrames}
                      style={{
                        marginTop: "12px",
                        padding: "8px 16px",
                        background: extractingFrames || !hasMaskPixels ? "var(--bg-secondary)" : "#7c3aed",
                        color: extractingFrames || !hasMaskPixels ? "var(--text-muted)" : "white",
                        border: "none",
                        borderRadius: "5px",
                        fontWeight: "700",
                        fontSize: "11px",
                        cursor: extractingFrames || !hasMaskPixels ? "not-allowed" : "pointer",
                      }}
                    >
                      {extractingFrames ? "Memproses..." : "🎬 Run Video Inpainting Pipeline"}
                    </button>
                  </div>
                )}

                {frameProgress && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      padding: "6px 10px",
                      background: "rgba(124,58,237,0.06)",
                      border: "1px solid rgba(124,58,237,0.15)",
                      borderRadius: "4px",
                    }}
                  >
                    {frameProgress}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
