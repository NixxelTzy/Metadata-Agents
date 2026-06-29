"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type VectorStyle = "flat" | "outline" | "both";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
type Complexity = "simple" | "medium" | "complex";
type VectorMode = "prompt" | "noprompt" | "composer";
type PanelTab = "generate" | "composer" | "magic" | "analytics" | "history";
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
    styleGuide: {
      palette: string;
      strokeWeight: string;
      typography: string;
      composition: string;
    };
  };
  prompts: GeneratedPrompt[];
  setTips: string[];
  complianceNotes: string[];
}

interface HistoryItem {
  id: string;
  timestamp: string;
  mode: VectorMode;
  style: VectorStyle;
  ratio: AspectRatio;
  conceptTitle: string;
  promptCount: number;
}

interface QueueItem {
  id: string;
  prompt: string;
  style: VectorStyle;
  status: "idle" | "processing" | "completed" | "failed";
  resultPlan?: GeneratedPlan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Bank Data
// ─────────────────────────────────────────────────────────────────────────────
const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string; w: number; h: number }[] = [
  { value: "1:1", label: "Square", icon: "⬛", w: 800, h: 800 },
  { value: "16:9", label: "Landscape", icon: "▬", w: 1200, h: 675 },
  { value: "9:16", label: "Portrait", icon: "▮", w: 675, h: 1200 },
  { value: "4:3", label: "Standard", icon: "🟫", w: 800, h: 600 },
  { value: "3:4", label: "Tall", icon: "📱", w: 600, h: 800 },
  { value: "21:9", label: "Ultrawide", icon: "🎬", w: 1400, h: 600 },
];

const STYLE_OPTIONS: { value: VectorStyle; label: string; desc: string }[] = [
  { value: "flat", label: "Flat Vector", desc: "Clean shapes, minimal depth, solid colors" },
  { value: "outline", label: "Outline / Line Art", desc: "Stroke-based, minimal fill, elegant lines" },
  { value: "both", label: "Flat + Outline", desc: "Hybrid with fills + prominent outlines" },
];

const PALETTE_PRESETS = [
  "Professional Blue & White",
  "Warm Earth Tones",
  "Pastel Gradient",
  "Monochrome Dark",
  "Vibrant Tropical",
  "Corporate Gray & Teal",
  "Soft Mint & Coral",
  "Bold Primary Colors",
];

const THEME_PRESETS = [
  "Flat Vector + Outline (Modern illustration design)",
  "Retro Flat 80s Tech & Synthwave aesthetics",
  "Kawaii Character Mascot & Cute Chibi Art",
  "Modern Isometric 3D Office Illustration Set",
  "Futuristic Neumorphic UI Design Elements"
];

const TARGET_USE_OPTIONS = [
  "Adobe Stock commercial illustration",
  "Website hero illustration",
  "Icon set / UI kit",
  "Infographic elements",
  "Social media graphic",
  "App onboarding screens",
  "Business presentation",
  "Packaging design element",
];

// Bank Data for Prompt Composer
const COMPOSER_BANK = {
  subjects: [
    "A software engineer writing code in front of multiple monitors",
    "A creative team collaborating around a whiteboard with sticky notes",
    "A couple walking their dog in a modern futuristic smart city",
    "A cute astronaut cooking ramen in outer space",
    "A sleek electric car charging at a cyber-punk station",
    "A minimalist workspace with a laptop, plant, and cup of coffee",
  ],
  aesthetics: [
    "flat design vector graphics",
    "isometric 3D vector style",
    "minimalist clean shapes",
    "detailed line art with pastel fills",
    "bold geometric lines and abstract shapes",
  ],
  backgrounds: [
    "solid modern navy background",
    "soft circle abstract gradients",
    "isolated transparent background style",
    "grid pattern floor with plant shadows",
    "subtle retro geometric sunburst pattern",
  ],
  lightings: [
    "flat isometric ambient lighting",
    "high-contrast sunset side glow",
    "futuristic neon accent highlights",
    "soft studio diffuse shadow edges",
    "monochromatic warm lighting tones",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Component
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: value ? "rgba(74,144,226,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${value ? "rgba(74,144,226,0.3)" : "var(--border)"}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 0.2s",
        userSelect: "none",
      }}
      onClick={() => onChange(!value)}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{
        width: 42,
        height: 22,
        background: value ? "#4a90e2" : "rgba(255,255,255,0.1)",
        borderRadius: 11,
        position: "relative",
        transition: "all 0.25s",
        flexShrink: 0,
        marginLeft: 12,
      }}>
        <div style={{
          position: "absolute",
          top: 2,
          left: value ? 22 : 2,
          width: 18,
          height: 18,
          background: "white",
          borderRadius: "50%",
          transition: "left 0.25s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );
}

export default function VectorCreator() {
  const [isOpen, setIsOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("generate");

  // Global settings (apply to both modes)
  const [faceless, setFaceless] = useState(false);
  const [consistency, setConsistency] = useState(true);
  const [style, setStyle] = useState<VectorStyle>("both");
  const [ratio, setRatio] = useState<AspectRatio>("1:1");
  const [colorPalette, setColorPalette] = useState("Professional Blue & White");
  const [complexity, setComplexity] = useState<Complexity>("medium");
  const [targetUse, setTargetUse] = useState("Adobe Stock commercial illustration");
  const [promptCount, setPromptCount] = useState(4);

  // General state
  const [mode, setMode] = useState<VectorMode>("noprompt");
  const [userPrompt, setUserPrompt] = useState("");
  const [savedPrompts, setSavedPrompts] = useState<string[]>([]);

  // Composer state
  const [compSubject, setCompSubject] = useState(COMPOSER_BANK.subjects[0]);
  const [compAesthetic, setCompAesthetic] = useState(COMPOSER_BANK.aesthetics[0]);
  const [compBackground, setCompBackground] = useState(COMPOSER_BANK.backgrounds[0]);
  const [compLighting, setCompLighting] = useState(COMPOSER_BANK.lightings[0]);

  // Autopilot state
  const [selectedTheme, setSelectedTheme] = useState(THEME_PRESETS[0]);
  const [customTheme, setCustomTheme] = useState("");

  // Results
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [magicIdeas, setMagicIdeas] = useState<MagicIdea[]>([]);
  const [enhancedPrompt, setEnhancedPrompt] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Live SVG comparison state
  const [beforeSvg, setBeforeSvg] = useState<string>("");
  const [afterSvg, setAfterSvg] = useState<string>("");
  const [svgTitle, setSvgTitle] = useState<string>("");
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const [downloadRes, setDownloadRes] = useState<ResolutionOpt>("2k");

  // Color sandbox tweak states
  const [detectedColors, setDetectedColors] = useState<string[]>([]);
  const [activeTweakColor, setActiveTweakColor] = useState<string>("");

  // SVG Manual Code Inspector states
  const [showCodeInspector, setShowCodeInspector] = useState(false);
  const [editableSvgCode, setEditableSvgCode] = useState("");

  // Batch Generation states
  const [batchQueue, setBatchQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Loading
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMagicking, setIsMagicking] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 2000);
    });
  };

  // Dragging slider comparison handler
  const handlePointerDown = () => {
    setIsDraggingSlider(true);
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingSlider || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(pct);
    };

    const handlePointerUp = () => {
      setIsDraggingSlider(false);
    };

    if (isDraggingSlider) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDraggingSlider]);

  // Extract unique colors from SVG to enable color tweaking sandbox
  useEffect(() => {
    if (!afterSvg) {
      setDetectedColors([]);
      return;
    }
    const matches = afterSvg.match(/#[0-9A-Fa-f]{3,8}\b/g);
    if (matches) {
      const uniqueColors = Array.from(new Set(matches.map(c => c.toLowerCase()))).slice(0, 12);
      setDetectedColors(uniqueColors);
    }
  }, [afterSvg]);

  // Tweak a specific color globally in the SVG states
  const handleColorReplace = (oldColor: string, newColor: string) => {
    const newColorHex = newColor.toLowerCase();
    const regex = new RegExp(oldColor, "gi");
    const updatedAfter = afterSvg.replace(regex, newColorHex);
    const updatedBefore = beforeSvg.replace(regex, newColorHex);
    setAfterSvg(updatedAfter);
    setBeforeSvg(updatedBefore);
    setEditableSvgCode(updatedAfter);
    setDetectedColors(prev => prev.map(c => c === oldColor ? newColorHex : c));
  };

  // Preset Filters for Vector Palette Sandbox
  const applyPaletteFilter = (filterType: "grayscale" | "cyberpunk" | "sunset" | "forest") => {
    if (!afterSvg || detectedColors.length === 0) return;

    let updatedAfter = afterSvg;
    let updatedBefore = beforeSvg;

    const filters: Record<string, string[]> = {
      cyberpunk: ["#ff007f", "#9d00ff", "#00f0ff", "#ff00aa", "#120024", "#0a0012", "#002b5c", "#3d0066"],
      sunset: ["#ff3b00", "#ff8800", "#ffcc00", "#d90036", "#2d0a00", "#54000f", "#803c00", "#380005"],
      forest: ["#0d5c3a", "#2b8c56", "#8fcc5c", "#1f3a2b", "#0a1a10", "#a2deaa", "#457551", "#223d29"],
    };

    detectedColors.forEach((color, idx) => {
      let replacement = color;
      if (filterType === "grayscale") {
        const hex = color.slice(1);
        let r = 127, g = 127, b = 127;
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        }
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b).toString(16).padStart(2, "0");
        replacement = `#${gray}${gray}${gray}`;
      } else {
        const palette = filters[filterType];
        replacement = palette[idx % palette.length];
      }

      const regex = new RegExp(color, "gi");
      updatedAfter = updatedAfter.replace(regex, replacement);
      updatedBefore = updatedBefore.replace(regex, replacement);
    });

    setAfterSvg(updatedAfter);
    setBeforeSvg(updatedBefore);
    setEditableSvgCode(updatedAfter);
  };

  const getComposedPrompt = useCallback(() => {
    return `A professional vector art of ${compSubject}, ${compAesthetic}, ${compBackground}, ${compLighting}, clean geometry, vector design assets.`;
  }, [compSubject, compAesthetic, compBackground, compLighting]);

  const handleSurpriseMe = () => {
    const rSubject = COMPOSER_BANK.subjects[Math.floor(Math.random() * COMPOSER_BANK.subjects.length)];
    const rAesthetic = COMPOSER_BANK.aesthetics[Math.floor(Math.random() * COMPOSER_BANK.aesthetics.length)];
    const rBackground = COMPOSER_BANK.backgrounds[Math.floor(Math.random() * COMPOSER_BANK.backgrounds.length)];
    const rLighting = COMPOSER_BANK.lightings[Math.floor(Math.random() * COMPOSER_BANK.lightings.length)];

    setCompSubject(rSubject);
    setCompAesthetic(rAesthetic);
    setCompBackground(rBackground);
    setCompLighting(rLighting);
    setMode("composer");
  };

  const handleGenerate = useCallback(async () => {
    setError("");
    setGeneratedPlan(null);
    setIsGenerating(true);

    const theme = customTheme.trim() || selectedTheme;
    const promptText = mode === "composer" ? getComposedPrompt() : userPrompt;

    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          payload: {
            mode: mode === "composer" ? "prompt" : mode,
            prompt: promptText,
            theme,
            style,
            ratio,
            faceless,
            consistency,
            colorPalette,
            complexity,
            targetUse,
            count: promptCount,
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text() || "Gagal menghubungi server");
      const data = await res.json();
      if (data.success && data.result) {
        setGeneratedPlan(data.result);
        if (data.result.plan?.conceptTitle) {
          setHistory((prev) => [
            {
              id: `h-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString("id-ID"),
              mode,
              style,
              ratio,
              conceptTitle: data.result.plan.conceptTitle,
              promptCount: data.result.prompts?.length ?? 0,
            },
            ...prev.slice(0, 19),
          ]);
        }
        setPanelTab("generate");
      } else {
        throw new Error(data.error || "Hasil tidak valid");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setIsGenerating(false);
    }
  }, [mode, userPrompt, getComposedPrompt, selectedTheme, customTheme, style, ratio, faceless, consistency, colorPalette, complexity, targetUse, promptCount]);

  const handleRenderSvg = async (targetPromptText: string, label: string) => {
    setError("");
    setIsGeneratingSvg(true);
    setBeforeSvg("");
    setAfterSvg("");
    setShowCodeInspector(false);

    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_svg",
          payload: {
            prompt: targetPromptText,
            theme: label,
            style,
            ratio,
            faceless,
            colorPalette,
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text() || "Gagal merender grafik vector");
      const data = await res.json();
      if (data.success && data.result) {
        setBeforeSvg(data.result.beforeSvg);
        setAfterSvg(data.result.afterSvg);
        setEditableSvgCode(data.result.afterSvg);
        setSvgTitle(data.result.title || label);
        setSliderPosition(50);
      } else {
        throw new Error(data.error || "Hasil render tidak valid");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal generate visual vector");
    } finally {
      setIsGeneratingSvg(false);
    }
  };

  const handleCreateVectorPhoto = async () => {
    const promptText = mode === "composer" ? getComposedPrompt() : userPrompt;
    const theme = customTheme.trim() || selectedTheme;
    const targetPrompt = promptText.trim() || theme;

    handleGenerate();
    handleRenderSvg(targetPrompt, theme);
  };

  const handleDownloadImage = (targetSvg: string, typeName: "before" | "after") => {
    if (!targetSvg) return;

    const currentRatioConfig = ASPECT_RATIOS.find((r) => r.value === ratio) || ASPECT_RATIOS[0];
    const baseW = currentRatioConfig.w;
    const baseH = currentRatioConfig.h;

    const cleanTitle = (svgTitle || "Vector_Asset").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const filename = `${cleanTitle}_${typeName}_${downloadRes}`;

    if (downloadRes === "svg") {
      const blob = new Blob([targetSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.svg`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const scaleMap = {
      "1k": 1024,
      "2k": 2048,
      "3k": 3072,
      "4k": 4096,
    };
    const targetWidth = scaleMap[downloadRes];
    const aspect = baseH / baseW;
    const targetHeight = Math.round(targetWidth * aspect);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, targetWidth, targetHeight);

    const img = new Image();
    const svgBlob = new Blob([targetSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${filename}.png`;
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const prettifySvgCode = () => {
    try {
      let formatted = "";
      let reg = /(>)(<)(\/*)/g;
      let xml = editableSvgCode.replace(reg, "$1\\r\\n$2$3");
      let pad = 0;
      xml.split("\\r\\n").forEach((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
          indent = 0;
        } else if (node.match(/^<\/\w/)) {
          if (pad !== 0) pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>$/)) {
          indent = 1;
        } else {
          indent = 0;
        }

        formatted += "  ".repeat(pad) + node + "\\r\\n";
        pad += indent;
      });
      setEditableSvgCode(formatted.trim());
    } catch {
    }
  };

  const cleanSvgCode = () => {
    let clean = editableSvgCode
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/metadata|defs[^\/>]*\/>/gi, "")
      .trim();
    setEditableSvgCode(clean);
    setAfterSvg(clean);
  };

  const handleMagic = useCallback(async () => {
    setError("");
    setMagicIdeas([]);
    setIsMagicking(true);
    const theme = customTheme.trim() || selectedTheme;

    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "magic",
          payload: { theme, style, faceless, count: 6 },
        }),
      });

      if (!res.ok) throw new Error(await res.text() || "Gagal menghasilkan ide");
      const data = await res.json();
      if (data.success && Array.isArray(data.ideas)) {
        setMagicIdeas(data.ideas);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setIsMagicking(false);
    }
  }, [selectedTheme, customTheme, style, faceless]);

  const handleEnhance = useCallback(async () => {
    if (!userPrompt.trim()) return;
    setError("");
    setEnhancedPrompt(null);
    setIsEnhancing(true);

    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enhance",
          payload: { prompt: userPrompt, style, ratio, faceless, colorPalette, targetUse },
        }),
      });

      if (!res.ok) throw new Error(await res.text() || "Gagal enhance prompt");
      const data = await res.json();
      if (data.success && data.enhanced) {
        setEnhancedPrompt(data.enhanced);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setIsEnhancing(false);
    }
  }, [userPrompt, style, ratio, faceless, colorPalette, targetUse]);

  const saveCurrentPrompt = () => {
    const text = mode === "composer" ? getComposedPrompt() : userPrompt;
    if (text.trim() && !savedPrompts.includes(text.trim())) {
      setSavedPrompts((prev) => [text.trim(), ...prev.slice(0, 9)]);
    }
  };

  const useIdeaAsPrompt = (idea: MagicIdea) => {
    setUserPrompt(idea.prompt);
    setMode("prompt");
    setPanelTab("generate");
  };

  const addToQueue = () => {
    const text = mode === "composer" ? getComposedPrompt() : userPrompt;
    if (!text.trim()) return;

    const newItem: QueueItem = {
      id: `q-${Date.now()}`,
      prompt: text,
      style,
      status: "idle"
    };

    setBatchQueue(prev => [...prev, newItem]);
  };

  const processBatchQueue = async () => {
    if (batchQueue.length === 0 || isProcessingQueue) return;
    setIsProcessingQueue(true);

    const updatedQueue = [...batchQueue];

    for (let i = 0; i < updatedQueue.length; i++) {
      if (updatedQueue[i].status !== "idle") continue;

      updatedQueue[i].status = "processing";
      setBatchQueue([...updatedQueue]);

      try {
        const res = await fetch("/api/vector", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            payload: {
              mode: "prompt",
              prompt: updatedQueue[i].prompt,
              style: updatedQueue[i].style,
              ratio,
              faceless,
              colorPalette,
              complexity,
              targetUse,
              count: 2,
            }
          })
        });

        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.success && data.result) {
          updatedQueue[i].status = "completed";
          updatedQueue[i].resultPlan = data.result;
        } else {
          updatedQueue[i].status = "failed";
        }
      } catch {
        updatedQueue[i].status = "failed";
      }

      setBatchQueue([...updatedQueue]);
      await new Promise(r => setTimeout(r, 1000));
    }

    setIsProcessingQueue(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>

      {/* ── Top Studio Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span>🎨</span> Platform Create Vector Photo AI
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            Buat foto berbasis vector komersial berkualitas tinggi (HD 1K-4K) otomatis dengan AI
          </p>
        </div>

        {/* Tab Navigation Pill */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 12, border: "1px solid var(--border)" }}>
          {([
            { id: "generate" as PanelTab, label: "⚡ Create Studio" },
            { id: "composer" as PanelTab, label: "⚙️ Prompt Composer" },
            { id: "magic" as PanelTab, label: "✨ Magic Ideas" },
            { id: "analytics" as PanelTab, label: "📈 Market Analytics" },
            { id: "history" as PanelTab, label: `📋 History (${history.length})` },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanelTab(t.id)}
              style={{
                padding: "8px 16px",
                background: panelTab === t.id ? "#4a90e2" : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                color: panelTab === t.id ? "white" : "var(--text-muted)",
                fontWeight: panelTab === t.id ? 800 : 500,
                fontSize: 12,
                transition: "all 0.2s"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Studio Control Bar (All Options Cleanly Arranged) ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        
        {/* Row 1: Mode & Theme / Prompt controls */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>Mode Generator:</span>
            {([
              { value: "noprompt" as VectorMode, label: "🤖 Tanpa Prompt (Autopilot)", desc: "Pilih tema otomatis" },
              { value: "prompt" as VectorMode, label: "✍️ Input Prompt (Custom)", desc: "Ketik prompt sendiri" },
            ]).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                style={{
                  padding: "8px 14px",
                  background: mode === m.value ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${mode === m.value ? "#4a90e2" : "var(--border)"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  color: mode === m.value ? "#4a90e2" : "var(--text)",
                  fontWeight: mode === m.value ? 800 : 500,
                  fontSize: 12,
                  transition: "all 0.2s",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Toggle Switches */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Faceless Toggle */}
            <div
              onClick={() => setFaceless(!faceless)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: faceless ? "rgba(255,152,0,0.12)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${faceless ? "rgba(255,152,0,0.4)" : "var(--border)"}`,
                borderRadius: 20,
                cursor: "pointer",
                userSelect: "none"
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: faceless ? "#ff9800" : "var(--text-muted)" }}>Faceless (No Face)</span>
              <div style={{ width: 32, height: 16, background: faceless ? "#ff9800" : "rgba(255,255,255,0.2)", borderRadius: 8, position: "relative", transition: "all 0.2s" }}>
                <div style={{ width: 12, height: 12, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: faceless ? 18 : 2, transition: "left 0.2s" }} />
              </div>
            </div>

            {/* Consistency Toggle */}
            <div
              onClick={() => setConsistency(!consistency)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: consistency ? "rgba(74,144,226,0.12)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${consistency ? "#4a90e2" : "var(--border)"}`,
                borderRadius: 20,
                cursor: "pointer",
                userSelect: "none"
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: consistency ? "#4a90e2" : "var(--text-muted)" }}>Consistency Mode</span>
              <div style={{ width: 32, height: 16, background: consistency ? "#4a90e2" : "rgba(255,255,255,0.2)", borderRadius: 8, position: "relative", transition: "all 0.2s" }}>
                <div style={{ width: 12, height: 12, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: consistency ? 18 : 2, transition: "left 0.2s" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Style & Aspect Ratio Selection */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Vector Style */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Style Vector Art:</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  style={{
                    padding: "10px 8px",
                    background: style === s.value ? "rgba(123,90,224,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${style === s.value ? "#7b5ae0" : "var(--border)"}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 12, color: style === s.value ? "#7b5ae0" : "var(--text)" }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{s.desc.split(',')[0]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Rasio Foto (Aspect Ratio):</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  style={{
                    padding: "8px 4px",
                    background: ratio === r.value ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${ratio === r.value ? "#4a90e2" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ fontSize: 14 }}>{r.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: ratio === r.value ? "#4a90e2" : "var(--text)", marginTop: 2 }}>{r.value}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Input Details according to Mode */}
        {mode === "noprompt" ? (
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Pilih Tema Vector Komersial (Tanpa Prompt):</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
              {THEME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSelectedTheme(t); setCustomTheme(""); }}
                  style={{
                    padding: "10px 14px",
                    background: selectedTheme === t && !customTheme ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedTheme === t && !customTheme ? "#4a90e2" : "var(--border)"}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: selectedTheme === t && !customTheme ? 800 : 500,
                    color: selectedTheme === t && !customTheme ? "#4a90e2" : "var(--text)",
                    textAlign: "left",
                    transition: "all 0.2s",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>Input Prompt Khusus Foto Vector:</label>
              <button
                type="button"
                onClick={handleMagic}
                disabled={isMagicking}
                style={{ background: "none", border: "none", color: "#7b5ae0", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                {isMagicking ? "✨ Generating..." : "✨ Magic Ideas Generator"}
              </button>
            </div>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Deskripsikan foto berbasis vector yang ingin Anda buat... (contoh: Flat vector illustration of a software developer sitting in front of monitors with code, vibrant isometric colors)"
              style={{ width: "100%", height: 90, padding: "12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, lineHeight: "1.5", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
        )}

        {/* 🚀 PRIMARY CTA BUTTON: BUAT FOTO VECTOR AI 🚀 */}
        <button
          type="button"
          onClick={handleCreateVectorPhoto}
          disabled={isGenerating || isGeneratingSvg}
          style={{
            width: "100%",
            padding: "18px",
            background: (isGenerating || isGeneratingSvg) ? "rgba(74,144,226,0.3)" : "linear-gradient(135deg, #4a90e2 0%, #7b5ae0 100%)",
            border: "none",
            borderRadius: 12,
            cursor: (isGenerating || isGeneratingSvg) ? "not-allowed" : "pointer",
            color: "white",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "0.02em",
            boxShadow: "0 6px 24px rgba(74,144,226,0.3)",
            transition: "all 0.2s"
          }}
        >
          {(isGenerating || isGeneratingSvg) ? "⏳ AI sedang membuat Foto Vector..." : "🎨 BUAT FOTO VECTOR (CREATE VECTOR PHOTO)"}
        </button>

      </div>

      {/* Error notification */}
      {error && (
        <div style={{ color: "#ff4d4f", background: "rgba(255,77,79,0.08)", padding: 14, borderRadius: 10, fontSize: 13, border: "1px solid rgba(255,77,79,0.2)" }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── 🖥️ LIVE VECTOR DISPLAY & BEFORE-AFTER SLIDER CANVAS ── */}
      {(isGeneratingSvg || beforeSvg || afterSvg) && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.06em" }}>🖼️ Hasil Visual Foto Vector (Before vs After)</div>
              <h3 style={{ margin: "4px 0 0 0", fontSize: 18, fontWeight: 900 }}>{svgTitle || "Foto Vector Commercial Asset"}</h3>
            </div>

            {afterSvg && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)" }}>Resolusi HD:</span>
                  <select
                    value={downloadRes}
                    onChange={(e) => setDownloadRes(e.target.value as ResolutionOpt)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", fontSize: 12, color: "var(--text)", fontWeight: 700 }}
                  >
                    <option value="1k">1K (1024px)</option>
                    <option value="2k">2K (2048px) - HD</option>
                    <option value="3k">3K (3072px) - Super HD</option>
                    <option value="4k">4K (4096px) - Ultra HD</option>
                    <option value="svg">SVG Original (Vector)</option>
                  </select>
                </div>

                <button
                  onClick={() => handleDownloadImage(afterSvg, "after")}
                  style={{ padding: "8px 16px", background: "linear-gradient(135deg, #4a90e2, #7b5ae0)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 800, color: "white", boxShadow: "0 2px 10px rgba(74,144,226,0.3)" }}
                >
                  🚀 Download Foto Vector ({downloadRes.toUpperCase()})
                </button>
              </div>
            )}
          </div>

          {isGeneratingSvg ? (
            <div style={{ height: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", borderRadius: 12, gap: 14 }}>
              <div style={{ fontSize: 32 }} className="animate-spin">🔄</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>Generasi AI menggambar Foto Vector Before & After...</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Draggable Slider Container */}
              <div
                ref={containerRef}
                style={{
                  position: "relative",
                  width: "100%",
                  height: 460,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#0d0d0d",
                  cursor: "ew-resize",
                  userSelect: "none",
                  border: "1px solid var(--border)"
                }}
                onPointerDown={handlePointerDown}
              >
                {/* Before Graphic (Sketch/Wireframe) */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: beforeSvg }} />

                {/* After Graphic (HD Vector Photo) */}
                <div style={{ position: "absolute", top: 0, left: 0, width: `${sliderPosition}%`, height: "100%", overflow: "hidden", borderRight: "3px solid #4a90e2", pointerEvents: "none", zIndex: 2 }}>
                  <div style={{ width: containerRef.current?.getBoundingClientRect().width || 800, height: "100%" }} dangerouslySetInnerHTML={{ __html: afterSvg }} />
                </div>

                {/* Labels */}
                <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.7)", color: "white", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 800, zIndex: 5 }}>
                  BEFORE (DRAFT SKETCH)
                </div>
                <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(74,144,226,0.9)", color: "white", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 800, zIndex: 5 }}>
                  AFTER (HD VECTOR PHOTO)
                </div>

                {/* Center Slider Bar */}
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sliderPosition}%`, width: 3, background: "#4a90e2", cursor: "ew-resize", transform: "translateX(-50%)", zIndex: 3 }}>
                  <div style={{ position: "absolute", top: "50%", left: "50%", width: 38, height: 38, background: "#4a90e2", border: "3px solid white", borderRadius: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.6)", fontSize: 12, color: "white", fontWeight: 900 }}>↔</div>
                </div>
              </div>

              {/* Color Tweak Sandbox */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>🎨 Vector Color Sandbox & Filters</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => applyPaletteFilter("grayscale")} style={{ padding: "5px 10px", fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Grayscale</button>
                    <button onClick={() => applyPaletteFilter("cyberpunk")} style={{ padding: "5px 10px", fontSize: 11, background: "rgba(157,0,255,0.15)", border: "1px solid rgba(157,0,255,0.4)", borderRadius: 6, cursor: "pointer", color: "#9d00ff", fontWeight: 800 }}>Cyberpunk</button>
                    <button onClick={() => applyPaletteFilter("sunset")} style={{ padding: "5px 10px", fontSize: 11, background: "rgba(255,59,0,0.15)", border: "1px solid rgba(255,59,0,0.4)", borderRadius: 6, cursor: "pointer", color: "#ff3b00", fontWeight: 800 }}>Sunset</button>
                    <button onClick={() => applyPaletteFilter("forest")} style={{ padding: "5px 10px", fontSize: 11, background: "rgba(43,140,86,0.15)", border: "1px solid rgba(43,140,86,0.4)", borderRadius: 6, cursor: "pointer", color: "#2b8c56", fontWeight: 800 }}>Forest</button>
                  </div>
                </div>

                {detectedColors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {detectedColors.map((color) => (
                      <div key={color} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: color, border: "1px solid rgba(255,255,255,0.2)" }} />
                        <span style={{ fontSize: 11, fontFamily: "monospace" }}>{color}</span>
                        <input type="color" value={color} onChange={(e) => handleColorReplace(color, e.target.value)} style={{ width: 22, height: 18, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Generated Plan Prompts Output ── */}
      {generatedPlan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>📝 Prompts & Commercial Metadata ({generatedPlan.prompts?.length ?? 0})</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 14 }}>
            {(generatedPlan.prompts || []).map((p, idx) => (
              <div key={p.id || idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>#{idx + 1} {p.label}</span>
                  <button onClick={() => copyToClipboard(p.prompt, p.id)} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    {copiedId === p.id ? "✓ Disalin" : "📋 Copy Prompt"}
                  </button>
                </div>
                <div style={{ background: "rgba(74,144,226,0.05)", padding: 12, borderRadius: 8, fontSize: 12, lineHeight: "1.5", marginBottom: 12 }}>
                  {p.prompt}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>ADOBE STOCK TITLE</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{p.metadata?.title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(p.metadata?.keywords || []).slice(0, 10).map((k: string) => (
                    <span key={k} className="keyword-tag" style={{ fontSize: 10 }}>{k}</span>
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
