"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { addUsage, formatTokens, estimateCost, getPlatformLabel, getUsage, type Platform } from "@/lib/tokenStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type VectorStyle   = "flat" | "outline" | "both";
type AspectRatio   = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
type Complexity    = "simple" | "medium" | "complex";
type PanelTab      = "generate" | "magic" | "analytics";
type ResolutionOpt = "1k" | "2k" | "3k" | "4k" | "svg";

interface MagicIdea {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tags: string[];
  estimatedSales: string;
  difficulty: "Easy" | "Medium" | "Complex";
}

interface GeneratedPrompt {
  id: string;
  label: string;
  prompt: string;
  negativePrompt: string;
  metadata: { title: string; keywords: string[] };
  technicalSpec: { ratio: string; complexity: string; colorCount: number };
}

interface GeneratedPlan {
  plan: {
    conceptTitle: string;
    commercialHook: string;
    styleGuide: { palette: string; strokeWeight: string; typography: string; composition: string; };
  };
  prompts: GeneratedPrompt[];
  setTips: string[];
  complianceNotes: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string; w: number; h: number }[] = [
  { value: "1:1",  label: "Square",    icon: "⬛", w: 800,  h: 800  },
  { value: "16:9", label: "Landscape", icon: "▬",  w: 1200, h: 675  },
  { value: "9:16", label: "Portrait",  icon: "▮",  w: 675,  h: 1200 },
  { value: "4:3",  label: "Standard",  icon: "🟫", w: 800,  h: 600  },
  { value: "3:4",  label: "Tall",      icon: "📱", w: 600,  h: 800  },
  { value: "21:9", label: "Ultrawide", icon: "🎬", w: 1400, h: 600  },
];

const STYLE_OPTIONS: { value: VectorStyle; label: string; desc: string; icon: string }[] = [
  { value: "flat",    label: "Flat Vector",      icon: "🟦", desc: "Clean shapes, solid fills, minimal depth, modern commercial look" },
  { value: "outline", label: "Outline / Line Art", icon: "✏️", desc: "Elegant stroke-based, transparent fills, premium editorial style" },
  { value: "both",    label: "Flat + Outline",   icon: "🎨", desc: "Hybrid fills with prominent strokes, rich detail, versatile use" },
];

const PALETTE_PRESETS = [
  "Professional Blue & Clean White",
  "Warm Earth Tones & Terracotta",
  "Soft Pastel Gradient (Lavender-Mint)",
  "Monochrome Dark with Accent",
  "Vibrant Tropical Neon Palette",
  "Corporate Gray, Teal & Navy",
  "Soft Mint, Coral & Peach",
  "Bold Primary Colors (Red-Blue-Yellow)",
  "Sunset Orange & Deep Purple",
  "Forest Green & Natural Brown",
  "Cyberpunk Neon (Purple-Cyan-Pink)",
  "Retro 70s (Burnt Orange & Avocado)",
];

const TARGET_USE_OPTIONS = [
  "Adobe Stock commercial illustration (max revenue)",
  "Website hero & landing page illustration",
  "Icon set / UI component kit",
  "Infographic & data visualization elements",
  "Social media content & story template",
  "App onboarding & empty-state screens",
  "Business pitch deck & presentation",
  "Packaging design & label artwork",
  "NFT & digital collectible artwork",
  "Educational e-book & course material",
];

const ART_THEMES = [
  { value: "vector", label: "Vector" },
  { value: "illustrator", label: "Illustrator" },
  { value: "photography", label: "Photography" },
  { value: "watercolor", label: "Watercolor" },
  { value: "3d_render", label: "3D Render" },
  { value: "pixel_art", label: "Pixel Art" },
  { value: "sketch", label: "Sketch" },
  { value: "anime", label: "Anime / Manga" },
  { value: "infographic", label: "Infographic" },
  { value: "icon_set", label: "Icon Set" },
];

const CONCEPT_CATEGORIES = [
  { value: "graphic", label: "Grafik & Abstrak" },
  { value: "business", label: "Bisnis & Keuangan" },
  { value: "scenery", label: "Pemandangan & Alam" },
  { value: "technology", label: "Teknologi & AI" },
  { value: "healthcare", label: "Kesehatan & Medis" },
  { value: "food", label: "Makanan & Kuliner" },
  { value: "travel", label: "Perjalanan & Wisata" },
  { value: "education", label: "Pendidikan" },
  { value: "sports", label: "Olahraga & Fitness" },
];

// ── Long and Highly Complex Static Ideas ──────────────────────────────────────
const STATIC_MAGIC_IDEAS: MagicIdea[] = [
  {
    id: "mi1",
    title: "Sistem Ekosistem Rumah Pintar Terintegrasi AI",
    description: "Sebuah ilustrasi konsep canggih yang menggambarkan interaksi manusia masa depan dengan ekosistem pintar di rumah mereka. Menampilkan UI holografik mengambang dengan visualisasi suhu ruangan, konsumsi energi, status keamanan real-time, dan kontrol pencahayaan otomatis. Sangat dicari oleh agensi desain editorial, pengembang aplikasi IoT, dan startup teknologi masa kini.",
    prompt: "A highly detailed flat vector illustration depicting a futuristic smart home automation system. A young developer is seen standing in the center of a modern minimalist living room, interacting with glowing semi-transparent holographic interface panels showing room temperature graphs, energy usage charts, home security map, and automated lighting controls. Deep corporate blue and neon white gradient color palette, clean isometric grid layout, elegant geometric shapes, isolated on a white background, premium commercial stock design.",
    tags: ["smart home", "technology", "vector", "business"],
    estimatedSales: "8,400+ downloads",
    difficulty: "Complex",
  },
  {
    id: "mi2",
    title: "Meditasi & Wellness Kesehatan Mental Kontemporer",
    description: "Karakter bergaya flat pastel lembut sedang mempraktikkan mindfulness dan yoga. Kategori terlaris top 5% dengan permintaan komersial yang konsisten sepanjang tahun untuk aplikasi kesehatan, editorial kesehatan mental, brosur spiritual, dan media sosial gaya hidup sehat.",
    prompt: "An elegant, clean flat vector illustration of a calm character sitting in a cross-legged lotus meditation pose, floating gently above a giant green monstera leaf. The background is filled with abstract organic pastel shapes, soft floating orbs, and botanical leaves in lavender, mint green, and coral. Minimal face detail, high visual peace, smooth gradients, ideal for modern meditation app onboarding screen.",
    tags: ["wellness", "meditation", "illustrator", "scenery"],
    estimatedSales: "12,200+ downloads",
    difficulty: "Easy",
  },
  {
    id: "mi3",
    title: "Peta Ekosistem Energi Hijau & Keberlanjutan",
    description: "Kombinasi panel surya, turbin angin, stasiun pengisian daya EV, dan grid listrik cerdas. Konten bertema ESG (Environmental, Social, Governance) mengalami lonjakan lisensi hingga 300% dari korporasi untuk laporan tahunan dan kampanye ramah lingkungan.",
    prompt: "Complex flat isometric vector illustration of a sustainable green energy landscape. Features wind turbines spinning on rolling green hills, a large solar panel farm tracking the sun, smart electrical grid towers, and a modern electric vehicle charging at a clean solar-powered station. Vibrant eco-friendly colors, clear blue sky, highly detailed elements, perfect for corporate sustainability reports.",
    tags: ["sustainability", "energy", "vector", "scenery"],
    estimatedSales: "9,600+ downloads",
    difficulty: "Complex",
  },
  {
    id: "mi4",
    title: "Gaya Hidup Bekerja Remote & Nomad Digital",
    description: "Bestseller abadi di kategori bisnis modern. Ilustrasi nomad digital bekerja di cafe pantai menghasilkan tingkat konversi lisensi 40% lebih tinggi dibanding fotografi studio biasa untuk landing page SaaS dan produk produktivitas.",
    prompt: "A modern professional flat vector illustration of a digital nomad working on a laptop at a rustic outdoor cafe table overlooking a sunny tropical beach. Surrounded by potted palm plants, a fresh coconut water drink on the table, and warm golden hour sunlight casting soft shadows. Relaxed work-from-anywhere lifestyle, vibrant warm orange and teal color scheme, clean vector lines.",
    tags: ["remote work", "business", "illustrator", "travel"],
    estimatedSales: "15,800+ downloads",
    difficulty: "Medium",
  },
];

// ── Main Component ────────────────────────────────────────────────────────────
interface VectorCreatorProps {
  onTokensUpdated?: () => void;
}

export default function VectorCreator({ onTokensUpdated }: VectorCreatorProps = {}) {
  const [panelTab, setPanelTab]   = useState<PanelTab>("generate");
  const [faceless, setFaceless]   = useState(false);
  const [consistency, setConsistency] = useState(true);
  const [style, setStyle]         = useState<VectorStyle>("both");
  const [ratio, setRatio]         = useState<AspectRatio>("1:1");
  const [colorPalette, setColorPalette] = useState(PALETTE_PRESETS[0]);
  const [complexity, setComplexity]     = useState<Complexity>("medium");
  const [targetUse, setTargetUse]       = useState(TARGET_USE_OPTIONS[0]);
  const [promptCount, setPromptCount]   = useState(4);
  const [customTheme, setCustomTheme]   = useState("");

  const [selectedArtThemes, setSelectedArtThemes] = useState<string[]>(["vector"]);
  const [selectedConcepts, setSelectedConcepts]   = useState<string[]>(["business"]);

  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [magicIdeas, setMagicIdeas]       = useState<MagicIdea[]>(STATIC_MAGIC_IDEAS);
  const [enhancedPrompt, setEnhancedPrompt] = useState<{ prompt: string; improvements: string[] } | null>(null);

  // Ideas tab extra state
  const [ideaCount, setIdeaCount]           = useState(6);
  const [ideaSortBy, setIdeaSortBy]         = useState<"default" | "sales" | "difficulty">("default");
  const [ideaFilterDiff, setIdeaFilterDiff] = useState<"All" | "Easy" | "Medium" | "Complex">("All");
  const [ideaSearchQuery, setIdeaSearchQuery] = useState("");

  const [beforeSvg, setBeforeSvg]       = useState("");
  const [afterSvg, setAfterSvg]         = useState("");
  const [svgTitle, setSvgTitle]         = useState("");
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  const [sliderPosition, setSliderPosition]   = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [downloadRes, setDownloadRes]   = useState<ResolutionOpt>("2k");
  const [detectedColors, setDetectedColors] = useState<string[]>([]);
  const [editableSvgCode, setEditableSvgCode] = useState("");
  const [showCodeInspector, setShowCodeInspector] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isMagicking, setIsMagicking]   = useState(false);
  const [isEnhancing, setIsEnhancing]   = useState(false);
  const [error, setError]               = useState("");
  const [copiedId, setCopiedId]         = useState("");
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);

  // ── Token tracking for vector platform ─────────────────────────────────────
  const [sessionTokens, setSessionTokens] = useState({ prompt: 0, completion: 0, total: 0, requests: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const trackVectorTokens = useCallback((usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined) => {
    if (!usage) return;
    addUsage(usage.promptTokens, usage.completionTokens, "vector");
    setSessionTokens(prev => ({
      prompt: prev.prompt + usage.promptTokens,
      completion: prev.completion + usage.completionTokens,
      total: prev.total + usage.totalTokens,
      requests: prev.requests + 1,
    }));
    onTokensUpdated?.();
  }, [onTokensUpdated]);

  // ── Toggle multi-select chips ──
  const toggleArtTheme = (val: string) => {
    setSelectedArtThemes(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const toggleConcept = (val: string) => {
    setSelectedConcepts(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  // ── Pointer drag for slider ──
  const handlePointerDown = () => setIsDraggingSlider(true);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!isDraggingSlider || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSliderPosition(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    };
    const onUp = () => setIsDraggingSlider(false);
    if (isDraggingSlider) { window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); }
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [isDraggingSlider]);

  // ── Extract colors from SVG ──
  useEffect(() => {
    if (!afterSvg) { setDetectedColors([]); return; }
    const matches = afterSvg.match(/#[0-9A-Fa-f]{3,8}\b/g);
    if (matches) setDetectedColors(Array.from(new Set(matches.map(c => c.toLowerCase()))).slice(0, 12));
  }, [afterSvg]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 2000);
    });
  };

  const handleColorReplace = (oldColor: string, newColor: string) => {
    const rx = new RegExp(oldColor, "gi");
    setAfterSvg(p => p.replace(rx, newColor));
    setBeforeSvg(p => p.replace(rx, newColor));
    setEditableSvgCode(p => p.replace(rx, newColor));
    setDetectedColors(p => p.map(c => c === oldColor ? newColor.toLowerCase() : c));
  };

  const applyPaletteFilter = (filter: "grayscale" | "cyberpunk" | "sunset" | "forest") => {
    if (!afterSvg || detectedColors.length === 0) return;
    const palettes: Record<string, string[]> = {
      cyberpunk: ["#ff007f","#9d00ff","#00f0ff","#ff00aa","#120024","#0a0012","#002b5c","#3d0066"],
      sunset:    ["#ff3b00","#ff8800","#ffcc00","#d90036","#2d0a00","#54000f","#803c00","#380005"],
      forest:    ["#0d5c3a","#2b8c56","#8fcc5c","#1f3a2b","#0a1a10","#a2deaa","#457551","#223d29"],
    };
    let updatedAfter = afterSvg, updatedBefore = beforeSvg;
    detectedColors.forEach((color, idx) => {
      let replacement = color;
      if (filter === "grayscale") {
        const hex = color.slice(1);
        let r = 127, g = 127, b = 127;
        if (hex.length >= 6) { r = parseInt(hex.slice(0,2),16); g = parseInt(hex.slice(2,4),16); b = parseInt(hex.slice(4,6),16); }
        const gr = Math.round(0.299*r + 0.587*g + 0.114*b).toString(16).padStart(2,"0");
        replacement = `#${gr}${gr}${gr}`;
      } else { replacement = palettes[filter][idx % palettes[filter].length]; }
      const rx = new RegExp(color, "gi");
      updatedAfter = updatedAfter.replace(rx, replacement);
      updatedBefore = updatedBefore.replace(rx, replacement);
    });
    setAfterSvg(updatedAfter); setBeforeSvg(updatedBefore); setEditableSvgCode(updatedAfter);
  };

  // ── handleRenderSvg ──
  const handleRenderSvg = useCallback(async (targetPrompt: string, label: string) => {
    setError(""); setIsGeneratingSvg(true); setBeforeSvg(""); setAfterSvg(""); setShowCodeInspector(false);
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_svg", payload: { prompt: targetPrompt, theme: label, style, ratio, faceless, colorPalette } }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal merender grafik vector");
      const data = await res.json();
      if (data.success && data.result) {
        setBeforeSvg(data.result.beforeSvg);
        setAfterSvg(data.result.afterSvg);
        setEditableSvgCode(data.result.afterSvg);
        setSvgTitle(data.result.title || label);
        setSliderPosition(50);
        trackVectorTokens(data.usage);
      } else throw new Error(data.error || "Hasil render tidak valid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate visual vector");
    } finally { setIsGeneratingSvg(false); }
  }, [style, ratio, faceless, colorPalette, trackVectorTokens]);

  const handleGenerate = useCallback(async () => {
    setError(""); setGeneratedPlan(null); setBeforeSvg(""); setAfterSvg("");
    setIsGenerating(true); setIsGeneratingSvg(true);

    const artThemesText = selectedArtThemes.map(t => ART_THEMES.find(a => a.value === t)?.label || t).join(", ");
    const conceptsText = selectedConcepts.map(c => CONCEPT_CATEGORIES.find(co => co.value === c)?.label || c).join(", ");

    const combinedTheme = [
      customTheme.trim() ? `Theme/Subject: ${customTheme.trim()}` : "",
      artThemesText ? `Art Style/Themes: ${artThemesText}` : "",
      conceptsText ? `Concept Categories: ${conceptsText}` : ""
    ].filter(Boolean).join(" | ");

    if (!combinedTheme.trim()) {
      setError("Masukkan tema atau pilih filter tema/konsep terlebih dahulu.");
      setIsGenerating(false);
      setIsGeneratingSvg(false);
      return;
    }

    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          payload: {
            mode: "noprompt",
            theme: combinedTheme,
            style,
            ratio,
            faceless,
            consistency,
            colorPalette,
            complexity,
            targetUse,
            count: promptCount
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal membuat rencana");
      const data = await res.json();
      if (data.success && data.result) {
        setGeneratedPlan(data.result);
        trackVectorTokens(data.usage);
        const firstPrompt = data.result.prompts?.[0];
        if (firstPrompt) await handleRenderSvg(firstPrompt.prompt, firstPrompt.label);
        else setIsGeneratingSvg(false);
      } else throw new Error(data.error || "Hasil tidak valid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
      setIsGeneratingSvg(false);
    } finally { setIsGenerating(false); }
  }, [customTheme, selectedArtThemes, selectedConcepts, style, ratio, faceless, consistency, colorPalette, complexity, targetUse, promptCount, handleRenderSvg, trackVectorTokens]);

  const handleMagic = useCallback(async () => {
    setError(""); setIsMagicking(true);
    try {
      const artThemesText = selectedArtThemes.map(t => ART_THEMES.find(a => a.value === t)?.label || t).join(", ");
      const conceptsText  = selectedConcepts.map(c => CONCEPT_CATEGORIES.find(co => co.value === c)?.label || c).join(", ");
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "magic",
          payload: {
            artType: artThemesText || selectedArtThemes[0] || "vector",
            concept: conceptsText || selectedConcepts[0] || "business",
            customTheme: customTheme.trim(),
            faceless,
            count: ideaCount
          }
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal menghasilkan ide");
      const data = await res.json();
      if (data.success && Array.isArray(data.ideas) && data.ideas.length > 0) {
        setMagicIdeas(data.ideas);
        setIdeaSearchQuery("");
        setIdeaFilterDiff("All");
        setIdeaSortBy("default");
      }
      trackVectorTokens(data.usage);
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); }
    finally { setIsMagicking(false); }
  }, [selectedArtThemes, selectedConcepts, customTheme, faceless, ideaCount, trackVectorTokens]);

  // ── handleEnhance ──
  const handleEnhance = useCallback(async () => {
    if (!customTheme.trim()) return;
    setError(""); setEnhancedPrompt(null); setIsEnhancing(true);
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enhance", payload: { prompt: customTheme, style, ratio, faceless, colorPalette, targetUse } }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal enhance prompt");
      const data = await res.json();
      if (data.success && data.enhanced) setEnhancedPrompt(data.enhanced);
      trackVectorTokens(data.usage);
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); }
    finally { setIsEnhancing(false); }
  }, [customTheme, style, ratio, faceless, colorPalette, targetUse, trackVectorTokens]);

  const handleDownloadImage = (svg: string, label: "before" | "after") => {
    if (!svg) return;
    const cfg = ASPECT_RATIOS.find(r => r.value === ratio) || ASPECT_RATIOS[0];
    const name = (svgTitle || "vector").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const fname = `${name}_${label}_${downloadRes}`;
    if (downloadRes === "svg") {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${fname}.svg`; a.click(); return;
    }
    const scale: Record<string,number> = { "1k":1024,"2k":2048,"3k":3072,"4k":4096 };
    const tw = scale[downloadRes], th = Math.round(tw * cfg.h / cfg.w);
    const canvas = document.createElement("canvas"); canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => { ctx.drawImage(img, 0, 0, tw, th); const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `${fname}.png`; a.click(); URL.revokeObjectURL(url); };
    img.src = url;
  };

  return (
    <div className="vc-container">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="vc-header">
        <div className="vc-header__title-group">
          <h1>
            🎨 Vector Studio AI
            <span className="vc-header__pro-badge">PRO</span>
          </h1>
          <p className="vc-header__subtitle">
            Platform pembuatan vector komersial HD 1K–4K berbasis AI · Adobe Stock-ready metadata otomatis
          </p>
        </div>
        <div className="vc-header__right">
          <div className="mon-tabs">
            {[
              { id: "generate" as PanelTab, label: "⚡ Studio"   },
              { id: "magic"    as PanelTab, label: "✨ Ideas"    },
              { id: "analytics"as PanelTab, label: "📈 Analytics"},
            ].map(t => (
              <button key={t.id} type="button" onClick={() => setPanelTab(t.id)} className={`mon-tab ${panelTab === t.id ? "mon-tab--active" : ""}`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Session token badge */}
          {sessionTokens.total > 0 && (
            <div className="vc-token-badge">
              <span className="vc-token-badge__icon">⚡</span>
              <span className="vc-token-badge__label">Sesi ini:</span>
              <span className="vc-token-badge__value">{formatTokens(sessionTokens.total)}</span>
              <span className="vc-token-badge__reqs">· {sessionTokens.requests} req</span>
              <span className="vc-token-badge__cost">{estimateCost(sessionTokens.prompt, sessionTokens.completion)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && <div className="vc-error">⚠️ {error}</div>}

      {/* ── GENERATE TAB ───────────────────────────────────────────────────── */}
      {panelTab === "generate" && (
        <div className="vc-panel">

          {/* Theme Input */}
          <div>
            <div className="vc-header" style={{ alignItems: "center", marginBottom: 8 }}>
              <span className="vc-field-label" style={{ marginBottom: 0 }}>Input Tema (Optional)</span>
              <button type="button" onClick={handleEnhance} disabled={isEnhancing} className="btn btn--ghost" style={{ color: "#7b5ae0" }}>
                {isEnhancing ? "✨ Enhancing..." : "✨ AI Enhance Theme →"}
              </button>
            </div>
            <textarea
              value={customTheme}
              onChange={e => setCustomTheme(e.target.value)}
              className="vc-textarea"
              style={{ minHeight: "100px", resize: "vertical" }}
              placeholder="Ketik tema vector yang ingin dibuat secara detail (contoh: Kucing astronot memakan ramen di luar angkasa dengan latar belakang kosmik cyberpunk)..."
            />
            {enhancedPrompt && (
              <div className="mon-section" style={{ marginTop: 12, background: "rgba(123,90,224,0.06)", borderColor: "rgba(123,90,224,0.2)" }}>
                <div className="mon-section__title" style={{ color: "#7b5ae0" }}>✨ AI-Enhanced Prompt:</div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{enhancedPrompt.prompt}</p>
                <button onClick={() => setCustomTheme(enhancedPrompt.prompt)} className="btn btn--primary" style={{ marginTop: 12, background: "#7b5ae0" }}>Gunakan Prompt Ini</button>
              </div>
            )}
          </div>

          {/* Theme Filters (Art style & Concept) */}
          <div className="vc-grid-2">
            <div>
              <span className="vc-field-label">Pilih Tema / Art Style</span>
              <div className="vc-chip-group">
                {ART_THEMES.map(theme => {
                  const isActive = selectedArtThemes.includes(theme.value);
                  return (
                    <button
                      key={theme.value}
                      type="button"
                      onClick={() => toggleArtTheme(theme.value)}
                      className={`vc-theme-chip ${isActive ? "vc-theme-chip--active" : ""}`}
                    >
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="vc-field-label">Pilih Konsep</span>
              <div className="vc-chip-group">
                {CONCEPT_CATEGORIES.map(concept => {
                  const isActive = selectedConcepts.includes(concept.value);
                  return (
                    <button
                      key={concept.value}
                      type="button"
                      onClick={() => toggleConcept(concept.value)}
                      className={`vc-concept-chip ${isActive ? "vc-concept-chip--active" : ""}`}
                    >
                      {concept.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Faceless and Consistency row */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div
              className={`vc-checkbox-container ${faceless ? "vc-checkbox-container--active" : ""}`}
              onClick={() => setFaceless(!faceless)}
            >
              <div className="vc-checkbox">
                <span className="vc-checkbox-checkmark">✓</span>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>🙈 Faceless (Karakter Tanpa Wajah)</span>
            </div>

            <div
              className={`vc-checkbox-container ${consistency ? "vc-checkbox-container--active" : ""}`}
              onClick={() => setConsistency(!consistency)}
            >
              <div className="vc-checkbox">
                <span className="vc-checkbox-checkmark">✓</span>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>🔗 Style Consistency (Konsistensi Gaya)</span>
            </div>
          </div>

          {/* Style + Ratio */}
          <div className="vc-grid-2">
            <div>
              <span className="vc-field-label">Style Vector</span>
              <div className="vc-grid-3">
                {STYLE_OPTIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => setStyle(s.value)} className={`vc-chip vc-style-card ${style === s.value ? "vc-chip--active vc-chip--style" : ""}`}>
                    <div className="vc-style-card__icon">{s.icon}</div>
                    <div className="vc-style-card__label">{s.label}</div>
                    <div className="vc-style-card__desc">{s.desc.split(",")[0]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="vc-field-label">Aspect Ratio</span>
              <div className="vc-grid-6">
                {ASPECT_RATIOS.map(r => (
                  <button key={r.value} type="button" onClick={() => setRatio(r.value)} className={`vc-ratio-btn ${ratio === r.value ? "vc-ratio-btn--active" : ""}`}>
                    <div className="vc-ratio-btn__icon">{r.icon}</div>
                    <div className="vc-ratio-btn__value">{r.value}</div>
                    <div className="vc-ratio-btn__label">{r.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color + Settings row */}
          <div className="vc-grid-3">
            <div>
              <span className="vc-field-label">Color Palette</span>
              <select value={colorPalette} onChange={e => setColorPalette(e.target.value)} className="vc-select">
                {PALETTE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <span className="vc-field-label">Complexity</span>
              <select value={complexity} onChange={e => setComplexity(e.target.value as Complexity)} className="vc-select">
                <option value="simple">Simple — Clean icons, minimal shapes</option>
                <option value="medium">Medium — Detailed illustration with props</option>
                <option value="complex">Complex — Scene with multiple elements & depth</option>
              </select>
            </div>
            <div>
              <span className="vc-field-label">Jumlah Prompt Output</span>
              <div className="vc-grid-4">
                {[2,4,6,8].map(n => (
                  <button key={n} type="button" onClick={() => setPromptCount(n)} className={`vc-chip ${promptCount === n ? "vc-chip--active" : ""}`}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Target Use */}
          <div>
            <span className="vc-field-label">Target Platform</span>
            <div className="vc-chip-group">
              {TARGET_USE_OPTIONS.map(t => (
                <button key={t} type="button" onClick={() => setTargetUse(t)} className={`vc-chip ${targetUse === t ? "vc-chip--active" : ""}`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Generate CTA */}
          <button type="button" onClick={handleGenerate} disabled={isGenerating} className="vc-generate-btn">
            {isGenerating ? "⏳ AI sedang membuat vector..." : "🎨 Create Vector"}
          </button>
        </div>
      )}

      {/* ── MAGIC IDEAS TAB ────────────────────────────────────────────────── */}
      {panelTab === "magic" && (
        <div className="vc-panel">

          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 className="mon-section__title" style={{ fontSize: 18, margin: 0 }}>✨ AI Ideas Generator</h3>
                <p className="vc-header__subtitle" style={{ margin: "4px 0 0" }}>Ide komersial kompleks untuk Adobe Stock · Pilih filter, atur jumlah, lalu generate.</p>
              </div>
              <button
                type="button"
                onClick={handleMagic}
                disabled={isMagicking}
                className="btn btn--primary"
                style={{ background: "linear-gradient(135deg,#7b5ae0,#4a90e2)", minWidth: 180, height: 44 }}
              >
                {isMagicking ? "⏳ Generating AI Ideas..." : "🔄 Generate Ideas"}
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          <div className="vc-panel" style={{ padding: "18px", background: "var(--bg-secondary)", gap: "16px", marginBottom: 0 }}>

            {/* Row 1: Custom Theme */}
            <div>
              <span className="vc-field-label">Tema Custom Khusus <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(Opsional)</span></span>
              <input
                type="text"
                value={customTheme}
                onChange={e => setCustomTheme(e.target.value)}
                placeholder="Misalnya: Kopi luar angkasa, kucing lucu, robot cyberpunk..."
                className="vc-input"
                style={{ width: "100%" }}
              />
            </div>

            {/* Row 2: Art Style & Concept — ALL options, multi-select */}
            <div className="vc-grid-2" style={{ gap: 16 }}>
              <div>
                <span className="vc-field-label">🎨 Tema / Art Style <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>Multi-pilih</span></span>
                <div className="vc-chip-group">
                  {ART_THEMES.map(theme => (
                    <button
                      key={theme.value}
                      type="button"
                      onClick={() => toggleArtTheme(theme.value)}
                      className={`vc-theme-chip ${selectedArtThemes.includes(theme.value) ? "vc-theme-chip--active" : ""}`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="vc-field-label">🗂️ Kategori Konsep <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>Multi-pilih</span></span>
                <div className="vc-chip-group">
                  {CONCEPT_CATEGORIES.map(concept => (
                    <button
                      key={concept.value}
                      type="button"
                      onClick={() => toggleConcept(concept.value)}
                      className={`vc-concept-chip ${selectedConcepts.includes(concept.value) ? "vc-concept-chip--active" : ""}`}
                    >
                      {concept.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Count slider + Faceless toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <span className="vc-field-label">Jumlah Ide yang Digenerate: <strong style={{ color: "#7b5ae0" }}>{ideaCount}</strong></span>
                <input
                  type="range"
                  min={3}
                  max={12}
                  step={1}
                  value={ideaCount}
                  onChange={e => setIdeaCount(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#7b5ae0", marginTop: 6 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  <span>3</span><span>6</span><span>9</span><span>12</span>
                </div>
              </div>
              <div
                className={`vc-checkbox-container ${faceless ? "vc-checkbox-container--active" : ""}`}
                onClick={() => setFaceless(!faceless)}
                style={{ width: "fit-content", flexShrink: 0 }}
              >
                <div className="vc-checkbox">
                  <span className="vc-checkbox-checkmark">✓</span>
                </div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>🙈 Karakter Faceless</span>
              </div>
            </div>
          </div>

          {/* Results Toolbar */}
          {magicIdeas.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              {/* Search */}
              <input
                type="text"
                value={ideaSearchQuery}
                onChange={e => setIdeaSearchQuery(e.target.value)}
                placeholder="🔍 Cari judul atau tag ide..."
                className="vc-input"
                style={{ flex: 1, minWidth: 160, height: 34, fontSize: 12 }}
              />
              {/* Sort */}
              <select
                value={ideaSortBy}
                onChange={e => setIdeaSortBy(e.target.value as typeof ideaSortBy)}
                className="vc-input"
                style={{ width: "auto", height: 34, fontSize: 12, paddingLeft: 8 }}
              >
                <option value="default">Urutan: Default</option>
                <option value="sales">Urutan: Est. Sales ↓</option>
                <option value="difficulty">Urutan: Difficulty ↑</option>
              </select>
              {/* Filter Difficulty */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["All", "Easy", "Medium", "Complex"] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setIdeaFilterDiff(d)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
                      border: `1px solid ${ideaFilterDiff === d ? "#7b5ae0" : "var(--border)"}`,
                      background: ideaFilterDiff === d ? "#7b5ae0" : "transparent",
                      color: ideaFilterDiff === d ? "#fff" : "var(--text-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {/* Copy All */}
              <button
                type="button"
                onClick={() => copyToClipboard(
                  magicIdeas.map((idea, i) =>
                    `--- Idea ${i+1}: ${idea.title} ---\nDescription: ${idea.description}\nPrompt: ${idea.prompt}\nTags: ${idea.tags.join(", ")}\nEst. Sales: ${idea.estimatedSales}`
                  ).join("\n\n"),
                  "all-ideas"
                )}
                className="btn btn--ghost"
                style={{ fontSize: 11, height: 34, paddingInline: 12, flexShrink: 0 }}
              >
                {copiedId === "all-ideas" ? "✓ Semua Disalin!" : "📋 Salin Semua"}
              </button>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                {(() => {
                  const q = ideaSearchQuery.toLowerCase();
                  return magicIdeas.filter(i =>
                    (ideaFilterDiff === "All" || i.difficulty === ideaFilterDiff) &&
                    (!q || i.title.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)))
                  ).length;
                })()} hasil
              </span>
            </div>
          )}

          {/* Ideas Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 16, marginTop: 14 }}>
            {(() => {
              let filtered = [...magicIdeas];
              // Filter by difficulty
              if (ideaFilterDiff !== "All") filtered = filtered.filter(i => i.difficulty === ideaFilterDiff);
              // Search by title or tag
              const q = ideaSearchQuery.toLowerCase();
              if (q) filtered = filtered.filter(i =>
                i.title.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)) || i.description.toLowerCase().includes(q)
              );
              // Sort
              if (ideaSortBy === "sales") {
                filtered.sort((a, b) => {
                  const na = parseInt(a.estimatedSales.replace(/[^0-9]/g, "")) || 0;
                  const nb = parseInt(b.estimatedSales.replace(/[^0-9]/g, "")) || 0;
                  return nb - na;
                });
              } else if (ideaSortBy === "difficulty") {
                const ord: Record<string, number> = { Easy: 0, Medium: 1, Complex: 2 };
                filtered.sort((a, b) => (ord[a.difficulty] || 0) - (ord[b.difficulty] || 0));
              }

              if (filtered.length === 0) return (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 20px", color: "var(--text-muted)", fontSize: 14 }}>
                  😔 Tidak ada ide yang cocok dengan filter yang dipilih.
                </div>
              );

              return filtered.map((idea, idx) => {
                const isExpanded = expandedIdeaId === idea.id;
                const diffColor = idea.difficulty === "Easy" ? "#22c55e" : idea.difficulty === "Medium" ? "#f59e0b" : "#ef4444";
                const diffBg = idea.difficulty === "Easy" ? "rgba(34,197,94,0.08)" : idea.difficulty === "Medium" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)";
                // Popularity score from sales number
                const salesNum = parseInt(idea.estimatedSales.replace(/[^0-9]/g, "")) || 0;
                const maxSales = 20000;
                const popPct = Math.min(Math.round((salesNum / maxSales) * 100), 100);
                const popColor = popPct >= 70 ? "#22c55e" : popPct >= 40 ? "#f59e0b" : "#60a5fa";

                return (
                  <div key={idea.id} className="vc-idea-card" style={{ display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

                    {/* Rank badge */}
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      background: "rgba(123,90,224,0.12)", border: "1px solid rgba(123,90,224,0.25)",
                      borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#7b5ae0"
                    }}>
                      #{idx + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      {/* Difficulty + Sales row */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          background: diffBg, color: diffColor, border: `1px solid ${diffColor}33`
                        }}>
                          {idea.difficulty === "Easy" ? "⚡ Easy" : idea.difficulty === "Medium" ? "🔥 Medium" : "💎 Complex"}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          background: "rgba(34,197,94,0.07)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)"
                        }}>
                          📦 {idea.estimatedSales}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px 0", lineHeight: 1.4, paddingRight: 32 }}>
                        {idea.title}
                      </h4>

                      {/* Description */}
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 12px 0" }}>
                        {idea.description}
                      </p>

                      {/* Popularity bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Popularitas Komersial</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: popColor }}>{popPct}%</span>
                        </div>
                        <div style={{ background: "var(--border)", borderRadius: 4, height: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${popPct}%`, background: `linear-gradient(90deg, ${popColor}, ${popColor}bb)`, borderRadius: 4, transition: "width 0.6s ease" }} />
                        </div>
                      </div>

                      {/* Tags */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                        {idea.tags.map(tag => <span key={tag} className="keyword-tag">{tag}</span>)}
                      </div>

                      {/* Prompt Collapsible */}
                      <div className="vc-idea-prompt-box">
                        <div
                          className="vc-idea-prompt-header"
                          onClick={() => setExpandedIdeaId(isExpanded ? null : idea.id)}
                        >
                          <span>📋 Prompt AI Generator</span>
                          <span>{isExpanded ? "Tutup ▲" : "Lihat Prompt ▼"}</span>
                        </div>
                        {isExpanded && (
                          <div style={{ padding: "10px 0 0" }}>
                            <p className="vc-idea-prompt-text" style={{ marginBottom: 10 }}>{idea.prompt}</p>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(idea.prompt, idea.id)}
                                className="btn btn--small btn--ghost"
                                style={{ fontSize: 11 }}
                              >
                                {copiedId === idea.id ? "✓ Disalin!" : "📋 Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(`${idea.title}\n\n${idea.description}\n\nPrompt: ${idea.prompt}\n\nTags: ${idea.tags.join(", ")}`, `full-${idea.id}`)}
                                className="btn btn--small btn--ghost"
                                style={{ fontSize: 11 }}
                              >
                                {copiedId === `full-${idea.id}` ? "✓ Disalin!" : "📄 Copy Lengkap"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRenderSvg(idea.prompt, idea.title)}
                                className="btn btn--small btn--ghost"
                                style={{ fontSize: 11, color: "#4a90e2", borderColor: "#4a90e2" }}
                              >
                                🖼️ Render SVG
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Use in Studio CTA */}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTheme(idea.prompt);
                        setPanelTab("generate");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="btn btn--primary w-full text-center"
                      style={{ marginTop: 14, background: "linear-gradient(135deg, #7b5ae0, #6366f1)" }}
                    >
                      Gunakan di Studio →
                    </button>
                  </div>
                );
              });
            })()}
          </div>

        </div>
      )}

      {/* ── ANALYTICS TAB ──────────────────────────────────────────────────── */}
      {panelTab === "analytics" && (
        <div className="vc-panel">
          <div className="vc-header" style={{ marginBottom: 8 }}>
            <div>
              <h3 className="mon-section__title" style={{ fontSize: 18 }}>📈 Token Usage Analytics</h3>
              <p className="vc-header__subtitle">Penghitungan token akurat per platform — reset otomatis setiap hari.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </div>
          </div>

          {/* Daily total bar */}
          {(() => {
            const usage = getUsage();
            const pct = Math.min(Math.round((usage.totalTokens / 100_000) * 100), 100);
            const pctColor = pct >= 85 ? "#dc2626" : pct >= 60 ? "#d97706" : "#16a34a";
            const platforms: Platform[] = ["metadata", "chat", "vector"];
            return (
              <>
                {/* Overview card */}
                <div className="mon-section" style={{ background: "rgba(74,144,226,0.05)", borderColor: "rgba(74,144,226,0.2)", padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Total Penggunaan Hari Ini</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: pctColor }}>{pct}%</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>dari 100k limit</span>
                    </div>
                  </div>
                  {/* Main bar */}
                  <div style={{ background: "var(--border)", borderRadius: 8, height: 10, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pctColor, borderRadius: 8, transition: "width 0.5s ease" }} />
                  </div>
                  {/* Stacked bar breakdown */}
                  <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 12 }}>
                    {platforms.map(p => {
                      const w = usage.totalTokens > 0 ? (usage.byPlatform[p].totalTokens / usage.totalTokens) * 100 : 0;
                      const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#16a34a" };
                      return <div key={p} style={{ width: `${w}%`, background: colors[p], transition: "width 0.5s" }} />;
                    })}
                  </div>
                  {/* Numbers row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[
                      { label: "Total Token", value: formatTokens(usage.totalTokens), sub: "hari ini" },
                      { label: "Input", value: formatTokens(usage.promptTokens), sub: "prompt" },
                      { label: "Output", value: formatTokens(usage.completionTokens), sub: "completion" },
                      { label: "Est. Cost", value: estimateCost(usage.promptTokens, usage.completionTokens), sub: "perkiraan" },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: "center", background: "var(--surface)", padding: "10px 8px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Per-platform breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                  {platforms.map(p => {
                    const pu = usage.byPlatform[p];
                    const colors: Record<Platform, string> = { metadata: "#4a90e2", chat: "#7b5ae0", vector: "#16a34a" };
                    const pPct = usage.totalTokens > 0 ? Math.round((pu.totalTokens / usage.totalTokens) * 100) : 0;
                    return (
                      <div key={p} style={{ background: "var(--surface)", border: `1px solid ${colors[p]}33`, borderRadius: 12, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{getPlatformLabel(p)}</span>
                          <span style={{ fontSize: 11, color: colors[p], fontWeight: 700, background: `${colors[p]}18`, padding: "2px 8px", borderRadius: 999 }}>{pPct}% share</span>
                        </div>
                        <div style={{ background: "var(--border)", borderRadius: 4, height: 4, marginBottom: 12, overflow: "hidden" }}>
                          <div style={{ width: `${pPct}%`, height: "100%", background: colors[p], borderRadius: 4, transition: "width 0.5s" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[
                            { label: "Total", val: formatTokens(pu.totalTokens) },
                            { label: "Requests", val: pu.requestCount.toString() },
                            { label: "Input", val: formatTokens(pu.promptTokens) },
                            { label: "Output", val: formatTokens(pu.completionTokens) },
                          ].map(item => (
                            <div key={item.label} style={{ background: "var(--bg-secondary)", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{item.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{item.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                          Est. {estimateCost(pu.promptTokens, pu.completionTokens)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Session stats */}
                {sessionTokens.total > 0 && (
                  <div style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 10 }}>⚡ Sesi Vector Saat Ini</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                      {[
                        { label: "Total Token", val: formatTokens(sessionTokens.total) },
                        { label: "Input", val: formatTokens(sessionTokens.prompt) },
                        { label: "Output", val: formatTokens(sessionTokens.completion) },
                        { label: "Requests", val: sessionTokens.requests.toString() },
                      ].map(item => (
                        <div key={item.label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{item.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: "#16a34a", marginTop: 2 }}>{item.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  Token reset otomatis setiap hari · Semua platform menggunakan API key Groq yang sama
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* ── SVG DISPLAY + BEFORE/AFTER SLIDER ──────────────────────────────── */}
      {(isGeneratingSvg || beforeSvg || afterSvg) && (
        <div className="vc-panel">
          <div className="vc-header">
            <div>
              <div className="vc-field-label" style={{ color: "#4a90e2", marginBottom: 4 }}>🖼️ Before vs After — HD Vector Result</div>
              <h3 className="mon-section__title" style={{ fontSize: 17 }}>{svgTitle || "Vector Commercial Asset"}</h3>
            </div>
            {afterSvg && (
              <div className="vc-chip-group">
                <select value={downloadRes} onChange={e => setDownloadRes(e.target.value as ResolutionOpt)} className="vc-select" style={{ width: 'auto' }}>
                  <option value="1k">1K PNG (1024px)</option>
                  <option value="2k">2K PNG (2048px) – HD</option>
                  <option value="3k">3K PNG (3072px) – Super HD</option>
                  <option value="4k">4K PNG (4096px) – Ultra HD</option>
                  <option value="svg">SVG Original (lossless vector)</option>
                </select>
                <button onClick={() => handleDownloadImage(afterSvg, "after")} className="btn btn--primary">
                  ⬇ Download {downloadRes.toUpperCase()}
                </button>
              </div>
            )}
          </div>

          {isGeneratingSvg ? (
            <div className="aichat__welcome" style={{ height: 400, background: "rgba(0,0,0,0.15)", borderRadius: 14 }}>
              <div style={{ fontSize:36, animation:"spin 1.2s linear infinite" }}>⚙️</div>
              <div style={{ fontSize:13, color:"var(--text-muted)", fontWeight:600 }}>AI sedang menggambar vector Before & After...</div>
            </div>
          ) : (
            <>
              <div ref={containerRef} onPointerDown={handlePointerDown}
                style={{ position:"relative", width:"100%", height:480, borderRadius:14, overflow:"hidden", background:"#0d0d0d", cursor:"ew-resize", userSelect:"none" as const, border:"1px solid var(--border)" }}>
                <div style={{ position:"absolute", inset:0, pointerEvents:"none" as const }} dangerouslySetInnerHTML={{ __html: beforeSvg }} />
                <div style={{ position:"absolute", top:0, left:0, width:`${sliderPosition}%`, height:"100%", overflow:"hidden", borderRight:"3px solid #4a90e2", pointerEvents:"none" as const, zIndex:2 }}>
                  <div style={{ width: containerRef.current?.getBoundingClientRect().width ?? 800, height:"100%" }} dangerouslySetInnerHTML={{ __html: afterSvg }} />
                </div>
                <div style={{ position:"absolute", top:12, right:12, background:"rgba(0,0,0,0.7)", color:"white", padding:"4px 10px", borderRadius:6, fontSize:10, fontWeight:800, zIndex:5 }}>BEFORE</div>
                <div style={{ position:"absolute", top:12, left:12, background:"rgba(74,144,226,0.9)", color:"white", padding:"4px 10px", borderRadius:6, fontSize:10, fontWeight:800, zIndex:5 }}>AFTER</div>
                <div style={{ position:"absolute", top:0, bottom:0, left:`${sliderPosition}%`, width:3, background:"#4a90e2", transform:"translateX(-50%)", zIndex:3, cursor:"ew-resize" }}>
                  <div style={{ position:"absolute", top:"50%", left:"50%", width:36, height:36, background:"#4a90e2", border:"3px solid white", borderRadius:"50%", transform:"translate(-50%,-50%)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(0,0,0,0.5)", fontSize:12, color:"white", fontWeight:900 }}>↔</div>
                </div>
              </div>

              {/* Color sandbox */}
              <div className="mon-section" style={{ background:"rgba(255,255,255,0.02)", padding: 16 }}>
                <div className="vc-header" style={{ marginBottom: 4 }}>
                  <span className="vc-field-label" style={{ marginBottom: 0 }}>🎨 Color Sandbox & Filters</span>
                  <div className="vc-chip-group">
                    {(["grayscale","cyberpunk","sunset","forest"] as const).map(f => (
                      <button key={f} type="button" onClick={() => applyPaletteFilter(f)} className="btn btn--small btn--ghost" style={{ textTransform: "capitalize" }}>{f}</button>
                    ))}
                  </div>
                </div>
                {detectedColors.length > 0 && (
                  <div className="vc-chip-group">
                    {detectedColors.map(color => (
                      <div key={color} className="vc-chip-group" style={{ background:"rgba(255,255,255,0.03)", padding:"4px 10px", borderRadius:8, border:"1px solid var(--border)" }}>
                        <div style={{ width:16, height:16, borderRadius:4, background:color, border:"1px solid rgba(255,255,255,0.2)" }} />
                        <span style={{ fontSize:10, fontFamily:"monospace" }}>{color}</span>
                        <input type="color" value={color} onChange={e => handleColorReplace(color, e.target.value)} style={{ width:20, height:18, border:"none", background:"none", cursor:"pointer", padding:0 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Generated Prompts Output ────────────────────────────────────────── */}
      {generatedPlan && (
        <div className="vc-container" style={{ gap: 16 }}>
          {generatedPlan.plan && (
            <div className="vc-panel" style={{ padding:"18px 22px" }}>
              <div className="vc-grid-4" style={{ gap: 20 }}>
                <div>
                  <div className="vc-field-label" style={{ color: "#4a90e2" }}>Concept</div>
                  <div style={{ fontSize:14, fontWeight:900 }}>{generatedPlan.plan.conceptTitle}</div>
                </div>
                <div>
                  <div className="vc-field-label">Palette</div>
                  <div style={{ fontSize:13 }}>{generatedPlan.plan.styleGuide?.palette}</div>
                </div>
                <div>
                  <div className="vc-field-label">Composition</div>
                  <div style={{ fontSize:13 }}>{generatedPlan.plan.styleGuide?.composition}</div>
                </div>
                <div>
                  <div className="vc-field-label">Commercial Hook</div>
                  <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{generatedPlan.plan.commercialHook}</div>
                </div>
              </div>
            </div>
          )}
          <h3 className="mon-section__title" style={{ fontSize: 16 }}>📝 Prompts & Adobe Stock Metadata ({generatedPlan.prompts?.length ?? 0})</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(420px,1fr))", gap:14 }}>
            {(generatedPlan.prompts || []).map((p, idx) => (
              <div key={p.id || idx} className="vc-prompt-card">
                <div className="vc-prompt-card__header">
                  <span className="vc-prompt-card__title">#{idx+1} {p.label}</span>
                  <div className="vc-prompt-card__actions">
                    <button type="button" onClick={() => copyToClipboard(p.prompt, p.id)} className="btn btn--small btn--ghost">{copiedId===p.id?"✓ Disalin":"📋 Copy"}</button>
                    <button type="button" onClick={() => handleRenderSvg(p.prompt, p.label)} disabled={isGeneratingSvg} className="btn btn--small btn--ghost" style={{ color: "#4a90e2", borderColor: "#4a90e2" }}>🖼️ Render</button>
                  </div>
                </div>
                <div className="vc-prompt-card__prompt-text">{p.prompt}</div>
                {p.negativePrompt && <div className="vc-prompt-card__negative-text"><strong>Negative:</strong> {p.negativePrompt}</div>}
                <div>
                  <div className="vc-field-label" style={{ marginBottom: 4 }}>Adobe Stock Title</div>
                  <div className="vc-prompt-card__meta-title">{p.metadata?.title}</div>
                </div>
                <div className="vc-prompt-card__keywords">
                  {(p.metadata?.keywords || []).slice(0,12).map((k: string) => (
                    <span key={k} className="keyword-tag">{k}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
