"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_IMAGES, compressImage, extractImageHints, extractVideoFrame } from "@/lib/utils";
import type { MetadataResult } from "@/app/api/generate/route";
import { addUsage, isTokenLimitReached, openPremiumModal, isUserAdminOrPremium } from "@/lib/tokenStore";
import { showToast } from "@/components/Toast";
import {
  UploadCloud, Tag, Sparkles, Download, Trash2, Plus, X,
  CheckCircle2, AlertCircle, Layers, Settings2, ShieldCheck,
  Film, Image as ImageIcon, Copy, Check, Info, FileSpreadsheet,
  RotateCw
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
  userEmail?: string;
  userRole?: string;
  isUnlimited?: boolean;
}

const CATEGORIES_LIST = [
  "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks",
  "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical",
  "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor",
  "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology",
  "Transportation", "Vectors", "Vintage"
];

export default function ImageUploader({ onTokensUpdated, userEmail, userRole, isUnlimited }: Props = {}) {
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
  const [globalMagnificModel, setGlobalMagnificModel] = useState("Adobe Firefly");
  const [copiedPromptIdx, setCopiedPromptIdx] = useState<number | null>(null);
  // Speed Boost AI Mode: 3 continuous workers, individual vision forensic analysis, zero lag
  const [autoSpeedMode, setAutoSpeedMode] = useState(true);
  // Auto-Restart Failed Photos Mode: otomatis mencoba ulang foto yang gagal
  const [autoRestartFailed, setAutoRestartFailed] = useState(true);
  const [retryingIndices, setRetryingIndices] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>("");
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const staleCountRef = useRef<number>(0);
  // Use a ref to hold retryAllFailed so pollJobProgress doesn't capture a stale closure
  const retryAllFailedRef = useRef<() => Promise<void>>(async () => {});

  const cancelActiveJob = async () => {
    const activeJobId = localStorage.getItem("active_metadata_job_id");
    if (!activeJobId) return;
    // Remove from localStorage first — the generate loop checks this each iteration
    localStorage.removeItem("active_metadata_job_id");
    try {
      await fetch(`/api/metadata/job?id=${activeJobId}`, { method: "DELETE" });
    } catch {}
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    pollingIntervalRef.current = null;
    pollingTimeoutRef.current = null;
    setLoading(false);
    setProgress("❌ Job dibatalkan.");
    lastProgressRef.current = -1;
    staleCountRef.current = 0;
  };

  const pollJobProgress = useCallback((jobId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    lastProgressRef.current = -1;
    staleCountRef.current = 0;

    // Hard timeout: stop polling after 10 minutes to prevent infinite stuck state
    pollingTimeoutRef.current = setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setLoading(false);
      setProgress("⚠️ Waktu habis. Job mungkin masih berjalan di server. Coba refresh halaman.");
      localStorage.removeItem("active_metadata_job_id");
    }, 10 * 60 * 1000);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/metadata/job?id=${jobId}`);
        if (!res.ok) return; // skip on network error, will retry next tick
        const data = await res.json();
        if (data.success && data.job) {
          const job = data.job;
          if (Array.isArray(job.results) && job.results.length > 0) {
            setResults(job.results);
          }
          setProgress(`⚡ Background AI: Memproses ${job.progress}/${job.total} file (${Math.round((job.progress / (job.total || 1)) * 100)}%)...`);

          // Stale detection: if progress hasn't moved in 20 consecutive polls (50s), force stop
          if (job.progress === lastProgressRef.current) {
            staleCountRef.current += 1;
            if (staleCountRef.current >= 20) {
              console.warn(`[pollJobProgress] Job ${jobId} stale for 50s, force-stopping polling`);
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
              pollingIntervalRef.current = null;
              pollingTimeoutRef.current = null;
              setLoading(false);
              // If we have partial results, show them
              if (Array.isArray(job.results) && job.results.length > 0) {
                setProgress(`⚠️ Progress terhenti. Menampilkan ${job.results.length} hasil yang ada.`);
                localStorage.removeItem("active_metadata_job_id");
              } else {
                setProgress("⚠️ Job tidak merespons. Silakan coba ulang.");
                localStorage.removeItem("active_metadata_job_id");
              }
              return;
            }
          } else {
            lastProgressRef.current = job.progress;
            staleCountRef.current = 0;
          }

          const isDone = job.status === "completed" || job.status === "failed" || job.progress >= job.total;
          if (isDone) {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
            pollingIntervalRef.current = null;
            pollingTimeoutRef.current = null;
            setLoading(false);
            lastProgressRef.current = -1;
            staleCountRef.current = 0;

            const hasFailed = Array.isArray(job.results) && job.results.some((r: any) => r && (r.error || !r.title));
            if (hasFailed && autoRestartFailed) {
              const failedCount = job.results.filter((r: any) => r && (r.error || !r.title)).length;
              setProgress(`🔄 Auto-Restart aktif: Memulihkan ${failedCount} foto yang gagal...`);
              showToast({
                type: "info",
                title: "Auto-Restart Berjalan",
                message: `Mendeteksi ${failedCount} foto belum lengkap. Sistem otomatis me-restart proses...`,
              });
              setTimeout(() => {
                void retryAllFailedRef.current();
              }, 1200);
            } else {
              setProgress(`✅ Selesai! ${job.results.length}/${job.total} file berhasil diproses di background server.`);
              localStorage.removeItem("active_metadata_job_id");
              showToast({
                type: "success",
                title: "Selesai!",
                message: `${job.results.length} foto selesai diproses di background server.`,
              });
            }
          }
        }
      } catch (err) {
        console.error("pollJobProgress error:", err);
      }
    }, 2500);
  }, [autoRestartFailed]);

  // Clear orphaned job ONLY on initial mount (never during active processing)
  useEffect(() => {
    try {
      localStorage.removeItem("active_metadata_job_id");
    } catch {}
  }, []);

  // Warn user before accidental tab close or page reload while generating
  useEffect(() => {
    if (!loading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Proses metadata AI sedang berjalan. Jika Anda me-refresh atau menutup tab, proses akan terhenti.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, [loading]);

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

      const maxLimit = platform === "magnific" ? 180 : 100;
      const remaining = maxLimit - images.length;
      if (remaining <= 0) {
        setError(`Maksimal ${maxLimit} file untuk ${platform === "magnific" ? "Magnific" : "platform ini"}`);
        return;
      }

      const toAdd = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        setError(`Hanya ${remaining} file lagi yang bisa ditambahkan (maks ${maxLimit})`);
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

      setImages((prev) => {
        const next = [...prev, ...newImages];
        if (platform === "magnific" && next.length > 20) {
          setAutoSpeedMode(true);
        }
        return next;
      });
      setResults([]);
    },
    [images.length, platform]
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
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    pollingIntervalRef.current = null;
    pollingTimeoutRef.current = null;
    lastProgressRef.current = -1;
    staleCountRef.current = 0;
    setImages([]);
    setResults([]);
    setError("");
    setProgress("");
    setLoading(false);
    try {
      localStorage.removeItem("active_metadata_job_id");
    } catch {}
  };


  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Generate a tiny compressed thumbnail (max 120px, ~5-8KB base64) using canvas */
  const generateThumbnail = (dataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      try {
        const img = new window.Image();
        img.onload = () => {
          const MAX = 120;
          const scale = Math.min(MAX / img.width, MAX / img.height, 1);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.6));
          } else {
            resolve(dataUrl.slice(0, 300));
          }
        };
        img.onerror = () => resolve(dataUrl.slice(0, 300));
        img.src = dataUrl;
      } catch {
        resolve(dataUrl.slice(0, 300));
      }
    });

  // Helper to detect rate-limit error result
  const response_was_ratelimit = (r: MetadataResult | null) =>
    r?.error?.includes("429") || r?.error?.includes("rate limit") || r?.error?.includes("Rate limit");

  // Helper: process a single image at index i safely
  const processSingleImage = async (i: number): Promise<MetadataResult> => {
    const img = images[i];
    if (!img) return { filename: "", title: "", keywords: [], error: "Foto tidak ditemukan", stabilized: true };

    const existingPrompt = magnificPrompts[img.id] || "";
    const visualHintsToSend = [
      img.visualHints,
      img.customHints ? `User hints: ${img.customHints}` : "",
      existingPrompt ? `Existing prompt to optimize: ${existingPrompt}` : ""
    ].filter(Boolean).join(" | ");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [{
            filename: img.file.name,
            dataUrl: img.preview,
            visualHints: visualHintsToSend,
            existingPrompt: existingPrompt || undefined
          }],
          sessionId: sessionIdRef.current,
          stabilized: true,
          platform,
          complianceGuard,
        }),
      });

      // Safe JSON parsing: prevents SyntaxError: Unexpected token 'A' if server returns HTML/text error
      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        const cleanSnippet = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        data = {
          error: response.status === 504
            ? "Server timeout (504). Server Groq sedang padat."
            : response.status === 413
            ? "Ukuran foto terlalu besar (413)."
            : `Server error (${response.status}): ${cleanSnippet || "Respons tidak valid"}`,
        };
      }

      if (data.totalUsage) {
        addUsage(data.totalUsage.promptTokens, data.totalUsage.completionTokens, "metadata");
        onTokensUpdated?.();
      }

      if (!response.ok || data.error) {
        return {
          filename: img.file.name,
          title: "",
          keywords: [],
          error: data.error || `Gagal dengan status ${response.status}`,
          stabilized: true,
        };
      } else {
        const newResults = (data.results as MetadataResult[]) || [];
        const rawResult = newResults[0];
        if (rawResult) {
          rawResult.title = (rawResult.title || "").replace(/^['"`\s]+|['"`\s]+$/g, "");
          rawResult.keywords = (rawResult.keywords || []).map((k) => k.replace(/['"`]/g, "").trim()).filter(Boolean);
        }
        const r = rawResult;
        if (r?.prompt) setMagnificPrompts((prev) => ({ ...prev, [img.id]: r.prompt! }));
        if (r?.model) setMagnificModels((prev) => ({ ...prev, [img.id]: r.model! }));
        else setMagnificModels((prev) => ({ ...prev, [img.id]: prev[img.id] || globalMagnificModel }));
        return r ?? { filename: img.file.name, title: "", keywords: [], error: "Respons kosong", stabilized: true };
      }
    } catch (loopError) {
      return {
        filename: img.file.name,
        title: "",
        keywords: [],
        error: loopError instanceof Error ? loopError.message : "Koneksi terputus",
        stabilized: true,
      };
    }
  };

  // Coba ulang 1 foto yang gagal
  const retryOne = async (index: number) => {
    if (loading || retryingIndices.has(index)) return;
    const img = images[index];
    if (!img) return;

    setRetryingIndices((prev) => new Set(prev).add(index));

    try {
      const res = await processSingleImage(index);
      setResults((prev) => {
        const next = [...prev];
        next[index] = res;
        return next;
      });

      if (res.error) {
        showToast({
          type: "error",
          title: "Coba Ulang Gagal",
          message: res.error,
        });
      } else {
        showToast({
          type: "success",
          title: "Berhasil!",
          message: `Metadata untuk ${img.file.name} berhasil dibuat.`,
        });
      }
    } catch (err: any) {
      setResults((prev) => {
        const next = [...prev];
        next[index] = {
          filename: img.file.name,
          title: "",
          keywords: [],
          error: err?.message || "Gagal mencoba ulang",
          stabilized: true,
        };
        return next;
      });
    } finally {
      setRetryingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  // Coba ulang SEMUA foto yang berstatus error
  const retryAllFailed = async () => {
    if (loading || retryingIndices.size > 0) return;
    const failedIndices = results
      .map((r, i) => (r && r.error ? i : -1))
      .filter((i) => i !== -1);

    if (failedIndices.length === 0) return;

    showToast({
      type: "info",
      title: "Mencoba Ulang Foto Gagal",
      message: `Memproses ulang ${failedIndices.length} foto yang gagal...`,
    });

    for (const idx of failedIndices) {
      await retryOne(idx);
      await sleep(300);
    }
  };

  // Keep ref in sync so pollJobProgress always calls the latest version
  retryAllFailedRef.current = retryAllFailed;

  const generate = async () => {
    if (images.length === 0) return;

    // Developer / Admin / Premium users have infinite tokens and should never be blocked
    const hasUnlimited =
      isUnlimited ||
      userEmail === "nixxeltzy@gmail.com" ||
      userRole === "admin" ||
      userRole === "premium" ||
      isUserAdminOrPremium(userRole, userEmail);

    if (!hasUnlimited && isTokenLimitReached(userRole, userEmail)) {
      showToast({
        type: "warning",
        title: "Batas Token 200k Tercapai",
        message: "Kuota token harian 200k Anda telah habis. Dapatkan akses unlimited dengan Paket Premium!",
      });
      openPremiumModal();
      return;
    }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem("active_metadata_job_id", jobId);
    sessionIdRef.current = jobId;

    setLoading(true);
    setError("");
    setResults([]);

    // Generate thumbnails for all images upfront (done client-side via canvas)
    setProgress(`Menyiapkan ${images.length} file...`);
    const queueImages = await Promise.all(images.map(async (img) => ({
      filename: img.file.name,
      dataUrl: img.preview,
      thumbnailUrl: await generateThumbnail(img.preview),
      visualHints: [
        img.visualHints,
        img.customHints ? `User hints: ${img.customHints}` : "",
        magnificPrompts[img.id] ? `Existing prompt: ${magnificPrompts[img.id]}` : ""
      ].filter(Boolean).join(" | "),
      existingPrompt: magnificPrompts[img.id] || undefined,
    })));

    try {
      // ── STEP 1: Init job slot in Redis ────────────────────────────────
      setProgress(`Mendaftarkan ${images.length} file ke server...`);
      const initRes = await fetch("/api/metadata/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "init",
          jobId,
          images: queueImages.map((img) => ({ filename: img.filename })),
          platform,
          complianceGuard,
        }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || `Gagal mendaftarkan antrian (${initRes.status})`);
      }

      setProgress(`⚡ AI Memproses 0/${images.length} file (0%)...`);

      // ── STEP 2: Process each image sequentially (1 per API call) ──────
      // Each call fits within Vercel 60s limit and updates history immediately.
      const localResults: MetadataResult[] = new Array(images.length).fill(null);

      for (let i = 0; i < queueImages.length; i++) {
        // Check if user cancelled
        const activeId = localStorage.getItem("active_metadata_job_id");
        if (!activeId || activeId !== jobId) break;

        const currentPct = Math.round((i / images.length) * 100);
        setProgress(`⚡ AI Memproses ${i + 1}/${images.length} file (${currentPct}%)...`);

        let processResult: MetadataResult | null = null;
        let lastErrorMsg = "";

        // Retry up to 3 attempts with exponential backoff on 429/504
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const processRes = await fetch("/api/metadata/queue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "process",
                jobId,
                image: queueImages[i],
                imageIndex: i,
                platform,
                complianceGuard,
              }),
            });

            if (processRes.ok) {
              const processData = await processRes.json();
              if (processData.result) {
                processResult = processData.result as MetadataResult;
                break;
              }
            } else {
              const errData = await processRes.json().catch(() => ({}));
              lastErrorMsg = errData.error || `Server status ${processRes.status}`;
              if (attempt < 3 && (processRes.status === 429 || processRes.status >= 500)) {
                setProgress(`⏳ Menunggu antrian AI untuk foto ${i + 1}/${images.length} (retrying ${attempt}/2)...`);
                await new Promise((r) => setTimeout(r, 2000 * attempt));
              }
            }
          } catch (netErr) {
            lastErrorMsg = netErr instanceof Error ? netErr.message : "Network error";
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        }

        if (processResult) {
          localResults[i] = processResult;
        } else {
          localResults[i] = {
            filename: queueImages[i]!.filename,
            title: "",
            keywords: [],
            error: lastErrorMsg || "Gagal memproses gambar",
          } as MetadataResult;
        }

        // Update results incrementally so user sees progress immediately
        setResults([...localResults].filter(Boolean) as MetadataResult[]);

        // Small pause between images to avoid Groq rate limits
        if (i < queueImages.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      // ── STEP 3: Done ──────────────────────────────────────────────────
      const finalResults = localResults.filter(Boolean) as MetadataResult[];
      setResults(finalResults);
      setLoading(false);
      localStorage.removeItem("active_metadata_job_id");

      const failedCount = finalResults.filter((r) => r.error || !r.title).length;
      const successCount = finalResults.length - failedCount;

      setProgress(`✅ Selesai! ${successCount}/${images.length} file berhasil diproses.`);
      showToast({
        type: successCount === images.length ? "success" : "warning",
        title: "Selesai!",
        message: `${successCount} foto selesai${failedCount > 0 ? `, ${failedCount} gagal` : ""}.`,
      });

    } catch (err) {
      console.error("Generate queue error:", err);
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memulai antrian");
      setLoading(false);
      localStorage.removeItem("active_metadata_job_id");
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
    const cleanTitle = (r.title || "").replace(/^['"`\s]+|['"`\s]+$/g, "");
    const cleanKeywords = (r.keywords || []).map((k) => k.replace(/['"`]/g, "").trim()).filter(Boolean);
    const text = `Title: ${cleanTitle}\nKeywords: ${cleanKeywords.join(", ")}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const copyPrompt = (idx: number) => {
    const r = results[idx];
    const imgId = images[idx]?.id ?? "";
    const rawPrompt = magnificPrompts[imgId] || r?.prompt || "";
    const promptVal = rawPrompt.replace(/^['"`\s]+|['"`\s]+$/g, "").trim();
    if (!promptVal) {
      showToast({
        type: "info",
        title: "Prompt Belum Tersedia",
        message: "Prompt AI belum digenerate atau masih kosong.",
      });
      return;
    }
    navigator.clipboard.writeText(promptVal);
    setCopiedPromptIdx(idx);
    showToast({
      type: "success",
      title: "Prompt AI Tersalin!",
      message: "Prompt berhasil disalin ke clipboard.",
    });
    setTimeout(() => setCopiedPromptIdx(null), 2000);
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
        const cleanTitle = (r?.title || "").replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/[\r\n]+/g, " ");
        const description = cleanTitle ? `"${cleanTitle.replace(/"/g, '""')}"` : `""`;

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const cleanKeywords = keywordsArr.map((k) => k.replace(/['"`]/g, "").trim()).filter(Boolean);
        const keywords = `"${cleanKeywords.join(',').replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

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

        const escMagnific = (v: string) => {
          const clean = (v || "").replace(/[\r\n]+/g, " ").trim();
          return `"${clean.replace(/"/g, '""')}"`;
        };

        const filename = escMagnific(rawFilename);
        const cleanTitle = (r?.title || "").replace(/^['"`\s]+|['"`\s]+$/g, "");
        const title = escMagnific(cleanTitle);

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const cleanKeywords = keywordsArr
          .map((k) => k.replace(/['"`]/g, "").trim())
          .filter(Boolean);
        const keywords = escMagnific(cleanKeywords.join(','));

        const promptVal = (magnificPrompts[imgId] || r?.prompt || "").replace(/^['"`\s]+|['"`\s]+$/g, "");
        const modelVal = magnificModels[imgId] || r?.model || globalMagnificModel;

        const prompt = escMagnific(promptVal);
        const model = escMagnific(modelVal);

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
        const cleanTitle = (r?.title || "").replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/[\r\n]+/g, " ");
        const title = cleanTitle ? `"${cleanTitle.replace(/"/g, '""')}"` : `""`;

        const keywordsArr = Array.isArray(r?.keywords) ? r!.keywords : [];
        const cleanKeywords = keywordsArr.map((k) => k.replace(/['"`]/g, "").trim()).filter(Boolean);
        const keywords = `"${cleanKeywords.join(', ').replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

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
    <div className="uploader-root">
      <style>{`
        .uploader-root {
          max-width: 100%;
          margin: 0;
          padding: 24px 20px 60px;
          font-family: var(--font);
        }
        .uploader-platform-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .uploader-platform-btn {
          padding: 16px 18px;
          border-radius: 16px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.18s ease;
          text-align: left;
        }
        .uploader-dropzone {
          border-radius: 20px;
          padding: 44px 24px;
          text-align: center;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.06);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          margin-bottom: 24px;
          position: relative;
        }
        .uploader-result-card {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(147, 197, 253, 0.5);
          border-radius: 18px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 6px 24px rgba(59, 130, 246, 0.07);
          position: relative;
        }
        .uploader-right-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-left: 14px;
          border-left: 1px solid rgba(147, 197, 253, 0.4);
        }

        @media (max-width: 640px) {
          .uploader-root { padding: 14px 10px 50px !important; }
          .uploader-platform-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
          .uploader-platform-btn { padding: 12px 14px !important; }
          .uploader-dropzone { padding: 26px 14px !important; border-radius: 16px !important; }
          .uploader-result-card {
            grid-template-columns: 1fr !important;
            padding: 14px 12px !important;
            border-radius: 16px !important;
            gap: 14px !important;
          }
          .uploader-right-col {
            border-left: none !important;
            border-top: 1px solid rgba(147, 197, 253, 0.4) !important;
            padding-left: 0 !important;
            padding-top: 14px !important;
          }
          .uploader-export-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .uploader-export-bar > * {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
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
        <div className="uploader-platform-grid">
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
            onClick={() => {
              setPlatform("magnific");
              setResults([]);
              if (images.length > 20) {
                setAutoSpeedMode(true);
              }
            }}
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
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, fontWeight: 600 }}>49 Keywords + Auto Prompt (Max 180 Foto)</div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                <option value="Adobe Firefly">Adobe Firefly (Default)</option>
                <option value="Midjourney 6">Midjourney 6</option>
                <option value="Flux">Flux</option>
                <option value="Stable Diffusion XL">Stable Diffusion XL</option>
                <option value="Midjourney 5">Midjourney 5</option>
                <option value="DALL-E 3">DALL-E 3</option>
              </select>
            </div>
          </div>
        )}

        {/* Speed Boost Multi-Worker AI Panel (Semua Platform) */}
        <div style={{
          marginTop: 12,
          padding: "12px 18px",
          background: autoSpeedMode ? "rgba(220, 252, 231, 0.8)" : "rgba(241, 245, 249, 0.8)",
          border: autoSpeedMode ? "1px solid rgba(134, 239, 172, 0.85)" : "1px solid rgba(203, 213, 225, 0.7)",
          borderRadius: 14,
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
            <input
              type="checkbox"
              checked={autoSpeedMode}
              onChange={(e) => setAutoSpeedMode(e.target.checked)}
              disabled={loading}
              style={{ marginTop: 3, accentColor: "#16a34a", width: 16, height: 16 }}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                  ⚡ Speed Boost Multi-Worker AI (Aktif Otomatis)
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#15803d", background: "rgba(220,252,231,0.95)", padding: "1px 7px", borderRadius: 999, border: "1px solid rgba(134,239,172,0.8)" }}>
                  3x Lebih Cepat
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontWeight: 500, lineHeight: 1.5 }}>
                Memproses foto secara paralel dengan continuous dynamic queue. Setiap foto tetap dianalisis visual secara individual sehingga <strong>akurasi 100% presisi dan tajam</strong> tanpa menunggu lama.
              </div>
            </div>
          </label>
          <div style={{ fontSize: 11.5, color: autoSpeedMode ? "#15803d" : "#64748b", fontWeight: 800, whiteSpace: "nowrap" }}>
            {autoSpeedMode ? "⚡ 3 Worker Aktif" : "Sekuensial (1-by-1)"}
          </div>
        </div>

        {/* Auto-Restart Foto Gagal (Self-Healing Mode) */}
        <div style={{
          marginTop: 10,
          padding: "12px 18px",
          background: autoRestartFailed ? "rgba(238, 242, 255, 0.85)" : "rgba(241, 245, 249, 0.8)",
          border: autoRestartFailed ? "1px solid rgba(199, 210, 254, 0.9)" : "1px solid rgba(203, 213, 225, 0.7)",
          borderRadius: 14,
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
            <input
              type="checkbox"
              checked={autoRestartFailed}
              onChange={(e) => setAutoRestartFailed(e.target.checked)}
              disabled={loading}
              style={{ marginTop: 3, accentColor: "#4f46e5", width: 16, height: 16 }}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                  🔄 Auto-Restart Foto Gagal (Self-Healing Recovery)
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#4338ca", background: "rgba(224,231,255,0.95)", padding: "1px 7px", borderRadius: 999, border: "1px solid rgba(199,210,254,0.8)" }}>
                  Auto-Retry Aktif
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontWeight: 500, lineHeight: 1.5 }}>
                Jika ada foto yang gagal akibat lonjakan rate limit atau kendala jaringan, sistem secara otomatis me-restart proses foto tersebut hingga berhasil 100% tanpa perlu klik manual.
              </div>
            </div>
          </label>
          <div style={{ fontSize: 11.5, color: autoRestartFailed ? "#4338ca" : "#64748b", fontWeight: 800, whiteSpace: "nowrap" }}>
            {autoRestartFailed ? "🔄 Pemulihan Otomatis" : "Nonaktif"}
          </div>
        </div>
      </div>

      {/* ── Dropzone Area ── */}
      <section
        className={`uploader-dropzone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: dragOver ? "2px dashed #2563eb" : "2px dashed rgba(147, 197, 253, 0.75)",
          background: dragOver ? "rgba(219, 234, 254, 0.8)" : "rgba(255, 255, 255, 0.7)",
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
          <span>Maksimal {platform === "magnific" ? 180 : 100} file sekaligus</span>
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
                {images.length}/{platform === "magnific" ? 180 : 100}
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
          <span style={{ flex: 1 }}>{progress}</span>
          {loading && (
            <button
              type="button"
              onClick={() => void cancelActiveJob()}
              style={{
                marginLeft: "auto",
                padding: "5px 14px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 8,
                color: "#dc2626",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ✕ Batalkan
            </button>
          )}
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

            <div className="uploader-export-bar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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

          {/* Banner Peringatan Jika Ada Foto yang Gagal */}
          {results.some((r) => r?.error) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                padding: "14px 20px",
                background: "rgba(254, 242, 242, 0.95)",
                border: "1px solid rgba(248, 113, 113, 0.7)",
                borderRadius: 14,
                marginBottom: 20,
                boxShadow: "0 4px 14px rgba(239, 68, 68, 0.08)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertCircle size={20} color="#dc2626" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#991b1b" }}>
                    Terdapat {results.filter((r) => r?.error).length} foto yang gagal diproses
                  </div>
                  <div style={{ fontSize: 11.5, color: "#b91c1c", fontWeight: 500, marginTop: 2 }}>
                    Server timeout atau Groq sedang padat. Klik tombol di kanan untuk memproses ulang foto yang gagal saja tanpa mengulang foto yang sudah berhasil.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={retryAllFailed}
                disabled={loading || retryingIndices.size > 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: (loading || retryingIndices.size > 0) ? "rgba(239, 68, 68, 0.4)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: (loading || retryingIndices.size > 0) ? "not-allowed" : "pointer",
                  boxShadow: (loading || retryingIndices.size > 0) ? "none" : "0 4px 14px rgba(220, 38, 38, 0.3)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap"
                }}
              >
                <RotateCw size={15} style={{ animation: retryingIndices.size > 0 ? "spin 0.8s linear infinite" : "none" }} />
                <span>
                  {retryingIndices.size > 0
                    ? `Mencoba Ulang (${retryingIndices.size})...`
                    : `Coba Ulang Semua yang Gagal (${results.filter((r) => r?.error).length})`}
                </span>
              </button>
            </div>
          )}

          {/* Result Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {results.map((result, i) => {
              if (result.error) {
                const isRetrying = retryingIndices.has(i);
                return (
                  <div
                    key={`${result.filename}-${i}`}
                    style={{
                      display: "flex",
                      gap: 16,
                      padding: "16px 20px",
                      background: "rgba(254, 226, 226, 0.8)",
                      border: "1px solid rgba(252, 165, 165, 0.85)",
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      boxShadow: "0 2px 10px rgba(239, 68, 68, 0.07)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 220, flex: 1 }}>
                      <img src={images[i]?.preview} alt={result.filename} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(252,165,165,0.7)" }} />
                      <div>
                        <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-all", fontWeight: 700 }}>{result.filename}</div>
                        <div style={{ color: "#dc2626", fontSize: 13.5, fontWeight: 800, marginTop: 4 }}>
                          ❌ {result.error}
                        </div>
                      </div>
                    </div>

                    {/* Tombol Coba Ulang Foto Ini */}
                    <button
                      type="button"
                      onClick={() => retryOne(i)}
                      disabled={isRetrying || loading}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "9px 18px",
                        borderRadius: 10,
                        border: "1px solid rgba(220, 38, 38, 0.3)",
                        background: isRetrying ? "rgba(239, 68, 68, 0.15)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                        color: isRetrying ? "#dc2626" : "#ffffff",
                        fontSize: 12.5,
                        fontWeight: 800,
                        cursor: isRetrying || loading ? "not-allowed" : "pointer",
                        boxShadow: isRetrying ? "none" : "0 3px 12px rgba(220, 38, 38, 0.25)",
                        transition: "all 0.15s ease",
                        whiteSpace: "nowrap"
                      }}
                    >
                      <RotateCw size={14} style={{ animation: isRetrying ? "spin 0.8s linear infinite" : "none" }} />
                      <span>{isRetrying ? "Mencoba Ulang..." : "Coba Ulang Foto Ini"}</span>
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={`${result.filename}-${i}`}
                  className="uploader-result-card"
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
                      <textarea
                        rows={2}
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
                          outline: "none",
                          resize: "vertical",
                          lineHeight: 1.4,
                          fontFamily: "inherit"
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
                  <div className="uploader-right-col">
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
                        <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700 }}>Mature</div>
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

                        {/* ── IP / Copyright Warning Banner ── */}
                        {(result as any).ipDetected && (
                          <div style={{
                            marginTop: 8,
                            padding: "8px 10px",
                            background: "rgba(254, 243, 199, 0.95)",
                            border: "1px solid rgba(251, 191, 36, 0.7)",
                            borderRadius: 8,
                            display: "flex",
                            gap: 6,
                            alignItems: "flex-start",
                          }}>
                            <span style={{ fontSize: 14 }}>⚠️</span>
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#92400e", marginBottom: 2 }}>
                                IP / HAK CIPTA TERDETEKSI — Editorial: Yes
                              </div>
                              <div style={{ fontSize: 10, color: "#78350f", lineHeight: 1.4 }}>
                                {(result as any).ipWarning || "Foto ini mengandung orang terkenal, logo brand, atau karya berhak cipta. Otomatis ditandai Editorial."}
                              </div>
                            </div>
                          </div>
                        )}

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
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 10.5, color: "#1e40af", fontWeight: 700 }}>Prompt AI (Auto-Visual Analysis)</span>
                            <button
                              type="button"
                              onClick={() => copyPrompt(i)}
                              title="Salin prompt AI"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 8px",
                                borderRadius: 6,
                                border: copiedPromptIdx === i ? "1px solid rgba(134, 239, 172, 0.8)" : "1px solid rgba(147, 197, 253, 0.7)",
                                background: copiedPromptIdx === i ? "rgba(220, 252, 231, 0.9)" : "rgba(219, 234, 254, 0.8)",
                                color: copiedPromptIdx === i ? "#15803d" : "#1e40af",
                                fontSize: 10.5,
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.15s ease"
                              }}
                            >
                              {copiedPromptIdx === i ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copiedPromptIdx === i ? "Tersalin!" : "Salin Prompt"}</span>
                            </button>
                          </div>
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
                            <option value="Adobe Firefly">Adobe Firefly (Default)</option>
                            <option value="Midjourney 6">Midjourney 6</option>
                            <option value="Flux">Flux</option>
                            <option value="Stable Diffusion XL">Stable Diffusion XL</option>
                            <option value="Midjourney 5">Midjourney 5</option>
                            <option value="DALL-E 3">DALL-E 3</option>
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
