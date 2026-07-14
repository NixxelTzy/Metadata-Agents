"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";

// ─── Types ────────────────────────────────────────────────────────────────────
type DrawTool = "brush" | "rect" | "eraser" | "clone";
type Algorithm = "smart_diffusion" | "patch_synthesis" | "median_blend";
type MediaType = "image" | "video";

// ─── Inpainting Algorithms ────────────────────────────────────────────────────

/** Build a binary mask array from a semi-transparent red overlay canvas */
function buildMaskArray(maskCanvas: HTMLCanvasElement): Uint8Array {
  const ctx = maskCanvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const mask = new Uint8Array(maskCanvas.width * maskCanvas.height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = d[i * 4 + 3]! > 20 ? 1 : 0;
  }
  return mask;
}

/**
 * Algorithm 1 — Smart Diffusion Fill (Multi-pass weighted radial sampling)
 * Best for: solid backgrounds, gradients, skies, simple textures.
 * Processes from boundary inward with increasing radius per pass.
 */
async function smartDiffusionFill(
  px: Uint8ClampedArray,
  mask: Uint8Array,
  W: number,
  H: number,
  onProgress?: (s: string) => void
): Promise<void> {
  const filled = new Uint8Array(W * H);
  const wR = new Float32Array(W * H);
  const wG = new Float32Array(W * H);
  const wB = new Float32Array(W * H);

  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) {
      const p = i * 4;
      wR[i] = px[p]!; wG[i] = px[p + 1]!; wB[i] = px[p + 2]!;
      filled[i] = 1;
    }
  }

  const masked: number[] = [];
  for (let i = 0; i < W * H; i++) if (mask[i]) masked.push(i);

  const radii = [3, 5, 8, 12, 16, 20, 24, 28];

  for (let pass = 0; pass < radii.length; pass++) {
    onProgress?.(`[Smart Diffusion] Pass ${pass + 1}/${radii.length} · Radius ${radii[pass]}px`);
    await new Promise(r => setTimeout(r, 8));

    const radius = radii[pass]!;
    const r2 = radius * radius;

    for (const i of masked) {
      if (filled[i]) continue;
      const x = i % W, y = Math.floor(i / W);

      let rS = 0, gS = 0, bS = 0, wS = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (!filled[ni]) continue;

          const d2 = dx * dx + dy * dy;
          const w = 1.0 / (d2 + 0.5);
          rS += wR[ni] * w; gS += wG[ni] * w; bS += wB[ni] * w; wS += w;
        }
      }

      if (wS > 0) {
        wR[i] = rS / wS; wG[i] = gS / wS; wB[i] = bS / wS;
        filled[i] = 1;
      }
    }
  }

  // Smooth boundary seam (3-pass)
  onProgress?.("[Smart Diffusion] Menghaluskan tepi mask...");
  await new Promise(r => setTimeout(r, 8));

  for (let bpass = 0; bpass < 4; bpass++) {
    for (const i of masked) {
      const x = i % W, y = Math.floor(i / W);
      let rS = 0, gS = 0, bS = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          rS += wR[ni]; gS += wG[ni]; bS += wB[ni]; c++;
        }
      }
      if (c > 0) { wR[i] = rS / c; wG[i] = gS / c; wB[i] = bS / c; }
    }
  }

  for (const i of masked) {
    const p = i * 4;
    px[p] = Math.min(255, Math.max(0, Math.round(wR[i])));
    px[p + 1] = Math.min(255, Math.max(0, Math.round(wG[i])));
    px[p + 2] = Math.min(255, Math.max(0, Math.round(wB[i])));
  }
}

/**
 * Algorithm 2 — Patch Synthesis (Exemplar-based, boundary-first BFS)
 * Best for: patterned textures, repetitive backgrounds, fabric, grass, walls.
 * Finds best-matching pixel patches from the non-masked region.
 */
async function patchSynthesis(
  px: Uint8ClampedArray,
  mask: Uint8Array,
  W: number,
  H: number,
  onProgress?: (s: string) => void
): Promise<void> {
  const PATCH_H = 7; // 15×15 patches
  const SAMPLES = 40;

  const filled = new Uint8Array(W * H);
  const wR = new Float32Array(W * H);
  const wG = new Float32Array(W * H);
  const wB = new Float32Array(W * H);

  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) {
      const p = i * 4;
      wR[i] = px[p]!; wG[i] = px[p + 1]!; wB[i] = px[p + 2]!;
      filled[i] = 1;
    }
  }

  // BFS-distance from boundary (process nearest boundary pixels first)
  const dist = new Float32Array(W * H).fill(999999);
  const bfsQ: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (!mask[ny * W + nx]) { dist[i] = 0; bfsQ.push(i); break; }
    }
  }
  let qi = 0;
  while (qi < bfsQ.length) {
    const i = bfsQ[qi++]!;
    const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const ni = ny * W + nx;
      if (!mask[ni] || dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1; bfsQ.push(ni);
    }
  }

  const sortedMasked = [...bfsQ].sort((a, b) => dist[a]! - dist[b]!);

  // Candidate source pixels (non-masked, spaced)
  const sources: number[] = [];
  for (let y = PATCH_H; y < H - PATCH_H; y += 3) {
    for (let x = PATCH_H; x < W - PATCH_H; x += 3) {
      const i = y * W + x;
      if (!mask[i]) sources.push(i);
    }
  }

  const total = sortedMasked.length;
  let done = 0;

  for (const i of sortedMasked) {
    if (filled[i]) continue;
    const x = i % W, y = Math.floor(i / W);

    let bestSSD = Infinity, bestSrc = -1;
    for (let s = 0; s < SAMPLES; s++) {
      const src = sources[Math.floor(Math.random() * sources.length)]!;
      const sx = src % W, sy = Math.floor(src / W);
      let ssd = 0, cnt = 0;

      for (let dy = -PATCH_H; dy <= PATCH_H; dy++) {
        for (let dx = -PATCH_H; dx <= PATCH_H; dx++) {
          const tx = x + dx, ty = y + dy;
          const tsx = sx + dx, tsy = sy + dy;
          if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
          if (tsx < 0 || tsx >= W || tsy < 0 || tsy >= H) continue;
          const ti = ty * W + tx;
          if (!filled[ti]) continue;
          const tni = tsy * W + tsx;
          const dr = px[ti * 4]! - px[tni * 4]!;
          const dg = px[ti * 4 + 1]! - px[tni * 4 + 1]!;
          const db = px[ti * 4 + 2]! - px[tni * 4 + 2]!;
          ssd += dr * dr + dg * dg + db * db;
          cnt++;
        }
      }
      if (cnt > 0 && ssd / cnt < bestSSD) { bestSSD = ssd / cnt; bestSrc = src; }
    }

    if (bestSrc !== -1) {
      wR[i] = px[bestSrc * 4]!;
      wG[i] = px[bestSrc * 4 + 1]!;
      wB[i] = px[bestSrc * 4 + 2]!;
    } else {
      wR[i] = wR[Math.max(0, i - 1)];
      wG[i] = wG[Math.max(0, i - 1)];
      wB[i] = wB[Math.max(0, i - 1)];
    }
    filled[i] = 1; done++;

    if (done % 400 === 0) {
      onProgress?.(`[Patch Synthesis] ${Math.round(done / total * 100)}% · ${done}/${total} px`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Smoothing pass
  for (let p = 0; p < 3; p++) {
    for (const i of sortedMasked) {
      const x = i % W, y = Math.floor(i / W);
      let rS = 0, gS = 0, bS = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          rS += wR[ni]; gS += wG[ni]; bS += wB[ni]; c++;
        }
      }
      if (c > 0) { wR[i] = rS / c; wG[i] = gS / c; wB[i] = bS / c; }
    }
  }

  for (const i of sortedMasked) {
    const p = i * 4;
    px[p] = Math.min(255, Math.max(0, Math.round(wR[i])));
    px[p + 1] = Math.min(255, Math.max(0, Math.round(wG[i])));
    px[p + 2] = Math.min(255, Math.max(0, Math.round(wB[i])));
  }
}

/**
 * Algorithm 3 — Median Blend (Sorted-neighbor sampling)
 * Best for: logos on uniform or near-uniform backgrounds. Very smooth results.
 */
async function medianBlend(
  px: Uint8ClampedArray,
  mask: Uint8Array,
  W: number,
  H: number,
  onProgress?: (s: string) => void
): Promise<void> {
  const RADIUS = 22;
  const result = new Uint8ClampedArray(px);
  const masked: number[] = [];
  for (let i = 0; i < W * H; i++) if (mask[i]) masked.push(i);

  let done = 0;
  for (const i of masked) {
    const x = i % W, y = Math.floor(i / W);
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];

    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (mask[ni]) continue;
        rs.push(px[ni * 4]!); gs.push(px[ni * 4 + 1]!); bs.push(px[ni * 4 + 2]!);
      }
    }

    if (rs.length > 0) {
      rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
      const m = Math.floor(rs.length / 2);
      result[i * 4] = rs[m]!; result[i * 4 + 1] = gs[m]!; result[i * 4 + 2] = bs[m]!;
    }
    done++;
    if (done % 600 === 0) {
      onProgress?.(`[Median Blend] ${Math.round(done / masked.length * 100)}%...`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  for (const i of masked) {
    px[i * 4] = result[i * 4]!;
    px[i * 4 + 1] = result[i * 4 + 1]!;
    px[i * 4 + 2] = result[i * 4 + 2]!;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WatermarkRemover() {
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [imageFullSize, setImageFullSize] = useState({ w: 0, h: 0 });

  // Drawing tools
  const [tool, setTool] = useState<DrawTool>("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [algorithm, setAlgorithm] = useState<Algorithm>("smart_diffusion");

  const [isDrawing, setIsDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [cloneSource, setCloneSource] = useState<{ x: number; y: number } | null>(null);
  const [hasMaskPixels, setHasMaskPixels] = useState(false);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Comparison
  const [comparePos, setComparePos] = useState(50);
  const [compareDragging, setCompareDragging] = useState(false);

  // Video frames
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [frameProgress, setFrameProgress] = useState("");
  const [processedFrames, setProcessedFrames] = useState<{ i: number; url: string }[]>([]);

  const [dragOver, setDragOver] = useState(false);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── File loader ─────────────────────────────────────────────────────────────
  const loadImageOntoCanvas = useCallback((src: string, fw: number, fh: number) => {
    const MAX_W = 880, MAX_H = 600;
    const ratio = Math.min(MAX_W / fw, MAX_H / fh, 1);
    const dw = Math.round(fw * ratio), dh = Math.round(fh * ratio);
    setImageFullSize({ w: fw, h: fh });

    [imageCanvasRef, maskCanvasRef, resultCanvasRef].forEach(ref => {
      if (ref.current) { ref.current.width = dw; ref.current.height = dh; }
    });

    const img = new Image();
    img.onload = () => {
      const ctx = imageCanvasRef.current?.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0, dw, dh);
      const mctx = maskCanvasRef.current?.getContext("2d");
      if (mctx) mctx.clearRect(0, 0, dw, dh);
      setResultUrl(null);
      setHasMaskPixels(false);
    };
    img.src = src;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setOriginalFile(file);
    setResultUrl(null);
    setProgress("");
    setProcessedFrames([]);
    setFrameProgress("");
    setHasMaskPixels(false);

    if (file.type.startsWith("image/")) {
      setMediaType("image");
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        setMediaUrl(src);
        const img = new Image();
        img.onload = () => loadImageOntoCanvas(src, img.width, img.height);
        img.src = src;
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith("video/")) {
      setMediaType("video");
      const url = URL.createObjectURL(file);
      setMediaUrl(url);
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration / 3); };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        const preview = canvas.toDataURL("image/jpeg", 0.92);
        loadImageOntoCanvas(preview, video.videoWidth, video.videoHeight);
      };
    }
  }, [loadImageOntoCanvas]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const f = Array.from(files).find(
      x => x.type.startsWith("image/") || x.type.startsWith("video/")
    );
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Canvas drawing helpers ───────────────────────────────────────────────────
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = maskCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * (c.width / r.width)),
      y: Math.round((e.clientY - r.top) * (c.height / r.height))
    };
  };

  const paintOnMask = (x: number, y: number, erase = false) => {
    const c = maskCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(239, 68, 68, 0.82)";
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

    // Draw sampled pixels directly onto image canvas at target position
    imgCtx.putImageData(srcData, x - r, y - r);

    // Erase mask in the area we just stamped
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
      if (e.altKey) { setCloneSource({ x, y }); return; }
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
      ctx.fillStyle = "rgba(239, 68, 68, 0.82)";
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

  // ─── Core processing ──────────────────────────────────────────────────────────
  const processFrame = async (
    imgCtx: CanvasRenderingContext2D,
    maskCanvas: HTMLCanvasElement,
    targetW: number,
    targetH: number,
    updateProgress?: (s: string) => void
  ): Promise<HTMLCanvasElement> => {
    const imgData = imgCtx.getImageData(0, 0, targetW, targetH);
    const px = new Uint8ClampedArray(imgData.data);
    const mask = buildMaskArray(maskCanvas);

    if (algorithm === "smart_diffusion") await smartDiffusionFill(px, mask, targetW, targetH, updateProgress);
    else if (algorithm === "patch_synthesis") await patchSynthesis(px, mask, targetW, targetH, updateProgress);
    else await medianBlend(px, mask, targetW, targetH, updateProgress);

    const out = document.createElement("canvas");
    out.width = targetW; out.height = targetH;
    out.getContext("2d")!.putImageData(new ImageData(px, targetW, targetH), 0, 0);
    return out;
  };

  const handleRemoveWatermark = async () => {
    const imgCanvas = imageCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!imgCanvas || !maskCanvas) return;

    const mask = buildMaskArray(maskCanvas);
    if (!mask.some(v => v === 1)) {
      setProgress("⚠️ Gambar area watermark terlebih dahulu menggunakan brush atau rectangle.");
      return;
    }

    setProcessing(true);
    setResultUrl(null);
    setProgress("Memulai engine inpainting...");

    try {
      const ctx = imgCanvas.getContext("2d")!;
      const out = await processFrame(ctx, maskCanvas, imgCanvas.width, imgCanvas.height, setProgress);
      const url = out.toDataURL("image/jpeg", 0.97);
      setResultUrl(url);

      // Draw on result canvas too
      const rc = resultCanvasRef.current!;
      rc.width = out.width; rc.height = out.height;
      rc.getContext("2d")!.drawImage(out, 0, 0);

      setProgress("✅ Watermark berhasil dihapus! Gunakan slider untuk membandingkan.");
    } catch (err) {
      setProgress(`❌ Error: ${err instanceof Error ? err.message : "Terjadi kesalahan"}`);
    } finally {
      setProcessing(false);
    }
  };

  // ─── Video frame extraction & processing ──────────────────────────────────────
  const handleProcessVideoFrames = async () => {
    if (!originalFile || mediaType !== "video") return;
    const maskCanvas = maskCanvasRef.current!;
    const mask = buildMaskArray(maskCanvas);
    if (!mask.some(v => v === 1)) {
      setFrameProgress("⚠️ Gambar area watermark pada frame preview terlebih dahulu.");
      return;
    }

    setExtractingFrames(true);
    setProcessedFrames([]);

    const url = URL.createObjectURL(originalFile);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;

    await new Promise<void>(r => { video.onloadedmetadata = () => r(); });

    const fps = 24;
    const duration = Math.min(video.duration, 30); // cap at 30s
    const total = Math.round(duration * fps);

    const dW = maskCanvas.width, dH = maskCanvas.height;
    const fW = video.videoWidth, fH = video.videoHeight;

    // Scale mask to full video resolution
    const fullMask = new Uint8Array(fW * fH);
    for (let y = 0; y < fH; y++) {
      for (let x = 0; x < fW; x++) {
        const mx = Math.round(x * dW / fW);
        const my = Math.round(y * dH / fH);
        fullMask[y * fW + x] = mask[Math.min(dH - 1, my) * dW + Math.min(dW - 1, mx)] ?? 0;
      }
    }

    const frames: { i: number; url: string }[] = [];

    for (let fi = 0; fi < total; fi++) {
      video.currentTime = fi / fps;
      await new Promise<void>(r => { video.onseeked = () => r(); });

      const fc = document.createElement("canvas");
      fc.width = fW; fc.height = fH;
      const fctx = fc.getContext("2d")!;
      fctx.drawImage(video, 0, 0);

      const imgData = fctx.getImageData(0, 0, fW, fH);
      const px = new Uint8ClampedArray(imgData.data);
      await smartDiffusionFill(px, fullMask, fW, fH);
      fctx.putImageData(new ImageData(px, fW, fH), 0, 0);

      frames.push({ i: fi, url: fc.toDataURL("image/jpeg", 0.92) });
      setFrameProgress(`Frame ${fi + 1}/${total} (${Math.round((fi + 1) / total * 100)}%)`);

      if (fi % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    URL.revokeObjectURL(url);
    setProcessedFrames(frames);
    setExtractingFrames(false);
    setFrameProgress(`✅ ${total} frame diproses! Siap diunduh sebagai ZIP.`);
  };

  const handleDownloadVideoZip = async () => {
    if (!processedFrames.length) return;
    setFrameProgress("📦 Membuat ZIP file...");
    const zip = new JSZip();

    for (const f of processedFrames) {
      const blob = await (await fetch(f.url)).blob();
      zip.file(`frame_${String(f.i + 1).padStart(4, "0")}.jpg`, blob);
    }
    zip.file("README_rekompilasi.txt", [
      "Instruksi rekompilasi video menggunakan ffmpeg:",
      "",
      "  ffmpeg -framerate 24 -i frame_%04d.jpg -c:v libx264 -crf 18 output.mp4",
      "",
      "Menyertakan audio asli:",
      "  ffmpeg -framerate 24 -i frame_%04d.jpg -i original.mp4 \\",
      "    -map 0:v -map 1:a -c:v libx264 -crf 18 -shortest output_with_audio.mp4"
    ].join("\n"));

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "watermark_removed_frames.zip";
    a.click();
    setFrameProgress("✅ ZIP berhasil diunduh!");
  };

  // ─── Download result ──────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    const dot = fileName.lastIndexOf(".");
    a.download = `${dot !== -1 ? fileName.slice(0, dot) : fileName}_no_watermark.jpg`;
    a.click();
  };

  const TOOL_OPTIONS: { id: DrawTool; label: string; icon: string; desc: string }[] = [
    { id: "brush", label: "Brush", icon: "🖌️", desc: "Lukis area watermark secara bebas" },
    { id: "rect", label: "Rectangle", icon: "▭", desc: "Pilih area persegi panjang" },
    { id: "eraser", label: "Eraser", icon: "◌", desc: "Hapus bagian seleksi yang salah" },
    { id: "clone", label: "Clone Stamp", icon: "⎘", desc: "Alt+klik untuk set sumber, lalu lukis" },
  ];

  const ALGO_OPTIONS: { id: Algorithm; label: string; desc: string; badge: string }[] = [
    { id: "smart_diffusion", label: "Smart Diffusion", desc: "Terbaik untuk gradasi, langit, tembok", badge: "Universal" },
    { id: "patch_synthesis", label: "Patch Synthesis", desc: "Terbaik untuk tekstur berulang (rumput, kain, bata)", badge: "Texture" },
    { id: "median_blend", label: "Median Blend", desc: "Terbaik untuk latar polos atau hampir seragam", badge: "Uniform BG" },
  ];

  const hasCanvas = !!mediaUrl;

  return (
    <div className="uploader">
      {/* Header */}
      <div className="uploader__hero">
        <h2>🧹 AI Watermark Removal Workstation</h2>
        <p>
          Hapus watermark foto & video menggunakan multi-algorithm inpainting engine berbasis canvas.
          Pilih area → jalankan engine → bandingkan hasilnya secara real-time.
        </p>
      </div>

      {/* Upload Area */}
      {!hasCanvas && (
        <section
          className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef} type="file" accept="image/*,video/*" hidden
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="dropzone__icon">🧹</div>
          <p className="dropzone__title">Seret & lepas foto atau video di sini</p>
          <p className="dropzone__subtitle">atau klik untuk memilih file</p>
          <p className="dropzone__hint">JPG, PNG, WEBP, MP4, MOV — Maks 1 file per sesi</p>
        </section>
      )}

      {/* Main Workspace */}
      {hasCanvas && (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", marginTop: "20px" }}>

          {/* ── Left: Tools Panel ── */}
          <aside style={{
            display: "flex", flexDirection: "column", gap: "16px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: "16px"
          }}>
            {/* File info */}
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700", marginBottom: "4px" }}>
                {mediaType === "video" ? "📹 Video (Preview Frame)" : "🖼️ Image"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text)", wordBreak: "break-all", fontWeight: "600" }}>
                {fileName}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                {imageFullSize.w}×{imageFullSize.h}px
              </div>
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Drawing Tools */}
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700", marginBottom: "8px" }}>
                Selection Tool
              </div>
              {TOOL_OPTIONS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  title={t.desc}
                  onClick={() => setTool(t.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "8px",
                    padding: "7px 10px", marginBottom: "4px", borderRadius: "6px", border: "1px solid",
                    borderColor: tool === t.id ? "#ec4899" : "var(--border)",
                    background: tool === t.id ? "rgba(236,72,153,0.12)" : "var(--bg-secondary)",
                    color: tool === t.id ? "#ec4899" : "var(--text)",
                    cursor: "pointer", fontSize: "12px", fontWeight: "600", textAlign: "left"
                  }}
                >
                  <span style={{ fontSize: "14px" }}>{t.icon}</span> {t.label}
                </button>
              ))}

              {tool === "clone" && (
                <div style={{ fontSize: "10px", color: "#ec4899", padding: "6px", background: "rgba(236,72,153,0.08)", borderRadius: "4px", marginTop: "4px" }}>
                  💡 Alt+Klik untuk set sumber clone, lalu lukis di area target.
                </div>
              )}
            </div>

            {/* Brush Size */}
            {(tool === "brush" || tool === "eraser" || tool === "clone") && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700", marginBottom: "4px" }}>
                  <span>Brush Size</span><span>{brushSize}px</span>
                </div>
                <input
                  type="range" min="4" max="100" value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
                />
              </div>
            )}

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Algorithm */}
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700", marginBottom: "8px" }}>
                Inpainting Engine
              </div>
              {ALGO_OPTIONS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  title={a.desc}
                  onClick={() => setAlgorithm(a.id)}
                  style={{
                    width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start",
                    padding: "7px 10px", marginBottom: "4px", borderRadius: "6px", border: "1px solid",
                    borderColor: algorithm === a.id ? "#ec4899" : "var(--border)",
                    background: algorithm === a.id ? "rgba(236,72,153,0.12)" : "var(--bg-secondary)",
                    color: algorithm === a.id ? "#ec4899" : "var(--text)",
                    cursor: "pointer", textAlign: "left"
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: "700" }}>{a.label}</span>
                  <span style={{ fontSize: "9px", color: algorithm === a.id ? "#ec4899" : "var(--text-muted)", marginTop: "2px" }}>
                    {a.badge}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            {/* Actions */}
            <button
              type="button"
              onClick={clearMask}
              style={{ width: "100%", padding: "7px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px" }}
            >
              🗑️ Clear Mask
            </button>

            <button
              type="button"
              disabled={processing || !hasMaskPixels}
              onClick={handleRemoveWatermark}
              style={{
                width: "100%", padding: "10px 0", fontWeight: "700", fontSize: "13px",
                border: "none", borderRadius: "6px", cursor: processing || !hasMaskPixels ? "not-allowed" : "pointer",
                background: processing || !hasMaskPixels ? "var(--bg-secondary)" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
                color: processing || !hasMaskPixels ? "var(--text-muted)" : "white",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
              }}
            >
              {processing ? <><span className="spinner" />Proses...</> : <>✨ Remove WM</>}
            </button>

            {resultUrl && (
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  width: "100%", padding: "8px 0", fontWeight: "600", fontSize: "12px",
                  border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer",
                  background: "var(--surface)", color: "var(--text)"
                }}
              >
                ⬇ Download Result
              </button>
            )}

            <button
              type="button"
              onClick={() => { setMediaUrl(null); setResultUrl(null); setFileName(""); setProgress(""); setHasMaskPixels(false); }}
              style={{ width: "100%", padding: "6px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "11px" }}
            >
              ← Ganti File
            </button>
          </aside>

          {/* ── Right: Canvas Workspace ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Canvas container */}
            <div style={{ position: "relative", background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", display: "inline-block" }}>
              {/* Image canvas (bottom) */}
              <canvas ref={imageCanvasRef} style={{ display: "block" }} />

              {/* Mask overlay canvas (top) */}
              <canvas
                ref={maskCanvasRef}
                style={{
                  position: "absolute", top: 0, left: 0,
                  cursor: tool === "brush" || tool === "eraser" ? "crosshair" : tool === "clone" ? "copy" : "crosshair"
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => setIsDrawing(false)}
              />

              {/* Hidden result canvas */}
              <canvas ref={resultCanvasRef} style={{ display: "none" }} />

              {/* Canvas label */}
              <div style={{ position: "absolute", top: "8px", left: "8px", background: "rgba(0,0,0,0.6)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "600", pointerEvents: "none" }}>
                {resultUrl ? "BEFORE (Klik slider ↓ untuk compare)" : "ORIGINAL — Gambar area watermark"}
              </div>

              {!hasMaskPixels && !resultUrl && (
                <div style={{
                  position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
                  background: "rgba(236,72,153,0.85)", color: "white", padding: "6px 14px",
                  borderRadius: "20px", fontSize: "11px", fontWeight: "600", pointerEvents: "none",
                  whiteSpace: "nowrap"
                }}>
                  ↑ Gunakan brush untuk menandai watermark
                </div>
              )}
            </div>

            {/* Progress message */}
            {progress && (
              <div style={{
                padding: "10px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "500",
                background: progress.startsWith("✅") ? "rgba(52,211,153,0.1)" : progress.startsWith("❌") ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.08)",
                border: `1px solid ${progress.startsWith("✅") ? "#34d399" : progress.startsWith("❌") ? "#ef4444" : "var(--border)"}`,
                color: "var(--text)"
              }}>
                {processing && <span className="spinner" style={{ marginRight: "8px", display: "inline-block" }} />}
                {progress}
              </div>
            )}

            {/* ── Comparison Slider ── */}
            {resultUrl && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "12px" }}>
                  🔀 Before / After Comparison — Drag to compare
                </div>

                <div
                  style={{ position: "relative", borderRadius: "6px", overflow: "hidden", cursor: "ew-resize", userSelect: "none" }}
                  onMouseDown={() => setCompareDragging(true)}
                  onMouseMove={(e) => {
                    if (!compareDragging) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setComparePos(Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100)));
                  }}
                  onMouseUp={() => setCompareDragging(false)}
                  onMouseLeave={() => setCompareDragging(false)}
                >
                  {/* Upscaled (result) - full width */}
                  <img src={resultUrl} alt="result" style={{ display: "block", width: "100%", height: "auto" }} />

                  {/* Original - clipped using clipPath */}
                  <img
                    src={mediaType === "image" ? mediaUrl! : mediaUrl!}
                    alt="original"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                      clipPath: `polygon(0 0, ${comparePos}% 0, ${comparePos}% 100%, 0 100%)`,
                      pointerEvents: "none"
                    }}
                  />

                  {/* Divider line */}
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, left: `${comparePos}%`,
                    width: "2px", background: "white", transform: "translateX(-1px)",
                    boxShadow: "0 0 8px rgba(0,0,0,0.5)"
                  }}>
                    <div style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                      width: "28px", height: "28px", borderRadius: "50%", background: "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.4)", color: "#333"
                    }}>⇔</div>
                  </div>

                  {/* Labels */}
                  <div style={{ position: "absolute", top: "8px", left: "8px", background: "rgba(0,0,0,0.7)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>BEFORE</div>
                  <div style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(236,72,153,0.85)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "700" }}>AFTER</div>
                </div>
              </div>
            )}

            {/* ── Video Processing ── */}
            {mediaType === "video" && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "10px" }}>
                  🎬 Video Processing — Hapus watermark dari semua frame
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  Tandai watermark pada preview frame di atas, lalu klik tombol di bawah untuk memproses semua frame video (maks 30 detik).
                  Hasil diunduh sebagai ZIP + instruksi rekompilasi ffmpeg.
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    disabled={extractingFrames || !hasMaskPixels}
                    onClick={handleProcessVideoFrames}
                    style={{
                      flex: 1, padding: "10px", fontWeight: "700", fontSize: "12px",
                      border: "none", borderRadius: "6px", cursor: extractingFrames || !hasMaskPixels ? "not-allowed" : "pointer",
                      background: extractingFrames || !hasMaskPixels ? "var(--bg-secondary)" : "#7c3aed",
                      color: extractingFrames || !hasMaskPixels ? "var(--text-muted)" : "white",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                    }}
                  >
                    {extractingFrames ? <><span className="spinner" />Memproses Frame...</> : "🎬 Proses Semua Frame Video"}
                  </button>
                  {processedFrames.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadVideoZip}
                      style={{
                        padding: "10px 20px", fontWeight: "700", fontSize: "12px",
                        border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer",
                        background: "var(--surface)", color: "var(--text)"
                      }}
                    >
                      📦 Download ZIP
                    </button>
                  )}
                </div>
                {frameProgress && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: frameProgress.startsWith("✅") ? "#34d399" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                    {extractingFrames && <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "1.5px" }} />}
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
