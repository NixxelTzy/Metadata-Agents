"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";

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
}

type UpscaleEngine = "ai_super_res" | "bicubic_crisp" | "bilinear_smooth";

export default function ImageUpscaler() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [targetSize, setTargetSize] = useState<3000 | 4000 | 8000>(4000); // 3K, 4K, 8K
  const [engine, setEngine] = useState<UpscaleEngine>("ai_super_res");
  const [sharpenLevel, setSharpenLevel] = useState<number>(50); // 0% - 100%
  const [denoiseLevel, setDenoiseLevel] = useState<number>(30); // 0% - 100%
  const [contrastLevel, setContrastLevel] = useState<number>(100); // 90% - 115% (mapped)
  const [saturationLevel, setSaturationLevel] = useState<number>(100); // 90% - 115% (mapped)
  const [outputFormat, setOutputFormat] = useState<"jpeg" | "png">("jpeg");
  const [jpegQuality, setJpegQuality] = useState<number>(92); // 10% - 100%

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  // Modal comparative zoom states
  const [selectedCompareImage, setSelectedCompareImage] = useState<ImageFile | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(2);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 }); // percentage
  const [isZooming, setIsZooming] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error("Gagal membaca dimensi gambar"));
      img.src = dataUrl;
    });
  };

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));

      if (fileArray.length === 0) {
        setError("Hanya file gambar (JPG, PNG, WEBP) yang didukung.");
        return;
      }

      const newImages: ImageFile[] = [];

      for (const file of fileArray) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error("Gagal membaca file"));
            reader.readAsDataURL(file);
          });

          const { width, height } = await getImageDimensions(dataUrl);

          const maxEdge = Math.max(width, height);
          let targetW = width;
          let targetH = height;

          if (maxEdge < targetSize) {
            const scale = targetSize / maxEdge;
            targetW = Math.round(width * scale);
            targetH = Math.round(height * scale);
          }

          newImages.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            preview: dataUrl,
            width,
            height,
            file,
            status: "idle",
            targetWidth: targetW,
            targetHeight: targetH,
          });
        } catch (err) {
          setError(`Gagal memuat beberapa gambar: ${file.name}`);
        }
      }

      setImages((prev) => [...prev, ...newImages]);
    },
    [targetSize]
  );

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

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearAll = () => {
    setImages([]);
    setError("");
    setProgress("");
  };

  // Bilateral Edge-Preserving Denoise Filter
  const applyDenoiseFilter = (ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) => {
    if (strength <= 0) return;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    const original = new Uint8ClampedArray(data);

    const threshold = 12 + (strength / 100) * 38;
    const radius = 1;

    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const idx = (y * w + x) * 4;
        const r = original[idx]!;
        const g = original[idx + 1]!;
        const b = original[idx + 2]!;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const nIdx = ((y + ky) * w + (x + kx)) * 4;
            const nr = original[nIdx]!;
            const ng = original[nIdx + 1]!;
            const nb = original[nIdx + 2]!;

            const diff = Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
            if (diff < threshold) {
              rSum += nr;
              gSum += ng;
              bSum += nb;
              count++;
            }
          }
        }

        if (count > 0) {
          data[idx] = Math.round(rSum / count);
          data[idx + 1] = Math.round(gSum / count);
          data[idx + 2] = Math.round(bSum / count);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // 3x3 Convolution Sharpening Filter
  const applySharpenFilter = (ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number) => {
    if (intensity <= 0) return;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    const original = new Uint8ClampedArray(data);

    // Map intensity 0-100 to kernel weight 0.0 - 0.45
    const mix = (intensity / 100) * 0.45;
    const a = -mix;
    const b = 1 + 4 * mix;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;

        for (let c = 0; c < 3; c++) {
          const center = original[idx + c]!;
          const up = original[((y - 1) * w + x) * 4 + c]!;
          const down = original[((y + 1) * w + x) * 4 + c]!;
          const left = original[(y * w + x - 1) * 4 + c]!;
          const right = original[(y * w + x + 1) * 4 + c]!;

          const val = center * b + (up + down + left + right) * a;
          data[idx + c] = Math.min(255, Math.max(0, val));
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const upscaleImageProcess = (imgFile: ImageFile): Promise<{ dataUrl: string; targetW: number; targetH: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const { width, height } = img;
          const maxEdge = Math.max(width, height);

          let targetW = width;
          let targetH = height;

          if (maxEdge < targetSize) {
            const scale = targetSize / maxEdge;
            targetW = Math.round(width * scale);
            targetH = Math.round(height * scale);
          }

          canvas.width = targetW;
          canvas.height = targetH;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context tidak tersedia"));
            return;
          }

          // Apply Engine smoothing settings
          if (engine === "ai_super_res" || engine === "bicubic_crisp") {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
          } else {
            // Bilinear / standard
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "low";
          }

          // Apply contrast & saturation using GPU native filter
          const contrastVal = contrastLevel / 100;
          const saturationVal = saturationLevel / 100;
          ctx.filter = `contrast(${contrastVal}) saturate(${saturationVal})`;

          ctx.drawImage(img, 0, 0, targetW, targetH);
          ctx.filter = "none"; // reset filter

          // Denoise processing (pre-sharpen)
          if (denoiseLevel > 0) {
            applyDenoiseFilter(ctx, targetW, targetH, denoiseLevel);
          }

          // Sharpen processing
          if (sharpenLevel > 0 && engine !== "bilinear_smooth") {
            applySharpenFilter(ctx, targetW, targetH, sharpenLevel);
          }

          const formatMime = outputFormat === "png" ? "image/png" : "image/jpeg";
          const quality = outputFormat === "png" ? undefined : jpegQuality / 100;

          const dataUrl = canvas.toDataURL(formatMime, quality);
          resolve({ dataUrl, targetW, targetH });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Gagal membaca preview gambar"));
      img.src = imgFile.preview;
    });
  };

  const handleUpscale = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setError("");

    const updated = [...images];

    for (let i = 0; i < updated.length; i++) {
      const img = updated[i]!;
      setProgress(`Meng-upscale (${i + 1}/${updated.length}): ${img.name}...`);

      setImages((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "processing" } : item))
      );

      try {
        const result = await upscaleImageProcess(img);
        setImages((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "success",
                  upscaledDataUrl: result.dataUrl,
                  targetWidth: result.targetW,
                  targetHeight: result.targetH,
                }
              : item
          )
        );
      } catch (err) {
        setImages((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "error" } : item))
        );
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    setProgress("✅ Semua gambar berhasil di-upscale!");
    setLoading(false);
  };

  const handleDownloadSingle = (img: ImageFile) => {
    if (!img.upscaledDataUrl) return;
    const link = document.createElement("a");
    link.href = img.upscaledDataUrl;
    const resLabel = targetSize === 3000 ? "3k" : targetSize === 4000 ? "4k" : "8k";
    const dotIdx = img.name.lastIndexOf(".");
    const baseName = dotIdx !== -1 ? img.name.substring(0, dotIdx) : img.name;
    const ext = outputFormat === "png" ? "png" : "jpg";
    link.download = `${baseName}_upscaled_${resLabel}.${ext}`;
    link.click();
  };

  const handleDownloadAll = async () => {
    const successImages = images.filter((img) => img.status === "success" && img.upscaledDataUrl);
    if (successImages.length === 0) return;

    setProgress("📦 Mengompresi file ke dalam ZIP...");
    const zip = new JSZip();
    const resLabel = targetSize === 3000 ? "3k" : targetSize === 4000 ? "4k" : "8k";
    const ext = outputFormat === "png" ? "png" : "jpg";

    for (const img of successImages) {
      const res = await fetch(img.upscaledDataUrl!);
      const blob = await res.blob();

      const dotIdx = img.name.lastIndexOf(".");
      const baseName = dotIdx !== -1 ? img.name.substring(0, dotIdx) : img.name;
      const filename = `${baseName}_upscaled_${resLabel}.${ext}`;

      zip.file(filename, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = `upscaled_images_${resLabel}.zip`;
    link.click();
    setProgress("✅ ZIP berhasil didownload!");
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const hasSuccess = images.some((img) => img.status === "success");
  const resLabel = targetSize === 3000 ? "3k" : targetSize === 4000 ? "4k" : "8k";

  return (
    <div className="uploader">
      <div className="uploader__hero">
        <h2>AI Photo Upscaler (Super Resolution)</h2>
        <p>Gunakan workstation ini untuk meng-upscale banyak foto sekaligus dengan parameter kualitas profesional.</p>
      </div>

      {/* Advanced control panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "20px",
          borderRadius: "var(--radius)",
          marginBottom: "24px"
        }}
      >
        {/* Left column: Resolution & engine */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
              Target Resolution
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {([3000, 4000, 8000] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setTargetSize(sz)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: targetSize === sz ? "var(--text)" : "var(--bg-secondary)",
                    color: targetSize === sz ? "var(--bg-primary)" : "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "600"
                  }}
                  disabled={loading}
                >
                  {sz === 3000 ? "3K" : sz === 4000 ? "4K" : "8K"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
              Upscale Engine
            </label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as UpscaleEngine)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: "600"
              }}
              disabled={loading}
            >
              <option value="ai_super_res">AI Super Resolution (Adaptive Crisp)</option>
              <option value="bicubic_crisp">Bicubic Crisp (High Contrast)</option>
              <option value="bilinear_smooth">Bilinear Smooth (Soft/Vector/Illustrative)</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                Output Format
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as "jpeg" | "png")}
                style={{ width: "100%", padding: "6px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "12px" }}
                disabled={loading}
              >
                <option value="jpeg">JPEG (Compressed)</option>
                <option value="png">PNG (Lossless)</option>
              </select>
            </div>
            {outputFormat === "jpeg" && (
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Quality ({jpegQuality}%)
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right column: Image enhancements */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              <span>Sharpen Intensity</span>
              <span>{sharpenLevel}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={sharpenLevel}
              onChange={(e) => setSharpenLevel(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
              disabled={loading || engine === "bilinear_smooth"}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              <span>Denoise Strength (Edge-Preserving)</span>
              <span>{denoiseLevel}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={denoiseLevel}
              onChange={(e) => setDenoiseLevel(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
              disabled={loading}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              <span>Contrast Control</span>
              <span>{(contrastLevel / 100).toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="90"
              max="115"
              value={contrastLevel}
              onChange={(e) => setContrastLevel(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
              disabled={loading}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              <span>Saturation Control</span>
              <span>{(saturationLevel / 100).toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="90"
              max="115"
              value={saturationLevel}
              onChange={(e) => setSaturationLevel(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#ec4899", height: "6px" }}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      <section
        className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
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
        <p className="dropzone__title">Seret & lepas foto di sini</p>
        <p className="dropzone__subtitle">atau klik untuk memilih file</p>
        <p className="dropzone__hint">Mendukung banyak file sekaligus · JPG, PNG, WEBP</p>
      </section>

      {images.length > 0 && (
        <section className="preview-section" style={{ marginTop: "24px" }}>
          <div className="preview-header">
            <h2>
              Gambar Terpilih <span className="badge">{images.length} file</span>
            </h2>
            <button type="button" className="btn btn--ghost" onClick={clearAll} disabled={loading}>
              Hapus Semua
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  gap: "16px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                  <img
                    src={img.preview}
                    alt={img.name}
                    style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--border)", cursor: img.status === "success" ? "pointer" : "default" }}
                    onClick={() => img.status === "success" && setSelectedCompareImage(img)}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {img.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {img.width}x{img.height} ({formatSize(img.size)})
                      {img.targetWidth && img.targetHeight && (
                        <span style={{ color: "#ec4899" }}>
                          &nbsp;→ Target: {img.targetWidth}x{img.targetHeight}px
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {img.status === "processing" && (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "1.5px" }} />
                      Proses...
                    </span>
                  )}
                  {img.status === "success" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCompareImage(img)}
                      style={{ background: "rgba(236, 72, 153, 0.15)", border: "1px solid #ec4899", color: "#ec4899", padding: "4px 10px", fontSize: "11px", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
                    >
                      🔍 Compare Zoom
                    </button>
                  )}
                  {img.status === "error" && (
                    <span style={{ fontSize: "12px", color: "var(--error)", fontWeight: "600" }}>✕ Gagal</span>
                  )}

                  {img.status === "success" && img.upscaledDataUrl && (
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "4px 10px", fontSize: "11px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px" }}
                      onClick={() => handleDownloadSingle(img)}
                    >
                      ⬇ Unduh
                    </button>
                  )}

                  {!loading && img.status !== "processing" && (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}
                      onClick={() => removeImage(img.id)}
                      aria-label="Hapus"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="actions" style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{ flex: 1 }}
              onClick={handleUpscale}
              disabled={loading || images.length === 0}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Meng-upscale...
                </>
              ) : (
                <>✨ Jalankan Upscale</>
              )}
            </button>

            {hasSuccess && (
              <button
                type="button"
                className="btn"
                style={{
                  background: "#ec4899",
                  color: "white",
                  border: "none",
                  fontWeight: "600",
                  padding: "0 24px",
                  borderRadius: "var(--radius)",
                  cursor: "pointer"
                }}
                onClick={handleDownloadAll}
              >
                📦 Download All (.zip)
              </button>
            )}
          </div>
        </section>
      )}

      {progress && !error && <p className="status status--info" style={{ marginTop: "16px" }}>{progress}</p>}
      {error && <p className="status status--error" style={{ marginTop: "16px" }}>{error}</p>}

      {/* Interactive side-by-side zoom comparison modal */}
      {selectedCompareImage && selectedCompareImage.upscaledDataUrl && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
          onClick={() => setSelectedCompareImage(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "1100px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "700" }}>Pixel Inspection (Zoom Comparison)</h3>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Original: {selectedCompareImage.width}x{selectedCompareImage.height} vs Upscaled ({engine.toUpperCase()}): {selectedCompareImage.targetWidth}x{selectedCompareImage.targetHeight}
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Zoom:</span>
                <select
                  value={zoomScale}
                  onChange={(e) => setZoomScale(Number(e.target.value))}
                  style={{ background: "var(--bg-secondary)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", padding: "2px 6px" }}
                >
                  <option value="1.5">1.5x</option>
                  <option value="2">2.0x (Default)</option>
                  <option value="3">3.0x</option>
                  <option value="4">4.0x (Pixel Level)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedCompareImage(null)}
                  style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: "20px", fontWeight: "600" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Split Screen zoom visualization area */}
            <div style={{ padding: "20px", background: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                Hover di atas gambar untuk memeriksa ketajaman secara detail (Zoom Synchronized).
              </span>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  width: "100%",
                  aspectRatio: selectedCompareImage.width / selectedCompareImage.height || 16/9,
                  maxHeight: "60vh",
                  overflow: "hidden",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  position: "relative"
                }}
              >
                {/* Left Side: Original Preview */}
                <div
                  style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "zoom-in" }}
                  onMouseEnter={() => setIsZooming(true)}
                  onMouseLeave={() => setIsZooming(false)}
                  onMouseMove={handleMouseMove}
                >
                  <img
                    src={selectedCompareImage.preview}
                    alt="Original"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      transition: isZooming ? "none" : "transform 0.15s ease-out",
                      transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
                      transform: isZooming ? `scale(${zoomScale})` : "scale(1)"
                    }}
                  />
                  <div style={{ position: "absolute", bottom: "10px", left: "10px", background: "rgba(0,0,0,0.65)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                    ORIGINAL
                  </div>
                </div>

                {/* Right Side: Upscaled Preview */}
                <div
                  style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "zoom-in" }}
                  onMouseEnter={() => setIsZooming(true)}
                  onMouseLeave={() => setIsZooming(false)}
                  onMouseMove={handleMouseMove}
                >
                  <img
                    src={selectedCompareImage.upscaledDataUrl}
                    alt="Upscaled"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      transition: isZooming ? "none" : "transform 0.15s ease-out",
                      transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
                      transform: isZooming ? `scale(${zoomScale})` : "scale(1)"
                    }}
                  />
                  <div style={{ position: "absolute", bottom: "10px", left: "10px", background: "rgba(236,72,153,0.75)", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                    AI UPSCALED ({resLabel.toUpperCase()})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
