"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type VectorStyle   = "flat" | "outline" | "both";
type AspectRatio   = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
type Complexity    = "simple" | "medium" | "complex";
type VectorMode    = "prompt" | "noprompt" | "composer";
type PanelTab      = "generate" | "composer" | "magic" | "analytics" | "history";
type ResolutionOpt = "1k" | "2k" | "3k" | "4k" | "svg";

interface MagicIdea {
  id: string; title: string; description: string; prompt: string;
  tags: string[]; estimatedSales: string; difficulty: "Easy" | "Medium" | "Complex";
}

interface GeneratedPrompt {
  id: string; label: string; prompt: string; negativePrompt: string;
  metadata: { title: string; keywords: string[] };
  technicalSpec: { ratio: string; complexity: string; colorCount: number };
}

interface GeneratedPlan {
  plan: {
    conceptTitle: string; commercialHook: string;
    styleGuide: { palette: string; strokeWeight: string; typography: string; composition: string; };
  };
  prompts: GeneratedPrompt[];
  setTips: string[];
  complianceNotes: string[];
}

interface HistoryItem {
  id: string; timestamp: string; mode: VectorMode; style: VectorStyle;
  ratio: AspectRatio; conceptTitle: string; promptCount: number;
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

const THEME_PRESETS = [
  "Flat Vector Modern Tech Workspace & Developer Lifestyle",
  "Retro 80s Synthwave Aesthetic with Neon Grid Lines",
  "Kawaii Chibi Character Mascot for Brand Identity",
  "Modern Isometric 3D Smart City & Urban Life",
  "Futuristic AI & Machine Learning Data Visualization",
  "Eco-Friendly Sustainability & Green Energy Concepts",
  "E-Commerce Shopping & Digital Payment Illustrations",
  "Healthcare & Medical Technology Flat Icons Set",
  "Food & Beverage Artisan Brand Illustration Pack",
  "Travel & Adventure Flat Landscape Destination Set",
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

// ── Enriched Composer Bank ────────────────────────────────────────────────────
const COMPOSER_BANK = {
  subjects: [
    "A senior software engineer pair-programming on dual ultra-wide monitors with neon IDE theme",
    "A diverse creative team brainstorming on glass whiteboard with colorful sticky notes",
    "A cute astronaut floating in zero gravity, holding a cup of instant ramen and chopsticks",
    "A solo female entrepreneur at minimal standing desk, surrounded by plants and warm lamp glow",
    "A sleek electric sports car charging at a futuristic cyber-punk street station at night",
    "A young data scientist analyzing complex holographic charts floating mid-air",
    "A chef plating artisanal ramen in a modern Japanese minimalist kitchen",
    "A delivery drone fleet flying over a smart city skyline at golden hour",
    "A meditating panda in a bamboo forest surrounded by floating glowing orbs",
    "A cybersecurity analyst in a dark room surrounded by multiple screens showing network maps",
  ],
  aesthetics: [
    "ultra-clean flat design vector illustration with precise geometric shapes",
    "modern isometric 3D vector with subtle shadow and depth layers",
    "detailed linework illustration with hatching and pastel color fills",
    "bold geometric abstract shapes with high color contrast and sharp edges",
    "soft kawaii chibi character style with rounded forms and big eyes",
    "retro 80s pixel-art inspired with limited color palette and grid texture",
    "neo-brutalist thick black strokes with saturated flat color blocks",
  ],
  backgrounds: [
    "solid deep navy blue background with minimal grid dot pattern",
    "soft lavender-to-mint gradient with abstract floating circle elements",
    "fully transparent background optimized for commercial asset isolation",
    "warm cream background with subtle paper texture grain and soft shadow",
    "dark matte charcoal background with neon accent glow reflections",
    "isometric floor grid with long drop shadow for 3D depth effect",
    "abstract geometric sunburst pattern in retro warm color palette",
  ],
  lightings: [
    "flat ambient isometric lighting with no harsh shadows, consistent tone",
    "dramatic sunset rim light casting long cool blue shadows",
    "futuristic neon underglow accent from below, blue-magenta split tones",
    "soft studio diffuse box lighting with subtle gradient shadow edges",
    "high-key bright flat lighting, minimal shadow, optimized for icons",
    "moody dark-to-light gradient spotlight from top-right corner",
    "cinematic volumetric golden hour side fill with warm shadows",
  ],
};

// ── Magic Ideas Bank (extended) ───────────────────────────────────────────────
const STATIC_MAGIC_IDEAS: MagicIdea[] = [
  {
    id: "mi1",
    title: "AI-Powered Smart Home Control System",
    description: "Futuristic flat vector illustration of a person controlling smart appliances via holographic interface — massive demand in tech editorial market.",
    prompt: "Flat vector illustration of a smart home control system, person standing in center living room interacting with floating holographic UI panels showing temperature, security, lighting controls, modern minimal interior, cool blue and white palette, isometric perspective, clean geometric shapes, professional stock illustration style",
    tags: ["smart home", "IoT", "tech", "futuristic"],
    estimatedSales: "8,400+ downloads",
    difficulty: "Medium",
  },
  {
    id: "mi2",
    title: "Mental Health & Mindfulness Wellness Set",
    description: "Soft pastel vector characters practicing mindfulness — top 5% seller category with evergreen commercial demand from health apps and publishers.",
    prompt: "Flat vector illustration of a calm character sitting in lotus meditation pose, surrounded by floating botanical leaves and soft glowing orbs, pastel lavender and mint green palette, clean rounded shapes, white background, mental health wellness concept, premium editorial illustration style",
    tags: ["wellness", "mindfulness", "health", "calm"],
    estimatedSales: "12,200+ downloads",
    difficulty: "Easy",
  },
  {
    id: "mi3",
    title: "Green Energy Renewable Technology Pack",
    description: "Solar panels, wind turbines, EV charging — ESG content has 300% growth in B2B licensing. Perfect for corporate reports and sustainability campaigns.",
    prompt: "Flat isometric vector illustration of a green energy landscape with solar farm, wind turbines, electric vehicle charging station, smart grid lines, lush green hills, clean sky blue background, eco-friendly technology concept, detailed vector illustration for commercial use",
    tags: ["sustainability", "ESG", "green energy", "climate"],
    estimatedSales: "9,600+ downloads",
    difficulty: "Complex",
  },
  {
    id: "mi4",
    title: "Remote Work & Digital Nomad Lifestyle",
    description: "Evergreen bestseller — remote work flat vectors convert 40% higher than studio photography for SaaS and productivity software marketing.",
    prompt: "Flat vector illustration of a digital nomad working on laptop at a beach cafe, tropical plants around, warm sunset colors, coffee cup on table, minimal focused workspace vibe, modern professional flat vector art style, for commercial stock illustration use",
    tags: ["remote work", "freelance", "lifestyle", "productivity"],
    estimatedSales: "15,800+ downloads",
    difficulty: "Easy",
  },
  {
    id: "mi5",
    title: "Blockchain & DeFi Finance Ecosystem",
    description: "Crypto and decentralized finance illustration is massively underserved in vector stock — early mover advantage with high CPM licensing rates.",
    prompt: "Complex flat vector illustration of blockchain network visualization, interconnected nodes forming hexagonal web, cryptocurrency coins floating, digital wallet interface, dark navy background with neon blue and gold accents, modern fintech editorial illustration, clean geometric shapes",
    tags: ["blockchain", "crypto", "fintech", "defi"],
    estimatedSales: "6,300+ downloads",
    difficulty: "Complex",
  },
  {
    id: "mi6",
    title: "Diverse Team Collaboration & Inclusion",
    description: "DEI content is mandated purchasing in Fortune 500 HR departments — diverse team illustrations consistently rank top 10 in commercial licensing.",
    prompt: "Flat vector illustration of diverse multicultural team of 4 professionals collaborating around circular table, laptops open, sticky notes on glass wall, inclusive workplace concept, warm coral and indigo color palette, modern editorial illustration for business use",
    tags: ["diversity", "teamwork", "inclusion", "business"],
    estimatedSales: "18,400+ downloads",
    difficulty: "Medium",
  },
];

// ── Toggle Component ─────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className={`vc-toggle ${value ? "vc-toggle--active" : ""}`} onClick={() => onChange(!value)}>
      <div className="vc-toggle__text-group">
        <div className="vc-toggle__label">{label}</div>
        {desc && <div className="vc-toggle__desc">{desc}</div>}
      </div>
      <div className="vc-toggle__switch">
        <div className="vc-toggle__knob" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VectorCreator() {
  const [panelTab, setPanelTab]   = useState<PanelTab>("generate");
  const [faceless, setFaceless]   = useState(false);
  const [consistency, setConsistency] = useState(true);
  const [style, setStyle]         = useState<VectorStyle>("both");
  const [ratio, setRatio]         = useState<AspectRatio>("1:1");
  const [colorPalette, setColorPalette] = useState(PALETTE_PRESETS[0]);
  const [complexity, setComplexity]     = useState<Complexity>("medium");
  const [targetUse, setTargetUse]       = useState(TARGET_USE_OPTIONS[0]);
  const [promptCount, setPromptCount]   = useState(4);
  const [mode, setMode]           = useState<VectorMode>("noprompt");
  const [userPrompt, setUserPrompt] = useState("");
  const [selectedTheme, setSelectedTheme] = useState(THEME_PRESETS[0]);
  const [customTheme, setCustomTheme]     = useState("");

  const [compSubject, setCompSubject]     = useState(COMPOSER_BANK.subjects[0]);
  const [compAesthetic, setCompAesthetic] = useState(COMPOSER_BANK.aesthetics[0]);
  const [compBackground, setCompBackground] = useState(COMPOSER_BANK.backgrounds[0]);
  const [compLighting, setCompLighting]   = useState(COMPOSER_BANK.lightings[0]);

  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [magicIdeas, setMagicIdeas]       = useState<MagicIdea[]>(STATIC_MAGIC_IDEAS);
  const [enhancedPrompt, setEnhancedPrompt] = useState<{ prompt: string; improvements: string[] } | null>(null);
  const [history, setHistory]             = useState<HistoryItem[]>([]);

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

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pointer drag for slider ─────────────────────────────────────────────────
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

  // ── Extract colors from SVG ─────────────────────────────────────────────────
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

  const getComposedPrompt = useCallback(() =>
    `A professional vector illustration of ${compSubject}, rendered in ${compAesthetic}, with ${compBackground}, lit by ${compLighting}. Clean precise geometry, crisp vector lines, optimized for commercial stock use.`,
  [compSubject, compAesthetic, compBackground, compLighting]);

  const handleSurpriseMe = () => {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    setCompSubject(pick(COMPOSER_BANK.subjects));
    setCompAesthetic(pick(COMPOSER_BANK.aesthetics));
    setCompBackground(pick(COMPOSER_BANK.backgrounds));
    setCompLighting(pick(COMPOSER_BANK.lightings));
    setMode("composer");
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

  // ── handleRenderSvg defined FIRST (before handleGenerate uses it) ─────────
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
      } else throw new Error(data.error || "Hasil render tidak valid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate visual vector");
    } finally { setIsGeneratingSvg(false); }
  }, [style, ratio, faceless, colorPalette]);

  // ── handleGenerate (after handleRenderSvg) ──────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setError(""); setGeneratedPlan(null); setBeforeSvg(""); setAfterSvg("");
    setIsGenerating(true); setIsGeneratingSvg(true);
    const theme = customTheme.trim() || selectedTheme;
    const promptText = mode === "composer" ? getComposedPrompt() : userPrompt;
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          payload: { mode: (mode === "composer" || userPrompt.trim()) ? "prompt" : "noprompt", prompt: promptText, theme, style, ratio, faceless, consistency, colorPalette, complexity, targetUse, count: promptCount },
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal membuat rencana");
      const data = await res.json();
      if (data.success && data.result) {
        setGeneratedPlan(data.result);
        if (data.result.plan?.conceptTitle) {
          setHistory(prev => [{
            id: `h-${Date.now()}`, timestamp: new Date().toLocaleTimeString("id-ID"),
            mode, style, ratio, conceptTitle: data.result.plan.conceptTitle,
            promptCount: data.result.prompts?.length ?? 0,
          }, ...prev.slice(0, 19)]);
        }
        const firstPrompt = data.result.prompts?.[0];
        if (firstPrompt) await handleRenderSvg(firstPrompt.prompt, firstPrompt.label);
        else setIsGeneratingSvg(false);
      } else throw new Error(data.error || "Hasil tidak valid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
      setIsGeneratingSvg(false);
    } finally { setIsGenerating(false); }
  }, [mode, userPrompt, getComposedPrompt, selectedTheme, customTheme, style, ratio, faceless, consistency, colorPalette, complexity, targetUse, promptCount, handleRenderSvg]);

  const handleMagic = useCallback(async () => {
    setError(""); setIsMagicking(true);
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "magic", payload: { theme: customTheme.trim() || selectedTheme, style, faceless, count: 6 } }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal menghasilkan ide");
      const data = await res.json();
      if (data.success && Array.isArray(data.ideas) && data.ideas.length > 0) setMagicIdeas(data.ideas);
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); }
    finally { setIsMagicking(false); }
  }, [selectedTheme, customTheme, style, faceless]);

  const handleEnhance = useCallback(async () => {
    if (!userPrompt.trim()) return;
    setError(""); setEnhancedPrompt(null); setIsEnhancing(true);
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enhance", payload: { prompt: userPrompt, style, ratio, faceless, colorPalette, targetUse } }),
      });
      if (!res.ok) throw new Error(await res.text() || "Gagal enhance prompt");
      const data = await res.json();
      if (data.success && data.enhanced) setEnhancedPrompt(data.enhanced);
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); }
    finally { setIsEnhancing(false); }
  }, [userPrompt, style, ratio, faceless, colorPalette, targetUse]);

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
        <div className="mon-tabs">
          {([
            { id:"generate" as PanelTab,  label:"⚡ Studio"   },
            { id:"composer" as PanelTab,  label:"⚙️ Composer" },
            { id:"magic"    as PanelTab,  label:"✨ Ideas"    },
            { id:"analytics"as PanelTab,  label:"📈 Analytics"},
            { id:"history"  as PanelTab,  label:`📋 History (${history.length})` },
          ]).map(t => (
            <button key={t.id} type="button" onClick={() => setPanelTab(t.id)} className={`mon-tab ${panelTab === t.id ? "mon-tab--active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && <div className="vc-error">⚠️ {error}</div>}

      {/* ── GENERATE TAB ───────────────────────────────────────────────────── */}
      {panelTab === "generate" && (
        <div className="vc-panel">

          {/* Mode selector */}
          <div className="vc-chip-group">
            <span className="vc-field-label" style={{ marginBottom: 0 }}>Mode:</span>
            {[
              { v:"noprompt" as VectorMode, label:"🤖 Autopilot (No Prompt)" },
              { v:"prompt"   as VectorMode, label:"✍️ Custom Prompt"         },
            ].map(m => (
              <button key={m.v} type="button" onClick={() => setMode(m.v)} className={`vc-chip ${mode === m.v ? "vc-chip--active" : ""}`}>{m.label}</button>
            ))}
            <div style={{ marginLeft:"auto" }} className="vc-chip-group">
              <button onClick={() => setFaceless(!faceless)} className={`vc-chip ${faceless ? "vc-chip--active vc-chip--toggle" : ""}`}>🙈 Faceless</button>
              <button onClick={() => setConsistency(!consistency)} className={`vc-chip ${consistency ? "vc-chip--active" : ""}`}>🔗 Consistency</button>
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

          {/* Theme / Prompt input */}
          {mode === "noprompt" ? (
            <div>
              <div className="vc-header" style={{ alignItems: "center", marginBottom: 4 }}>
                <span className="vc-field-label" style={{ marginBottom: 0 }}>Tema Vector Komersial</span>
                <input value={customTheme} onChange={e => setCustomTheme(e.target.value)} placeholder="atau ketik tema custom..." className="vc-input" style={{ width: "auto", flexGrow: 1, maxWidth: "40%" }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:8 }}>
                {THEME_PRESETS.map(t => (
                  <button key={t} type="button" onClick={() => { setSelectedTheme(t); setCustomTheme(""); }} className={`vc-chip ${selectedTheme === t && !customTheme ? "vc-chip--active" : ""}`} style={{ textAlign: "left" }}>{t}</button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="vc-header" style={{ alignItems: "center", marginBottom: 0 }}>
                <span className="vc-field-label" style={{ marginBottom: 0 }}>Custom Prompt</span>
                <button type="button" onClick={handleEnhance} disabled={isEnhancing} className="btn btn--ghost" style={{ color: "#7b5ae0" }}>
                  {isEnhancing ? "✨ Enhancing..." : "✨ AI Enhance →"}
                </button>
              </div>
              <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} className="vc-textarea"
                placeholder="Deskripsikan vector yang ingin dibuat secara detail — subjek, gaya, warna, komposisi, mood..."
              />
              {enhancedPrompt && (
                <div className="mon-section" style={{ marginTop: 12, background: "rgba(123,90,224,0.06)", borderColor: "rgba(123,90,224,0.2)" }}>
                  <div className="mon-section__title" style={{ color: "#7b5ae0" }}>✨ AI-Enhanced Prompt:</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{enhancedPrompt.prompt}</p>
                  <button onClick={() => setUserPrompt(enhancedPrompt.prompt)} className="btn btn--primary" style={{ marginTop: 12, background: "#7b5ae0" }}>Gunakan Prompt Ini</button>
                </div>
              )}
            </div>
          )}

          {/* Generate CTA */}
          <button type="button" onClick={handleGenerate} disabled={isGenerating} className="vc-generate-btn">
            {isGenerating ? "⏳ AI sedang merancang konsep & metadata..." : "📝 Generate Rencana + Metadata Adobe Stock"}
          </button>
        </div>
      )}

      {/* ── COMPOSER TAB ───────────────────────────────────────────────────── */}
      {panelTab === "composer" && (
        <div className="vc-panel">
          <div>
            <h3 className="mon-section__title" style={{ fontSize: 18 }}>⚙️ Advanced Prompt Composer</h3>
            <p className="vc-header__subtitle">Bangun prompt detail dengan memilih komponen. AI akan menggabungkannya menjadi prompt komersial yang optimal.</p>
          </div>
          <div className="vc-grid-2">
            {[
              { label:"Subject / Protagonist", value: compSubject, set: setCompSubject, options: COMPOSER_BANK.subjects },
              { label:"Aesthetic / Art Style",  value: compAesthetic, set: setCompAesthetic, options: COMPOSER_BANK.aesthetics },
              { label:"Background / Environment", value: compBackground, set: setCompBackground, options: COMPOSER_BANK.backgrounds },
              { label:"Lighting & Atmosphere",    value: compLighting, set: setCompLighting, options: COMPOSER_BANK.lightings },
            ].map(field => (
              <div key={field.label}>
                <span className="vc-field-label">{field.label}</span>
                <select value={field.value} onChange={e => field.set(e.target.value)} className="vc-select">
                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="mon-section" style={{ background: "rgba(74,144,226,0.05)", borderColor: "rgba(74,144,226,0.15)" }}>
            <div className="mon-section__title" style={{ color: "#4a90e2" }}>Preview Composed Prompt:</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{getComposedPrompt()}</p>
          </div>
          <div className="vc-grid-3" style={{ gap: 12 }}>
            <button type="button" onClick={handleSurpriseMe} className="btn btn--secondary">🎲 Acak Semua</button>
            <button type="button" onClick={() => copyToClipboard(getComposedPrompt(), "composed")} className="btn btn--secondary">
              {copiedId === "composed" ? "✓ Tersalin" : "📋 Copy Prompt"}
            </button>
            <button type="button" onClick={() => { setUserPrompt(getComposedPrompt()); setMode("prompt"); setPanelTab("generate"); }} className="btn btn--primary">
              Gunakan di Studio →
            </button>
          </div>
        </div>
      )}

      {/* ── MAGIC IDEAS TAB ────────────────────────────────────────────────── */}
      {panelTab === "magic" && (
        <div className="vc-panel">
          <div className="vc-header">
            <div>
              <h3 className="mon-section__title" style={{ fontSize: 18 }}>✨ High-Demand Vector Ideas</h3>
              <p className="vc-header__subtitle">Ide vector komersial dengan estimasi penjualan tertinggi di Adobe Stock. Klik ide untuk langsung gunakan sebagai prompt.</p>
            </div>
            <button type="button" onClick={handleMagic} disabled={isMagicking} className="btn btn--primary" style={{ background: "linear-gradient(135deg,#7b5ae0,#4a90e2)" }}>
              {isMagicking ? "⏳ Generating..." : "🔄 Regenerate Ideas"}
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:14 }}>
            {magicIdeas.map(idea => (
              <div key={idea.id} onClick={() => { setUserPrompt(idea.prompt); setMode("prompt"); setPanelTab("generate"); }} className="vc-idea-card">
                {/* Market stats */}
                <div className="vc-idea-card__stats">
                  <div className="vc-idea-card__stat" style={{ background:"rgba(76,175,80,0.1)", border:"1px solid rgba(76,175,80,0.2)" }}>
                    <div className="vc-idea-card__stat-label">Est. Sales</div>
                    <div className="vc-idea-card__stat-value" style={{ color:"#4caf50" }}>{idea.estimatedSales}</div>
                  </div>
                  <div className="vc-idea-card__stat" style={{ background: idea.difficulty==="Easy"?"rgba(76,175,80,0.1)":idea.difficulty==="Medium"?"rgba(255,152,0,0.1)":"rgba(239,68,68,0.1)", border:"1px solid var(--border)" }}>
                    <div className="vc-idea-card__stat-label">Difficulty</div>
                    <div className="vc-idea-card__stat-value" style={{ color: idea.difficulty==="Easy"?"#4caf50":idea.difficulty==="Medium"?"#ff9800":"#ef4444" }}>{idea.difficulty}</div>
                  </div>
                </div>
                <h4 className="vc-idea-card__title">{idea.title}</h4>
                <p className="vc-idea-card__desc">{idea.description}</p>
                <div className="vc-idea-card__prompt">
                  "{idea.prompt.slice(0, 120)}..."
                </div>
                <div className="vc-idea-card__tags">
                  {idea.tags.map(tag => <span key={tag} className="keyword-tag">{tag}</span>)}
                </div>
                <div className="vc-idea-card__cta">Klik untuk pakai prompt ini →</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ANALYTICS TAB ──────────────────────────────────────────────────── */}
      {panelTab === "analytics" && (
        <div className="vc-panel" style={{ alignItems:"center", justifyContent:"center", minHeight:320, textAlign:"center" }}>
          <div style={{ fontSize:48, opacity:0.3 }}>📈</div>
          <h3 className="mon-section__title" style={{ fontSize: 18, marginTop: 12 }}>Market Analytics</h3>
          <p className="vc-header__subtitle" style={{ maxWidth: 400 }}>Fitur analisis tren pasar Adobe Stock sedang dalam pengembangan. Akan menampilkan kategori terlaris, harga lisensi rata-rata, dan prediksi tren.</p>
        </div>
      )}

      {/* ── HISTORY TAB ────────────────────────────────────────────────────── */}
      {panelTab === "history" && (
        <div className="vc-panel">
          <h3 className="mon-section__title" style={{ fontSize: 18 }}>📋 Generation History</h3>
          {history.length === 0 ? (
            <p className="vc-header__subtitle">Belum ada history. Hasil generate akan muncul di sini.</p>
          ) : (
            <div className="mon-section" style={{ padding: 0, background: 'transparent' }}>
              {history.map(item => (
                <div key={item.id} className="mon-info-row" style={{ background: "rgba(255,255,255,0.02)", padding: "11px 16px", borderRadius: 10 }}>
                  <div>
                    <strong style={{ fontSize:13 }}>{item.conceptTitle}</strong>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{item.promptCount} prompts · {item.style} · {item.ratio} · {item.mode}</div>
                  </div>
                  <span style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"monospace", flexShrink: 0 }}>{item.timestamp}</span>
                </div>
              ))}
            </div>
          )}
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
