// ─── Upscale Engine Types ───────────────────────────────────────────────────────

export type UpscaleEngine = "ai_super_res" | "bicubic_crisp" | "bilinear_smooth";

export interface EngineProfile {
  label: string;
  badge: string;
  description: string;
  smoothing: "high" | "low";
  multiPass: boolean;
  sharpen: number;
  denoise: number;
  contrast: number;
  saturation: number;
  quality: number;
}

export interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
  badge: string;
  desc: string;
  minPixels?: number; // Minimum total pixels (e.g. 4.1e6 for Adobe Stock 4MP requirement)
}

export interface ImageUpscaleFile {
  id: string;
  name: string;
  size: number;
  type: "image";
  preview: string;
  width: number;
  height: number;
  file: File;
  status: "idle" | "processing" | "success" | "error";
  upscaledDataUrl?: string;
  targetWidth?: number;
  targetHeight?: number;
  processingStep?: string;
}

export interface VideoUpscaleFile {
  id: string;
  name: string;
  size: number;
  type: "video";
  file: File;
  thumbnailDataUrl: string;
  duration: number;
  width: number;
  height: number;
  frameCount: number;
  status: "idle" | "processing" | "success" | "error";
  processedFrames?: number;
  totalFrames?: number;
  outputVideoUrl?: string;
  originalVideoUrl?: string;
  upscaledWidth?: number;
  upscaledHeight?: number;
  previewOriginalDataUrl?: string;
  previewUpscaledDataUrl?: string;
  processingStep?: string;
}

export type MediaUpscaleFile = (ImageUpscaleFile & { type: "image" }) | VideoUpscaleFile;
