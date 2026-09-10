/**
 * MACHINE/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core Type Definitions for the High-Intelligence Microstock Machine Engine.
 * Augmented with Multi-Dimensional Forensic Reasoning, Computer Vision Signals,
 * and Microstock Algorithmic Optimization Models.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ColorTemperature = "warm" | "cool" | "neutral";

export type MicrostockPlatform = "adobe_stock" | "shutterstock" | "magnific";

export type KeywordCategory =
  | "subject"
  | "action"
  | "environment"
  | "mood"
  | "style"
  | "commercial"
  | "technical";

export interface VisualFeatureVector {
  dominantColors: string[];
  colorTemperature: ColorTemperature;
  lightingStyle: string;
  composition: string;
  detectedObjects: string[];
  sceneContext: string;
  perceivedMood: string[];
  complexityScore: number;         // 0 to 1
  aiForensicNotes?: string;
  colorPsychology?: string;
  commercialTheme?: string;
  focalDepth?: "shallow" | "deep" | "macro" | "panoramic";
  copySpaceSuitability?: {
    hasCopySpace: boolean;
    location: "left" | "right" | "top" | "bottom" | "center" | "none";
    score: number; // 0 to 1
  };
  buyerIntentSignals?: string[];
}

export interface KeywordScore {
  keyword: string;
  relevanceScore: number;          // 0 to 1 (Visual accuracy alignment)
  buyerIntentScore: number;        // 0 to 1 (Commercial search demand)
  simplicityScore: number;         // 0 to 1 (Common everyday English searchability)
  seoWeight: number;               // Combined algorithmic ranking weight
  category: KeywordCategory;
  stemKey?: string;                // Morphological root key for deduplication
  searchVolumeTier?: "high" | "medium" | "niche";
}

export interface CategoryPrediction {
  primaryCategory: string;
  secondaryCategory: string;
  tertiaryCategory?: string;
  confidence: number;              // 0 to 1
  matchedSignals: string[];
  reasoning?: string;
  platformTaxonomy?: "shutterstock" | "adobe_stock" | "unified";
}

export interface MetadataQualityMetrics {
  overallScore: number;            // 0 to 100 (composite percentage index)
  accuracyConfidence: number;      // 0 to 1 (visual alignment)
  commercialViability: number;     // 0 to 1 (buyer demand estimation)
  diversityIndex: number;          // 0 to 1 (lexical variety, unique stems)
  complianceScore: number;         // 0 to 1 (agency policy compliance)
  simplicityIndex: number;         // 0 to 1 (easy everyday English keywords)
  details: {
    passedChecks: string[];
    warnings: string[];
    recommendations: string[];
    aiForensicAudit?: string;
    categoryDistribution?: Record<KeywordCategory, number>;
  };
}

export interface PromptEnhanceResult {
  enhancedPrompt: string;
  targetModel: string;
  recommendedAspectRatio: string;
  cameraSettings: string;
  lightingPrompt: string;
  negativePrompts: string[];
  modelParameters?: string;
}

export interface OptimizedMetadata {
  title: string;
  keywords: string[];
  categories: string[];
  prompt: string;
  model: string;
  editorial: "yes" | "no";
  matureContent: "yes" | "no";
  illustration: "yes" | "no";
  confidenceScore: number;         // e.g. 0.99
  qualityMetrics: MetadataQualityMetrics;
  mlInsights: {
    extractedConcepts: string[];
    prunedKeywords: string[];
    boostedKeywords: string[];
    predictedCategories: string[];
    aiModelUsed: string;
    reasoningChain?: string[];
  };
}

export interface OptimizerInput {
  title: string;
  keywords: string[];
  visualDescription?: string;
  visualHints?: string;
  existingPrompt?: string;
  platform: MicrostockPlatform;
  targetModel?: string;            // Default: "Adobe Firefly" or "Midjourney 6"
  editorial?: "yes" | "no";
  matureContent?: "yes" | "no";
  illustration?: "yes" | "no";
  filename?: string;
  imageDataUrl?: string;           // Optional base64 data URL for neural vision inspection
}
