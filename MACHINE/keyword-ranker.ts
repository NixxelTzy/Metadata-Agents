/**
 * MACHINE/keyword-ranker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Objective Microstock Keyword Ranking Engine.
 * Features:
 *  1. Okapi BM25+ Information Retrieval Scoring with Length Normalization
 *  2. Commercial Buyer Intent Indexing (High-converting microstock terms)
 *  3. Simplicity & Buyer Searchability Index (Favors standard high-volume English)
 *  4. Strict Morphological Stem Deduplication (Porter algorithm)
 *  5. Algorithmic Portfolio Balancing (Subjects, Actions, Context, Commercial)
 *  6. Adobe Stock Top-10 Priority Front-Loading
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KeywordScore, KeywordCategory } from "./types";
import { normalizeKeyword, isInvalidKeyword, getStemKey } from "./semantic-engine";

// High-converting commercial buyer search terms with calibrated search volume weights (1.0 to 2.8)
const HIGH_INTENT_BUYER_VOCABULARY: Record<string, number> = {
  // Prime Commercial Attributes (Top Search Demands)
  "copy space": 2.8,
  "isolated": 2.7,
  "background": 2.5,
  "concept": 2.5,
  "flat lay": 2.4,
  "top view": 2.4,
  "closeup": 2.3,
  "minimal": 2.2,
  "minimalist": 2.2,
  "texture": 2.2,
  "pattern": 2.1,
  "empty space": 2.3,

  // Business, Tech & Lifestyle Keywords
  "business": 2.6,
  "lifestyle": 2.5,
  "modern": 2.4,
  "technology": 2.5,
  "corporate": 2.3,
  "professional": 2.3,
  "success": 2.2,
  "strategy": 2.2,
  "innovation": 2.3,
  "workplace": 2.2,
  "office": 2.2,
  "finance": 2.3,

  // Nature, Health & Mood Keywords
  "nature": 2.5,
  "sustainable": 2.4,
  "healthy": 2.3,
  "wellness": 2.4,
  "organic": 2.3,
  "fresh": 2.2,
  "clean": 2.2,
  "bright": 2.1,
  "serene": 2.1,
  "tranquility": 2.0,
  "authentic": 2.3,
  "vibrant": 2.2,
  "eco friendly": 2.4,
  "luxury": 2.2,
  "elegance": 2.1,
};

// Common Everyday Search Terms (High Simplicity Index: 0.9 to 1.0)
const HIGH_SIMPLICITY_TERMS = new Set([
  "water", "man", "woman", "person", "people", "food", "tree", "sky",
  "car", "house", "room", "table", "chair", "hand", "face", "sun",
  "dog", "cat", "flower", "coffee", "cup", "book", "light", "road",
  "city", "street", "summer", "winter", "green", "blue", "white", "black",
  "happy", "work", "travel", "home", "healthy", "clean", "fresh", "office"
]);

/**
 * Categorizes keyword into portfolio dimensions for balanced agency tagging.
 */
function categorizeKeyword(kw: string): KeywordCategory {
  const commercialWords = ["copy space", "isolated", "concept", "background", "texture", "pattern", "minimal", "empty space", "backdrop", "template"];
  const moodWords = ["happy", "serene", "peaceful", "energetic", "dark", "bright", "cozy", "luxury", "dramatic", "calm", "joy", "cheerful", "moody"];
  const actionWords = ["walking", "working", "smiling", "running", "looking", "holding", "standing", "sitting", "cooking", "exercising", "training"];
  const envWords = ["indoor", "outdoor", "studio", "office", "street", "forest", "mountain", "beach", "room", "kitchen", "garden", "city", "park"];
  const styleWords = ["flat lay", "top view", "macro", "panoramic", "aerial", "vintage", "modern", "rustic", "minimalist", "cinematic", "overhead"];

  if (commercialWords.some(w => kw.includes(w))) return "commercial";
  if (styleWords.some(w => kw.includes(w))) return "style";
  if (moodWords.some(w => kw.includes(w))) return "mood";
  if (actionWords.some(w => kw.includes(w))) return "action";
  if (envWords.some(w => kw.includes(w))) return "environment";
  return "subject";
}

/**
 * Calculates Okapi BM25+ relevance score between query/context tokens and target keyword.
 * Uses BM25+ variant with lower-bound parameter delta = 1.0 to prevent zero-score underflow.
 */
function calculateBM25Score(keyword: string, contextTokens: string[], avgDocLength = 30): number {
  const kwTokens = keyword.split(" ").filter(Boolean);
  const docLength = contextTokens.length;
  const k1 = 1.2;
  const b = 0.75;
  const delta = 1.0;

  let totalScore = 0;

  for (const token of kwTokens) {
    const tokenStem = getStemKey(token);
    // Count occurrences of token or its stem in context
    let tf = 0;
    for (const ct of contextTokens) {
      if (ct === token || getStemKey(ct) === tokenStem) {
        tf++;
      }
    }

    if (tf > 0) {
      const termScore = ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))) + delta;
      totalScore += termScore;
    }
  }

  // Normalize relative to keyword token count
  return totalScore / Math.max(1, kwTokens.length);
}

/**
 * Computes the simplicity / searchability index (0.0 to 1.0)
 * Favors 1-2 word common English tags over obscure or hyper-specialized vocabulary.
 */
function computeSimplicityScore(kw: string): number {
  const words = kw.split(" ");
  let score = 0.75;

  // Length factor: 1 or 2 words are optimal for stock search
  if (words.length === 1) score += 0.15;
  else if (words.length === 2) score += 0.10;
  else score -= 0.20;

  // Check if keyword contains common vocabulary
  if (words.some(w => HIGH_SIMPLICITY_TERMS.has(w))) {
    score += 0.10;
  }

  // Penalize excessively long individual words (> 13 characters)
  if (words.some(w => w.length > 13)) {
    score -= 0.15;
  }

  return Math.min(1.0, Math.max(0.2, Number(score.toFixed(2))));
}

/**
 * Ranks candidate keywords using multi-objective statistical optimization:
 *  - Visual alignment (BM25+)
 *  - Commercial buyer intent
 *  - Natural English simplicity
 *  - Strict Porter stem deduplication
 *  - Top-10 Adobe Stock front-loading
 */
export function rankKeywords(
  candidates: string[],
  contextText: string,
  targetCount = 49
): { rankedKeywords: string[]; keywordScores: KeywordScore[]; prunedCount: number } {
  const contextTokens = contextText
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const scoredList: KeywordScore[] = [];
  const seenStems = new Set<string>();
  let prunedCount = 0;

  for (const rawKw of candidates) {
    const kw = normalizeKeyword(rawKw);

    if (isInvalidKeyword(kw)) {
      prunedCount++;
      continue;
    }

    // Strict Stem Deduplication: prevents redundant morphological clutter
    const stem = getStemKey(kw);
    if (seenStems.has(stem)) {
      prunedCount++;
      continue;
    }
    seenStems.add(stem);

    // 1. BM25+ Visual Context Relevance Score (0.0 to 1.0 normalized)
    const rawBM25 = calculateBM25Score(kw, contextTokens);
    const relevanceScore = Math.min(1.0, Number((rawBM25 / 3.5).toFixed(2)));

    // 2. Commercial Buyer Intent Score (0.0 to 1.0 normalized)
    const buyerWeight = HIGH_INTENT_BUYER_VOCABULARY[kw] || 1.0;
    const buyerIntentScore = Number((buyerWeight / 2.8).toFixed(2));

    // 3. Simplicity Score (0.0 to 1.0)
    const simplicityScore = computeSimplicityScore(kw);

    // 4. Combined Multi-Objective Algorithmic SEO Weight
    // Prioritizes relevance (45%), buyer intent (35%), and simplicity (20%)
    const seoWeight = Number(
      (
        (relevanceScore * 1.8) +
        (buyerIntentScore * 1.4) +
        (simplicityScore * 0.8)
      ).toFixed(3)
    );

    const category = categorizeKeyword(kw);
    const searchVolumeTier = buyerWeight >= 2.2 ? "high" : buyerWeight >= 1.5 ? "medium" : "niche";

    scoredList.push({
      keyword: kw,
      relevanceScore,
      buyerIntentScore,
      simplicityScore,
      seoWeight,
      category,
      stemKey: stem,
      searchVolumeTier,
    });
  }

  // Sort descending by composite SEO weight
  scoredList.sort((a, b) => b.seoWeight - a.seoWeight);

  // Adobe Stock Strategy: Front-load the top-5 strongest primary concepts and commercial hooks
  const top10Anchors = scoredList.slice(0, 10);
  top10Anchors.sort((a, b) => (b.relevanceScore + b.buyerIntentScore) - (a.relevanceScore + a.buyerIntentScore));

  const remaining = scoredList.slice(10);
  const orderedList = [...top10Anchors, ...remaining];

  const selectedScores = orderedList.slice(0, targetCount);
  const rankedKeywords = selectedScores.map((s) => s.keyword);

  return {
    rankedKeywords,
    keywordScores: selectedScores,
    prunedCount,
  };
}
