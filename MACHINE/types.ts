/**
 * MACHINE/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise-Grade Type Definitions — Microstock Machine Intelligence Engine
 * Full discriminated unions, strict interfaces, platform policy models,
 * pipeline execution tracing, and multi-dimensional scoring matrices.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── PLATFORM ────────────────────────────────────────────────────────────────

export type MicrostockPlatform = "adobe_stock" | "shutterstock" | "magnific";

export interface PlatformPolicyConfig {
  platform: MicrostockPlatform;
  /** Exact keyword count required in final metadata */
  metadataKeywordCount: number;
  /** Maximum title character length */
  maxTitleLength: number;
  /** Maximum title word count */
  maxTitleWords: number;
  /** Minimum title word count */
  minTitleWords: number;
  /** Whether platform auto-appends a keyword (e.g. magnific adds "ai generate") */
  autoAppendKeyword?: string;
  /** Forbidden characters in title */
  forbiddenTitleChars: RegExp;
  /** Platform-specific banned term additions */
  additionalBannedTerms: string[];
  /** Search algorithm priority weighting */
  searchWeights: { relevance: number; commercial: number; simplicity: number };
}

export const PLATFORM_POLICIES: Record<MicrostockPlatform, PlatformPolicyConfig> = {
  adobe_stock: {
    platform: "adobe_stock",
    metadataKeywordCount: 49,
    maxTitleLength: 200,
    maxTitleWords: 15,
    minTitleWords: 5,
    forbiddenTitleChars: /['"`\\]/,
    additionalBannedTerms: ["ai generated", "artificial intelligence generated"],
    searchWeights: { relevance: 0.45, commercial: 0.30, simplicity: 0.25 },
  },
  shutterstock: {
    platform: "shutterstock",
    metadataKeywordCount: 50,
    maxTitleLength: 200,
    maxTitleWords: 15,
    minTitleWords: 5,
    forbiddenTitleChars: /['"`\\]/,
    additionalBannedTerms: [],
    searchWeights: { relevance: 0.40, commercial: 0.35, simplicity: 0.25 },
  },
  magnific: {
    platform: "magnific",
    metadataKeywordCount: 49,
    maxTitleLength: 180,
    maxTitleWords: 12,
    minTitleWords: 4,
    autoAppendKeyword: "ai generate",
    forbiddenTitleChars: /['"`\\]/,
    additionalBannedTerms: [],
    searchWeights: { relevance: 0.35, commercial: 0.30, simplicity: 0.35 },
  },
};

// ── VISUAL FEATURES ─────────────────────────────────────────────────────────

export type ColorTemperature = "warm" | "cool" | "neutral";
export type FocalDepth = "shallow" | "deep" | "macro" | "panoramic";
export type CompositionType =
  | "rule_of_thirds"
  | "centered"
  | "flat_lay"
  | "portrait"
  | "wide_angle"
  | "macro"
  | "minimal"
  | "symmetrical"
  | "diagonal"
  | "frame_within_frame";

export type LightingStyle =
  | "golden_hour"
  | "studio_high_key"
  | "studio_low_key"
  | "natural_soft"
  | "neon_backlit"
  | "dramatic_chiaroscuro"
  | "rim_backlit"
  | "harsh_direct"
  | "overcast_diffused"
  | "candlelight"
  | "ambient_indoor";

export type SceneComplexity = "minimal" | "moderate" | "complex" | "highly_complex";
export type EditorialSignal = "commercial" | "editorial" | "documentary" | "ambiguous";

export interface CopySpaceAnalysis {
  hasCopySpace: boolean;
  location: "left" | "right" | "top" | "bottom" | "center" | "none" | "multiple";
  areaRatio?: number;           // 0 to 1 — fraction of frame that is copy space
  score: number;               // 0 to 1
  suggestedTextPlacement?: "overlay_left" | "overlay_right" | "overlay_top" | "none";
}

export interface ColorHarmony {
  scheme: "complementary" | "analogous" | "triadic" | "split_complementary" | "monochromatic" | "neutral";
  dominantHue: string;
  saturationLevel: "vibrant" | "muted" | "neutral" | "desaturated";
  contrastRatio: number;       // 1 to 21 (WCAG scale)
}

export interface VisualFeatureVector {
  // Color
  dominantColors: string[];
  colorTemperature: ColorTemperature;
  colorHarmony?: ColorHarmony;
  colorPsychology: string;

  // Composition & Optics
  composition: string;
  compositionType?: CompositionType;
  focalDepth: FocalDepth;
  copySpaceSuitability: CopySpaceAnalysis;

  // Lighting
  lightingStyle: string;
  lightingType?: LightingStyle;

  // Content
  detectedObjects: string[];
  detectedActions?: string[];
  detectedMaterials?: string[];
  sceneContext: string;
  sceneType?: "indoor" | "outdoor" | "studio" | "aerial" | "underwater" | "abstract";

  // Mood & Commercial
  perceivedMood: string[];
  emotionalTone?: "positive" | "negative" | "neutral" | "dramatic" | "serene";
  commercialTheme: string;
  editorialSignal?: EditorialSignal;
  sceneComplexity?: SceneComplexity;
  complexityScore: number;     // 0 to 1

  // AI metadata
  aiForensicNotes?: string;
  buyerIntentSignals: string[];
  inferredUseCases?: string[];  // e.g. ["advertising banner", "social media post", "editorial article"]
}

// ── KEYWORD TYPES ────────────────────────────────────────────────────────────

export type KeywordCategory =
  | "subject"
  | "action"
  | "environment"
  | "mood"
  | "style"
  | "commercial"
  | "technical"
  | "color"
  | "material"
  | "demographic"
  | "concept"
  | "seasonal"
  | "industry"
  | "emotion"
  | "composition";

export type SearchVolumeTier = "ultra_high" | "high" | "medium" | "low" | "niche";
export type BuyerPersona = "editorial" | "commercial" | "advertising" | "lifestyle" | "creative";
export type RankingAlgorithm = "bm25_plus" | "tfidf" | "buyer_intent" | "simplicity" | "ensemble";

export interface KeywordScore {
  keyword: string;
  relevanceScore: number;        // 0 to 1 — BM25+ visual alignment
  buyerIntentScore: number;      // 0 to 1 — commercial search demand
  simplicityScore: number;       // 0 to 1 — everyday English searchability
  diversityBonus?: number;        // 0 to 1 — contribution to category portfolio balance
  competitionPenalty?: number;    // 0 to 1 — oversaturation penalty
  temporalScore?: number;         // 0 to 1 — seasonal/trending relevance
  seoWeight: number;             // composite ranking weight
  category: KeywordCategory;
  stemKey?: string;
  searchVolumeTier?: SearchVolumeTier | "high" | "medium" | "niche";
  buyerPersonaFit?: BuyerPersona[];
  isAnchor?: boolean;             // top-10 anchor tag for platform front-loading
  isFallback?: boolean;           // was added via fallback top-up
}

export interface SemanticRelationship {
  term: string;
  relationType: "synonym" | "hypernym" | "hyponym" | "co_occurrence" | "visual_associate";
  strength: number;              // 0 to 1
}

export interface TokenizerOutput {
  rawTokens: string[];
  stemmedTokens: string[];
  phoneticTokens: string[];
  nGrams: string[];              // bigrams from the input
  uniqueStems: Set<string>;
  tokenCount: number;
}

// ── CATEGORY TYPES ──────────────────────────────────────────────────────────

export interface CategoryPrediction {
  primaryCategory: string;
  secondaryCategory: string;
  tertiaryCategory?: string;
  quaternaryCategory?: string;
  confidence: number;            // 0 to 1
  calibratedConfidence?: number;  // Platt-scaled confidence
  matchedSignals: string[];
  negativeSignals?: string[];
  reasoning: string;
  platformTaxonomy: MicrostockPlatform | "unified";
  naiveBayesScore?: number;
  conflictResolution?: string;
}

// ── QUALITY & SCORING ───────────────────────────────────────────────────────

export type QualityGateStatus = "pass" | "warn" | "fail";
export type RejectionRisk = "low" | "medium" | "high" | "critical";

export interface QualityDimension {
  name: string;
  score: number;                 // 0 to 1
  weight: number;                // contribution weight in composite
  status: QualityGateStatus;
  message: string;
}

export interface MetadataQualityMetrics {
  // Composite
  overallScore: number;          // 0 to 100
  rejectionRisk?: RejectionRisk;

  // Individual dimensions
  dimensions?: {
    titleWordCount: QualityDimension;
    titleCharacterCompliance: QualityDimension;
    titleForbiddenChars: QualityDimension;
    keywordCountCompliance: QualityDimension;
    bannedTermDetection: QualityDimension;
    trademarkDetection: QualityDimension;
    stemDiversityIndex: QualityDimension;
    simplicityIndex: QualityDimension;
    visualAlignmentRatio: QualityDimension;
    commercialModifierCoverage: QualityDimension;
    categoryDistributionBalance: QualityDimension;
    buyerIntentCoverage: QualityDimension;
    redundancyScore: QualityDimension;
    poolQualityRatio: QualityDimension;
    languageClarityScore: QualityDimension;
  };

  // Aggregates (kept for backwards compat)
  accuracyConfidence: number;
  commercialViability: number;
  diversityIndex: number;
  complianceScore: number;
  simplicityIndex: number;

  details: {
    passedChecks: string[];
    warnings: string[];
    recommendations: string[];
    aiForensicAudit?: string;
    categoryDistribution?: Partial<Record<KeywordCategory, number>> | Record<string, number>;
    poolQuality?: { totalCandidates: number; validCandidates: number; validRatio: number };
  };
}

// ── PROMPT TYPES ────────────────────────────────────────────────────────────

export type GenerativeModel =
  | "Adobe Firefly 3"
  | "Midjourney 6.1"
  | "Flux.1 Dev"
  | "Flux.1 Schnell"
  | "DALL-E 3"
  | "Stable Diffusion XL"
  | "Midjourney 6";

export interface LensProfile {
  focalLength: string;
  aperture: string;
  useCase: string;
  depthOfField: "very_shallow" | "shallow" | "medium" | "deep";
  description: string;
}

export interface LightingRig {
  name: string;
  keyLight: string;
  fillLight: string;
  rimLight?: string;
  description: string;
  mood: string;
}

export interface PromptEnhanceResult {
  enhancedPrompt: string;
  targetModel: GenerativeModel | string;
  recommendedAspectRatio: string;
  cameraSettings: string;
  lightingPrompt: string;
  colorGrading?: string;
  negativePrompts: string[];
  modelParameters: string;
  promptQualityScore?: number;    // 0 to 100
  technicalCompleteness?: number; // 0 to 1
}

// ── POOL TYPES ──────────────────────────────────────────────────────────────

export type PoolGenerationStrategy = "heuristic" | "ai_augmented" | "hybrid" | "full_ai";

export interface KeywordPool {
  candidates: string[];
  totalGenerated: number;
  validCandidates: number;
  validRatio: number;
  strategy: PoolGenerationStrategy;
  generationTimeMs: number;
  clustersCovered: string[];
  selectedForMetadata: string[];
  platform: MicrostockPlatform;
  selectionCount: number;
}

// ── PIPELINE TYPES ──────────────────────────────────────────────────────────

export type PipelineStage =
  | "init"
  | "visual_extraction"
  | "title_synthesis"
  | "pool_generation"
  | "pool_validation"
  | "keyword_ranking"
  | "fallback_topup"
  | "category_prediction"
  | "prompt_enhancement"
  | "quality_audit"
  | "cache_write"
  | "complete";

export interface PipelineStageTrace {
  stage: PipelineStage;
  startMs: number;
  endMs: number;
  durationMs: number;
  success: boolean;
  output?: string;
  warning?: string;
}

export interface PipelineExecutionTrace {
  traceId: string;
  platform: MicrostockPlatform;
  strategy: PoolGenerationStrategy;
  totalDurationMs: number;
  stages: PipelineStageTrace[];
  apiCallCount: number;
  cacheHit: boolean;
  poolSize: number;
  finalKeywordCount: number;
  qualityGatePassed: boolean;
  feedbackLoops: number;
}

// ── OPTIMIZER TYPES ──────────────────────────────────────────────────────────

export interface OptimizedMetadata {
  title: string;
  keywords: string[];             // Final selected keywords for platform (49 or 50)
  keywordPool: string[];          // Full 500-candidate pool
  keywordScores?: KeywordScore[]; // Detailed scores for final keywords
  categories: string[];
  prompt: string;
  model: string;
  editorial: "yes" | "no";
  matureContent: "yes" | "no";
  illustration: "yes" | "no";
  confidenceScore: number;
  qualityMetrics: MetadataQualityMetrics;
  executionTrace?: PipelineExecutionTrace;
  mlInsights: {
    extractedConcepts: string[];
    detectedActions?: string[];
    detectedMaterials?: string[];
    prunedKeywords: string[];
    boostedKeywords: string[];
    predictedCategories: string[];
    aiModelUsed: string;
    reasoningChain: string[];
    poolSize: number;
    poolStrategy?: PoolGenerationStrategy;
  };
  aiForensics?: {
    modelUsed: string;
    reasoningChain: string[];
    latencyMs: number;
    visionUsed?: boolean;
  };
}

export interface OptimizerInput {
  title: string;
  keywords: string[];
  visualDescription?: string;
  visualHints?: string;
  existingPrompt?: string;
  platform: MicrostockPlatform;
  targetModel?: string;
  editorial?: "yes" | "no";
  matureContent?: "yes" | "no";
  illustration?: "yes" | "no";
  filename?: string;
  imageDataUrl?: string;          // base64 data URL for vision model
  useAI?: boolean;
  groqApiKey?: string;
  strategy?: PoolGenerationStrategy;
}

export interface BatchOptimizerInput {
  items: OptimizerInput[];
  concurrency?: number;           // default 3
  sharedPoolCache?: boolean;      // reuse pool across similar images
}

export interface BatchOptimizerResult {
  results: OptimizedMetadata[];
  failedIndices: number[];
  totalDurationMs: number;
  averageQualityScore: number;
}
