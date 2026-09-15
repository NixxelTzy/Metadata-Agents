// lib/upscale/index.ts
// ─── Upscale Library — Public API ─────────────────────────────────────────────
// Import everything from this single entry point.
//
// Usage:
//   import { runUpscalePipeline, calcTargetDimensions, ENGINE_PROFILES, RESOLUTION_PRESETS, DEFAULT_PRESET_INDEX } from "@/lib/upscale";
//   import type { UpscaleEngine, ResolutionPreset, MediaUpscaleFile } from "@/lib/upscale";

export * from "./types";
export * from "./engines";
export * from "./pipeline";
