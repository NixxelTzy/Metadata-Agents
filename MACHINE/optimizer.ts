/**
 * MACHINE/optimizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Pipeline Optimizer for Microstock Metadata Generation.
 * Synthesizes visual forensics, statistical BM25+ keyword ranking,
 * category classification, generative prompt enhancement, and quality auditing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { extractVisualFeatures } from "./feature-extractor";
import { rankKeywords } from "./keyword-ranker";
import { classifyCategory } from "./category-predictor";
import { expandConcepts, normalizeKeyword, getStemKey } from "./semantic-engine";
import { enhanceGenerativePrompt } from "./prompt-enhancer";
import { scoreMetadata } from "./confidence-scorer";
import { globalMachineCache } from "./cache-engine";
import { OptimizedMetadata, OptimizerInput } from "./types";

/**
 * Strips all residual quote characters, backticks, and escape slashes.
 */
function deepCleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .replace(/['"`\\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Synthesizes a compelling 8-12 word commercial microstock title if provided title is sparse.
 */
function synthesizeCommercialTitle(
  existingTitle: string,
  visualDescription: string,
  detectedObjects: string[],
  commercialTheme?: string
): string {
  const cleaned = deepCleanText(existingTitle);
  const words = cleaned.split(/\s+/).filter(Boolean);

  // If existing title is already strong (7-15 words), keep it
  if (words.length >= 7 && words.length <= 16) {
    return cleaned;
  }

  // If short, enrich with visual context and commercial anchor
  const primarySubject = detectedObjects[0] || "commercial stock subject";
  const contextPhrase = visualDescription ? visualDescription.slice(0, 60) : "with natural lighting";

  if (words.length > 0 && words.length < 7) {
    return `${cleaned} with modern natural lighting and copy space background`;
  }

  if (commercialTheme) {
    return `High quality ${commercialTheme} with professional lighting and copy space`;
  }

  return `Professional photograph of ${primarySubject} ${contextPhrase} with copy space`;
}

/**
 * Executes the complete MACHINE ML optimization pipeline on metadata.
 */
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

  // Exact target keyword count per platform:
  // Magnific = 49 (platform auto-appends 'ai generate' as 50th)
  // Adobe Stock = 49
  // Shutterstock = 50
  const targetCount = platform === "shutterstock" ? 50 : 49;
  reasoningChain.push(`Targeting ${targetCount} keywords for platform '${platform}'`);

  // 1. Visual Feature Extraction
  const visualFeatures = extractVisualFeatures(visualDescription, visualHints, rawTitle);
  reasoningChain.push(`Extracted visual features: ${visualFeatures.detectedObjects.length} subjects, ${visualFeatures.colorTemperature} temperature, ${visualFeatures.lightingStyle}`);

  // 2. Deep Clean & Refine Title
  let title = deepCleanText(rawTitle);
  title = synthesizeCommercialTitle(title, visualDescription, visualFeatures.detectedObjects, visualFeatures.commercialTheme);
  title = deepCleanText(title);
  reasoningChain.push(`Formulated commercial title (${title.split(' ').length} words): "${title}"`);

  // 3. Keyword Normalization & Semantic Concept Expansion
  const cleanedKeywords = rawKeywords.map(k => normalizeKeyword(deepCleanText(k))).filter(Boolean);
  const expandedAdditions = expandConcepts(visualFeatures.detectedObjects, 18);
  const fullCandidatePool = [...cleanedKeywords, ...expandedAdditions];
  reasoningChain.push(`Pool expanded: ${cleanedKeywords.length} original + ${expandedAdditions.length} concept synonyms`);

  // 4. Algorithmic Machine Keyword Ranking (Okapi BM25+ & Buyer Intent & Porter Stem Deduplication)
  const contextCorpus = `${visualDescription} ${visualHints} ${title} ${visualFeatures.detectedObjects.join(" ")} ${visualFeatures.sceneContext}`;
  const { rankedKeywords, prunedCount } = rankKeywords(fullCandidatePool, contextCorpus, targetCount);
  reasoningChain.push(`BM25+ ranking completed: pruned ${prunedCount} redundant/invalid items`);

  // 5. Intelligent Fallback Top-Up (Guarantees exact required count)
  const finalKeywords = [...rankedKeywords];
  const seenStemsInFinal = new Set<string>(finalKeywords.map(k => getStemKey(k)));

  const fallbackFillers = [
    "commercial", "background", "concept", "isolated", "copy space", "nature", "lifestyle",
    "modern", "professional", "clean", "design", "creative", "bright", "authentic",
    "minimalist", "healthy", "wellness", "serene", "texture", "pattern", "organic", "luxury",
    "elegance", "tranquil", "fresh", "outdoor", "indoor", "composition", "horizontal", "nobody",
    "daylight", "scenic", "beautiful", "sunlight", "calm", "contemporary", "high quality",
    "vibrant", "horizontal view", "detail", "close up", "focus", "clear", "simplicity",
    "smooth", "atmosphere", "visual", "space", "element", "artistic", "inspiration",
    "environment", "pure", "graphic", "harmony", "view", "light", "color", "balance"
  ];

  for (const fallback of fallbackFillers) {
    if (finalKeywords.length >= targetCount) break;
    const stem = getStemKey(fallback);
    if (!seenStemsInFinal.has(stem) && !finalKeywords.includes(fallback)) {
      seenStemsInFinal.add(stem);
      finalKeywords.push(fallback);
    }
  }

  // Ensure strict length match
  const constrainedKeywords = finalKeywords.slice(0, targetCount);
  reasoningChain.push(`Final keyword count sealed at exactly ${constrainedKeywords.length}`);

  // 6. Dual-Platform Category Prediction
  const categoryPrediction = classifyCategory(constrainedKeywords, visualFeatures, title, platform);
  const categories = [categoryPrediction.primaryCategory, categoryPrediction.secondaryCategory];
  if (categoryPrediction.tertiaryCategory) {
    categories.push(categoryPrediction.tertiaryCategory);
  }
  reasoningChain.push(`Predicted categories: [${categories.join(", ")}] with ${Math.round(categoryPrediction.confidence * 100)}% confidence`);

  // 7. Generative Prompt Enhancement
  const enhancedPrompt = enhanceGenerativePrompt({
    existingPrompt,
    title,
    visualFeatures,
    targetModel,
  });
  reasoningChain.push(`Enhanced prompt compiled for model '${targetModel}'`);

  // 8. Multi-Factor Quality & Confidence Scoring
  const qualityMetrics = scoreMetadata(title, constrainedKeywords, visualFeatures, targetCount);
  reasoningChain.push(`Forensic quality score: ${qualityMetrics.overallScore}/100, Accuracy: ${Math.round(qualityMetrics.accuracyConfidence * 100)}%`);

  // 9. Cache Final Optimization Output
  const cacheKey = `${filename}_${title}_${platform}`;
  globalMachineCache.set(cacheKey, {
    title,
    keywords: constrainedKeywords,
    confidence: qualityMetrics.accuracyConfidence,
    overallScore: qualityMetrics.overallScore,
  });

  return {
    title,
    keywords: constrainedKeywords,
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
      prunedKeywords: [`Pruned ${prunedCount} low-quality/redundant items`],
      boostedKeywords: constrainedKeywords.slice(0, 10),
      predictedCategories: categories,
      aiModelUsed: "MACHINE-ML-Cognitive-v2",
      reasoningChain,
    },
  };
}
