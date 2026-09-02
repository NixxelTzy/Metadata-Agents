"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

// ── Resolution Map ─────────────────────────────────────────────────────────────
const RESOLUTION_MAP = {
  "1K": { width: 1920, height: 1080 },
  "2K": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
} as const;

// ── Default Code Presets ────────────────────────────────────────────────────────
const CODE_PRESETS = [
  {
    name: "✨ Neon Particle Vortex",
    code: `function render(ctx, canvas, t, duration) {
  const w = canvas.width, h = canvas.height;
  const progress = t / duration;
  ctx.fillStyle = "rgba(10, 10, 18, 0.25)";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const count = 120;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + progress * Math.PI * 4;
    const dist = (Math.sin(angle * 3 + progress * Math.PI * 2) * 0.3 + 0.5) * Math.min(w, h) * 0.35;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const radius = Math.sin(i + progress * Math.PI * 2) * 6 + 8;
    const hue = (i * 3 + progress * 360) % 360;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = \`hsla(\${hue}, 90%, 60%, 0.85)\`;
    ctx.shadowColor = \`hsla(\${hue}, 90%, 60%, 0.9)\`;
    ctx.shadowBlur = 15;
    ctx.fill();
  }
}`
  },
  {
    name: "🌊 Cyberpunk Grid Wave",
    code: `function render(ctx, canvas, t, duration) {
  const w = canvas.width, h = canvas.height;
  const progress = t / duration;
  ctx.fillStyle = "#05050f";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 10;
  const cols = 24, rows = 16;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * w;
      const baseY = (r / rows) * h;
      const wave = Math.sin((c / cols) * 8 + progress * Math.PI * 2) * 22 + Math.cos((r / rows) * 6 + progress * Math.PI * 2) * 16;
      const y = baseY + wave;
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}`
  },
  {
    name: "🔮 Liquid Blob Gradient",
    code: `function render(ctx, canvas, t, duration) {
  const w = canvas.width, h = canvas.height;
  const progress = t / duration;
  ctx.fillStyle = "#0a071b";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const rad = Math.min(w, h) * 0.28;
  ctx.beginPath();
  const points = 12;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rOffset = Math.sin(a * 4 + progress * Math.PI * 2) * 35 + Math.cos(a * 2 - progress * Math.PI * 4) * 25;
    const r = rad + rOffset;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad * 1.5);
  grad.addColorStop(0, "#ff007f");
  grad.addColorStop(0.5, "#7928ca");
  grad.addColorStop(1, "#4200ff");
  ctx.fillStyle = grad;
  ctx.shadowColor = "#ff007f";
  ctx.shadowBlur = 30;
  ctx.fill();
}`
  }
];

export default function MotionStudio({ onTokensUpdated }: { onTokensUpdated?: () => void } = {}) {
  const [code, setCode] = useState(CODE_PRESETS[0]!.code);
  const [fps, setFps] = useState<30 | 60>(30);
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [duration, setDuration] = useState<5 | 10 | 15 | 20 | 30>(10);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number>(0);
  const renderFnRef = useRef<Function | null>(null);

  // Compile JS code safely
  const compileCode = useCallback((jsCode: string) => {
    try {
      setError("");
      const wrapper = new Function(
        jsCode + '; return typeof render !== "undefined" ? render : null;'
      );
      const fn = wrapper();
      if (typeof fn !== "function") {
        setError("Fungsi render(ctx, canvas, t, duration) tidak ditemukan dalam kode JS.");
        return null;
      }
      return fn;
    } catch (e) {
      setError("Syntax Error dalam kode JavaScript: " + String(e));
      return null;
    }
  }, []);

  // Update render function when code changes
  useEffect(() => {
    const fn = compileCode(code);
    renderFnRef.current = fn;
  }, [code, compileCode]);

  // Main Animation Loop (100% Client-Side Render — Zero Lag)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = RESOLUTION_MAP[resolution];
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const loop = (timestamp: number) => {
      if (!isRunning) return;

      if (isPlaying && renderFnRef.current) {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp - pausedTimeRef.current * 1000;
        }

        const elapsed = (timestamp - startTimeRef.current) / 1000;
        const loopedTime = elapsed % duration;
        setCurrentTime(loopedTime);

        try {
          renderFnRef.current(ctx, canvas, loopedTime, duration);
        } catch (err) {
          setError("Runtime Error saat render: " + (err instanceof Error ? err.message : String(err)));
          setIsPlaying(false);
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration, resolution]);

  const togglePlay = () => {
    if (isPlaying) {
      pausedTimeRef.current = currentTime;
      startTimeRef.current = null;
    } else {
      startTimeRef.current = null;
    }
    setIsPlaying(!isPlaying);
  };

  const resetAnimation = () => {
    startTimeRef.current = null;
    pausedTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleExportZip = async () => {
    const fn = compileCode(code);
    if (!fn) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      const { width, height } = RESOLUTION_MAP[resolution];
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context tidak tersedia");

      const zip = new JSZip();
      const totalFrames = fps * duration;

      for (let i = 0; i < totalFrames; i++) {
        const t = (i / totalFrames) * duration;
        ctx.clearRect(0, 0, width, height);
        fn(ctx, exportCanvas, t, duration);

        const blob = await new Promise<Blob | null>((res) =>
          exportCanvas.toBlob(res, "image/jpeg", 0.9)
        );

        if (blob) {
          const paddedIndex = i.toString().padStart(5, "0");
          zip.file(`frame_${paddedIndex}.jpg`, blob);
        }

        if (i % 5 === 0) {
          setExportProgress(Math.round((i / totalFrames) * 100));
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `motion_canvas_frames_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Gagal Export: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px", color: "var(--text)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: "800", margin: 0 }}>
            🎬 Motion Studio — Direct JS Canvas Engine
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            Eksekusi & Render Kode JavaScript Canvas 100% Client-Side secara Instan tanpa Delay Server
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={copyCode}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            {codeCopied ? "✓ Copied!" : "📋 Salin Kode"}
          </button>
          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExporting}
            style={{
              background: "linear-gradient(135deg, #0066FF 0%, #00C8FF 100%)",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "700",
              cursor: isExporting ? "wait" : "pointer"
            }}
          >
            {isExporting ? `Exporting (${exportProgress}%)` : "⬇ Export Zip Frames"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.3)", borderRadius: "8px", color: "#ff4d4f", marginBottom: "16px", fontSize: "13px" }}>
          ❌ {error}
        </div>
      )}

      {/* Preset Buttons */}
      <div style={{ marginBottom: "16px" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
          Template Kode Instan:
        </span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {CODE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                setCode(preset.code);
                resetAnimation();
              }}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Grid: Left Code Editor, Right Live Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Direct JS Code Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#0066FF" }}>
              ⚡ Editor Kode JavaScript Canvas
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Fungsi: render(ctx, canvas, t, duration)
            </span>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ketik atau tempel kode JavaScript Canvas di sini..."
            rows={20}
            style={{
              width: "100%",
              fontFamily: "'Fira Code', 'Courier New', monospace",
              fontSize: "12px",
              lineHeight: "1.5",
              padding: "14px",
              background: "#0d0d15",
              color: "#00f0ff",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              outline: "none",
              resize: "vertical"
            }}
          />

          {/* Render & Controls Bar */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>FPS</span>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value) as any)}
                style={{ width: "100%", padding: "6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "12px" }}
              >
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>

            <div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>Resolusi</span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                style={{ width: "100%", padding: "6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "12px" }}
              >
                <option value="1K">1K (1920x1080)</option>
                <option value="2K">2K (2560x1440)</option>
                <option value="4K">4K (3840x2160)</option>
              </select>
            </div>

            <div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>Durasi (Detik)</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as any)}
                style={{ width: "100%", padding: "6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "12px" }}
              >
                <option value={5}>5 Detik</option>
                <option value={10}>10 Detik</option>
                <option value={15}>15 Detik</option>
                <option value={20}>20 Detik</option>
                <option value={30}>30 Detik</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Live Player Canvas */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
              📺 Live Canvas Player
            </span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#0284c7" }}>
              {currentTime.toFixed(2)}s / {duration}s
            </span>
          </div>

          {/* Canvas Frame Display */}
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              background: "#000",
              borderRadius: "8px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain"
              }}
            />
          </div>

          {/* Player Navigation Buttons */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={togglePlay}
              style={{
                flex: 1,
                padding: "8px 0",
                background: isPlaying ? "var(--bg-secondary)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: isPlaying ? "var(--text)" : "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>

            <button
              type="button"
              onClick={resetAnimation}
              style={{
                padding: "8px 16px",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
