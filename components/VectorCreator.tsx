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

// ─────────────────────────────────────────────────────────────────────────────
// Main VectorCreator Component
// ─────────────────────────────────────────────────────────────────────────────
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
    // Match hex colors (e.g. #fff, #ffffff, #AABBCC)
    const matches = afterSvg.match(/#[0-9A-Fa-f]{3,8}\b/g);
    if (matches) {
      const uniqueColors = Array.from(new Set(matches.map(c => c.toLowerCase()))).slice(0, 12);
      setDetectedColors(uniqueColors);
    }
  }, [afterSvg]);

  // Tweak a specific color globally in the SVG states
  const handleColorReplace = (oldColor: string, newColor: string) => {
    const newColorHex = newColor.toLowerCase();
    // Replace in before & after SVG
    const regex = new RegExp(oldColor, "gi");
    const updatedAfter = afterSvg.replace(regex, newColorHex);
    const updatedBefore = beforeSvg.replace(regex, newColorHex);
    setAfterSvg(updatedAfter);
    setBeforeSvg(updatedBefore);
    setEditableSvgCode(updatedAfter);

    // Update color list
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
        // Calculate basic grayscale representation of the color hex
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

  // Compile full composed prompt from prompt builder
  const getComposedPrompt = useCallback(() => {
    return `A professional vector art of ${compSubject}, ${compAesthetic}, ${compBackground}, ${compLighting}, clean geometry, vector design assets.`;
  }, [compSubject, compAesthetic, compBackground, compLighting]);

  // Surprise Me! - Randomize Composer Parameters
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

  // ─── GENERATE PLAN ──────────────────────────────────────────────────────────
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
        // Save to history
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

  // ─── GENERATE SVG (BEFORE-AFTER PREVIEW) ───────────────────────────────────
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

  // ─── DOWNLOAD RESOLUTION SYSTEM (HD CANVAS RENDERER) ────────────────────────
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

  // Format / Indent SVG code manually (Prettify XML)
  const prettifySvgCode = () => {
    try {
      let formatted = "";
      let reg = /(>)(<)(\/*)/g;
      let xml = editableSvgCode.replace(reg, "$1\r\n$2$3");
      let pad = 0;
      xml.split("\r\n").forEach((node) => {
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

        formatted += "  ".repeat(pad) + node + "\r\n";
        pad += indent;
      });
      setEditableSvgCode(formatted.trim());
    } catch {
      // ignore formatting if failed
    }
  };

  // Clean SVG tag structure
  const cleanSvgCode = () => {
    let clean = editableSvgCode
      .replace(/<!--[\s\S]*?-->/g, "") // remove comments
      .replace(/metadata|defs[^\/>]*\/>/gi, "") // clean metadata
      .trim();
    setEditableSvgCode(clean);
    setAfterSvg(clean);
  };

  // ─── MAGIC IDEAS ────────────────────────────────────────────────────────────
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

  // ─── ENHANCE PROMPT ─────────────────────────────────────────────────────────
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

  // ─── BATCH QUEUE SYSTEM ─────────────────────────────────────────────────────
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
              count: 2, // low count for batch processing speed
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
      // small delay between calls
      await new Promise(r => setTimeout(r, 1000));
    }

    setIsProcessingQueue(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "linear-gradient(135deg, rgba(74,144,226,0.15) 0%, rgba(123,90,224,0.1) 100%)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎨</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Vector Creator AI Pro</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Adobe Stock Engine · SVG Sandbox · Before/After Viewer</div>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.01)", overflowX: "auto" }}>
        {([
          { id: "generate" as PanelTab, label: "⚡ Generator" },
          { id: "composer" as PanelTab, label: "⚙️ Composer" },
          { id: "magic" as PanelTab, label: "✨ Magic Ideas" },
          { id: "analytics" as PanelTab, label: "📈 Analytics" },
          { id: "history" as PanelTab, label: `📋 History (${history.length})` },
        ]).map((t) => (
          <button key={t.id} type="button" onClick={() => setPanelTab(t.id)} style={{ flexShrink: 0, padding: "12px 22px", background: panelTab === t.id ? "rgba(74,144,226,0.08)" : "transparent", border: "none", borderBottom: panelTab === t.id ? "2px solid #4a90e2" : "2px solid transparent", cursor: "pointer", color: panelTab === t.id ? "#4a90e2" : "var(--text-muted)", fontWeight: panelTab === t.id ? 800 : 500, fontSize: 12, transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Compact Settings Bar ── */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Row 1: Mode · Style · Ratio · Complexity · Count */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>

          {/* Mode */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginRight: 3 }}>MODE</span>
            {([{ value: "prompt" as VectorMode, label: "✍️ Custom" }, { value: "noprompt" as VectorMode, label: "🤖 Auto" }]).map((m) => (
              <button key={m.value} type="button" onClick={() => setMode(m.value)} style={{ padding: "5px 11px", background: mode === m.value ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.03)", border: `1px solid ${mode === m.value ? "rgba(74,144,226,0.5)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: mode === m.value ? "#4a90e2" : "var(--text-muted)", fontWeight: mode === m.value ? 800 : 500, fontSize: 11, whiteSpace: "nowrap", transition: "all 0.2s" }}>
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Style */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginRight: 3 }}>STYLE</span>
            {STYLE_OPTIONS.map((s) => (
              <button key={s.value} type="button" onClick={() => setStyle(s.value)} style={{ padding: "5px 10px", background: style === s.value ? "rgba(123,90,224,0.2)" : "rgba(255,255,255,0.03)", border: `1px solid ${style === s.value ? "rgba(123,90,224,0.5)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: style === s.value ? "#7b5ae0" : "var(--text-muted)", fontWeight: style === s.value ? 800 : 500, fontSize: 11, whiteSpace: "nowrap", transition: "all 0.2s" }}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Ratio */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginRight: 3 }}>RASIO</span>
            {ASPECT_RATIOS.map((r) => (
              <button key={r.value} type="button" onClick={() => setRatio(r.value)} style={{ padding: "5px 9px", background: ratio === r.value ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.03)", border: `1px solid ${ratio === r.value ? "rgba(74,144,226,0.5)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: ratio === r.value ? "#4a90e2" : "var(--text-muted)", fontWeight: ratio === r.value ? 800 : 500, fontSize: 11, whiteSpace: "nowrap", transition: "all 0.2s" }}>
                {r.value}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Complexity */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginRight: 3 }}>KOMPLEKSITAS</span>
            {(["simple", "medium", "complex"] as Complexity[]).map((c) => (
              <button key={c} type="button" onClick={() => setComplexity(c)} style={{ padding: "5px 10px", background: complexity === c ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${complexity === c ? "rgba(76,175,80,0.4)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: complexity === c ? "#4caf50" : "var(--text-muted)", fontWeight: complexity === c ? 800 : 500, fontSize: 11, textTransform: "capitalize", transition: "all 0.2s" }}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Prompt count */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginRight: 3 }}>JUMLAH PROMPT</span>
            {[2, 4, 6, 8].map((n) => (
              <button key={n} type="button" onClick={() => setPromptCount(n)} style={{ padding: "5px 9px", background: promptCount === n ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.03)", border: `1px solid ${promptCount === n ? "rgba(74,144,226,0.5)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: promptCount === n ? "#4a90e2" : "var(--text-muted)", fontWeight: promptCount === n ? 800 : 500, fontSize: 11, transition: "all 0.2s" }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Toggles + Dropdowns */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

          {/* Faceless Toggle */}
          <button type="button" onClick={() => setFaceless(!faceless)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 13px", background: faceless ? "rgba(255,152,0,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${faceless ? "rgba(255,152,0,0.4)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: faceless ? 800 : 500, color: faceless ? "#ff9800" : "var(--text-muted)", transition: "all 0.2s" }}>
            <div style={{ width: 28, height: 14, background: faceless ? "#ff9800" : "rgba(255,255,255,0.1)", borderRadius: 7, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: faceless ? 16 : 2, width: 10, height: 10, background: "white", borderRadius: "50%", transition: "left 0.2s" }} />
            </div>
            Faceless Mode
          </button>

          {/* Consistency Toggle */}
          <button type="button" onClick={() => setConsistency(!consistency)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 13px", background: consistency ? "rgba(74,144,226,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${consistency ? "rgba(74,144,226,0.4)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: consistency ? 800 : 500, color: consistency ? "#4a90e2" : "var(--text-muted)", transition: "all 0.2s" }}>
            <div style={{ width: 28, height: 14, background: consistency ? "#4a90e2" : "rgba(255,255,255,0.1)", borderRadius: 7, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: consistency ? 16 : 2, width: 10, height: 10, background: "white", borderRadius: "50%", transition: "left 0.2s" }} />
            </div>
            Konsistensi Warna
          </button>

          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Palette */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>PALETTE:</span>
            <select value={colorPalette} onChange={(e) => setColorPalette(e.target.value)} style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, color: "var(--text)" }}>
              {PALETTE_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Target Use */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>TARGET:</span>
            <select value={targetUse} onChange={(e) => setTargetUse(e.target.value)} style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, color: "var(--text)" }}>
              {TARGET_USE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Main Content — Full Width ── */}
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

        {error && (
          <div style={{ color: "#ff4d4f", background: "rgba(255,77,79,0.08)", padding: 12, borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,77,79,0.2)" }}>⚠️ {error}</div>
        )}

        {/* ═══════════════════════════════════════
            TAB: GENERATOR
        ═══════════════════════════════════════ */}
        {panelTab === "generate" && (
          <>
            {/* Custom Prompt Mode */}
            {mode === "prompt" && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.01)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: "#4a90e2" }}>✍️ Custom Prompt Mode</div>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Deskripsikan konsep vector yang ingin dibuat... (contoh: A minimalist flat vector illustration of a person working on a laptop in a cozy home office, surrounded by plants and warm lighting)"
                  style={{ width: "100%", minHeight: 100, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, lineHeight: "1.5", resize: "vertical", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={handleEnhance} disabled={isEnhancing || !userPrompt.trim()} style={{ padding: "8px 14px", background: "rgba(123,90,224,0.12)", border: "1px solid rgba(123,90,224,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#7b5ae0" }}>
                    {isEnhancing ? "⏳ Enhancing..." : "✨ Enhance Prompt"}
                  </button>
                  <button type="button" onClick={saveCurrentPrompt} disabled={!userPrompt.trim()} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
                    💾 Simpan Prompt
                  </button>
                  <button type="button" onClick={addToQueue} disabled={!userPrompt.trim()} style={{ padding: "8px 14px", background: "rgba(74,144,226,0.12)", border: "1px solid rgba(74,144,226,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#4a90e2" }}>
                    📥 Add to Batch Queue
                  </button>
                </div>

                {enhancedPrompt && (
                  <div style={{ marginTop: 12, padding: 12, background: "rgba(123,90,224,0.06)", border: "1px solid rgba(123,90,224,0.2)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7b5ae0", marginBottom: 8 }}>✨ Enhanced Prompt</div>
                    <p style={{ fontSize: 13, margin: "0 0 10px 0", lineHeight: "1.5" }}>{enhancedPrompt.enhanced}</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setUserPrompt(enhancedPrompt.enhanced); setEnhancedPrompt(null); }} style={{ padding: "6px 12px", background: "#7b5ae0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "white" }}>Gunakan Prompt Ini</button>
                      <button type="button" onClick={() => copyToClipboard(enhancedPrompt.enhanced, "enhanced")} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
                        {copiedId === "enhanced" ? "✓ Disalin!" : "📋 Copy"}
                      </button>
                    </div>
                  </div>
                )}

                {savedPrompts.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8 }}>📋 Saved Prompts</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {savedPrompts.map((p, i) => (
                        <button key={i} type="button" onClick={() => setUserPrompt(p)} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.slice(0, 45)}…
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Autopilot Mode */}
            {mode === "noprompt" && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.01)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 12, color: "#4a90e2" }}>🤖 Autopilot — Pilih Tema Komersial</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
                  {THEME_PRESETS.map((t) => (
                    <button key={t} type="button" onClick={() => { setSelectedTheme(t); setCustomTheme(""); }} style={{ padding: "10px 14px", background: selectedTheme === t && !customTheme ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)", border: `1px solid ${selectedTheme === t && !customTheme ? "rgba(74,144,226,0.4)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: selectedTheme === t && !customTheme ? 800 : 500, color: selectedTheme === t && !customTheme ? "#4a90e2" : "var(--text-muted)", textAlign: "left", transition: "all 0.2s" }}>
                      {t}
                    </button>
                  ))}
                </div>
                <input value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} placeholder="Atau ketik tema kustom sendiri..." style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text)", boxSizing: "border-box" }} />
              </div>
            )}

            {/* Generate Button */}
            <button type="button" onClick={handleGenerate} disabled={isGenerating} style={{ width: "100%", padding: "16px", background: isGenerating ? "rgba(74,144,226,0.3)" : "linear-gradient(135deg, #4a90e2, #7b5ae0)", border: "none", borderRadius: 12, cursor: isGenerating ? "not-allowed" : "pointer", color: "white", fontWeight: 900, fontSize: 16, letterSpacing: "0.03em", transition: "all 0.2s", boxShadow: isGenerating ? "none" : "0 4px 20px rgba(74,144,226,0.25)" }}>
              {isGenerating ? "⏳ AI sedang merancang vector plan..." : "🚀 Generate Vector Plan"}
            </button>

            {/* Batch Queue */}
            {batchQueue.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)" }}>📋 Batch Queue ({batchQueue.length})</span>
                  <button onClick={processBatchQueue} disabled={isProcessingQueue} style={{ padding: "5px 12px", background: "#4a90e2", border: "none", borderRadius: 6, color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                    {isProcessingQueue ? "⏳ Processing..." : "▶ Process Queue"}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 120, overflowY: "auto" }}>
                  {batchQueue.map((item, idx) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <span style={{ fontSize: 12 }}>#{idx + 1}: {item.prompt.slice(0, 60)}…</span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700, background: item.status === "completed" ? "rgba(76,175,80,0.15)" : item.status === "processing" ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.05)", color: item.status === "completed" ? "#4caf50" : item.status === "processing" ? "#ff9800" : "var(--text-muted)" }}>{item.status.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generated Plan Output */}
            {generatedPlan && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Concept Overview */}
                <div style={{ background: "linear-gradient(135deg, rgba(74,144,226,0.08), rgba(123,90,224,0.05))", border: "1px solid rgba(74,144,226,0.25)", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>🎯 Concept Overview</div>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: 20, fontWeight: 900 }}>{generatedPlan.plan?.conceptTitle}</h3>
                  <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "var(--text-muted)", lineHeight: "1.6" }}>{generatedPlan.plan?.commercialHook}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                    {Object.entries(generatedPlan.plan?.styleGuide || {}).map(([k, v]) => (
                      <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{k}</div>
                        <div style={{ fontSize: 12, marginTop: 3 }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tips & Compliance */}
                {(generatedPlan.setTips?.length > 0 || generatedPlan.complianceNotes?.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {generatedPlan.setTips?.length > 0 && (
                      <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8 }}>💡 Set Tips</div>
                        {generatedPlan.setTips.map((tip: string, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0", borderBottom: i < generatedPlan.setTips.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>• {tip}</div>
                        ))}
                      </div>
                    )}
                    {generatedPlan.complianceNotes?.length > 0 && (
                      <div style={{ background: "rgba(255,152,0,0.04)", border: "1px solid rgba(255,152,0,0.2)", borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#ff9800", marginBottom: 8 }}>⚠️ Compliance Notes</div>
                        {generatedPlan.complianceNotes.map((note: string, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>• {note}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt Cards */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.06em" }}>
                    📝 Generated Prompts ({generatedPlan.prompts?.length ?? 0})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 12 }}>
                    {(generatedPlan.prompts || []).map((p, idx) => (
                      <div key={p.id || idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#4a90e2" }}>#{idx + 1}</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</span>
                          </div>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button type="button" onClick={() => handleRenderSvg(p.prompt, p.label)} style={{ padding: "5px 12px", background: "rgba(74,144,226,0.15)", border: "1px solid rgba(74,144,226,0.3)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#4a90e2" }}>🎨 Render Visual</button>
                            <button type="button" onClick={() => copyToClipboard(p.prompt, p.id)} style={{ padding: "5px 10px", background: copiedId === p.id ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: copiedId === p.id ? "#4caf50" : "var(--text-muted)" }}>
                              {copiedId === p.id ? "✓" : "📋"}
                            </button>
                          </div>
                        </div>

                        <div style={{ background: "rgba(74,144,226,0.04)", border: "1px solid rgba(74,144,226,0.15)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: "#4a90e2", fontWeight: 700, marginBottom: 4 }}>PROMPT</div>
                          <p style={{ fontSize: 12, margin: 0, lineHeight: "1.5" }}>{p.prompt}</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 3 }}>ADOBE STOCK TITLE</div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{p.metadata?.title}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 3 }}>SPECS</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.technicalSpec?.ratio} · {p.technicalSpec?.complexity} · {p.technicalSpec?.colorCount} warna</div>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 6 }}>KEYWORDS ({p.metadata?.keywords?.length ?? 0})</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(p.metadata?.keywords || []).slice(0, 14).map((k: string) => (
                              <span key={k} className="keyword-tag" style={{ fontSize: 10 }}>{k}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════
            SVG BEFORE/AFTER VIEWER
            (muncul di semua tab saat ada SVG)
        ═══════════════════════════════════════ */}
        {(isGeneratingSvg || beforeSvg || afterSvg) && (
          <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.05em" }}>🖥️ Vector Sandbox — Before / After Editor</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{svgTitle || "Memproses asset..."}</div>
              </div>
              {afterSvg && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <select value={downloadRes} onChange={(e) => setDownloadRes(e.target.value as ResolutionOpt)} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, fontWeight: 700, color: "var(--text)" }}>
                    <option value="1k">1K (1024px)</option>
                    <option value="2k">2K (2048px)</option>
                    <option value="3k">3K (3072px)</option>
                    <option value="4k">4K Ultra HD</option>
                    <option value="svg">SVG (Vector Asli)</option>
                  </select>
                  <button onClick={() => handleDownloadImage(beforeSvg, "before")} style={{ padding: "6px 13px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>💾 Download Before</button>
                  <button onClick={() => handleDownloadImage(afterSvg, "after")} style={{ padding: "6px 13px", background: "linear-gradient(135deg, #4a90e2, #7b5ae0)", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "white" }}>🚀 Download After</button>
                </div>
              )}
            </div>

            {isGeneratingSvg && (
              <div style={{ height: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", borderRadius: 12, gap: 12 }}>
                <div style={{ fontSize: 30 }} className="animate-spin">🔄</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Menggambar vektor Before & After… (5-10 detik)</div>
              </div>
            )}

            {!isGeneratingSvg && beforeSvg && afterSvg && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Slider */}
                <div ref={containerRef} style={{ position: "relative", width: "100%", height: 440, borderRadius: 12, overflow: "hidden", background: "#0d0d0d", cursor: "ew-resize", userSelect: "none" }} onPointerDown={handlePointerDown}>
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: beforeSvg }} />
                  <div style={{ position: "absolute", top: 0, left: 0, width: `${sliderPosition}%`, height: "100%", overflow: "hidden", borderRight: "2px solid #4a90e2", pointerEvents: "none", zIndex: 2 }}>
                    <div style={{ width: containerRef.current?.getBoundingClientRect().width || 800, height: "100%" }} dangerouslySetInnerHTML={{ __html: afterSvg }} />
                  </div>
                  <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.65)", color: "white", padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, zIndex: 5 }}>BEFORE (WIREFRAME)</div>
                  <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(74,144,226,0.85)", color: "white", padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, zIndex: 5 }}>AFTER (HD VECTOR)</div>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sliderPosition}%`, width: 2, background: "#4a90e2", cursor: "ew-resize", transform: "translateX(-50%)", zIndex: 3 }}>
                    <div style={{ position: "absolute", top: "50%", left: "50%", width: 36, height: 36, background: "#4a90e2", border: "3px solid white", borderRadius: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.5)", fontSize: 11, color: "white", fontWeight: 900 }}>↔</div>
                  </div>
                </div>

                {/* Color Sandbox */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)" }}>🎨 Color Tweak Sandbox</span>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => applyPaletteFilter("grayscale")} style={{ padding: "4px 9px", fontSize: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>Grayscale</button>
                      <button onClick={() => applyPaletteFilter("cyberpunk")} style={{ padding: "4px 9px", fontSize: 10, background: "rgba(157,0,255,0.12)", border: "1px solid rgba(157,0,255,0.3)", borderRadius: 4, cursor: "pointer", color: "#9d00ff", fontWeight: 700 }}>Cyberpunk</button>
                      <button onClick={() => applyPaletteFilter("sunset")} style={{ padding: "4px 9px", fontSize: 10, background: "rgba(255,59,0,0.12)", border: "1px solid rgba(255,59,0,0.3)", borderRadius: 4, cursor: "pointer", color: "#ff3b00", fontWeight: 700 }}>Sunset</button>
                      <button onClick={() => applyPaletteFilter("forest")} style={{ padding: "4px 9px", fontSize: 10, background: "rgba(43,140,86,0.12)", border: "1px solid rgba(43,140,86,0.3)", borderRadius: 4, cursor: "pointer", color: "#2b8c56", fontWeight: 700 }}>Forest</button>
                    </div>
                  </div>
                  {detectedColors.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tidak ada warna terdeteksi di SVG ini.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {detectedColors.map((color) => (
                        <div key={color} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, background: color, border: "1px solid rgba(255,255,255,0.15)" }} />
                          <span style={{ fontSize: 10, fontFamily: "monospace" }}>{color}</span>
                          <input type="color" value={color} onChange={(e) => handleColorReplace(color, e.target.value)} style={{ width: 20, height: 16, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SVG Code Inspector */}
                <div>
                  <button type="button" onClick={() => setShowCodeInspector(!showCodeInspector)} style={{ background: "none", border: "none", color: "#4a90e2", fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                    {showCodeInspector ? "▼ Tutup SVG Inspector" : "▶ SVG Code Inspector & Editor Manual"}
                  </button>
                  {showCodeInspector && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea value={editableSvgCode} onChange={(e) => { setEditableSvgCode(e.target.value); setAfterSvg(e.target.value); }} style={{ width: "100%", height: 200, padding: 10, borderRadius: 8, background: "#0d0d0d", color: "#4af2a1", fontFamily: "monospace", fontSize: 11, border: "1px solid var(--border)", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={prettifySvgCode} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Prettify Code</button>
                        <button onClick={cleanSvgCode} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Clean Metadata</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB: PROMPT COMPOSER
        ═══════════════════════════════════════ */}
        {panelTab === "composer" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, border: "1px solid var(--border)", borderRadius: 12, padding: 18, background: "rgba(255,255,255,0.01)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#4a90e2" }}>⚙️ Advanced Prompt Composer</span>
              <button onClick={handleSurpriseMe} style={{ padding: "7px 16px", background: "linear-gradient(135deg, #7b5ae0, #4a90e2)", border: "none", borderRadius: 20, color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>🎲 Surprise Me!</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "1. Subject & Scene", state: compSubject, setter: setCompSubject, options: COMPOSER_BANK.subjects },
                { label: "2. Aesthetic & Layout", state: compAesthetic, setter: setCompAesthetic, options: COMPOSER_BANK.aesthetics },
                { label: "3. Background Design", state: compBackground, setter: setCompBackground, options: COMPOSER_BANK.backgrounds },
                { label: "4. Shading & Lighting", state: compLighting, setter: setCompLighting, options: COMPOSER_BANK.lightings },
              ].map(({ label, state, setter, options }) => (
                <div key={label}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 5, fontWeight: 600 }}>{label}</label>
                  <select value={state} onChange={(e) => setter(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(74,144,226,0.05)", border: "1px solid rgba(74,144,226,0.2)", borderRadius: 10, padding: 14 }}>
              <span style={{ fontSize: 10, color: "#4a90e2", fontWeight: 700, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Composed Prompt Preview</span>
              <p style={{ fontSize: 13, margin: 0, lineHeight: "1.6", color: "var(--text)" }}>{getComposedPrompt()}</p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setMode("composer"); setPanelTab("generate"); }} style={{ flex: 1, padding: "11px", background: "#4a90e2", border: "none", borderRadius: 8, color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Gunakan Prompt Ini → Generate</button>
              <button onClick={addToQueue} style={{ padding: "11px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>📥 Add to Queue</button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB: MAGIC IDEAS
        ═══════════════════════════════════════ */}
        {panelTab === "magic" && (
          <>
            <div style={{ background: "linear-gradient(135deg, rgba(123,90,224,0.08), rgba(74,144,226,0.05))", border: "1px solid rgba(123,90,224,0.2)", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#7b5ae0", marginBottom: 6 }}>✨ Magic Ideas Generator</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px 0" }}>AI menghasilkan 6 konsep vector komersial siap pakai berdasarkan tema & style yang aktif.</p>
              <button type="button" onClick={handleMagic} disabled={isMagicking} style={{ width: "100%", padding: "14px", background: isMagicking ? "rgba(123,90,224,0.3)" : "linear-gradient(135deg, #7b5ae0, #4a90e2)", border: "none", borderRadius: 10, cursor: isMagicking ? "not-allowed" : "pointer", color: "white", fontWeight: 900, fontSize: 15, boxShadow: isMagicking ? "none" : "0 4px 20px rgba(123,90,224,0.3)" }}>
                {isMagicking ? "✨ AI sedang brainstorming..." : "✨ Generate Magic Ideas"}
              </button>
            </div>

            {magicIdeas.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {magicIdeas.map((idea, idx) => (
                  <div key={idea.id || idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", background: idea.difficulty === "Easy" ? "rgba(76,175,80,0.1)" : idea.difficulty === "Medium" ? "rgba(255,152,0,0.1)" : "rgba(255,77,79,0.1)", color: idea.difficulty === "Easy" ? "#4caf50" : idea.difficulty === "Medium" ? "#ff9800" : "#ff4d4f", borderRadius: 4, fontWeight: 700 }}>{idea.difficulty}</span>
                      <span style={{ fontSize: 10, color: "#4caf50", fontWeight: 800 }}>{idea.estimatedSales}</span>
                    </div>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 800 }}>{idea.title}</h4>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px 0", lineHeight: "1.5", flex: 1 }}>{idea.description}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                      {(idea.tags || []).slice(0, 5).map((tag: string) => (
                        <span key={tag} className="keyword-tag" style={{ fontSize: 9 }}>{tag}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => useIdeaAsPrompt(idea)} style={{ width: "100%", padding: "8px", background: "rgba(74,144,226,0.12)", border: "1px solid rgba(74,144,226,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#4a90e2", transition: "all 0.2s" }}>
                      Gunakan Ide Ini →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════
            TAB: ANALYTICS
        ═══════════════════════════════════════ */}
        {panelTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#4a90e2", marginBottom: 4 }}>📊 Stock Market Commercial Analytics</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Analisis pasar untuk konsep vector yang sedang aktif.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {[
                { label: "ESTIMATED STOCK RATING", value: generatedPlan ? "94 / 100" : "—", color: "#4caf50" },
                { label: "MARKET DEMAND", value: generatedPlan ? "Very High 🔥" : "—", color: "#ff9800" },
                { label: "COMPETITION INDEX", value: generatedPlan ? "Low Saturation" : "—", color: "#4a90e2" },
                { label: "EST. LICENSE PRICE", value: generatedPlan ? "$12–$35" : "—", color: "#7b5ae0" },
              ].map((m) => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block", fontWeight: 700, marginBottom: 4 }}>{m.label}</span>
                  <strong style={{ fontSize: 20, color: m.color }}>{m.value}</strong>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 12, fontWeight: 700 }}>CATEGORY TAG DISTRIBUTION</span>
              {generatedPlan ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[{ label: "Conceptual Keywords", pct: 40, color: "#4a90e2" }, { label: "Descriptive Tagging", pct: 35, color: "#7b5ae0" }, { label: "Commercial Intent", pct: 25, color: "#4caf50" }].map((bar) => (
                    <div key={bar.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                        <span>{bar.label}</span>
                        <span style={{ fontWeight: 700 }}>{bar.pct}%</span>
                      </div>
                      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: bar.color, width: `${bar.pct}%`, borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Belum ada plan aktif. Generate plan terlebih dahulu.</div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB: HISTORY
        ═══════════════════════════════════════ */}
        {panelTab === "history" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-muted)", marginBottom: 14 }}>📋 Riwayat Generate</div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "50px 0" }}>Belum ada riwayat. Coba generate vector terlebih dahulu.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {history.map((h) => (
                  <div key={h.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{h.timestamp}</span>
                      <div style={{ display: "flex", gap: 5 }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(74,144,226,0.1)", color: "#4a90e2", borderRadius: 4, fontWeight: 700 }}>{h.style}</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>{h.ratio}</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.conceptTitle}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{h.promptCount} prompts · Mode: {h.mode}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        background: "linear-gradient(135deg, rgba(74,144,226,0.15) 0%, rgba(123,90,224,0.1) 100%)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎨</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>Vector Creator AI Pro</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Workspace & Sandbox Editor · Adobe Stock Engine</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, padding: 4 }}
        >
          ✕
        </button>
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.01)" }}>
        {[
          { id: "generate" as PanelTab, label: "⚡ Plan Workspace", },
          { id: "composer" as PanelTab, label: "⚙️ Prompt Composer", },
          { id: "magic" as PanelTab, label: "✨ Magic Ideas", },
          { id: "analytics" as PanelTab, label: "📈 Stock Analytics", },
          { id: "history" as PanelTab, label: `📋 History (${history.length})`, },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPanelTab(t.id)}
            style={{
              flex: 1,
              padding: "12px 14px",
              background: panelTab === t.id ? "rgba(74,144,226,0.08)" : "transparent",
              border: "none",
              borderBottom: panelTab === t.id ? "2px solid #4a90e2" : "2px solid transparent",
              cursor: "pointer",
              color: panelTab === t.id ? "#4a90e2" : "var(--text-muted)",
              fontWeight: panelTab === t.id ? 800 : 500,
              fontSize: 12,
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", minHeight: 0 }}>
        
        {/* ── LEFT: Settings Panel ── */}
        <div style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: 800,
        }}>

          {/* Mode Selector */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Vector Mode</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {([
                { value: "prompt", label: "Custom Prompt", icon: "✍️" },
                { value: "noprompt", label: "Auto (Autopilot)", icon: "🤖" },
              ] as const).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => { setMode(m.value); if (m.value === "prompt" && panelTab === "composer") setPanelTab("generate"); }}
                  style={{
                    padding: "8px 10px",
                    background: mode === m.value ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${mode === m.value ? "rgba(74,144,226,0.4)" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    color: mode === m.value ? "#4a90e2" : "var(--text)",
                    fontWeight: mode === m.value ? 800 : 500,
                    fontSize: 11,
                    textAlign: "center",
                    transition: "all 0.2s",
                  }}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Global Toggles */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Constraints & Controls</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Toggle
                value={faceless}
                onChange={setFaceless}
                label="Faceless (No Face) Mode"
                desc="Karakter tanpa wajah untuk kelayakan legalitas stock"
              />
              <Toggle
                value={consistency}
                onChange={setConsistency}
                label="Strict Color Consistency"
                desc="Pertahankan palette warna konseptual antarseluruh shot"
              />
            </div>
          </div>

          {/* Style */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Vector Aesthetic Style</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  style={{
                    padding: "9px 12px",
                    background: style === s.value ? "rgba(74,144,226,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${style === s.value ? "rgba(74,144,226,0.35)" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: style === s.value ? "#4a90e2" : "var(--text)" }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Aspek Rasio Vector</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  style={{
                    padding: "8px 6px",
                    background: ratio === r.value ? "rgba(74,144,226,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${ratio === r.value ? "rgba(74,144,226,0.35)" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 14 }}>{r.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ratio === r.value ? "#4a90e2" : "var(--text)", marginTop: 2 }}>{r.value}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{r.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Complexity */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Tingkat Kompleksitas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              {(["simple", "medium", "complex"] as Complexity[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setComplexity(c)}
                  style={{
                    padding: "7px 4px",
                    background: complexity === c ? "rgba(74,144,226,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${complexity === c ? "rgba(74,144,226,0.35)" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: complexity === c ? 800 : 500,
                    color: complexity === c ? "#4a90e2" : "var(--text)",
                    textTransform: "capitalize",
                    transition: "all 0.2s",
                  }}
                >
                  {c === "simple" ? "🟢" : c === "medium" ? "🟡" : "🔴"} {c}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette Presets */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Color Scheme</div>
            <select
              value={colorPalette}
              onChange={(e) => setColorPalette(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text)" }}
            >
              {PALETTE_PRESETS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Target Use */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Target Penggunaan</div>
            <select
              value={targetUse}
              onChange={(e) => setTargetUse(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text)" }}
            >
              {TARGET_USE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Prompt Count */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>Jumlah Prompt</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
              {[2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPromptCount(n)}
                  style={{
                    padding: "7px 4px",
                    background: promptCount === n ? "rgba(74,144,226,0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${promptCount === n ? "rgba(74,144,226,0.35)" : "var(--border)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: promptCount === n ? 800 : 500,
                    color: promptCount === n ? "#4a90e2" : "var(--text)",
                    transition: "all 0.2s",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Main Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxHeight: 800 }}>
          
          {error && (
            <div style={{ color: "#ff4d4f", background: "rgba(255,77,79,0.08)", padding: 12, borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,77,79,0.2)" }}>
              ⚠️ {error}
            </div>
          )}

          {/* 🖥️ DYNAMIC LIVE SVG VISUALIZER (BEFORE-AFTER SLIDER) */}
          {(isGeneratingSvg || beforeSvg || afterSvg) && (
            <div style={{
              background: "rgba(255,255,255,0.01)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#4a90e2" }}>🖥️ DYNAMIC VECTOR SANDBOX EDITOR</div>
                  <div style={{ fontSize: 13, fontWeight: 750, marginTop: 2 }}>{svgTitle || "Memproses asset..."}</div>
                </div>
                {afterSvg && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <label style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>RESOLUSI DOWNLOAD</label>
                      <select
                        value={downloadRes}
                        onChange={(e) => setDownloadRes(e.target.value as ResolutionOpt)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, color: "var(--text)", fontWeight: 700 }}
                      >
                        <option value="1k">1K (1024px)</option>
                        <option value="2k">2K (2048px) - Standar</option>
                        <option value="3k">3K (3072px)</option>
                        <option value="4k">4K (4096px) - Ultra HD</option>
                        <option value="svg">SVG (Asli / Vector)</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
                      <button
                        onClick={() => handleDownloadImage(beforeSvg, "before")}
                        style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                      >
                        💾 Download Before
                      </button>
                      <button
                        onClick={() => handleDownloadImage(afterSvg, "after")}
                        style={{ padding: "6px 12px", background: "linear-gradient(135deg, #4a90e2, #7b5ae0)", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "white" }}
                      >
                        🚀 Download After
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isGeneratingSvg && (
                <div style={{
                  height: 350,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: 10,
                  gap: 10
                }}>
                  <div style={{ fontSize: 24 }} className="animate-spin">🔄</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Menggambar vector Before & After... (Bisa memakan waktu 5-10 detik)</div>
                </div>
              )}

              {!isGeneratingSvg && beforeSvg && afterSvg && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Slider Container */}
                  <div
                    ref={containerRef}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 400,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "#0d0d0d",
                      cursor: "ew-resize",
                      userSelect: "none"
                    }}
                    onPointerDown={handlePointerDown}
                  >
                    {/* Before Graphic (Wireframe/Sketch) - Underneath */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none"
                      }}
                      dangerouslySetInnerHTML={{ __html: beforeSvg }}
                    />

                    {/* After Graphic (Premium Vector illustration) - Clipped Top Layer */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: `${sliderPosition}%`,
                        height: "100%",
                        overflow: "hidden",
                        borderRight: "2px solid #4a90e2",
                        pointerEvents: "none",
                        zIndex: 2
                      }}
                    >
                      <div
                        style={{
                          width: containerRef.current?.getBoundingClientRect().width || 600,
                          height: "100%"
                        }}
                        dangerouslySetInnerHTML={{ __html: afterSvg }}
                      />
                    </div>

                    {/* Labels */}
                    <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "white", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, zIndex: 5 }}>
                      BEFORE (SKETCH)
                    </div>
                    <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(74,144,226,0.8)", color: "white", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, zIndex: 5 }}>
                      AFTER (HD VECTOR)
                    </div>

                    {/* Handle Slider Line & Center Circle */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${sliderPosition}%`,
                        width: 2,
                        background: "#4a90e2",
                        cursor: "ew-resize",
                        transform: "translateX(-50%)",
                        zIndex: 3
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          width: 32,
                          height: 32,
                          background: "#4a90e2",
                          border: "3px solid white",
                          borderRadius: "50%",
                          transform: "translate(-50%, -50%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                          fontSize: 10,
                          color: "white",
                          fontWeight: 900
                        }}
                      >
                        ↔
                      </div>
                    </div>
                  </div>

                  {/* 🎨 DYNAMIC COLOR TWEAK SANDBOX & PALETTE MODIFIERS */}
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>🎨 Vector Color Tweak Sandbox</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => applyPaletteFilter("grayscale")} style={{ padding: "4px 8px", fontSize: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>Grayscale</button>
                        <button onClick={() => applyPaletteFilter("cyberpunk")} style={{ padding: "4px 8px", fontSize: 10, background: "rgba(157,0,255,0.15)", border: "1px solid rgba(157,0,255,0.3)", borderRadius: 4, cursor: "pointer", color: "#9d00ff", fontWeight: 700 }}>Cyberpunk</button>
                        <button onClick={() => applyPaletteFilter("sunset")} style={{ padding: "4px 8px", fontSize: 10, background: "rgba(255,59,0,0.15)", border: "1px solid rgba(255,59,0,0.3)", borderRadius: 4, cursor: "pointer", color: "#ff3b00", fontWeight: 700 }}>Sunset Glow</button>
                        <button onClick={() => applyPaletteFilter("forest")} style={{ padding: "4px 8px", fontSize: 10, background: "rgba(43,140,86,0.15)", border: "1px solid rgba(43,140,86,0.3)", borderRadius: 4, cursor: "pointer", color: "#2b8c56", fontWeight: 700 }}>Forest</button>
                      </div>
                    </div>

                    {detectedColors.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tidak ada palette warna yang terdeteksi di SVG ini.</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tweak warna terdeteksi:</span>
                        {detectedColors.map((color) => (
                          <div key={color} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.03)", padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)" }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, background: color, border: "1px solid rgba(255,255,255,0.2)" }} />
                            <span style={{ fontSize: 10, fontFamily: "monospace" }}>{color}</span>
                            <input
                              type="color"
                              value={color}
                              onChange={(e) => handleColorReplace(color, e.target.value)}
                              style={{ width: 20, height: 16, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 🛠️ SVG CODE INSPECTOR & LIVE EDITOR */}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowCodeInspector(!showCodeInspector)}
                      style={{ background: "none", border: "none", color: "#4a90e2", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      {showCodeInspector ? "▼ Tutup SVG Inspector" : "▶ Buka SVG Code Inspector & Editor Manual"}
                    </button>

                    {showCodeInspector && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={editableSvgCode}
                          onChange={(e) => { setEditableSvgCode(e.target.value); setAfterSvg(e.target.value); }}
                          style={{ width: "100%", height: 180, padding: 8, borderRadius: 8, background: "#0d0d0d", color: "#4af2a1", fontFamily: "monospace", fontSize: 11, border: "1px solid var(--border)" }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={prettifySvgCode} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Prettify Code</button>
                          <button onClick={cleanSvgCode} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Clean Metadata</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: PLAN WORKSPACE ───────────────────────────────────────────── */}
          {panelTab === "generate" && (
            <>
              {/* Mode: With Prompt */}
              {mode === "prompt" && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "rgba(255,255,255,0.01)" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.05em" }}>✍️ Custom Prompt Mode</div>
                  <textarea
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Deskripsikan konsep vector yang ingin dibuat... (misal: A minimalist flat vector illustration of a person working on a laptop in a cozy home office, surrounded by plants and warm lighting)"
                    style={{
                      width: "100%",
                      minHeight: 110,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontSize: 13,
                      lineHeight: "1.5",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleEnhance}
                      disabled={isEnhancing || !userPrompt.trim()}
                      style={{ padding: "8px 14px", background: "rgba(123,90,224,0.12)", border: "1px solid rgba(123,90,224,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#7b5ae0" }}
                    >
                      {isEnhancing ? "⏳ Enhancing..." : "✨ Enhance Prompt"}
                    </button>
                    <button
                      type="button"
                      onClick={saveCurrentPrompt}
                      disabled={!userPrompt.trim()}
                      style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}
                    >
                      💾 Save Prompt
                    </button>
                    <button
                      type="button"
                      onClick={addToQueue}
                      disabled={!userPrompt.trim()}
                      style={{ padding: "8px 14px", background: "rgba(74,144,226,0.12)", border: "1px solid rgba(74,144,226,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#4a90e2" }}
                    >
                      📥 Add to Batch Queue
                    </button>
                  </div>

                  {/* Enhanced Prompt Result */}
                  {enhancedPrompt && (
                    <div style={{ marginTop: 12, padding: 12, background: "rgba(123,90,224,0.06)", border: "1px solid rgba(123,90,224,0.2)", borderRadius: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#7b5ae0", textTransform: "uppercase", marginBottom: 8 }}>✨ Enhanced Prompt</div>
                      <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 10px 0", lineHeight: "1.5" }}>{enhancedPrompt.enhanced}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => { setUserPrompt(enhancedPrompt.enhanced); setEnhancedPrompt(null); }}
                          style={{ padding: "6px 12px", background: "#7b5ae0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "white" }}
                        >
                          Gunakan Prompt Ini
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(enhancedPrompt.enhanced, "enhanced")}
                          style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}
                        >
                          {copiedId === "enhanced" ? "✓ Disalin!" : "📋 Copy"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Saved Prompt List */}
                  {savedPrompts.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>📋 Prompt List Tersimpan</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 150, overflowY: "auto" }}>
                        {savedPrompts.map((p, i) => (
                          <div
                            key={i}
                            onClick={() => setUserPrompt(p)}
                            style={{
                              padding: "8px 10px",
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              cursor: "pointer",
                              fontSize: 12,
                              color: "var(--text-muted)",
                              lineHeight: "1.4",
                            }}
                          >
                            {p.slice(0, 80)}{p.length > 80 ? "..." : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode: No Prompt (Theme-based) */}
              {mode === "noprompt" && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "rgba(255,255,255,0.01)" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.05em" }}>🤖 Autopilot Tema (Tanpa Prompt)</div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>Pilih 1 dari 5 Tema Komersial</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {THEME_PRESETS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setSelectedTheme(t); setCustomTheme(""); }}
                          style={{
                            padding: "9px 12px",
                            background: selectedTheme === t && !customTheme ? "rgba(74,144,226,0.15)" : "rgba(255,255,255,0.02)",
                            border: `1px solid ${selectedTheme === t && !customTheme ? "rgba(74,144,226,0.4)" : "var(--border)"}`,
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: selectedTheme === t && !customTheme ? 800 : 500,
                            color: selectedTheme === t && !customTheme ? "#4a90e2" : "var(--text-muted)",
                            textAlign: "left",
                            transition: "all 0.2s",
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>Atau ketik tema kustom sendiri:</div>
                    <input
                      value={customTheme}
                      onChange={(e) => setCustomTheme(e.target.value)}
                      placeholder="Tulis tema sendiri..."
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text)" }}
                    />
                  </div>
                </div>
              )}

              {/* Generate Plan Button */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: isGenerating ? "rgba(74,144,226,0.3)" : "linear-gradient(135deg, #4a90e2, #7b5ae0)",
                  border: "none",
                  borderRadius: 10,
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  color: "white",
                  fontWeight: 900,
                  fontSize: 14,
                  letterSpacing: "0.03em",
                  transition: "all 0.2s",
                }}
              >
                {isGenerating ? "⏳ AI sedang merancang vector plan..." : "🚀 Generate Vector Plan"}
              </button>

              {/* BATCH QUEUE VISUALIZER */}
              {batchQueue.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>📋 Batch Queue System ({batchQueue.length} Antrean)</span>
                    <button
                      onClick={processBatchQueue}
                      disabled={isProcessingQueue}
                      style={{ padding: "5px 12px", background: "#4a90e2", border: "none", borderRadius: 6, color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    >
                      {isProcessingQueue ? "⏳ Running Queue..." : "▶ Process Queue"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 150, overflowY: "auto" }}>
                    {batchQueue.map((item, idx) => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>#{idx + 1}: {item.prompt.slice(0, 50)}...</span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Style: {item.style}</span>
                        </div>
                        <span style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700,
                          background: item.status === "completed" ? "rgba(76,175,80,0.15)" : item.status === "processing" ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.05)",
                          color: item.status === "completed" ? "#4caf50" : item.status === "processing" ? "#ff9800" : "var(--text-muted)"
                        }}>{item.status.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Plan Output */}
              {generatedPlan && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Concept Overview */}
                  <div style={{ background: "linear-gradient(135deg, rgba(74,144,226,0.08), rgba(123,90,224,0.05))", border: "1px solid rgba(74,144,226,0.25)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#4a90e2", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>🎯 Concept Overview</div>
                    <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 900 }}>{generatedPlan.plan?.conceptTitle}</h3>
                    <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "var(--text-muted)", lineHeight: "1.5" }}>{generatedPlan.plan?.commercialHook}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {Object.entries(generatedPlan.plan?.styleGuide || {}).map(([k, v]) => (
                        <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 8 }}>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{k}</div>
                          <div style={{ fontSize: 12, marginTop: 3 }}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Prompt Cards */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.06em" }}>
                      📝 Generated Prompts ({generatedPlan.prompts?.length ?? 0})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(generatedPlan.prompts || []).map((p, idx) => (
                        <div key={p.id || idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 900, color: "#4a90e2" }}>#{idx + 1}</span>
                              <span style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</span>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button
                                type="button"
                                onClick={() => handleRenderSvg(p.prompt, p.label)}
                                style={{ padding: "4px 10px", background: "rgba(74,144,226,0.15)", border: "1px solid rgba(74,144,226,0.3)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#4a90e2" }}
                              >
                                🎨 Render Live Visual
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(p.prompt, p.id)}
                                style={{ padding: "4px 10px", background: copiedId === p.id ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: copiedId === p.id ? "#4caf50" : "var(--text-muted)" }}
                              >
                                {copiedId === p.id ? "✓ Disalin!" : "📋 Copy Prompt"}
                              </button>
                            </div>
                          </div>

                          {/* Prompt Text */}
                          <div style={{ background: "rgba(74,144,226,0.04)", border: "1px solid rgba(74,144,226,0.15)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: "#4a90e2", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Prompt</div>
                            <p style={{ fontSize: 12, margin: 0, lineHeight: "1.5", color: "var(--text)" }}>{p.prompt}</p>
                          </div>

                          {/* Metadata */}
                          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Adobe Stock Title</div>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{p.metadata?.title}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Keywords ({p.metadata?.keywords?.length ?? 0})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {(p.metadata?.keywords || []).slice(0, 15).map((k: string) => (
                                <span key={k} className="keyword-tag" style={{ fontSize: 10 }}>{k}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── TAB: PROMPT COMPOSER ─────────────────────────────────────────── */}
          {panelTab === "composer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.01)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: "#4a90e2", textTransform: "uppercase" }}>⚙️ Advanced Prompt Composer</span>
                <button
                  onClick={handleSurpriseMe}
                  style={{ padding: "6px 12px", background: "linear-gradient(135deg, #7b5ae0, #4a90e2)", border: "none", borderRadius: 20, color: "white", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  🎲 Surprise Me!
                </button>
              </div>

              {/* Composer Inputs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>1. Subject & Scene</label>
                  <select
                    value={compSubject}
                    onChange={(e) => setCompSubject(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
                  >
                    {COMPOSER_BANK.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>2. Aesthetic & Layout</label>
                  <select
                    value={compAesthetic}
                    onChange={(e) => setCompAesthetic(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
                  >
                    {COMPOSER_BANK.aesthetics.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>3. Background Design</label>
                  <select
                    value={compBackground}
                    onChange={(e) => setCompBackground(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
                  >
                    {COMPOSER_BANK.backgrounds.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>4. Shading & Lighting</label>
                  <select
                    value={compLighting}
                    onChange={(e) => setCompLighting(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12 }}
                  >
                    {COMPOSER_BANK.lightings.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Output Preview */}
              <div style={{ background: "rgba(74,144,226,0.04)", border: "1px solid rgba(74,144,226,0.2)", borderRadius: 10, padding: 12 }}>
                <span style={{ fontSize: 10, color: "#4a90e2", fontWeight: 700, display: "block", marginBottom: 4 }}>COMPOSED PROMPT PREVIEW</span>
                <p style={{ fontSize: 12, margin: 0, lineHeight: "1.5", color: "var(--text)" }}>{getComposedPrompt()}</p>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setMode("composer"); setPanelTab("generate"); }}
                  style={{ flex: 1, padding: "10px", background: "#4a90e2", border: "none", borderRadius: 8, color: "white", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                >
                  Gunakan Prompt Composer Ini
                </button>
                <button
                  onClick={addToQueue}
                  style={{ padding: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  📥 Add to Queue
                </button>
              </div>
            </div>
          )}

          {/* ─── TAB: MAGIC IDEAS ────────────────────────────────────────────────── */}
          {panelTab === "magic" && (
            <>
              <div style={{ background: "linear-gradient(135deg, rgba(123,90,224,0.08), rgba(74,144,226,0.05))", border: "1px solid rgba(123,90,224,0.2)", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#7b5ae0", marginBottom: 6 }}>✨ Magic Ideas Generator</div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px 0" }}>
                  AI akan menghasilkan 6 konsep vector komersial berdasarkan tema dan style yang dipilih di panel kiri.
                </p>
                <button
                  type="button"
                  onClick={handleMagic}
                  disabled={isMagicking}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: isMagicking ? "rgba(123,90,224,0.3)" : "linear-gradient(135deg, #7b5ae0, #4a90e2)",
                    border: "none",
                    borderRadius: 8,
                    cursor: isMagicking ? "not-allowed" : "pointer",
                    color: "white",
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {isMagicking ? "✨ AI sedang brainstorming..." : "✨ Generate Magic Ideas"}
                </button>
              </div>

              {magicIdeas.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {magicIdeas.map((idea, idx) => (
                    <div key={idea.id || idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, padding: "2px 7px",
                          background: idea.difficulty === "Easy" ? "rgba(76,175,80,0.1)" : idea.difficulty === "Medium" ? "rgba(255,152,0,0.1)" : "rgba(255,77,79,0.1)",
                          color: idea.difficulty === "Easy" ? "#4caf50" : idea.difficulty === "Medium" ? "#ff9800" : "#ff4d4f",
                          borderRadius: 4, fontWeight: 700
                        }}>{idea.difficulty}</span>
                        <span style={{ fontSize: 10, color: "#4caf50", fontWeight: 700 }}>{idea.estimatedSales}</span>
                      </div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: 13, fontWeight: 800 }}>{idea.title}</h4>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px 0", lineHeight: "1.4", flex: 1 }}>{idea.description}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
                        {(idea.tags || []).slice(0, 4).map((tag: string) => (
                          <span key={tag} className="keyword-tag" style={{ fontSize: 9 }}>{tag}</span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => useIdeaAsPrompt(idea)}
                        style={{ width: "100%", padding: "7px", background: "rgba(74,144,226,0.12)", border: "1px solid rgba(74,144,226,0.25)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#4a90e2" }}
                      >
                        Gunakan Ide Ini →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── TAB: STOCK ANALYTICS ─────────────────────────────────────────── */}
          {panelTab === "analytics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.01)" }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#4a90e2", textTransform: "uppercase" }}>📊 Stock Market Commercial Analytics</span>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Analisis pasar real-time untuk rancangan konsep vector yang sedang aktif.
              </p>

              {/* Analytics metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>ESTIMATED STOCK RATING</span>
                  <strong style={{ fontSize: 18, color: "#4caf50" }}>{generatedPlan ? "94 / 100" : "N/A"}</strong>
                </div>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>MARKET DEMAND</span>
                  <strong style={{ fontSize: 16, color: "#ff9800" }}>{generatedPlan ? "Very High 🔥" : "N/A"}</strong>
                </div>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>COMPETITION INDEX</span>
                  <strong style={{ fontSize: 16, color: "#4a90e2" }}>{generatedPlan ? "Moderate (Low Saturation)" : "N/A"}</strong>
                </div>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", display: "block" }}>EST. SINGLE LICENSE</span>
                  <strong style={{ fontSize: 16, color: "#7b5ae0" }}>{generatedPlan ? "$12.00 - $35.00" : "N/A"}</strong>
                </div>
              </div>

              {/* Keyword distribution chart mock */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 700 }}>RECOMMENDED CATEGORY TAG DISTRIBUTION</span>
                {generatedPlan ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                        <span>Conceptual Keywords</span>
                        <span>40%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "#4a90e2", width: "40%" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                        <span>Descriptive Tagging</span>
                        <span>35%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "#7b5ae0", width: "35%" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                        <span>Commercial Intent</span>
                        <span>25%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "#4caf50", width: "25%" }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>Belum ada plan aktif. Generate plan terlebih dahulu.</div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB: HISTORY ────────────────────────────────────────────────────── */}
          {panelTab === "history" && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12, letterSpacing: "0.06em" }}>📋 Riwayat Generate</div>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>
                  Belum ada riwayat. Coba generate vector terlebih dahulu.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map((h) => (
                    <div key={h.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{h.timestamp}</span>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(74,144,226,0.1)", color: "#4a90e2", borderRadius: 4, fontWeight: 700 }}>{h.style}</span>
                          <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>{h.ratio}</span>
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{h.conceptTitle}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{h.promptCount} prompts · Mode: {h.mode}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
