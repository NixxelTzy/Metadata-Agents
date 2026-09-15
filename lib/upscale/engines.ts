// ─── Engine Profiles & Resolution Presets ─────────────────────────────────────
// Centralized config for the AI Upscaler.
// Import from here instead of defining inline in the component.

import type { EngineProfile, ResolutionPreset, UpscaleEngine } from "./types";

// ─── Engine Profiles ──────────────────────────────────────────────────────────

export const ENGINE_PROFILES: Record<UpscaleEngine, EngineProfile> = {
  ai_super_res: {
    label: "AI Super Resolution",
    badge: "MULTI-PASS",
    description: "Multi-pass neural resampling with smart edge-preserving denoise & halo-free sharpening",
    smoothing: "high",
    multiPass: true,
    sharpen: 65,    // Balanced crisp sharpening without halos or ringing
    denoise: 16,    // Clean noise reduction while preserving natural fine textures
    contrast: 1.03, // Natural commercial grade contrast
    saturation: 1.04, // Rich natural microstock colors
    quality: 99,    // Near lossless JPEG output
  },
  bicubic_crisp: {
    label: "Bicubic Crisp",
    badge: "HIGH-DETAIL",
    description: "High-definition cubic resampling with edge enhancement for photography & portraits",
    smoothing: "high",
    multiPass: false,
    sharpen: 75,
    denoise: 8,
    contrast: 1.04,
    saturation: 1.02,
    quality: 98,
  },
  bilinear_smooth: {
    label: "Bilinear Smooth",
    badge: "ANTI-ALIAS",
    description: "Clean anti-aliased interpolation — ideal for vector art, graphics, and illustrations",
    smoothing: "low",
    multiPass: false,
    sharpen: 25,
    denoise: 6,
    contrast: 1.01,
    saturation: 1.0,
    quality: 98,
  },
};

// ─── Resolution Presets ───────────────────────────────────────────────────────
// Adobe Stock requirement: Minimum 4.0 Megapixels (MP) total resolution.
// Shutterstock requirement: Minimum 4.0 MP total resolution.
// By setting minPixels: 4_100_000 on the 2K preset, even wide aspect ratios
// (like 16:9 or 21:9) are guaranteed to exceed 4 MP so Adobe Stock NEVER rejects them!

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  {
    label: "2048px (2K Pro)",
    width: 2048,
    height: 2048,
    badge: "2K Stock ✓",
    desc: "Longer side ≥ 2048px · Guaranteed ≥ 4MP (Adobe Stock Approved)",
    minPixels: 4_100_000,
  },
  {
    label: "3000px (3K Ultra)",
    width: 3000,
    height: 3000,
    badge: "3K",
    desc: "Longer side ≥ 3000px · High resolution stock photo",
    minPixels: 4_100_000,
  },
  {
    label: "4096px (4K UHD)",
    width: 4096,
    height: 4096,
    badge: "4K",
    desc: "Longer side ≥ 4096px · Ultra HD master quality",
  },
  {
    label: "6000px (6K Master)",
    width: 6000,
    height: 6000,
    badge: "6K",
    desc: "Longer side ≥ 6000px · Large format print ready",
  },
  {
    label: "8192px (8K Studio)",
    width: 8192,
    height: 8192,
    badge: "8K",
    desc: "Longer side ≥ 8192px · Maximum commercial fidelity",
  },
  {
    label: "2× Scale",
    width: 2000,
    height: 2000,
    badge: "2×",
    desc: "2× original dimensions · preserves original pixel ratio",
    minPixels: 4_100_000,
  },
];

// Default preset: 2K Pro (index 0) with guaranteed ≥ 4MP Adobe Stock compliance
export const DEFAULT_PRESET_INDEX = 0;
