"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

// ── Resolution Map ─────────────────────────────────────────────────────────────
const RESOLUTION_MAP = {
  "1K": { width: 1920, height: 1080 },
  "2K": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
} as const;

// ── Iframe Player HTML ─────────────────────────────────────────────────────────
// Uses string concat to avoid backtick-inside-backtick escaping issues
const IFRAME_SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "<head>",
  '<meta charset="utf-8">',
  "<style>",
  "* { margin: 0; padding: 0; box-sizing: border-box; }",
  "body { background: #0a0a0a; overflow: hidden; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }",
  "canvas { display: block; }",
  "</style>",
  "</head>",
  "<body>",
  '<canvas id="c"></canvas>',
  "<script>",
  "(function() {",
  "  var canvas = document.getElementById('c');",
  "  var ctx = canvas.getContext('2d');",
  "  var renderFn = null;",
  "  var fps = 30;",
  "  var duration = 10;",
  "  var renderMode = 'normal';",
  "  var isPlaying = false;",
  "  var startTime = null;",
  "  var pausedAt = 0;",
  "  var rafId = null;",
  "  var frames = [];",
  "  var frameWidth = 0;",
  "  var frameHeight = 0;",
  "  var turboFrameIndex = 0;",
  "  var turboLastTime = null;",
  "  var turboFrameMs = 1000 / fps;",
  "",
  "  function fitCanvas(w, h) {",
  "    canvas.width = w;",
  "    canvas.height = h;",
  "    var scaleX = window.innerWidth / w;",
  "    var scaleY = window.innerHeight / h;",
  "    var scale = Math.min(scaleX, scaleY);",
  "    canvas.style.width = (w * scale) + 'px';",
  "    canvas.style.height = (h * scale) + 'px';",
  "  }",
  "",
  "  function safeEval(code) {",
  "    try {",
  "      var wrapper = new Function(code + '; return typeof render !== \"undefined\" ? render : null;');",
  "      var fn = wrapper();",
  "      if (typeof fn === 'function') return fn;",
  "      parent.postMessage({ type: 'ERROR', message: 'render() function not found' }, '*');",
  "      return null;",
  "    } catch(e) {",
  "      parent.postMessage({ type: 'ERROR', message: String(e) }, '*');",
  "      return null;",
  "    }",
  "  }",
  "",
  "  function normalLoop() {",
  "    if (!isPlaying || !renderFn) return;",
  "    var now = performance.now();",
  "    var elapsed = (now - startTime) / 1000 + pausedAt;",
  "    if (elapsed >= duration) {",
  "      elapsed = 0;",
  "      startTime = now;",
  "      pausedAt = 0;",
  "    }",
  "    try { renderFn(ctx, canvas, elapsed, duration); }",
  "    catch(e) { parent.postMessage({ type: 'ERROR', message: e.message }, '*'); isPlaying = false; return; }",
  "    parent.postMessage({ type: 'TIMEUPDATE', currentTime: elapsed }, '*');",
  "    rafId = requestAnimationFrame(normalLoop);",
  "  }",
  "",
  "  function prerenderFrames(fn, totalFrames, cb) {",
  "    frames = [];",
  "    var tmpCanvas = document.createElement('canvas');",
  "    tmpCanvas.width = canvas.width;",
  "    tmpCanvas.height = canvas.height;",
  "    var offCtx = tmpCanvas.getContext('2d');",
  "    var i = 0;",
  "    function renderBatch() {",
  "      var batchSize = 4;",
  "      for (var b = 0; b < batchSize && i < totalFrames; b++, i++) {",
  "        var t = (i / totalFrames) * duration;",
  "        offCtx.clearRect(0, 0, canvas.width, canvas.height);",
  "        try { fn(offCtx, tmpCanvas, t, duration); } catch(e) {}",
  "        frames.push(offCtx.getImageData(0, 0, canvas.width, canvas.height));",
  "      }",
  "      var progress = Math.round((i / totalFrames) * 100);",
  "      parent.postMessage({ type: 'PRERENDER_PROGRESS', progress: progress }, '*');",
  "      if (i < totalFrames) { requestAnimationFrame(renderBatch); }",
  "      else { cb(); }",
  "    }",
  "    requestAnimationFrame(renderBatch);",
  "  }",
  "",
  "  function turboLoop(now) {",
  "    if (!isPlaying || frames.length === 0) return;",
  "    if (!turboLastTime) turboLastTime = now;",
  "    var delta = now - turboLastTime;",
  "    if (delta >= turboFrameMs) {",
  "      turboLastTime = now - (delta % turboFrameMs);",
  "      ctx.putImageData(frames[turboFrameIndex], 0, 0);",
  "      var ct = (turboFrameIndex / frames.length) * duration;",
  "      parent.postMessage({ type: 'TIMEUPDATE', currentTime: ct }, '*');",
  "      turboFrameIndex = (turboFrameIndex + 1) % frames.length;",
  "    }",
  "    rafId = requestAnimationFrame(turboLoop);",
  "  }",
  "",
  "  function startPlayback() {",
  "    if (rafId) cancelAnimationFrame(rafId);",
  "    isPlaying = true;",
  "    if (renderMode === 'turbo' && frames.length > 0) {",
  "      turboLastTime = null; turboFrameIndex = 0;",
  "      rafId = requestAnimationFrame(turboLoop);",
  "    } else if (renderMode === 'normal' && renderFn) {",
  "      startTime = performance.now();",
  "      rafId = requestAnimationFrame(normalLoop);",
  "    }",
  "  }",
  "",
  "  function init(data) {",
  "    fps = data.fps || 30;",
  "    duration = data.duration || 10;",
  "    renderMode = data.renderMode || 'normal';",
  "    frameWidth = data.width || 1920;",
  "    frameHeight = data.height || 1080;",
  "    turboFrameMs = 1000 / fps;",
  "    frames = []; isPlaying = false; pausedAt = 0;",
  "    if (rafId) cancelAnimationFrame(rafId);",
  "    fitCanvas(frameWidth, frameHeight);",
  "    ctx.clearRect(0, 0, canvas.width, canvas.height);",
  "    renderFn = safeEval(data.code);",
  "    if (!renderFn) return;",
  "    if (renderMode === 'turbo') {",
  "      var totalFrames = Math.ceil(fps * duration);",
  "      prerenderFrames(renderFn, totalFrames, function() {",
  "        parent.postMessage({ type: 'PRERENDER_DONE' }, '*');",
  "        startPlayback();",
  "      });",
  "    } else {",
  "      parent.postMessage({ type: 'READY' }, '*');",
  "      startPlayback();",
  "    }",
  "  }",
  "",
  "  window.addEventListener('message', function(e) {",
  "    var d = e.data;",
  "    if (!d || !d.type) return;",
  "    if (d.type === 'INIT' || d.type === 'RELOAD') { init(d); }",
  "    else if (d.type === 'PLAY') {",
  "      if (!isPlaying) {",
  "        isPlaying = true;",
  "        if (renderMode === 'turbo' && frames.length > 0) {",
  "          turboLastTime = null; rafId = requestAnimationFrame(turboLoop);",
  "        } else if (renderMode === 'normal' && renderFn) {",
  "          startTime = performance.now() - pausedAt * 1000;",
  "          rafId = requestAnimationFrame(normalLoop);",
  "        }",
  "      }",
  "    }",
  "    else if (d.type === 'PAUSE') {",
  "      isPlaying = false;",
  "      if (rafId) cancelAnimationFrame(rafId);",
  "      if (renderMode === 'normal' && startTime) pausedAt = (performance.now() - startTime) / 1000;",
  "    }",
  "    else if (d.type === 'SEEK') {",
  "      pausedAt = d.time;",
  "      if (renderMode === 'normal' && renderFn) {",
  "        try { renderFn(ctx, canvas, d.time, duration); } catch(e) {}",
  "        parent.postMessage({ type: 'TIMEUPDATE', currentTime: d.time }, '*');",
  "      } else if (renderMode === 'turbo' && frames.length > 0) {",
  "        var fi = Math.min(Math.floor((d.time / duration) * frames.length), frames.length - 1);",
  "        turboFrameIndex = fi;",
  "        ctx.putImageData(frames[fi], 0, 0);",
  "        parent.postMessage({ type: 'TIMEUPDATE', currentTime: d.time }, '*');",
  "      }",
  "    }",
  "    else if (d.type === 'RESTART') {",
  "      pausedAt = 0; turboFrameIndex = 0;",
  "      if (renderMode === 'normal' && renderFn && isPlaying) startTime = performance.now();",
  "    }",
  "  });",
  "",
  "  window.addEventListener('resize', function() {",
  "    if (frameWidth && frameHeight) fitCanvas(frameWidth, frameHeight);",
  "  });",
  "})();",
  "</script>",
  "</body>",
  "</html>",
].join("\n");

// ── Pill button helper ─────────────────────────────────────────────────────────
function PillBtn({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px",
        borderRadius: "999px",
        border: `1px solid ${active ? "#a78bfa" : "rgba(255,255,255,0.12)"}`,
        background: active
          ? "rgba(167,139,250,0.18)"
          : "rgba(255,255,255,0.04)",
        color: active ? "#a78bfa" : "rgba(255,255,255,0.55)",
        fontWeight: active ? "700" : "500",
        fontSize: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap" as const,
        boxShadow: active ? "0 0 12px rgba(167,139,250,0.35)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// ── Setting group helper ───────────────────────────────────────────────────────
function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span
        style={{
          fontSize: "10px",
          fontWeight: "700",
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MotionStudio() {
  const [prompt, setPrompt] = useState("");
  const [fps, setFps] = useState<30 | 60>(30);
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [renderMode, setRenderMode] = useState<"turbo" | "normal">("normal");
  const [bitrate, setBitrate] = useState<2 | 4 | 8 | 16>(4);
  const [duration, setDuration] = useState<10 | 15 | 20 | 25 | 30>(10);

  const [generatedCode, setGeneratedCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [isPrerendering, setIsPrerendering] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Listen to messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const d = e.data as {
        type: string;
        currentTime?: number;
        progress?: number;
        message?: string;
      };
      if (!d?.type) return;
      if (d.type === "TIMEUPDATE") setCurrentTime(d.currentTime ?? 0);
      else if (d.type === "PRERENDER_PROGRESS")
        setRenderProgress(d.progress ?? 0);
      else if (d.type === "PRERENDER_DONE") {
        setIsPrerendering(false);
        setIsPlaying(true);
      } else if (d.type === "READY") {
        setIsPlaying(true);
      } else if (d.type === "ERROR") {
        setError("Animation error: " + (d.message ?? "Unknown error"));
        setIsPlaying(false);
        setIsPrerendering(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const sendToIframe = useCallback((data: object) => {
    iframeRef.current?.contentWindow?.postMessage(data, "*");
  }, []);

  // Send INIT when code changes
  useEffect(() => {
    if (!generatedCode) return;
    const { width, height } = RESOLUTION_MAP[resolution];
    if (renderMode === "turbo") {
      setIsPrerendering(true);
      setRenderProgress(0);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setError("");
    sendToIframe({ type: "INIT", code: generatedCode, fps, duration, renderMode, width, height });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedCode]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/motion/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, fps, resolution, duration, renderMode }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal generate animasi");
      if (!data.code) throw new Error("Kode animasi kosong dari server");
      setGeneratedCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!generatedCode) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      // eslint-disable-next-line no-new-func
      const wrapper = new Function(
        generatedCode + '; return typeof render !== "undefined" ? render : null;'
      );
      const renderFn = wrapper() as
        | ((
            ctx: CanvasRenderingContext2D,
            canvas: HTMLCanvasElement,
            t: number,
            dur: number
          ) => void)
        | null;
      if (typeof renderFn !== "function")
        throw new Error("render() function not found");

      const { width, height } = RESOLUTION_MAP[resolution];
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      const zip = new JSZip();
      const totalFrames = fps * duration;

      for (let i = 0; i < totalFrames; i++) {
        const t = (i / totalFrames) * duration;
        ctx.clearRect(0, 0, width, height);
        renderFn(ctx, exportCanvas, t, duration);
        const blob = await new Promise<Blob | null>((resolve) =>
          exportCanvas.toBlob(resolve, "image/jpeg", 0.9)
        );
        if (blob) {
          const padded = i.toString().padStart(5, "0");
          zip.file("frame_" + padded + ".jpg", blob);
        }
        if (i % 10 === 0) setExportProgress(Math.round((i / totalFrames) * 100));
        // Yield to keep UI responsive
        if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "motion_studio_" + Date.now() + ".zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.max(0, Math.min(duration, pct * duration));
    setCurrentTime(seekTime);
    sendToIframe({ type: "SEEK", time: seekTime });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return m + ":" + sec;
  };

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const togglePlay = () => {
    if (!generatedCode || isPrerendering) return;
    if (isPlaying) {
      sendToIframe({ type: "PAUSE" });
      setIsPlaying(false);
    } else {
      sendToIframe({ type: "PLAY" });
      setIsPlaying(true);
    }
  };

  const restart = () => {
    sendToIframe({ type: "RESTART" });
    setCurrentTime(0);
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "linear-gradient(160deg, #0d0d14 0%, #0a0a0f 100%)",
        minHeight: "100%",
        padding: "0",
        color: "#fff",
        fontFamily: "inherit",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 4px" }}>

        {/* ── Hero ── */}
        <div
          style={{
            textAlign: "center",
            padding: "28px 0 20px",
            marginBottom: "4px",
          }}
        >
          <h2
            style={{
              fontSize: "28px",
              fontWeight: "900",
              margin: "0 0 8px",
              background: "linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.5px",
            }}
          >
            🎬 Motion Studio
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.45)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Buat animasi canvas AI-powered secara realtime. Ketik prompt, atur
            settings, dan tonton live preview langsung.
          </p>
        </div>

        {/* ── Settings Panel ── */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "12px",
            display: "flex",
            flexWrap: "wrap",
            gap: "20px",
            alignItems: "flex-start",
          }}
        >
          <SettingGroup label="FPS">
            {([30, 60] as const).map((v) => (
              <PillBtn key={v} active={fps === v} onClick={() => setFps(v)} disabled={isGenerating}>
                {v} FPS
              </PillBtn>
            ))}
          </SettingGroup>

          <SettingGroup label="Resolusi">
            {(["1K", "2K", "4K"] as const).map((v) => (
              <PillBtn key={v} active={resolution === v} onClick={() => setResolution(v)} disabled={isGenerating}>
                {v}
              </PillBtn>
            ))}
          </SettingGroup>

          <SettingGroup label="Durasi">
            {([10, 15, 20, 25, 30] as const).map((v) => (
              <PillBtn key={v} active={duration === v} onClick={() => setDuration(v)} disabled={isGenerating}>
                {v}s
              </PillBtn>
            ))}
          </SettingGroup>

          <SettingGroup label="Render Mode">
            {(
              [
                { id: "turbo" as const, label: "⚡ Turbo" },
                { id: "normal" as const, label: "🎯 Normal" },
              ] as const
            ).map((v) => (
              <PillBtn key={v.id} active={renderMode === v.id} onClick={() => setRenderMode(v.id)} disabled={isGenerating}>
                {v.label}
              </PillBtn>
            ))}
          </SettingGroup>

          <SettingGroup label="Bitrate">
            {([2, 4, 8, 16] as const).map((v) => (
              <PillBtn key={v} active={bitrate === v} onClick={() => setBitrate(v)} disabled={isGenerating}>
                {v} Mbps
              </PillBtn>
            ))}
          </SettingGroup>
        </div>

        {/* ── Prompt & Generate ── */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "12px",
            display: "flex",
            gap: "12px",
            alignItems: "stretch",
            flexWrap: "wrap",
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Deskripsikan animasi yang kamu inginkan... (contoh: Cosmic particle system berwarna neon biru dan ungu yang berputar keluar dari tengah layar)"
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate();
            }}
            style={{
              flex: 1,
              minWidth: "260px",
              minHeight: "80px",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(167,139,250,0.25)",
              borderRadius: "12px",
              padding: "12px 14px",
              color: "#fff",
              fontSize: "13px",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "none",
                background:
                  isGenerating || !prompt.trim()
                    ? "rgba(167,139,250,0.25)"
                    : "linear-gradient(135deg, #a78bfa, #60a5fa)",
                color: "#fff",
                fontWeight: "700",
                fontSize: "13px",
                cursor: isGenerating || !prompt.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                whiteSpace: "nowrap",
                boxShadow:
                  !isGenerating && prompt.trim()
                    ? "0 0 20px rgba(167,139,250,0.4)"
                    : "none",
                transition: "all 0.2s",
                minWidth: "150px",
                justifyContent: "center",
              }}
            >
              {isGenerating ? (
                <>
                  <span className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", borderColor: "rgba(255,255,255,0.3) transparent transparent transparent" }} />
                  Generating...
                </>
              ) : generatedCode ? (
                "♻️ Regenerate"
              ) : (
                "✨ Generate"
              )}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!generatedCode || isExporting || isPrerendering}
              style={{
                padding: "10px 20px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                fontWeight: "600",
                fontSize: "12px",
                cursor:
                  !generatedCode || isExporting || isPrerendering
                    ? "not-allowed"
                    : "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s",
              }}
            >
              {isExporting
                ? "📦 Exporting " + exportProgress + "%"
                : "📦 Export ZIP"}
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "12px",
              fontSize: "13px",
              color: "#fca5a5",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Preview Area ── */}
        <div
          style={{
            background: "#000",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            overflow: "hidden",
            marginBottom: "12px",
            boxShadow: "0 0 60px rgba(167,139,250,0.08)",
          }}
        >
          {/* Preview container — 16:9 ratio */}
          <div
            style={{
              position: "relative",
              width: "100%",
              paddingTop: "56.25%", // 16:9
              background: "#0a0a0a",
            }}
          >
            {/* Placeholder */}
            {!generatedCode && !isGenerating && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "16px",
                    background: "rgba(167,139,250,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px",
                  }}
                >
                  🎬
                </div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "rgba(255,255,255,0.3)",
                    margin: 0,
                    fontWeight: "500",
                  }}
                >
                  ✨ Generate animasi untuk memulai live preview
                </p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", margin: 0 }}>
                  Ctrl+Enter untuk generate cepat
                </p>
              </div>
            )}

            {/* Generating overlay */}
            {isGenerating && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.8)",
                  backdropFilter: "blur(8px)",
                  zIndex: 20,
                  gap: "16px",
                }}
              >
                <span
                  className="spinner"
                  style={{
                    width: "40px",
                    height: "40px",
                    borderWidth: "3px",
                    borderColor: "rgba(167,139,250,0.3) transparent transparent transparent",
                  }}
                />
                <p
                  style={{
                    color: "#a78bfa",
                    fontWeight: "600",
                    fontSize: "14px",
                    margin: 0,
                  }}
                >
                  🤖 AI sedang merancang animasi...
                </p>
              </div>
            )}

            {/* Turbo pre-render overlay */}
            {isPrerendering && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.85)",
                  backdropFilter: "blur(8px)",
                  zIndex: 20,
                  gap: "16px",
                }}
              >
                <p
                  style={{
                    color: "#a78bfa",
                    fontWeight: "700",
                    fontSize: "14px",
                    margin: 0,
                  }}
                >
                  ⚡ Pre-rendering Turbo Frames...
                </p>
                <div
                  style={{
                    width: "260px",
                    height: "6px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: renderProgress + "%",
                      background:
                        "linear-gradient(90deg, #a78bfa, #60a5fa)",
                      borderRadius: "999px",
                      transition: "width 0.2s ease",
                      boxShadow: "0 0 8px rgba(167,139,250,0.7)",
                    }}
                  />
                </div>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  {renderProgress}% — Setelah selesai, playback akan ultra-smooth ⚡
                </p>
              </div>
            )}

            {/* The iframe — ALWAYS in DOM */}
            <iframe
              ref={iframeRef}
              srcDoc={IFRAME_SRC}
              sandbox="allow-scripts"
              title="Motion Studio Preview"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
              }}
            />
          </div>

          {/* ── Player Controls ── */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              padding: "12px 16px",
            }}
          >
            {/* Timeline */}
            <div
              ref={timelineRef}
              onClick={handleTimelineClick}
              style={{
                height: "6px",
                background: "rgba(255,255,255,0.1)",
                borderRadius: "999px",
                cursor: generatedCode ? "pointer" : "default",
                marginBottom: "12px",
                position: "relative",
                overflow: "visible",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: pct + "%",
                  background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
                  borderRadius: "999px",
                  transition: "width 0.05s linear",
                  boxShadow: "0 0 8px rgba(167,139,250,0.6)",
                  position: "relative",
                }}
              >
                {/* Playhead dot */}
                <div
                  style={{
                    position: "absolute",
                    right: "-6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 0 8px rgba(167,139,250,0.9)",
                    opacity: generatedCode ? 1 : 0,
                  }}
                />
              </div>
            </div>

            {/* Controls row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Play/Pause */}
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!generatedCode || isPrerendering}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontSize: "16px",
                    cursor: !generatedCode || isPrerendering ? "not-allowed" : "pointer",
                    opacity: !generatedCode || isPrerendering ? 0.4 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                {/* Restart */}
                <button
                  type="button"
                  onClick={restart}
                  disabled={!generatedCode || isPrerendering}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontSize: "16px",
                    cursor: !generatedCode || isPrerendering ? "not-allowed" : "pointer",
                    opacity: !generatedCode || isPrerendering ? 0.4 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                >
                  ⏮
                </button>
                {/* Time display */}
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.5)",
                    minWidth: "80px",
                  }}
                >
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                {/* FPS badge */}
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    padding: "2px 7px",
                    borderRadius: "4px",
                    background: "rgba(167,139,250,0.12)",
                    color: "#a78bfa",
                    border: "1px solid rgba(167,139,250,0.25)",
                  }}
                >
                  {fps}fps · {resolution} · {renderMode === "turbo" ? "⚡ Turbo" : "🎯 Normal"} · {bitrate}Mbps
                </span>
              </div>
              {/* Code toggle */}
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                disabled={!generatedCode}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: showCode ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.05)",
                  color: showCode ? "#a78bfa" : "rgba(255,255,255,0.5)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: !generatedCode ? "not-allowed" : "pointer",
                  opacity: !generatedCode ? 0.4 : 1,
                  transition: "all 0.15s",
                }}
              >
                {showCode ? "▲ Hide Code" : "</> View Code"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Code Panel ── */}
        {showCode && generatedCode && (
          <div
            style={{
              background: "#1a1a2e",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              overflow: "hidden",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  render.js
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 7px",
                    borderRadius: "4px",
                    background: "rgba(0,0,0,0.4)",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  {generatedCode.split("\n").length} lines
                </span>
              </div>
              <button
                type="button"
                onClick={copyCode}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: codeCopied
                    ? "rgba(52,211,153,0.15)"
                    : "rgba(255,255,255,0.06)",
                  color: codeCopied ? "#34d399" : "rgba(255,255,255,0.5)",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontWeight: "600",
                  transition: "all 0.15s",
                }}
              >
                {codeCopied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <pre
              style={{
                padding: "16px",
                overflowX: "auto",
                maxHeight: "380px",
                overflowY: "auto",
                fontSize: "12px",
                fontFamily: "monospace",
                color: "#c9d1d9",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              <code>{generatedCode}</code>
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}
