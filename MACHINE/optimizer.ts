/**
 * MACHINE/optimizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Pipeline Optimizer for Microstock Metadata Generation.
 *
 * PIPELINE OVERVIEW:
 *  1. Visual feature extraction (heuristic or AI vision)
 *  2. Build internal 500-keyword candidate pool (1-2 words, relevant, common)
 *  3. Rank pool → select best N for platform metadata:
 *       magnific    → 49 keywords
 *       adobe_stock → 49 keywords
 *       shutterstock → 50 keywords
 *  4. Category prediction, prompt enhancement, quality audit
 *
 * Model: Groq openai/gpt-oss-120b (reasoning) + qwen/qwen3.8-27b (vision)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { extractVisualFeatures, extractVisualFeaturesWithAI } from "./feature-extractor";
import { rankKeywords, rankKeywordsWithAI } from "./keyword-ranker";
import { classifyCategory, classifyCategoryWithAI } from "./category-predictor";
import {
  buildKeywordPool,
  buildKeywordPoolWithAI,
  expandConcepts,
  normalizeKeyword,
  getStemKey,
} from "./semantic-engine";
import { enhanceGenerativePrompt, enhanceGenerativePromptWithAI } from "./prompt-enhancer";
import { scoreMetadata, scoreMetadataWithAI } from "./confidence-scorer";
import { globalMachineCache } from "./cache-engine";
import { synthesizeTitleSync, optimizeTitleWithAI } from "./title-optimizer";
import { OptimizedMetadata, OptimizerInput, MicrostockPlatform } from "./types";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function deepCleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .replace(/['"`\\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Returns the exact keyword count the platform expects in the final metadata output.
 *  - magnific:     49  (platform auto-appends 'ai generate' as 50th)
 *  - adobe_stock:  49
 *  - shutterstock: 50
 */
function getMetadataKeywordCount(platform: MicrostockPlatform): number {
  return platform === "shutterstock" ? 50 : 49;
}

// ---------------------------------------------------------------------------
// DOMAIN-SPECIFIC & UNIVERSAL FALLBACK POOLS
// Safe, ultra-simple, high-converting 1-2 word everyday buyer tags.
// ---------------------------------------------------------------------------

const DOMAIN_FALLBACK_MAP: Record<string, string[]> = {
  automotive: [
    "car", "auto", "repair", "mechanic", "garage", "service", "vehicle",
    "tool", "worker", "workshop", "wheel", "motor", "inspection", "maintenance",
    "automobile", "fixing", "brake", "rotor", "caliper", "technician", "job"
  ],
  food: [
    "food", "meal", "fresh", "dish", "plate", "delicious", "healthy", "table",
    "kitchen", "cooking", "snack", "dinner", "lunch", "breakfast", "tasty",
    "organic", "cuisine", "gourmet", "nutrition", "chef", "recipe"
  ],
  nature: [
    "nature", "outdoor", "landscape", "scenic", "sky", "green", "tree", "plant",
    "environment", "field", "light", "view", "natural", "sunlight", "calm",
    "serene", "earth", "leaf", "horizon", "sunny", "scenery"
  ],
  business: [
    "business", "office", "work", "corporate", "professional", "success", "team",
    "meeting", "modern", "job", "worker", "finance", "strategy", "growth",
    "company", "career", "desk", "computer", "colleague", "planning"
  ],
  technology: [
    "technology", "computer", "digital", "screen", "data", "internet", "modern",
    "device", "laptop", "phone", "network", "tech", "online", "communication",
    "software", "smart", "electronic", "innovation", "display", "connection"
  ],
  health: [
    "health", "healthy", "medical", "wellness", "doctor", "care", "lifestyle",
    "fitness", "medicine", "clinic", "treatment", "exercise", "active", "patient",
    "hospital", "therapy", "checkup", "recovery", "body", "energy"
  ],
  people: [
    "person", "people", "man", "woman", "adult", "young", "portrait", "face",
    "smile", "happy", "lifestyle", "standing", "looking", "casual", "confident",
    "cheerful", "positive", "human", "attractive", "model"
  ],
};

const UNIVERSAL_FALLBACK_POOL: string[] = [
  "person", "man", "woman", "people", "adult", "young", "smile", "happy",
  "business", "office", "work", "professional", "modern", "lifestyle",
  "background", "concept", "isolated", "copy space", "clean", "minimal",
  "technology", "computer", "digital", "data", "screen",
  "nature", "outdoor", "sky", "light", "color",
  "food", "coffee", "drink", "table", "cup",
  "travel", "city", "street", "building", "car",
  "health", "fitness", "sport", "active", "energy",
  "design", "creative", "idea", "plan", "strategy",
  "finance", "money", "growth", "success", "team",
];

// ---------------------------------------------------------------------------
// SYNCHRONOUS PIPELINE  (zero-latency, no AI calls)
// ---------------------------------------------------------------------------

export function optimizeMetadata(input: OptimizerInput): OptimizedMetadata {
  const {
    title: rawTitle,
    keywords: rawKeywords,
    visualDescription = "",
    visualHints = "",
    existingPrompt,
    platform,
    targetModel = platform === "magnific" ? "Adobe Firefly" : "Midjourney 6",
    editorial = "no",
    matureContent = "no",
    illustration = "no",
    filename = "",
  } = input;

  const reasoningChain: string[] = [];
  const metadataCount = getMetadataKeywordCount(platform);
  reasoningChain.push(`Platform: '${platform}' → metadata output: ${metadataCount} keywords`);

  // 1. Visual Feature Extraction
  const visualFeatures = extractVisualFeatures(visualDescription, visualHints, rawTitle);
  reasoningChain.push(`Extracted ${visualFeatures.detectedObjects.length} visual subjects`);

  // 2. Title Optimization
  let title = synthesizeTitleSync(rawTitle, visualFeatures.detectedObjects, visualFeatures.commercialTheme || "", platform);
  reasoningChain.push(`Title (${title.split(" ").length} words): "${title}"`);

  // 3. Build 500-candidate keyword pool
  const cleanedInputKeywords = rawKeywords.map(k => normalizeKeyword(deepCleanText(k))).filter(Boolean);
  const extraContext = visualDescription.split(/\s+/).slice(0, 30);
  const pool500 = buildKeywordPool(
    [...visualFeatures.detectedObjects, ...cleanedInputKeywords.slice(0, 20)],
    extraContext,
    500,
  );
  reasoningChain.push(`Keyword pool built: ${pool500.length} candidates (target: 500)`);

  // 4. Rank pool → select best metadataCount keywords
  const contextCorpus = `${visualDescription} ${visualHints} ${title} ${visualFeatures.detectedObjects.join(" ")}`;
  const { rankedKeywords, prunedCount } = rankKeywords(pool500, contextCorpus, metadataCount);
  reasoningChain.push(`BM25+ ranking from pool: pruned ${prunedCount}, selected ${rankedKeywords.length}`);

  // 5. Domain-Aware & Universal Fallback Top-Up
  const finalKeywords = [...rankedKeywords];
  const seenStems = new Set<string>(finalKeywords.map(k => getStemKey(k)));

  const detectedLower = visualFeatures.detectedObjects.map(o => o.toLowerCase());
  const priorityFallbacks: string[] = [];
  if (detectedLower.some(o => ["car", "mechanic", "brake", "auto", "vehicle", "rotor", "wheel", "garage", "workshop"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.automotive || []));
  }
  if (detectedLower.some(o => ["food", "coffee", "meal", "salad", "pizza", "burger", "cake", "bread", "fruit", "cooking", "tea"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.food || []));
  }
  if (detectedLower.some(o => ["nature", "mountain", "beach", "ocean", "forest", "sky", "tree", "river", "lake", "sunset"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.nature || []));
  }
  if (detectedLower.some(o => ["business", "office", "meeting", "money", "finance", "laptop", "work"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.business || []));
  }
  if (detectedLower.some(o => ["computer", "technology", "phone", "screen", "data", "code", "tech"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.technology || []));
  }
  if (detectedLower.some(o => ["health", "doctor", "medicine", "fitness", "yoga", "gym", "clinic"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.health || []));
  }
  if (detectedLower.some(o => ["person", "man", "woman", "girl", "boy", "child", "people", "couple", "family"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.people || []));
  }

  const combinedFallbacks = [...priorityFallbacks, ...UNIVERSAL_FALLBACK_POOL];
  for (const fallback of combinedFallbacks) {
    if (finalKeywords.length >= metadataCount) break;
    const kw = normalizeKeyword(fallback);
    const stem = getStemKey(kw);
    if (!seenStems.has(stem)) {
      seenStems.add(stem);
      finalKeywords.push(kw);
    }
  }
  const constrainedKeywords = finalKeywords.slice(0, metadataCount);
  reasoningChain.push(`Final metadata keywords: exactly ${constrainedKeywords.length}`);

  // 6. Category prediction
  const categoryPrediction = classifyCategory(constrainedKeywords, visualFeatures, title, platform);
  const categories = [categoryPrediction.primaryCategory, categoryPrediction.secondaryCategory];
  if (categoryPrediction.tertiaryCategory) categories.push(categoryPrediction.tertiaryCategory);
  reasoningChain.push(`Categories: [${categories.join(", ")}] (${Math.round(categoryPrediction.confidence * 100)}%)`);

  // 7. Prompt enhancement
  const enhancedPrompt = enhanceGenerativePrompt({ existingPrompt, title, visualFeatures, targetModel });
  reasoningChain.push(`Prompt compiled for '${targetModel}'`);

  // 8. Quality scoring
  const qualityMetrics = scoreMetadata(title, constrainedKeywords, visualFeatures, metadataCount);
  reasoningChain.push(`Quality: ${qualityMetrics.overallScore}/100`);

  // 9. Cache
  const cacheKey = `${filename}_${title}_${platform}`;
  globalMachineCache.set(cacheKey, { title, keywords: constrainedKeywords, pool: pool500 });

  return {
    title,
    keywords: constrainedKeywords,
    keywordPool: pool500,
    categories,
    prompt: enhancedPrompt,
    model: targetModel,
    editorial,
    matureContent,
    illustration,
    confidenceScore: qualityMetrics.accuracyConfidence,
    qualityMetrics,
    mlInsights: {
      extractedConcepts: visualFeatures.detectedObjects,
      prunedKeywords: [`Pruned ${prunedCount} items from 500-pool`],
      boostedKeywords: constrainedKeywords.slice(0, 10),
      predictedCategories: categories,
      aiModelUsed: "MACHINE-ML-Cognitive-v3",
      reasoningChain,
      poolSize: pool500.length,
    },
  };
}

// ---------------------------------------------------------------------------
// ASYNC AI PIPELINE  (Groq 120B reasoning + Qwen vision)
// ---------------------------------------------------------------------------

export async function optimizeMetadataWithAI(input: OptimizerInput): Promise<OptimizedMetadata> {
  const startTime = Date.now();
  const {
    title: rawTitle,
    keywords: rawKeywords,
    visualDescription = "",
    visualHints = "",
    existingPrompt,
    platform,
    targetModel = platform === "magnific" ? "Adobe Firefly" : "Midjourney 6",
    editorial = "no",
    matureContent = "no",
    illustration = "no",
    filename = "",
    imageDataUrl,
  } = input;

  const reasoningChain: string[] = [];
  const metadataCount = getMetadataKeywordCount(platform);
  reasoningChain.push(`[Groq AI] Platform: '${platform}' → metadata output: ${metadataCount} keywords`);

  // Cache check
  const cacheKey = `ai_${filename}_${rawTitle}_${platform}`;
  const cached = globalMachineCache.get(cacheKey);
  if (cached && cached.keywords?.length === metadataCount) {
    return cached;
  }

  // 1. AI Visual Feature Extraction
  const visualFeatures = await extractVisualFeaturesWithAI(visualDescription, visualHints, imageDataUrl);
  reasoningChain.push(`[Groq AI] Vision: [${visualFeatures.detectedObjects.join(", ")}] | Theme: ${visualFeatures.commercialTheme}`);

  // 2. AI Title Optimization
  const cleanedInputKeywords = rawKeywords.map(k => normalizeKeyword(deepCleanText(k))).filter(Boolean);
  const titleResult = await optimizeTitleWithAI(rawTitle, {
    detectedObjects: visualFeatures.detectedObjects,
    commercialTheme: visualFeatures.commercialTheme,
    platform,
    keywords: cleanedInputKeywords,
    visualDescription,
  });
  let title = titleResult.optimized;
  reasoningChain.push(`[Groq AI] Title (${title.split(" ").length} words, score: ${titleResult.analysis.titleScore}/100): "${title}"`);

  // 3. Build 500-candidate pool using AI expansion
  const contextCorpus = `${visualDescription} ${visualHints} ${title} ${visualFeatures.detectedObjects.join(" ")} ${visualFeatures.sceneContext}`;
  const pool500 = await buildKeywordPoolWithAI(
    [...visualFeatures.detectedObjects, ...cleanedInputKeywords.slice(0, 20)],
    contextCorpus,
    500,
  );
  reasoningChain.push(`[Groq AI] Keyword pool: ${pool500.length} candidates generated`);

  // 4. AI Ranking — select best metadataCount from the 500 pool
  const aiRanking = await rankKeywordsWithAI(pool500, contextCorpus, metadataCount);
  const finalKeywords = [...aiRanking.rankedKeywords];
  const seenStems = new Set<string>(finalKeywords.map(k => getStemKey(k)));

  // 5. Domain-Aware & Universal Fallback Top-Up
  const detectedLower = visualFeatures.detectedObjects.map(o => o.toLowerCase());
  const priorityFallbacks: string[] = [];
  if (detectedLower.some(o => ["car", "mechanic", "brake", "auto", "vehicle", "rotor", "wheel", "garage", "workshop"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.automotive || []));
  }
  if (detectedLower.some(o => ["food", "coffee", "meal", "salad", "pizza", "burger", "cake", "bread", "fruit", "cooking", "tea"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.food || []));
  }
  if (detectedLower.some(o => ["nature", "mountain", "beach", "ocean", "forest", "sky", "tree", "river", "lake", "sunset"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.nature || []));
  }
  if (detectedLower.some(o => ["business", "office", "meeting", "money", "finance", "laptop", "work"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.business || []));
  }
  if (detectedLower.some(o => ["computer", "technology", "phone", "screen", "data", "code", "tech"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.technology || []));
  }
  if (detectedLower.some(o => ["health", "doctor", "medicine", "fitness", "yoga", "gym", "clinic"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.health || []));
  }
  if (detectedLower.some(o => ["person", "man", "woman", "girl", "boy", "child", "people", "couple", "family"].includes(o))) {
    priorityFallbacks.push(...(DOMAIN_FALLBACK_MAP.people || []));
  }

  const combinedFallbacks = [...priorityFallbacks, ...UNIVERSAL_FALLBACK_POOL];
  for (const fallback of combinedFallbacks) {
    if (finalKeywords.length >= metadataCount) break;
    const kw = normalizeKeyword(fallback);
    const stem = getStemKey(kw);
    if (!seenStems.has(stem)) {
      seenStems.add(stem);
      finalKeywords.push(kw);
    }
  }
  const constrainedKeywords = finalKeywords.slice(0, metadataCount);
  reasoningChain.push(`[Groq AI] Final metadata: exactly ${constrainedKeywords.length} keywords selected from ${pool500.length}-pool`);

  // 6. AI Category
  const categoryPrediction = await classifyCategoryWithAI(constrainedKeywords, visualFeatures, title, platform);
  const categories = [categoryPrediction.primaryCategory, categoryPrediction.secondaryCategory];
  if (categoryPrediction.tertiaryCategory) categories.push(categoryPrediction.tertiaryCategory);
  reasoningChain.push(`[Groq AI] Categories: [${categories.join(", ")}]`);

  // 7. AI Prompt
  const promptResult = await enhanceGenerativePromptWithAI({ existingPrompt, title, visualFeatures, targetModel });
  reasoningChain.push(`[Groq AI] Prompt: ${promptResult.cameraSettings}`);

  // 8. AI Quality Audit
  const qualityMetrics = await scoreMetadataWithAI(title, constrainedKeywords, visualFeatures, metadataCount);
  reasoningChain.push(`[Groq AI] Quality: ${qualityMetrics.overallScore}/100, Simplicity: ${Math.round(qualityMetrics.simplicityIndex * 100)}%`);

  const latencyMs = Date.now() - startTime;

  const result: OptimizedMetadata = {
    title,
    keywords: constrainedKeywords,
    keywordPool: pool500,
    categories,
    prompt: promptResult.enhancedPrompt,
    model: targetModel,
    editorial,
    matureContent,
    illustration,
    confidenceScore: qualityMetrics.accuracyConfidence,
    qualityMetrics,
    mlInsights: {
      extractedConcepts: visualFeatures.detectedObjects,
      prunedKeywords: [`Pruned ${aiRanking.prunedCount} from ${pool500.length}-pool`],
      boostedKeywords: constrainedKeywords.slice(0, 10),
      predictedCategories: categories,
      aiModelUsed: "Groq openai/gpt-oss-120b + qwen/qwen3.8-27b",
      reasoningChain,
      poolSize: pool500.length,
    },
    aiForensics: {
      modelUsed: "openai/gpt-oss-120b + qwen/qwen3.8-27b",
      reasoningChain,
      latencyMs,
    },
  };

  globalMachineCache.set(cacheKey, result);
  return result;
}
