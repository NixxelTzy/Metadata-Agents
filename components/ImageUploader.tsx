"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_IMAGES, compressImage, extractImageHints, extractVideoFrame } from "@/lib/utils";
import type { MetadataResult } from "@/app/api/generate/route";
import { addUsage } from "@/lib/tokenStore";
import {
  UploadCloud, Tag, Sparkles, Download, Trash2, Plus, X,
  CheckCircle2, AlertCircle, Layers, Settings2, ShieldCheck,
  Film, Image as ImageIcon, Copy, Check, Info, FileSpreadsheet
} from "lucide-react";

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
  const [platform, setPlatform] = useState<"adobe_stock" | "shutterstock" | "magnific">("adobe_stock");
  const [csvExtension, setCsvExtension] = useState<"original" | "jpg" | "mp4" | "mov" | "eps" | "ai">("original");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Magnific-specific per-image fields: prompt and AI model
  const [magnificPrompts, setMagnificPrompts] = useState<Record<string, string>>({});
  const [magnificModels, setMagnificModels] = useState<Record<string, string>>({});
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

  const copyResult = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    const text = `Title: ${r.title}\nKeywords: ${r.keywords.join(", ")}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const exportCsv = () => {
    if (images.length === 0) return;

    let header = "";
    let csvRows: string[] = [];

    if (platform === "shutterstock") {
      header = "Filename,Description,Keywords,Categories,Editorial,Mature content,illustration\r\n";
      csvRows = images.map((img, idx) => {
        const r = results[idx];
        
        let rawFilename = img.file.name;
        if (csvExtension !== "original") {
          const dotIdx = rawFilename.lastIndexOf(".");
          const baseName = dotIdx !== -1 ? rawFilename.substring(0, dotIdx) : rawFilename;
          rawFilename = `${baseName}.${csvExtension}`;
        }
        
        const filename = `"${rawFilename.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;
        const description = r?.title ? `"${r.title.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"` : `""`;

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const keywords = `"${keywordsArr.map(k => k.trim()).join(',').replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

        const categoriesArr = Array.isArray(r?.categories) ? r!.categories : [];
        const cleanCategories = categoriesArr.filter(Boolean);
        const categories = `"${cleanCategories.join(',').replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

        const editorial = r?.editorial || "no";
        const matureContent = r?.matureContent || "no";
        const illustration = r?.illustration || "no";

        return [filename, description, keywords, categories, editorial, matureContent, illustration].join(',');
      });
    } else if (platform === "magnific") {
      header = "File name;Title;Keywords;Prompt;Model\r\n";
      csvRows = images.map((img, idx) => {
        const r = results[idx];
        const imgId = img.id;

        let rawFilename = img.file.name;
        if (csvExtension !== "original") {
          const dotIdx = rawFilename.lastIndexOf(".");
          const baseName = dotIdx !== -1 ? rawFilename.substring(0, dotIdx) : rawFilename;
          rawFilename = `${baseName}.${csvExtension}`;
        }

        const esc = (v: string) => v.replace(/'/g, "''").replace(/[\r\n]+/g, " ");

        const filename = `'${esc(rawFilename)}'`;
        const title = r?.title ? `'${esc(r.title)}'` : `''`;

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const keywords = `'${keywordsArr.map(k => esc(k.trim())).join(',')}'`;

        const prompt = magnificPrompts[imgId] ? `'${esc(magnificPrompts[imgId]!)}'` : `''`;
        const model = magnificModels[imgId] ? `'${esc(magnificModels[imgId]!)}'` : `''`;

        return [filename, title, keywords, prompt, model].join(';');
      });
    } else {
      header = "Filename,Title,Keywords,Category,Releases\r\n";
      csvRows = images.map((img, idx) => {
        const r = results[idx];
        
        let rawFilename = img.file.name;
        if (csvExtension !== "original") {
          const dotIdx = rawFilename.lastIndexOf(".");
          const baseName = dotIdx !== -1 ? rawFilename.substring(0, dotIdx) : rawFilename;
          rawFilename = `${baseName}.${csvExtension}`;
        }

        const filename = `"${rawFilename.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;
        const title = r?.title ? `"${r.title.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"` : `""`;

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const keywords = `"${keywordsArr.map(k => k.trim()).join(', ').replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

        return [filename, title, keywords, `""`, `""`].join(',');
      });
    }

    const csvContent = header + csvRows.join("\r\n") + "\r\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const filenameMap: Record<string, string> = {
      shutterstock: "shutterstock_metadata.csv",
      magnific: "magnific_metadata.csv",
      adobe_stock: "adobe_stock_metadata.csv",
    };
    link.setAttribute("href", url);
    link.setAttribute("download", filenameMap[platform] ?? "metadata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasGeneratedResults = results.length > 0 && results.some((r) => !r.error && r.title);

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "24px 20px 60px", fontFamily: "var(--font)" }}>
      {/* ── Hero Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#38bdf8", marginBottom: 12 }}>
          <Sparkles size={13} />
          <span>AI Vision Multimodal Analysis</span>
        </div>
        <h1 style={{ fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 800, color: "#f0f8ff", letterSpacing: "-0.02em", marginBottom: 8 }}>
          Stock AI Metadata Generator
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 640 }}>
          Upload foto atau video, AI otomatis membaca konteks visual dan menghasilkan Judul SEO, Keywords komprehensif, serta kategori yang siap diekspor ke format CSV.
        </p>
      </div>

      {/* ── Platform Selector Cards ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
          Pilih Target Platform
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {/* Adobe Stock */}
          <button
            type="button"
            onClick={() => { setPlatform("adobe_stock"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 14,
              border: platform === "adobe_stock" ? "1.5px solid #38bdf8" : "1px solid rgba(149,199,255,0.15)",
              background: platform === "adobe_stock" ? "rgba(14,165,233,0.18)" : "rgba(149,199,255,0.04)",
              boxShadow: platform === "adobe_stock" ? "0 4px 20px rgba(14,165,233,0.25), inset 0 0 0 1px rgba(56,189,248,0.3)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 13, boxShadow: "0 0 12px rgba(56,189,248,0.3)" }}>
                As
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>Adobe Stock</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Title + 49 Keywords</div>
              </div>
            </div>
            {platform === "adobe_stock" && <CheckCircle2 size={18} color="#38bdf8" />}
          </button>

          {/* Shutterstock */}
          <button
            type="button"
            onClick={() => { setPlatform("shutterstock"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 14,
              border: platform === "shutterstock" ? "1.5px solid #38bdf8" : "1px solid rgba(149,199,255,0.15)",
              background: platform === "shutterstock" ? "rgba(14,165,233,0.18)" : "rgba(149,199,255,0.04)",
              boxShadow: platform === "shutterstock" ? "0 4px 20px rgba(14,165,233,0.25), inset 0 0 0 1px rgba(56,189,248,0.3)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 13, boxShadow: "0 0 12px rgba(56,189,248,0.3)" }}>
                Ss
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>Shutterstock</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>50 Keywords + 2 Kategori</div>
              </div>
            </div>
            {platform === "shutterstock" && <CheckCircle2 size={18} color="#38bdf8" />}
          </button>

          {/* Magnific */}
          <button
            type="button"
            onClick={() => { setPlatform("magnific"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 14,
              border: platform === "magnific" ? "1.5px solid #38bdf8" : "1px solid rgba(149,199,255,0.15)",
              background: platform === "magnific" ? "rgba(14,165,233,0.18)" : "rgba(149,199,255,0.04)",
              boxShadow: platform === "magnific" ? "0 4px 20px rgba(14,165,233,0.25), inset 0 0 0 1px rgba(56,189,248,0.3)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 13, boxShadow: "0 0 12px rgba(56,189,248,0.3)" }}>
                Mg
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f8ff" }}>Magnific</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>50 Keywords + AI Prompt</div>
              </div>
            </div>
            {platform === "magnific" && <CheckCircle2 size={18} color="#38bdf8" />}
          </button>
        </div>
      </div>

      {/* ── Dropzone Area ── */}
      <section
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: dragOver ? "2px dashed #38bdf8" : "2px dashed rgba(149,199,255,0.25)",
          borderRadius: 18,
          padding: "44px 24px",
          textAlign: "center",
          background: dragOver ? "rgba(14,165,233,0.12)" : "rgba(149,199,255,0.03)",
          boxShadow: dragOver ? "0 0 30px rgba(56,189,248,0.25)" : "none",
          cursor: "pointer",
          transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          marginBottom: 24,
          position: "relative"
        }}
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
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.15))", border: "1px solid rgba(14,165,233,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#38bdf8" }}>
          <UploadCloud size={28} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f0f8ff", marginBottom: 6 }}>
          Seret & lepas file foto atau video ke sini
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
          atau klik untuk memilih dari perangkat Anda
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 999, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          <span>Maksimal {MAX_IMAGES} file sekaligus</span>
          <span>•</span>
          <span>JPG, PNG, WEBP, MP4, MOV</span>
        </div>
      </section>

      {/* ── Selected Images Preview & Generator Control ── */}
      {images.length > 0 && (
        <section style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} color="#38bdf8" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f8ff" }}>
                File Siap Proses
              </span>
              <span style={{ padding: "2px 8px", background: "rgba(14,165,233,0.15)", color: "#38bdf8", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                {images.length}/{MAX_IMAGES}
              </span>
            </div>
            <button
              type="button"
              onClick={clearAll}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#fca5a5", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
            >
              <Trash2 size={13} />
              Hapus Semua
            </button>
          </div>

          {/* List of files */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "rgba(0,10,30,0.5)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  gap: 14
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <img
                    src={img.preview}
                    alt={img.file.name}
                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f8ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {img.file.name}
                    </div>
                    <input
                      type="text"
                      placeholder="Petunjuk visual spesifik (opsional, misal: sunset, clean modern flat vector, bokeh)..."
                      value={img.customHints || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setImages(prev => prev.map(item => item.id === img.id ? { ...item, customHints: val } : item));
                      }}
                      style={{
                        width: "100%",
                        padding: "5px 9px",
                        fontSize: 11,
                        marginTop: 4,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                        color: "rgba(255,255,255,0.85)",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  style={{ background: "rgba(255,255,255,0.05)", border: "none", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}
                  aria-label="Hapus file"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Stabilizer and Compliance Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, padding: "14px 16px", background: "rgba(0,10,30,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={stabilized}
                onChange={(e) => setStabilized(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 2, accentColor: "#0ea5e9" }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f0f8ff" }}>Mode Stabil (Individual Queue)</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Memproses file per baris agar tidak gagal semua saat terjadi rate limit.</div>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={complianceGuard}
                onChange={(e) => setComplianceGuard(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 2, accentColor: "#0ea5e9" }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f0f8ff" }}>Adobe Stock Compliance Guard</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Filter otomatis agar judul mematuhi aturan konten editorial/komersial.</div>
              </div>
            </label>
          </div>

          {/* Action Generate CTA */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: loading ? "rgba(14,165,233,0.3)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
              color: "white",
              fontSize: 14,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 20px rgba(14,165,233,0.35)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
          >
            {loading ? (
              <>
                <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span>Memproses Metadata AI...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Metadata Sekarang ({images.length} File)</span>
              </>
            )}
          </button>
        </section>
      )}

      {/* ── Status Alerts ── */}
      {progress && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.3)", borderRadius: 12, color: "#38bdf8", fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
          <Info size={16} />
          <span>{progress}</span>
        </div>
      )}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, color: "#f87171", fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Results & Inline Editor Workspace ── */}
      {results.length > 0 && (
        <section style={{ marginTop: 32 }}>
          {/* Header Workspace */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f0f8ff", letterSpacing: "-0.01em" }}>
                Hasil Metadata & Workspace Editor
              </h2>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                Edit teks dan keywords langsung di bawah sebelum mengekspor ke format CSV.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Format Ekstensi CSV:</span>
                <select
                  value={csvExtension}
                  onChange={(e) => setCsvExtension(e.target.value as any)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    outline: "none"
                  }}
                >
                  <option value="original" style={{ background: "#001122", color: "#fff" }}>Asli (.jpg/.png)</option>
                  <option value="jpg" style={{ background: "#001122", color: "#fff" }}>Force .jpg</option>
                  <option value="mp4" style={{ background: "#001122", color: "#fff" }}>Force .mp4</option>
                  <option value="mov" style={{ background: "#001122", color: "#fff" }}>Force .mov</option>
                  <option value="eps" style={{ background: "#001122", color: "#fff" }}>Force .eps</option>
                  <option value="ai" style={{ background: "#001122", color: "#fff" }}>Force .ai</option>
                </select>
              </div>

              <button
                type="button"
                onClick={exportCsv}
                disabled={!hasGeneratedResults}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: hasGeneratedResults ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(255,255,255,0.06)",
                  color: hasGeneratedResults ? "white" : "rgba(255,255,255,0.3)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: hasGeneratedResults ? "pointer" : "not-allowed",
                  boxShadow: hasGeneratedResults ? "0 4px 14px rgba(16,185,129,0.3)" : "none"
                }}
              >
                <FileSpreadsheet size={15} />
                <span>Export {platform.toUpperCase()} CSV</span>
              </button>
            </div>
          </div>

          {/* Result Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {results.map((result, i) => {
              if (result.error) {
                return (
                  <div
                    key={`${result.filename}-${i}`}
                    style={{
                      display: "flex",
                      gap: 16,
                      padding: "16px 20px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 14,
                      alignItems: "center"
                    }}
                  >
                    <img src={images[i]?.preview} alt={result.filename} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>{result.filename}</div>
                      <div style={{ color: "#f87171", fontSize: 13, fontWeight: 700, marginTop: 4 }}>❌ {result.error}</div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`${result.filename}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 20,
                    padding: "20px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 16,
                    position: "relative"
                  }}
                >
                  {/* Left Column: Thumbnail + Copy Meta */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                    <div style={{ position: "relative", width: "100%", maxWidth: 160, aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <img
                        src={images[i]?.preview}
                        alt={result.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", wordBreak: "break-all", textAlign: "center", fontWeight: 600 }}>
                      {result.filename}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyResult(i)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        color: copiedIdx === i ? "#4ade80" : "rgba(255,255,255,0.6)",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedIdx === i ? "Tersalin!" : "Salin Meta"}</span>
                    </button>
                  </div>

                  {/* Center Column: Description & Keywords Editor */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>
                        Judul / Deskripsi
                      </label>
                      <input
                        type="text"
                        value={result.title}
                        onChange={(e) => handleUpdateResult(i, { title: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: 13,
                          background: "rgba(0,10,30,0.6)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          color: "#f0f8ff",
                          fontWeight: 600,
                          outline: "none"
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
                          Keywords ({result.keywords.length})
                        </label>
                        <span style={{ fontSize: 10, color: result.keywords.length >= 45 ? "#4ade80" : "#fbbf24" }}>
                          {result.keywords.length} kata kunci
                        </span>
                      </div>

                      {/* Keyword Pills */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          maxHeight: 140,
                          overflowY: "auto",
                          padding: 10,
                          background: "rgba(0,10,30,0.6)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 8,
                          marginBottom: 8
                        }}
                      >
                        {result.keywords.map((kw, kwIdx) => (
                          <span
                            key={`${kw}-${kwIdx}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "rgba(14,165,233,0.12)",
                              border: "1px solid rgba(14,165,233,0.25)",
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 10,
                              color: "#93c5fd",
                              fontWeight: 600
                            }}
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(i, kwIdx)}
                              style={{ border: "none", background: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Add keyword input */}
                      <div style={{ display: "flex", gap: 6 }}>
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
                            padding: "6px 10px",
                            fontSize: 11,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px dashed rgba(255,255,255,0.12)",
                            borderRadius: 6,
                            color: "white",
                            outline: "none"
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Platform-Specific Controls */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                    {platform === "shutterstock" ? (
                      <>
                        <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
                          Kategori Shutterstock
                        </label>
                        <select
                          value={result.categories?.[0] || ""}
                          onChange={(e) => {
                            const cats = result.categories ? [...result.categories] : ["", ""];
                            while (cats.length < 2) cats.push("");
                            cats[0] = e.target.value;
                            handleUpdateResult(i, { categories: cats });
                          }}
                          style={{ background: "rgba(0,10,30,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", fontSize: 11, padding: 6, width: "100%", outline: "none" }}
                        >
                          <option value="" style={{ background: "#001122" }}>-- Kategori 1 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat} style={{ background: "#001122" }}>{cat}</option>
                          ))}
                        </select>
                        <select
                          value={result.categories?.[1] || ""}
                          onChange={(e) => {
                            const cats = result.categories ? [...result.categories] : ["", ""];
                            while (cats.length < 2) cats.push("");
                            cats[1] = e.target.value;
                            handleUpdateResult(i, { categories: cats });
                          }}
                          style={{ background: "rgba(0,10,30,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", fontSize: 11, padding: 6, width: "100%", outline: "none" }}
                        >
                          <option value="" style={{ background: "#001122" }}>-- Kategori 2 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat} style={{ background: "#001122" }}>{cat}</option>
                          ))}
                        </select>

                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                          Atribut Teknis
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Editorial</span>
                            <select
                              value={result.editorial || "no"}
                              onChange={(e) => handleUpdateResult(i, { editorial: e.target.value as "yes" | "no" })}
                              style={{ background: "rgba(0,10,30,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", fontSize: 11, padding: 4, width: "100%" }}
                            >
                              <option value="no" style={{ background: "#001122" }}>No</option>
                              <option value="yes" style={{ background: "#001122" }}>Yes</option>
                            </select>
                          </div>
                          <div>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Mature</span>
                            <select
                              value={result.matureContent || "no"}
                              onChange={(e) => handleUpdateResult(i, { matureContent: e.target.value as "yes" | "no" })}
                              style={{ background: "rgba(0,10,30,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", fontSize: 11, padding: 4, width: "100%" }}
                            >
                              <option value="no" style={{ background: "#001122" }}>No</option>
                              <option value="yes" style={{ background: "#001122" }}>Yes</option>
                            </select>
                          </div>
                        </div>
                      </>
                    ) : platform === "magnific" ? (
                      <>
                        <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)" }}>
                          Info AI Magnific
                        </label>
                        <div>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>Prompt AI</span>
                          <textarea
                            rows={3}
                            placeholder="Prompt yang digunakan..."
                            value={magnificPrompts[images[i]?.id ?? ""] ?? ""}
                            onChange={(e) => {
                              const id = images[i]?.id ?? "";
                              setMagnificPrompts(prev => ({ ...prev, [id]: e.target.value }));
                            }}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              fontSize: 11,
                              background: "rgba(0,10,30,0.6)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 6,
                              color: "white",
                              resize: "vertical"
                            }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>Model AI</span>
                          <select
                            value={magnificModels[images[i]?.id ?? ""] ?? ""}
                            onChange={(e) => {
                              const id = images[i]?.id ?? "";
                              setMagnificModels(prev => ({ ...prev, [id]: e.target.value }));
                            }}
                            style={{ width: "100%", background: "rgba(0,10,30,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white", fontSize: 11, padding: 6 }}
                          >
                            <option value="" style={{ background: "#001122" }}>-- Non-AI / Manual --</option>
                            <option value="Midjourney 6" style={{ background: "#001122" }}>Midjourney 6</option>
                            <option value="Midjourney 5" style={{ background: "#001122" }}>Midjourney 5</option>
                            <option value="Stable Diffusion XL" style={{ background: "#001122" }}>Stable Diffusion XL</option>
                            <option value="DALL-E 3" style={{ background: "#001122" }}>DALL-E 3</option>
                            <option value="Adobe Firefly" style={{ background: "#001122" }}>Adobe Firefly</option>
                            <option value="Flux" style={{ background: "#001122" }}>Flux</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center", gap: 6, padding: "16px 0" }}>
                        <ShieldCheck size={28} color="#38bdf8" />
                        <span style={{ fontWeight: 700, color: "#f0f8ff" }}>Adobe Stock Ready</span>
                        <span style={{ fontSize: 10, maxWidth: 180 }}>Title & 49 Keywords terstruktur otomatis sesuai panduan resmi kontributor.</span>
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
