/**
 * MACHINE/prompt-enhancer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generative AI Prompt Engineering & Photographic Synthesis Engine.
 * Tailors prompts with optics, lighting geometry, color science, and parameters
 * specifically for Adobe Firefly, Midjourney v6.1, and Flux.1.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { VisualFeatureVector, PromptEnhanceResult } from "./types";

interface PromptEnhanceOptions {
  existingPrompt?: string;
  title?: string;
  visualFeatures?: VisualFeatureVector;
  targetModel?: string;            // e.g. "Adobe Firefly", "Midjourney 6", "Flux.1"
  aspectRatio?: string;            // e.g. "16:9", "3:2", "4:5", "1:1"
}

// Curated negative prompts to suppress common generative flaws
const UNIVERSAL_NEGATIVE_PROMPTS = [
  "watermark", "text", "signature", "blurry", "deformed fingers", "distorted hands",
  "extra limbs", "overexposed", "plastic skin", "low resolution", "pixelated",
  "amateur photography", "grainy artifact", "unrealistic anatomy"
];

/**
 * Strips residual prompt prefixes and unwanted formatting.
 */
function cleanPromptText(text: string): string {
  return text
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\b(prompt:|image of|photo of|photograph of|a photo showing|a picture of)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Compiles a detailed camera settings descriptor based on composition & focal depth.
 */
function compileCameraRig(composition: string, depth?: string): string {
  if (depth === "macro" || composition.includes("macro")) {
    return "shot on 100mm f/2.8 Macro lens, 1:1 reproduction ratio, extreme optical sharpness, smooth creamy bokeh";
  }
  if (depth === "shallow" || composition.includes("portrait")) {
    return "shot on 85mm f/1.4 prime lens, shallow depth of field, sharp subject focus with soft background falloff";
  }
  if (depth === "panoramic" || composition.includes("wide")) {
    return "shot on 24mm f/8 ultra-wide lens, deep depth of field, edge-to-edge optical clarity, hyper-detailed horizon";
  }
  // Default commercial standard
  return "shot on 50mm f/2.8 professional lens, balanced natural perspective, authentic commercial stock depth";
}

/**
 * Synthesizes a photorealistic generative prompt and returns structured details.
 */
export function buildEnhancedPromptResult(options: PromptEnhanceOptions): PromptEnhanceResult {
  const {
    existingPrompt,
    title,
    visualFeatures,
    targetModel = "Adobe Firefly",
    aspectRatio = "3:2",
  } = options;

  // 1. Determine Core Subject
  let baseSubject = "";
  if (existingPrompt && existingPrompt.trim().length > 5) {
    baseSubject = cleanPromptText(existingPrompt);
  } else if (title && title.trim().length > 3) {
    baseSubject = cleanPromptText(title);
  } else {
    baseSubject = visualFeatures?.sceneContext || "detailed commercial stock photography subject";
  }

  // 2. Optical & Lighting Configuration
  const lighting = visualFeatures?.lightingStyle || "soft natural commercial daylight";
  const composition = visualFeatures?.composition || "balanced professional commercial framing";
  const cameraSettings = compileCameraRig(composition, visualFeatures?.focalDepth);

  // 3. Color Science & Mood
  const colorTemp = visualFeatures?.colorTemperature === "warm"
    ? "warm golden hour color temperature, rich natural warmth"
    : visualFeatures?.colorTemperature === "cool"
    ? "crisp cool morning color temperature, clean blue ambient tones"
    : "calibrated neutral 5500K daylight color balance, true-to-life tones";

  const moodString = visualFeatures?.perceivedMood && visualFeatures.perceivedMood.length > 0
    ? `mood: ${visualFeatures.perceivedMood.join(", ")}`
    : "mood: authentic, commercial, professional";

  // 4. Model-Specific Tailoring
  let modelStyle = "";
  let modelParams = "";
  const modelLower = targetModel.toLowerCase();

  if (modelLower.includes("firefly")) {
    modelStyle = "commercial stock photography, realistic textures, clean dynamic range, hyper-detailed, clean natural lighting, studio color grading";
    modelParams = `--ar ${aspectRatio}`;
  } else if (modelLower.includes("flux")) {
    modelStyle = "candid 35mm photography, natural film texture, authentic uncompressed details, subtle micro-contrasts, editorial stock quality";
    modelParams = `--ar ${aspectRatio} --quality 2`;
  } else {
    // Midjourney v6.1 default
    modelStyle = "commercial stock photo, shot on Hasselblad H6D-100c, commercial grade color grading, 8k resolution, photorealistic masterpiece";
    modelParams = `--ar ${aspectRatio} --v 6.1 --style raw --stylize 100`;
  }

  // 5. Assemble Seamless Prompt
  const promptParts = [
    baseSubject,
    composition,
    cameraSettings,
    lighting,
    colorTemp,
    moodString,
    modelStyle,
    modelParams,
  ].filter(Boolean);

  const enhancedPrompt = promptParts
    .join(", ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/['"`]/g, "")
    .trim();

  return {
    enhancedPrompt,
    targetModel,
    recommendedAspectRatio: aspectRatio,
    cameraSettings,
    lightingPrompt: lighting,
    negativePrompts: UNIVERSAL_NEGATIVE_PROMPTS,
    modelParameters: modelParams,
  };
}

/**
 * Backward-compatible single-string enhancer.
 */
export function enhanceGenerativePrompt(options: PromptEnhanceOptions): string {
  return buildEnhancedPromptResult(options).enhancedPrompt;
}
