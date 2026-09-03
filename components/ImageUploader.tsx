"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_IMAGES, compressImage, extractImageHints, extractVideoFrame } from "@/lib/utils";
import type { MetadataResult } from "@/app/api/generate/route";
import { addUsage, isTokenLimitReached, openPremiumModal } from "@/lib/tokenStore";
import { showToast } from "@/components/Toast";
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
  const [globalMagnificModel, setGlobalMagnificModel] = useState("Midjourney 6");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGlobalModelChange = (model: string) => {
    setGlobalMagnificModel(model);
    setMagnificModels((prev) => {
      const updated: Record<string, string> = {};
      images.forEach((img) => {
        updated[img.id] = model;
      });
      return { ...prev, ...updated };
    });
  };

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

    if (isTokenLimitReached()) {
      showToast({
        type: "warning",
        title: "Batas Token 200k Tercapai",
        message: "Kuota token harian 200k Anda telah habis. Dapatkan akses unlimited dengan Paket Premium!",
      });
      openPremiumModal();
      return;
    }

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
              const newResults = data.results as MetadataResult[];
              collected.push(...newResults);
              const r = newResults[0];
              if (r) {
                if (r.prompt) {
                  setMagnificPrompts((prev) => ({ ...prev, [img.id]: r.prompt! }));
                }
                if (r.model) {
                  setMagnificModels((prev) => ({ ...prev, [img.id]: r.model! }));
                } else {
                  setMagnificModels((prev) => ({ ...prev, [img.id]: prev[img.id] || globalMagnificModel }));
                }
              }
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

        const resList = data.results as MetadataResult[];
        setResults(resList);

        const newPrompts: Record<string, string> = {};
        const newModels: Record<string, string> = {};
        images.forEach((img, idx) => {
          const r = resList[idx];
          if (r) {
            if (r.prompt) newPrompts[img.id] = r.prompt;
            if (r.model) newModels[img.id] = r.model;
            else newModels[img.id] = globalMagnificModel;
          }
        });
        setMagnificPrompts((prev) => ({ ...prev, ...newPrompts }));
        setMagnificModels((prev) => ({ ...prev, ...newModels }));

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

        const promptVal = magnificPrompts[imgId] || r?.prompt || "";
        const modelVal = magnificModels[imgId] || r?.model || globalMagnificModel;

        const prompt = promptVal ? `'${esc(promptVal)}'` : `''`;
        const model = modelVal ? `'${esc(modelVal)}'` : `''`;

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
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(219, 234, 254, 0.8)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 999, fontSize: 11, fontWeight: 800, color: "#1e40af", marginBottom: 12 }}>
          <Sparkles size={13} color="#2563eb" />
          <span>AI Vision Multimodal Analysis</span>
        </div>
        <h1 style={{ fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em", marginBottom: 8 }}>
          Stock AI Metadata Generator
        </h1>
        <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.6, maxWidth: 680, fontWeight: 500 }}>
          Upload foto atau video, AI otomatis membaca konteks visual dan menghasilkan Judul SEO, Keywords komprehensif, serta kategori yang siap diekspor ke format CSV.
        </p>
      </div>

      {/* ── Platform Selector Cards ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af", marginBottom: 10 }}>
          Pilih Target Platform
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {/* Adobe Stock */}
          <button
            type="button"
            onClick={() => { setPlatform("adobe_stock"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 16,
              border: platform === "adobe_stock" ? "2px solid #2563eb" : "1px solid rgba(147, 197, 253, 0.45)",
              background: platform === "adobe_stock" ? "rgba(219, 234, 254, 0.85)" : "rgba(255, 255, 255, 0.75)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: platform === "adobe_stock" ? "0 8px 24px rgba(37, 99, 235, 0.18)" : "0 2px 10px rgba(59, 130, 246, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                As
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Adobe Stock</div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, fontWeight: 600 }}>Title + 49 Keywords</div>
              </div>
            </div>
            {platform === "adobe_stock" && <CheckCircle2 size={20} color="#2563eb" />}
          </button>

          {/* Shutterstock */}
          <button
            type="button"
            onClick={() => { setPlatform("shutterstock"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 16,
              border: platform === "shutterstock" ? "2px solid #2563eb" : "1px solid rgba(147, 197, 253, 0.45)",
              background: platform === "shutterstock" ? "rgba(219, 234, 254, 0.85)" : "rgba(255, 255, 255, 0.75)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: platform === "shutterstock" ? "0 8px 24px rgba(37, 99, 235, 0.18)" : "0 2px 10px rgba(59, 130, 246, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #ef4444, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}>
                Ss
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Shutterstock</div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, fontWeight: 600 }}>50 Keywords + 2 Kategori</div>
              </div>
            </div>
            {platform === "shutterstock" && <CheckCircle2 size={20} color="#2563eb" />}
          </button>

          {/* Magnific */}
          <button
            type="button"
            onClick={() => { setPlatform("magnific"); setResults([]); }}
            style={{
              padding: "16px 18px",
              borderRadius: 16,
              border: platform === "magnific" ? "2px solid #2563eb" : "1px solid rgba(147, 197, 253, 0.45)",
              background: platform === "magnific" ? "rgba(219, 234, 254, 0.85)" : "rgba(255, 255, 255, 0.75)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: platform === "magnific" ? "0 8px 24px rgba(37, 99, 235, 0.18)" : "0 2px 10px rgba(59, 130, 246, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "all 0.18s ease",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, boxShadow: "0 4px 12px rgba(139,92,246,0.3)" }}>
                Mg
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Magnific</div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, fontWeight: 600 }}>50 Keywords + Auto AI Prompt</div>
              </div>
            </div>
            {platform === "magnific" && <CheckCircle2 size={20} color="#2563eb" />}
          </button>
        </div>

        {/* Magnific Global Model & Auto Prompt Banner */}
        {platform === "magnific" && (
          <div style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "14px 18px",
            background: "rgba(219, 234, 254, 0.75)",
            border: "1px solid rgba(147, 197, 253, 0.7)",
            borderRadius: 14,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles size={18} color="#2563eb" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                  Auto Visual Prompt Analysis &amp; Model Sync
                </div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, fontWeight: 500 }}>
                  Prompt AI otomatis dibuat secara mendalam dari analisis foto/video dan model AI diterapkan seragam.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1e40af" }}>Model AI Seragam:</span>
              <select
                value={globalMagnificModel}
                onChange={(e) => handleGlobalModelChange(e.target.value)}
                style={{
                  padding: "7px 14px",
                  background: "white",
                  border: "1px solid rgba(147, 197, 253, 0.8)",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#0f172a",
                  cursor: "pointer",
                  outline: "none"
                }}
              >
                <option value="Midjourney 6">Midjourney 6 (Default)</option>
                <option value="Flux">Flux</option>
                <option value="Stable Diffusion XL">Stable Diffusion XL</option>
                <option value="Midjourney 5">Midjourney 5</option>
                <option value="DALL-E 3">DALL-E 3</option>
                <option value="Adobe Firefly">Adobe Firefly</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Dropzone Area ── */}
      <section
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: dragOver ? "2px dashed #2563eb" : "2px dashed rgba(147, 197, 253, 0.75)",
          borderRadius: 20,
          padding: "44px 24px",
          textAlign: "center",
          background: dragOver ? "rgba(219, 234, 254, 0.8)" : "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: dragOver ? "0 0 30px rgba(59, 130, 246, 0.25)" : "0 4px 20px rgba(59, 130, 246, 0.06)",
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
        <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.8))", border: "1px solid rgba(147, 197, 253, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#2563eb", boxShadow: "0 4px 16px rgba(37,99,235,0.12)" }}>
          <UploadCloud size={30} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
          Seret &amp; lepas file foto atau video ke sini
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14, fontWeight: 500 }}>
          atau klik untuk memilih dari perangkat Anda
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", background: "rgba(219, 234, 254, 0.7)", border: "1px solid rgba(147, 197, 253, 0.5)", borderRadius: 999, fontSize: 11.5, color: "#1e40af", fontWeight: 700 }}>
          <span>Maksimal {MAX_IMAGES} file sekaligus</span>
          <span>•</span>
          <span>JPG, PNG, WEBP, MP4, MOV</span>
        </div>
      </section>

      {/* ── Selected Images Preview & Generator Control ── */}
      {images.length > 0 && (
        <section style={{ background: "rgba(255, 255, 255, 0.75)", border: "1px solid rgba(147, 197, 253, 0.5)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 20, padding: "22px", marginBottom: 28, boxShadow: "0 6px 24px rgba(59, 130, 246, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} color="#2563eb" />
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                File Siap Proses
              </span>
              <span style={{ padding: "2px 10px", background: "rgba(219, 234, 254, 0.8)", color: "#1e40af", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 999, fontSize: 11.5, fontWeight: 800 }}>
                {images.length}/{MAX_IMAGES}
              </span>
            </div>
            <button
              type="button"
              onClick={clearAll}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(254, 226, 226, 0.8)", border: "1px solid rgba(252, 165, 165, 0.8)", borderRadius: 8, color: "#dc2626", fontSize: 11.5, fontWeight: 700, cursor: "pointer", transition: "background 0.15s" }}
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
                  background: "rgba(255, 255, 255, 0.85)",
                  border: "1px solid rgba(147, 197, 253, 0.45)",
                  borderRadius: 12,
                  gap: 14
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <img
                    src={img.preview}
                    alt={img.file.name}
                    style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(147, 197, 253, 0.5)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                        padding: "6px 10px",
                        fontSize: 11.5,
                        marginTop: 4,
                        background: "rgba(248, 250, 252, 0.9)",
                        border: "1px solid rgba(147, 197, 253, 0.5)",
                        borderRadius: 6,
                        color: "#0f172a",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  style={{ background: "rgba(241, 245, 249, 0.8)", border: "1px solid rgba(203, 213, 225, 0.6)", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", cursor: "pointer" }}
                  aria-label="Hapus file"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Stabilizer and Compliance Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, padding: "14px 16px", background: "rgba(219, 234, 254, 0.5)", border: "1px solid rgba(147, 197, 253, 0.5)", borderRadius: 14, marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={stabilized}
                onChange={(e) => setStabilized(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 2, accentColor: "#2563eb" }}
              />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>Mode Stabil (Individual Queue)</div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, fontWeight: 500 }}>Memproses file per baris agar tidak gagal semua saat terjadi rate limit.</div>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={complianceGuard}
                onChange={(e) => setComplianceGuard(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 2, accentColor: "#2563eb" }}
              />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>Adobe Stock Compliance Guard</div>
                <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, fontWeight: 500 }}>Filter otomatis agar judul mematuhi aturan konten editorial/komersial.</div>
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
              borderRadius: 14,
              border: "none",
              background: loading ? "rgba(59, 130, 246, 0.5)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "white",
              fontSize: 14.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "rgba(219, 234, 254, 0.8)", border: "1px solid rgba(147, 197, 253, 0.7)", borderRadius: 14, color: "#1e40af", fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
          <Info size={18} color="#2563eb" />
          <span>{progress}</span>
        </div>
      )}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "rgba(254, 226, 226, 0.85)", border: "1px solid rgba(252, 165, 165, 0.8)", borderRadius: 14, color: "#b91c1c", fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
          <AlertCircle size={18} color="#dc2626" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Results & Inline Editor Workspace ── */}
      {results.length > 0 && (
        <section style={{ marginTop: 32 }}>
          {/* Header Workspace */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(147, 197, 253, 0.4)" }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em" }}>
                Hasil Metadata &amp; Workspace Editor
              </h2>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
                Edit teks dan keywords langsung di bawah sebelum mengekspor ke format CSV.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255, 255, 255, 0.8)", padding: "5px 12px", borderRadius: 10, border: "1px solid rgba(147, 197, 253, 0.5)" }}>
                <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>Format Ekstensi CSV:</span>
                <select
                  value={csvExtension}
                  onChange={(e) => setCsvExtension(e.target.value as any)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#2563eb",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    outline: "none"
                  }}
                >
                  <option value="original">Asli (.jpg/.png)</option>
                  <option value="jpg">Force .jpg</option>
                  <option value="mp4">Force .mp4</option>
                  <option value="mov">Force .mov</option>
                  <option value="eps">Force .eps</option>
                  <option value="ai">Force .ai</option>
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
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: hasGeneratedResults ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(203, 213, 225, 0.6)",
                  color: hasGeneratedResults ? "white" : "#94a3b8",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: hasGeneratedResults ? "pointer" : "not-allowed",
                  boxShadow: hasGeneratedResults ? "0 4px 16px rgba(16,185,129,0.35)" : "none"
                }}
              >
                <FileSpreadsheet size={16} />
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
                      background: "rgba(254, 226, 226, 0.75)",
                      border: "1px solid rgba(252, 165, 165, 0.8)",
                      borderRadius: 16,
                      alignItems: "center"
                    }}
                  >
                    <img src={images[i]?.preview} alt={result.filename} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(252,165,165,0.6)" }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-all", fontWeight: 600 }}>{result.filename}</div>
                      <div style={{ color: "#dc2626", fontSize: 13.5, fontWeight: 800, marginTop: 4 }}>❌ {result.error}</div>
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
                    padding: "22px",
                    background: "rgba(255, 255, 255, 0.8)",
                    border: "1px solid rgba(147, 197, 253, 0.5)",
                    borderRadius: 18,
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    boxShadow: "0 6px 24px rgba(59, 130, 246, 0.07)",
                    position: "relative"
                  }}
                >
                  {/* Left Column: Thumbnail + Copy Meta */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                    <div style={{ position: "relative", width: "100%", maxWidth: 160, aspectRatio: "1/1", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(147, 197, 253, 0.6)", boxShadow: "0 4px 12px rgba(59,130,246,0.1)" }}>
                      <img
                        src={images[i]?.preview}
                        alt={result.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#64748b", wordBreak: "break-all", textAlign: "center", fontWeight: 700 }}>
                      {result.filename}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyResult(i)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(147, 197, 253, 0.6)",
                        background: copiedIdx === i ? "rgba(220, 252, 231, 0.9)" : "rgba(219, 234, 254, 0.7)",
                        color: copiedIdx === i ? "#15803d" : "#1e40af",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                    >
                      {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedIdx === i ? "Tersalin!" : "Salin Meta"}</span>
                    </button>
                  </div>

                  {/* Center Column: Description & Keywords Editor */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af", display: "block", marginBottom: 6 }}>
                        Judul / Deskripsi
                      </label>
                      <input
                        type="text"
                        value={result.title}
                        onChange={(e) => handleUpdateResult(i, { title: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          fontSize: 13,
                          background: "rgba(248, 250, 252, 0.95)",
                          border: "1px solid rgba(147, 197, 253, 0.6)",
                          borderRadius: 10,
                          color: "#0f172a",
                          fontWeight: 700,
                          outline: "none"
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af" }}>
                          Keywords ({result.keywords.length})
                        </label>
                        <span style={{ fontSize: 11, fontWeight: 700, color: result.keywords.length >= 45 ? "#16a34a" : "#d97706" }}>
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
                          background: "rgba(248, 250, 252, 0.9)",
                          border: "1px solid rgba(147, 197, 253, 0.5)",
                          borderRadius: 10,
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
                              background: "rgba(219, 234, 254, 0.8)",
                              border: "1px solid rgba(147, 197, 253, 0.6)",
                              padding: "3px 9px",
                              borderRadius: 999,
                              fontSize: 10.5,
                              color: "#1e40af",
                              fontWeight: 700
                            }}
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(i, kwIdx)}
                              style={{ border: "none", background: "none", color: "#64748b", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
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
                            padding: "8px 12px",
                            fontSize: 11.5,
                            background: "rgba(255, 255, 255, 0.95)",
                            border: "1.5px dashed rgba(147, 197, 253, 0.8)",
                            borderRadius: 8,
                            color: "#0f172a",
                            fontWeight: 600,
                            outline: "none"
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Platform-Specific Controls */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 12, borderLeft: "1px solid rgba(147, 197, 253, 0.4)" }}>
                    {platform === "shutterstock" ? (
                      <>
                        <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af" }}>
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
                          style={{ background: "rgba(248, 250, 252, 0.95)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 8, color: "#0f172a", fontSize: 11.5, padding: 8, width: "100%", fontWeight: 600, outline: "none" }}
                        >
                          <option value="">-- Kategori 1 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
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
                          style={{ background: "rgba(248, 250, 252, 0.95)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 8, color: "#0f172a", fontSize: 11.5, padding: 8, width: "100%", fontWeight: 600, outline: "none" }}
                        >
                          <option value="">-- Kategori 2 --</option>
                          {CATEGORIES_LIST.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af", marginTop: 6 }}>
                          Atribut Teknis
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <span style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700 }}>Editorial</span>
                            <select
                              value={result.editorial || "no"}
                              onChange={(e) => handleUpdateResult(i, { editorial: e.target.value as "yes" | "no" })}
                              style={{ background: "rgba(248, 250, 252, 0.95)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 8, color: "#0f172a", fontSize: 11.5, padding: 6, width: "100%", fontWeight: 600 }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                          <div>
                            <span style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700 }}>Mature</span>
                            <select
                              value={result.matureContent || "no"}
                              onChange={(e) => handleUpdateResult(i, { matureContent: e.target.value as "yes" | "no" })}
                              style={{ background: "rgba(248, 250, 252, 0.95)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 8, color: "#0f172a", fontSize: 11.5, padding: 6, width: "100%", fontWeight: 600 }}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                        </div>
                      </>
                    ) : platform === "magnific" ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <label style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e40af" }}>
                            Info AI Magnific
                          </label>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#15803d", background: "rgba(220,252,231,0.9)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(187,247,208,0.8)" }}>
                            Auto Generated
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 10.5, color: "#1e40af", display: "block", marginBottom: 3, fontWeight: 700 }}>Prompt AI (Auto-Visual Analysis)</span>
                          <textarea
                            rows={3}
                            placeholder="Prompt generative AI otomatis terisi setelah analisis foto..."
                            value={magnificPrompts[images[i]?.id ?? ""] ?? result.prompt ?? ""}
                            onChange={(e) => {
                              const id = images[i]?.id ?? "";
                              setMagnificPrompts(prev => ({ ...prev, [id]: e.target.value }));
                            }}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              fontSize: 11.5,
                              background: "rgba(248, 250, 252, 0.95)",
                              border: "1px solid rgba(147, 197, 253, 0.6)",
                              borderRadius: 8,
                              color: "#0f172a",
                              fontWeight: 600,
                              resize: "vertical"
                            }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: 10.5, color: "#1e40af", display: "block", marginBottom: 3, fontWeight: 700 }}>Model AI</span>
                          <select
                            value={magnificModels[images[i]?.id ?? ""] ?? result.model ?? globalMagnificModel}
                            onChange={(e) => {
                              const id = images[i]?.id ?? "";
                              setMagnificModels(prev => ({ ...prev, [id]: e.target.value }));
                            }}
                            style={{ width: "100%", background: "rgba(248, 250, 252, 0.95)", border: "1px solid rgba(147, 197, 253, 0.6)", borderRadius: 8, color: "#0f172a", fontSize: 11.5, padding: 8, fontWeight: 700, outline: "none" }}
                          >
                            <option value="Midjourney 6">Midjourney 6</option>
                            <option value="Flux">Flux</option>
                            <option value="Stable Diffusion XL">Stable Diffusion XL</option>
                            <option value="Midjourney 5">Midjourney 5</option>
                            <option value="DALL-E 3">DALL-E 3</option>
                            <option value="Adobe Firefly">Adobe Firefly</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", color: "#64748b", fontSize: 11.5, textAlign: "center", gap: 6, padding: "16px 0" }}>
                        <ShieldCheck size={32} color="#2563eb" />
                        <span style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>Adobe Stock Ready</span>
                        <span style={{ fontSize: 10.5, maxWidth: 180, lineHeight: 1.4 }}>Title &amp; 49 Keywords terstruktur otomatis sesuai panduan resmi kontributor.</span>
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
