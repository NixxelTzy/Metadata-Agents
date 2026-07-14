"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_IMAGES, compressImage, extractImageHints, extractVideoFrame } from "@/lib/utils";
import type { MetadataResult } from "@/app/api/generate/route";
import { addUsage } from "@/lib/tokenStore";

interface ImagePreview {
  id: string;
  file: File;
  preview: string;
  visualHints: string;
  customHints?: string;
}

interface Props {
  onTokensUpdated?: () => void;
}

const CATEGORIES_LIST = [
  "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks",
  "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical",
  "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor",
  "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology",
  "Transportation", "Vectors", "Vintage"
];

export default function ImageUploader({ onTokensUpdated }: Props = {}) {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stabilized, setStabilized] = useState(true);
  const [complianceGuard, setComplianceGuard] = useState(true);
  const [platform, setPlatform] = useState<"adobe_stock" | "shutterstock">("adobe_stock");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      const fileArray = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );

      if (fileArray.length === 0) {
        setError("Hanya file gambar (JPG, PNG, WEBP) atau video (MP4, MOV, dll) yang didukung");
        return;
      }

      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) {
        setError(`Maksimal ${MAX_IMAGES} file`);
        return;
      }

      const toAdd = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        setError(`Hanya ${remaining} file lagi yang bisa ditambahkan (maks ${MAX_IMAGES})`);
      }

      const newImages: ImagePreview[] = [];

      for (const file of toAdd) {
        try {
          if (file.type.startsWith("image/")) {
            const compressed = await compressImage(file);
            const visualHints = await extractImageHints(compressed);
            newImages.push({
              id: `${file.name}-${Date.now()}-${Math.random()}`,
              file,
              preview: compressed,
              visualHints,
              customHints: ""
            });
          } else if (file.type.startsWith("video/")) {
            const frame = await extractVideoFrame(file);
            const visualHints = await extractImageHints(frame);
            newImages.push({
              id: `${file.name}-${Date.now()}-${Math.random()}`,
              file,
              preview: frame,
              visualHints: `[Video Frame] ${visualHints}`,
              customHints: ""
            });
          }
        } catch {
          setError(`Gagal memproses: ${file.name}`);
        }
      }

      setImages((prev) => [...prev, ...newImages]);
      setResults([]);
    },
    [images.length]
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
    const idx = images.findIndex((img) => img.id === id);
    setImages((prev) => prev.filter((img) => img.id !== id));
    if (idx !== -1) {
      setResults((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const clearAll = () => {
    setImages([]);
    setResults([]);
    setError("");
    setProgress("");
  };

  const generate = async () => {
    if (images.length === 0) return;

    setLoading(true);
    setError("");
    setResults([]);

    const collected: MetadataResult[] = [];
    const INTER_REQUEST_DELAY_MS = 1500;
    const RATE_LIMIT_PAUSE_MS = 10000;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    try {
      if (stabilized) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i]!;
          setProgress(`Mode Stabil: Memproses file ${i + 1}/${images.length}...`);

          const visualHintsToSend = img.customHints
            ? `${img.visualHints} | User hints: ${img.customHints}`
            : img.visualHints;

          try {
            const response = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                images: [
                  {
                    filename: img.file.name,
                    dataUrl: img.preview,
                    visualHints: visualHintsToSend,
                  },
                ],
                stabilized: true,
                platform,
                complianceGuard,
              }),
            });

            const data = await response.json();

            if (data.totalUsage) {
              addUsage(data.totalUsage.promptTokens, data.totalUsage.completionTokens, "metadata");
              onTokensUpdated?.();
            }

            if (!response.ok) {
              const isRateLimit = response.status === 429;
              collected.push({
                filename: img.file.name,
                title: "",
                keywords: [],
                error: data.error || `Gagal dengan status ${response.status}`,
                stabilized: true,
              });

              if (isRateLimit && i < images.length - 1) {
                setProgress(`⚠️ Rate limit terdeteksi. Menunggu 10 detik sebelum melanjutkan...`);
                await sleep(RATE_LIMIT_PAUSE_MS);
              }
            } else {
              collected.push(...(data.results as MetadataResult[]));
            }
          } catch (loopError) {
            collected.push({
              filename: img.file.name,
              title: "",
              keywords: [],
              error: loopError instanceof Error ? loopError.message : "Koneksi error",
              stabilized: true,
            });
          }

          setResults([...collected]);

          if (i < images.length - 1) {
            await sleep(INTER_REQUEST_DELAY_MS);
          }
        }

        const success = collected.filter((r) => !r.error).length;
        setProgress(`✅ Selesai! ${success}/${images.length} file berhasil`);
      } else {
        setProgress(`Memproses ${images.length} file (mode cepat)...`);

        const payload = images.map((img) => ({
          filename: img.file.name,
          dataUrl: img.preview,
          visualHints: img.customHints
            ? `${img.visualHints} | User hints: ${img.customHints}`
            : img.visualHints,
        }));

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: payload, stabilized: false, platform, complianceGuard }),
        });

        const data = await response.json();

        if (data.totalUsage) {
          addUsage(data.totalUsage.promptTokens, data.totalUsage.completionTokens, "metadata");
          onTokensUpdated?.();
        }

        if (!response.ok) {
          throw new Error(data.error || "Gagal menghubungi server");
        }

        setResults(data.results as MetadataResult[]);
        setProgress(`✅ Selesai! ${data.results.length} file diproses`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateResult = (index: number, updatedFields: Partial<MetadataResult>) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updatedFields } : r))
    );
  };

  const handleRemoveKeyword = (resIdx: number, kwIdx: number) => {
    const updatedKeywords = results[resIdx]!.keywords.filter((_, idx) => idx !== kwIdx);
    handleUpdateResult(resIdx, { keywords: updatedKeywords });
  };

  const handleAddKeyword = (resIdx: number, newKw: string) => {
    const clean = newKw.trim().toLowerCase();
    if (!clean) return;
    const current = results[resIdx]!.keywords;
    if (current.includes(clean)) return;
    handleUpdateResult(resIdx, { keywords: [...current, clean] });
  };

  const exportCsv = () => {
    if (images.length === 0) return;

    let header = "";
    let csvRows: string[] = [];

    if (platform === "shutterstock") {
      header = "Filename,Description,Keywords,Categories,Editorial,Mature content,illustration\n";
      csvRows = images.map((img, idx) => {
        const r = results[idx];
        const filename = `"${img.file.name.replace(/"/g, '""')}"`;
        const description = r?.title ? `"${r.title.replace(/"/g, '""')}"` : "\"\"";

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const keywords = `"${keywordsArr.join(',').replace(/"/g, '""')}"`;

        const categoriesArr = Array.isArray(r?.categories) ? r!.categories : [];
        const categories = `"${categoriesArr.join(',').replace(/"/g, '""')}"`;

        const editorial = r?.editorial || "no";
        const matureContent = r?.matureContent || "no";
        const illustration = r?.illustration || "no";

        return [filename, description, keywords, categories, editorial, matureContent, illustration].join(',');
      });
    } else {
      header = "Filename,Title,Keywords,Category,Releases\n";
      csvRows = images.map((img, idx) => {
        const r = results[idx];
        const filename = `"${img.file.name.replace(/"/g, '""')}"`;
        const title = r?.title ? `"${r.title.replace(/"/g, '""')}"` : "\"\"";

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const keywords = `"${keywordsArr.join(',').replace(/"/g, '""')}"`;

        return [filename, title, keywords, "", ""].join(',');
      });
    }

    const csvContent = header + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", platform === "shutterstock" ? "shutterstock_metadata.csv" : "adobe_stock_metadata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasGeneratedResults = results.length > 0 && results.some((r) => !r.error && r.title);

  return (
    <div className="uploader">
      <div className="uploader__hero">
        <h2>Stock AI Metadata Generator</h2>
        <p>Upload foto atau video, AI akan generate metadata siap pakai untuk platform stok Anda.</p>
      </div>

      <div className="platform-selector">
        <button
          type="button"
          className={`platform-btn ${platform === "adobe_stock" ? "platform-btn--active" : ""}`}
          onClick={() => { setPlatform("adobe_stock"); setResults([]); }}
        >
          <span className="platform-icon">🏷️</span> Adobe Stock (49 Keywords)
        </button>
        <button
          type="button"
          className={`platform-btn ${platform === "shutterstock" ? "platform-btn--active" : ""}`}
          onClick={() => { setPlatform("shutterstock"); setResults([]); }}
        >
          <span className="platform-icon">📸</span> Shutterstock (50 Keywords)
        </button>
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
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="dropzone__icon">📹</div>
        <p className="dropzone__title">Seret & lepas file foto atau video di sini</p>
        <p className="dropzone__subtitle">atau klik untuk memilih file</p>
        <p className="dropzone__hint">Maksimal {MAX_IMAGES} file · JPG, PNG, WEBP, MP4, MOV, dll</p>
      </section>

      {images.length > 0 && (
        <section className="preview-section">
          <div className="preview-header">
            <h2>
              File Terpilih <span className="badge">{images.length}/{MAX_IMAGES}</span>
            </h2>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>
              Hapus Semua
            </button>
          </div>

          {/* Inline visual hints customizer before generation */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <img
                    src={img.preview}
                    alt={img.file.name}
                    style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {img.file.name}
                    </div>
                    <input
                      type="text"
                      placeholder="Tambahkan petunjuk visual kustom (misal: golden hour, clean vector)..."
                      value={img.customHints || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setImages(prev => prev.map(item => item.id === img.id ? { ...item, customHints: val } : item));
                      }}
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        fontSize: "11px",
                        marginTop: "4px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--text)"
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px", marginLeft: "12px" }}
                  aria-label="Hapus"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="stabilizer-panel" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
            <label className="stabilizer-toggle">
              <input
                type="checkbox"
                checked={stabilized}
                onChange={(e) => setStabilized(e.target.checked)}
                disabled={loading}
              />
              <span className="stabilizer-toggle__box" />
              <span className="stabilizer-toggle__text">
                <strong>Mode Stabil</strong>
                <small>Proses dengan penanganan error individual per file.</small>
              </span>
            </label>

            <label className="stabilizer-toggle">
              <input
                type="checkbox"
                checked={complianceGuard}
                onChange={(e) => setComplianceGuard(e.target.checked)}
                disabled={loading}
              />
              <span className="stabilizer-toggle__box" />
              <span className="stabilizer-toggle__text">
                <strong>Adobe Stock Compliance Guard</strong>
                <small>Secara otomatis memfilter judul agar tidak melanggar aturan Newsworthy Events.</small>
              </span>
            </label>
          </div>

          <div className="actions" style={{ marginTop: "16px" }}>
            <button type="button" className="btn btn--primary" onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Memproses...
                </>
              ) : (
                <>✨ Generate Metadata</>
              )}
            </button>
          </div>
        </section>
      )}

      {progress && !error && <p className="status status--info" style={{ marginTop: "16px" }}>{progress}</p>}
      {error && <p className="status status--error" style={{ marginTop: "16px" }}>{error}</p>}

      {results.length > 0 && (
        <section className="results-section">
          <div className="results-header">
            <h2>Hasil Metadata & Inline Editor Workspace</h2>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={exportCsv}
              disabled={!hasGeneratedResults}
            >
              ⬇ Export .csv
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
            {results.map((result, i) => {
              if (result.error) {
                return (
                  <div
                    key={`${result.filename}-${i}`}
                    style={{
                      display: "flex",
                      gap: "14px",
                      padding: "16px",
                      background: "#fff5f5",
                      border: "1px solid #fed7d7",
                      borderRadius: "var(--radius)",
                      alignItems: "center"
                    }}
                  >
                    <img src={images[i]?.preview} alt={result.filename} style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "4px" }} />
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all" }}>{result.filename}</div>
                      <div style={{ color: "var(--error)", fontSize: "13px", fontWeight: "600", marginTop: "4px" }}>❌ {result.error}</div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`${result.filename}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 1fr",
                    gap: "20px",
                    padding: "20px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    transition: "border-color 0.15s"
                  }}
                >
                  {/* Thumbnail & Info */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                    <img
                      src={images[i]?.preview}
                      alt={result.filename}
                      style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                    />
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", wordBreak: "break-all", textAlign: "center" }}>
                      {result.filename}
                    </div>
                  </div>

                  {/* Title & Keywords */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                        Description / Title
                      </label>
                      <input
                        type="text"
                        value={result.title}
                        onChange={(e) => handleUpdateResult(i, { title: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: "13px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          color: "var(--text)",
                          fontWeight: "500"
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                        Keywords ({result.keywords.length})
                      </label>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "5px",
                          maxHeight: "150px",
                          overflowY: "auto",
                          padding: "8px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          marginBottom: "8px"
                        }}
                      >
                        {result.keywords.map((kw, kwIdx) => (
                          <span
                            key={`${kw}-${kwIdx}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              color: "var(--text-secondary)"
                            }}
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(i, kwIdx)}
                              style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontWeight: "bold", fontSize: "10px", padding: 0 }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="+ Tambah Keyword (Tekan Enter)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const input = e.currentTarget;
                            handleAddKeyword(i, input.value);
                            input.value = "";
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          fontSize: "11px",
                          background: "transparent",
                          border: "1px dashed var(--border)",
                          borderRadius: "4px",
                          color: "var(--text)"
                        }}
                      />
                    </div>
                  </div>

                  {/* Shutterstock Options or Adobe Stock categories */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderLeft: "1px solid var(--border)", paddingLeft: "20px" }}>
                    {platform === "shutterstock" ? (
                      <>
                        <label style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                          Shutterstock Categories
                        </label>
                        <select
                          value={result.categories?.[0] || ""}
                          onChange={(e) => {
                            const cats = [...(result.categories || [])];
                            cats[0] = e.target.value;
                            handleUpdateResult(i, { categories: cats.filter(Boolean) });
                          }}
                          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "12px", padding: "6px", width: "100%" }}
                        >
                          <option value="">-- Kategori 1 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <select
                          value={result.categories?.[1] || ""}
                          onChange={(e) => {
                            const cats = [...(result.categories || [])];
                            cats[1] = e.target.value;
                            handleUpdateResult(i, { categories: cats.filter(Boolean) });
                          }}
                          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "12px", padding: "6px", width: "100%" }}
                        >
                          <option value="">-- Kategori 2 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        <label style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginTop: "8px" }}>
                          Technical Attributes
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <div>
                            <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Editorial</span>
                            <select
                              value={result.editorial || "no"}
                              onChange={(e) => handleUpdateResult(i, { editorial: e.target.value as "yes" | "no" })}
                              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "11px", padding: "4px", width: "100%" }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                          <div>
                            <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Mature</span>
                            <select
                              value={result.matureContent || "no"}
                              onChange={(e) => handleUpdateResult(i, { matureContent: e.target.value as "yes" | "no" })}
                              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "11px", padding: "4px", width: "100%" }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                          <div style={{ gridColumn: "span 2" }}>
                            <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Illustration</span>
                            <select
                              value={result.illustration || "no"}
                              onChange={(e) => handleUpdateResult(i, { illustration: e.target.value as "yes" | "no" })}
                              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "11px", padding: "4px", width: "100%" }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", color: "var(--text-muted)", fontSize: "11px", textAlign: "center" }}>
                        <span>Platform: Adobe Stock</span>
                        <span style={{ fontSize: "9px", marginTop: "4px" }}>Hanya membutuhkan Title & Keywords</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
