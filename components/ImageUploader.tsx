"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_IMAGES, compressImage, extractImageHints } from "@/lib/utils";
import type { MetadataResult } from "@/app/api/generate/route";
import ResultCard from "./ResultCard";
import { addUsage } from "@/lib/tokenStore";

interface ImagePreview {
  id: string;
  file: File;
  preview: string;
  visualHints: string;
}

interface Props {
  onTokensUpdated?: () => void;
}

export default function ImageUploader({ onTokensUpdated }: Props = {}) {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stabilized, setStabilized] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));

      if (fileArray.length === 0) {
        setError("Hanya file gambar yang didukung (JPG, PNG, WEBP)");
        return;
      }

      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) {
        setError(`Maksimal ${MAX_IMAGES} foto`);
        return;
      }

      const toAdd = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        setError(`Hanya ${remaining} foto lagi yang bisa ditambahkan (maks ${MAX_IMAGES})`);
      }

      const newImages: ImagePreview[] = [];

      for (const file of toAdd) {
        try {
          const compressed = await compressImage(file);
          const visualHints = await extractImageHints(compressed);
          newImages.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            preview: compressed,
            visualHints,
          });
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
    setImages((prev) => prev.filter((img) => img.id !== id));
    setResults([]);
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

    try {
      if (stabilized) {
        // Proses 1 foto per 1 foto, dan lanjut sampai habis
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          setProgress(`Mode Stabil: Memproses foto ${i + 1}/${images.length}...`);

          try {
            const response = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                images: [
                  {
                    filename: img.file.name,
                    dataUrl: img.preview,
                    visualHints: img.visualHints,
                  },
                ],
                stabilized: true,
              }),
            });

            const data = await response.json();

            if (data.totalUsage) {
              addUsage(data.totalUsage.promptTokens, data.totalUsage.completionTokens);
              onTokensUpdated?.();
            }

            if (!response.ok) {
              collected.push({
                filename: img.file.name,
                title: "",
                keywords: [],
                error: data.error || `Gagal dengan status ${response.status}`,
                stabilized: true,
              });
            } else {
              // API mengembalikan array hasil dengan 1 item
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
        }

        const success = collected.filter((r) => !r.error).length;
        setProgress(`Selesai! ${success}/${images.length} foto berhasil`);
      } else {
        // Mode cepat (bulk)
        setProgress(`Memproses ${images.length} foto (mode cepat)...`);

        const payload = images.map((img) => ({
          filename: img.file.name,
          dataUrl: img.preview,
          visualHints: img.visualHints,
        }));

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: payload, stabilized: false }),
        });

        const data = await response.json();

        if (data.totalUsage) {
          addUsage(data.totalUsage.promptTokens, data.totalUsage.completionTokens);
          onTokensUpdated?.();
        }

        if (!response.ok) {
          throw new Error(data.error || "Gagal menghubungi server");
        }

        setResults(data.results as MetadataResult[]);
        setProgress(`Selesai! ${data.results.length} foto diproses`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (images.length === 0) return;

    const header = "Filename,Title,Keywords,Category,Releases\n";

    // Ekspor SEMUA foto yang dipilih user (termasuk yang gagal).
    // Mapping berdasarkan index UI supaya nama foto (filename) selalu nyambung.
    const csvRows = images.map((img, idx) => {
      const r = results[idx];

      const filename = `"${img.file.name.replace(/"/g, '""')}"`;
      const title = r?.title ? `"${r.title.replace(/"/g, '""')}"` : "\"\"";

      const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
      const keywords = `"${keywordsArr.join(',').replace(/"/g, '""')}"`;

      return [filename, title, keywords, "", ""].join(',');
    });

    const csvContent = header + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", "adobe_stock_metadata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="uploader">
      <div className="uploader__hero">
        <h2>Metadata Adobe Stock</h2>
        <p>Upload foto, AI akan generate title & keywords siap upload ke Adobe Stock.</p>
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
        />
        <div className="dropzone__icon">📷</div>
        <p className="dropzone__title">Seret & lepas foto di sini</p>
        <p className="dropzone__subtitle">atau klik untuk memilih file</p>
        <p className="dropzone__hint">Maksimal {MAX_IMAGES} foto · JPG, PNG, WEBP</p>
      </section>

      {images.length > 0 && (
        <section className="preview-section">
          <div className="preview-header">
            <h2>
              Foto Terpilih <span className="badge">{images.length}/{MAX_IMAGES}</span>
            </h2>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>
              Hapus Semua
            </button>
          </div>

          <div className="preview-grid">
            {images.map((img) => (
              <div key={img.id} className="preview-card">
                <img src={img.preview} alt={img.file.name} />
                <button
                  type="button"
                  className="preview-card__remove"
                  onClick={() => removeImage(img.id)}
                  aria-label="Hapus"
                >
                  ×
                </button>
                <span className="preview-card__name">{img.file.name}</span>
              </div>
            ))}
          </div>

          <div className="stabilizer-panel">
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
                <small>
                  Proses lebih lambat dengan penanganan error individual per foto.
                </small>
              </span>
            </label>
          </div>

          <div className="actions">
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

      {progress && !error && <p className="status status--info">{progress}</p>}
      {error && <p className="status status--error">{error}</p>}

      {results.length > 0 && (
        <section className="results-section">
          <div className="results-header">
            <h2>Hasil Metadata</h2>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={exportCsv}
              disabled={results.filter((r) => !r.error).length === 0}
            >
              ⬇ Export .csv
            </button>
          </div>

          <div className="results-list">
            {results.map((result, i) => (
              <ResultCard key={`${result.filename}-${i}`} result={result} preview={images[i]?.preview} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

