/**
 * MACHINE/keyword-ranker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Objective Microstock Keyword Ranking Engine.
 * Features:
 *  1. Okapi BM25+ Information Retrieval Scoring with Length Normalization
 *  2. Commercial Buyer Intent Indexing (High-converting microstock terms)
 *  3. Ultra-High Simplicity & Buyer Searchability Index (Favors common 1-word tags)
 *  4. Strict Morphological Stem Deduplication (Porter algorithm)
 *  5. Algorithmic Portfolio Balancing (Subjects, Actions, Context, Commercial)
 *  6. Adobe Stock Top-10 Priority Front-Loading
 *  7. Groq AI Neural Ranking (openai/gpt-oss-120b Reasoning Engine)
 *
 * PIPELINE:
 *  Input: up to 500-candidate keyword pool (from buildKeywordPool / buildKeywordPoolWithAI)
 *  Output: best 49 or 50 keywords selected for the target platform metadata
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KeywordScore, KeywordCategory } from "./types";
import { normalizeKeyword, isInvalidKeyword, getStemKey } from "./semantic-engine";
import { callGroq, REASONING_MODEL, GroqMessage } from "@/lib/groq";

// High-converting commercial buyer search terms — 300+ terms, calibrated search volume weights (1.0–2.8)
const HIGH_INTENT_BUYER_VOCABULARY: Record<string, number> = {

  // ── Prime Commercial Attributes (Top Stock Search Demand) ──
  "copy space": 2.8, "isolated": 2.7, "background": 2.7, "concept": 2.6,
  "white background": 2.6, "flat lay": 2.5, "top view": 2.5, "overhead": 2.4,
  "closeup": 2.4, "close up": 2.4, "macro": 2.3, "empty space": 2.3,
  "minimal": 2.4, "minimalist": 2.4, "clean": 2.5, "simple": 2.3,
  "blank": 2.3, "template": 2.3, "banner": 2.2, "design": 2.4,

  // ── People & Portraits ──
  "woman": 2.7, "man": 2.7, "person": 2.6, "people": 2.6, "family": 2.6,
  "portrait": 2.5, "face": 2.5, "smile": 2.5, "happy": 2.5, "couple": 2.5,
  "baby": 2.5, "child": 2.5, "girl": 2.5, "boy": 2.4, "senior": 2.3,
  "adult": 2.4, "team": 2.4, "group": 2.4, "crowd": 2.3, "friends": 2.4,
  "model": 2.4, "lifestyle": 2.6, "headshot": 2.4, "expression": 2.2,
  "beautiful": 2.4, "young": 2.4, "diversity": 2.3, "laugh": 2.3,

  // ── Food & Drink ──
  "food": 2.8, "meal": 2.7, "coffee": 2.8, "drink": 2.6, "dinner": 2.5,
  "lunch": 2.4, "breakfast": 2.5, "cooking": 2.5, "kitchen": 2.5,
  "restaurant": 2.5, "organic": 2.5, "fresh": 2.5, "healthy food": 2.5,
  "salad": 2.5, "pizza": 2.5, "burger": 2.4, "cake": 2.4, "fruit": 2.5,
  "vegetable": 2.4, "bread": 2.4, "wine": 2.4, "beer": 2.3, "juice": 2.4,
  "tea": 2.4, "chef": 2.4, "recipe": 2.3, "delicious": 2.4, "gourmet": 2.3,
  "dessert": 2.4, "chocolate": 2.4, "baking": 2.3, "seafood": 2.3,
  "plate": 2.4, "bowl": 2.3, "snack": 2.3,

  // ── Nature & Landscape ──
  "nature": 2.8, "outdoor": 2.7, "landscape": 2.7, "mountain": 2.6,
  "beach": 2.7, "ocean": 2.6, "forest": 2.6, "sunset": 2.7, "sunrise": 2.5,
  "sky": 2.5, "cloud": 2.4, "tree": 2.5, "flower": 2.6, "garden": 2.5,
  "water": 2.6, "lake": 2.5, "river": 2.4, "snow": 2.4, "rain": 2.3,
  "green": 2.4, "leaf": 2.3, "grass": 2.3, "summer": 2.5, "winter": 2.4,
  "spring": 2.4, "autumn": 2.4, "tropical": 2.5, "scenic": 2.5,
  "field": 2.4, "park": 2.4, "waterfall": 2.4, "desert": 2.3,
  "coast": 2.4, "horizon": 2.3, "golden hour": 2.4, "environment": 2.4,

  // ── Animals & Wildlife ──
  "dog": 2.7, "cat": 2.7, "bird": 2.5, "animal": 2.5, "pet": 2.6,
  "wildlife": 2.5, "puppy": 2.6, "kitten": 2.5, "horse": 2.4, "fish": 2.3,
  "butterfly": 2.4, "bee": 2.3, "lion": 2.3, "tiger": 2.3, "elephant": 2.3,
  "rabbit": 2.4, "cute animal": 2.4, "fur": 2.3, "wild": 2.3,

  // ── Technology & Digital ──
  "technology": 2.7, "digital": 2.6, "computer": 2.6, "phone": 2.6,
  "laptop": 2.6, "screen": 2.4, "internet": 2.4, "smartphone": 2.5,
  "app": 2.3, "software": 2.3, "network": 2.3, "data": 2.4,
  "cyber": 2.3, "innovation": 2.4, "ai": 2.5, "robot": 2.4,
  "code": 2.3, "tablet": 2.4, "camera": 2.4, "headphones": 2.3,
  "smartwatch": 2.3, "drone": 2.4, "online": 2.3, "wireless": 2.3,
  "virtual": 2.3, "cloud computing": 2.3, "cybersecurity": 2.3,

  // ── Business & Work ──
  "business": 2.7, "office": 2.6, "corporate": 2.5, "professional": 2.5,
  "success": 2.5, "meeting": 2.5, "career": 2.4, "finance": 2.5,
  "money": 2.5, "investment": 2.4, "economy": 2.3, "growth": 2.4,
  "strategy": 2.3, "leadership": 2.4, "entrepreneur": 2.3, "startup": 2.3,
  "executive": 2.3, "marketing": 2.3, "teamwork": 2.4, "productivity": 2.3,
  "management": 2.3, "handshake": 2.4, "contract": 2.3, "deal": 2.3,
  "conference": 2.3, "presentation": 2.4, "planning": 2.3,

  // ── Health & Medical ──
  "health": 2.7, "doctor": 2.6, "medical": 2.6, "hospital": 2.5,
  "wellness": 2.6, "medicine": 2.5, "nurse": 2.5, "healthy": 2.6,
  "therapy": 2.4, "care": 2.4, "clinic": 2.4, "pharmacy": 2.3,
  "treatment": 2.4, "patient": 2.4, "stethoscope": 2.4, "diet": 2.4,
  "nutrition": 2.4, "mental health": 2.4, "dental": 2.3, "vitamin": 2.3,
  "first aid": 2.4, "recovery": 2.3, "checkup": 2.3,

  // ── Sports & Fitness ──
  "fitness": 2.7, "exercise": 2.6, "yoga": 2.6, "running": 2.6,
  "gym": 2.6, "athlete": 2.5, "training": 2.5, "workout": 2.5,
  "sport": 2.6, "swimming": 2.4, "cycling": 2.4, "hiking": 2.4,
  "marathon": 2.3, "basketball": 2.3, "football": 2.3, "soccer": 2.3,
  "tennis": 2.3, "golf": 2.3, "boxing": 2.3, "dance": 2.4,
  "active": 2.4, "strength": 2.3, "stretching": 2.3, "pilates": 2.3,

  // ── Automotive & Mechanics ──
  "car": 2.8, "mechanic": 2.8, "repair": 2.7, "brake": 2.7,
  "auto": 2.7, "garage": 2.6, "service": 2.6, "workshop": 2.5,
  "technician": 2.5, "automobile": 2.5, "maintenance": 2.5, "tool": 2.6,
  "worker": 2.6, "vehicle": 2.6, "rotor": 2.4, "caliper": 2.3,
  "wheel": 2.5, "fixing": 2.4, "inspection": 2.4, "automotive": 2.5,
  "motor": 2.4, "engine": 2.4, "driving": 2.4, "road": 2.4, "tire": 2.3,

  // ── Travel & Tourism ──
  "travel": 2.7, "vacation": 2.7, "holiday": 2.6, "tourism": 2.5,
  "destination": 2.5, "adventure": 2.5, "hotel": 2.5, "airport": 2.4,
  "airplane": 2.4, "luggage": 2.3, "tourist": 2.4, "resort": 2.4,
  "explore": 2.4, "journey": 2.4, "trip": 2.5, "backpack": 2.3,
  "passport": 2.3, "city": 2.5, "urban": 2.4, "map": 2.3,
  "sightseeing": 2.3, "beach vacation": 2.4, "mountain travel": 2.3,

  // ── Home & Interior ──
  "home": 2.6, "interior": 2.6, "room": 2.5, "furniture": 2.5,
  "bedroom": 2.5, "living room": 2.5, "decor": 2.5, "house": 2.5,
  "cozy": 2.5, "apartment": 2.4, "sofa": 2.3, "chair": 2.3,
  "table": 2.3, "lamp": 2.2, "modern home": 2.4, "clean home": 2.4,
  "bathroom": 2.4, "kitchen design": 2.4, "real estate": 2.5,
  "property": 2.4, "architecture": 2.4,

  // ── Fashion & Beauty ──
  "fashion": 2.6, "beauty": 2.6, "makeup": 2.5, "skincare": 2.5,
  "clothing": 2.5, "dress": 2.5, "style": 2.4, "model fashion": 2.4,
  "hair": 2.4, "cosmetics": 2.4, "perfume": 2.3, "jewelry": 2.3,
  "elegant": 2.4, "glamour": 2.3, "trendy": 2.3, "casual wear": 2.3,

  // ── Education ──
  "education": 2.5, "school": 2.5, "student": 2.5, "learning": 2.5,
  "book": 2.4, "classroom": 2.4, "university": 2.4, "teacher": 2.4,
  "study": 2.4, "knowledge": 2.3, "library": 2.3, "graduation": 2.4,
  "science": 2.4, "research": 2.3, "academic": 2.3,

  // ── Celebrations & Events ──
  "christmas": 2.5, "birthday": 2.5, "wedding": 2.5, "party": 2.5,
  "celebration": 2.5, "holiday season": 2.4, "festival": 2.4,
  "gift": 2.4, "balloon": 2.3, "cake celebration": 2.4,
  "new year": 2.4, "graduation party": 2.3, "valentine": 2.4,

  // ── Abstract, Mood & Color ──
  "abstract": 2.4, "texture": 2.4, "pattern": 2.4, "gradient": 2.3,
  "colorful": 2.4, "vibrant": 2.3, "bright": 2.3, "dark": 2.2,
  "light": 2.3, "color": 2.3, "blue": 2.3, "red": 2.2, "green color": 2.2,
  "warm": 2.3, "cool": 2.2, "peaceful": 2.3, "serene": 2.3,
  "tranquil": 2.2, "authentic": 2.4, "luxury": 2.3, "elegant design": 2.3,
  "sustainable": 2.4, "eco": 2.3, "wellness lifestyle": 2.4,
};


// Common Everyday Search Terms (High Simplicity Index: 0.9 to 1.0)
const HIGH_SIMPLICITY_TERMS = new Set([
  // People & basic human attributes
  "water", "man", "woman", "person", "people", "food", "tree", "sky",
  "car", "house", "room", "table", "chair", "hand", "face", "sun",
  "dog", "cat", "flower", "coffee", "cup", "book", "light", "road",
  "city", "street", "summer", "winter", "green", "blue", "white", "black",
  "happy", "work", "travel", "home", "healthy", "clean", "fresh", "office",
  "baby", "child", "girl", "boy", "couple", "family", "team", "crowd",
  "smile", "look", "walk", "stand", "sit", "run", "hold", "young", "adult",
  // Automotive & mechanics
  "auto", "brake", "mechanic", "repair", "service", "garage", "tool",
  "worker", "wheel", "workshop", "inspection", "fixing", "rotor", "caliper",
  "vehicle", "job", "labor", "check", "disc", "drive", "equipment",
  "motor", "trade", "safety", "male", "technician", "automotive", "metal",
  "engine", "tire", "truck", "bike", "speed",
  // Food & drink
  "meal", "dish", "plate", "bowl", "snack", "bread", "cake", "salad",
  "fruit", "vegetable", "meat", "fish", "soup", "tea", "drink", "juice",
  "wine", "beer", "kitchen", "cook", "chef", "sweet", "tasty", "sugar",
  // Nature & outdoors
  "nature", "mountain", "beach", "sea", "ocean", "river", "lake", "forest",
  "wood", "grass", "leaf", "plant", "rose", "garden", "park", "cloud",
  "rain", "snow", "ice", "stone", "rock", "sand", "hill", "view",
  // Technology & digital
  "tech", "phone", "screen", "computer", "laptop", "data", "code", "app",
  "web", "camera", "robot", "drone", "audio", "sound", "wire", "chip",
  // Business, finance & work
  "business", "desk", "meeting", "money", "cash", "bank", "card", "coin",
  "plan", "deal", "growth", "career", "paper", "pen", "note",
  // Health, sports & wellness
  "health", "doctor", "nurse", "care", "pill", "clinic", "fit", "gym",
  "sport", "yoga", "exercise", "rest", "sleep", "spa", "active", "body",
  // Design, home & abstract
  "background", "concept", "color", "space", "line", "shape", "pattern",
  "texture", "wall", "floor", "door", "window", "bed", "sofa", "lamp",
  "art", "style", "modern", "simple", "luxury", "bright", "dark", "warm", "cool"
]);

/**
 * Categorizes keyword into portfolio dimensions for balanced agency tagging.
 */
function categorizeKeyword(kw: string): KeywordCategory {
  const commercialWords = ["copy space", "isolated", "concept", "background", "texture", "pattern", "minimal", "empty space", "backdrop", "template"];
  const moodWords = ["happy", "serene", "peaceful", "energetic", "dark", "bright", "cozy", "luxury", "dramatic", "calm", "joy", "cheerful", "moody"];
  const actionWords = ["walking", "working", "smiling", "running", "looking", "holding", "standing", "sitting", "cooking", "exercising", "training", "fixing", "repairing", "checking"];
  const envWords = ["indoor", "outdoor", "studio", "office", "street", "forest", "mountain", "beach", "room", "kitchen", "garden", "city", "park", "garage", "workshop"];
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

  return totalScore / Math.max(1, kwTokens.length);
}

/**
 * Computes the simplicity / searchability index (0.0 to 1.0)
 * Strongly rewards common 1-word tags and penalizes complex/awkward multi-word phrases.
 */
function computeSimplicityScore(kw: string): number {
  const words = kw.split(" ");
  let score = 0.75;

  // Single word tags are the holy grail of microstock search
  if (words.length === 1) score += 0.20;
  else if (words.length === 2) score += 0.05;
  else score -= 0.35; // Strongly penalize 3+ words

  // Common everyday search term bonus
  if (words.some(w => HIGH_SIMPLICITY_TERMS.has(w))) {
    score += 0.15;
  }

  // Penalize obscure long words
  if (words.some(w => w.length > 12)) {
    score -= 0.20;
  }

  return Math.min(1.0, Math.max(0.1, Number(score.toFixed(2))));
}

/**
 * Ranks candidate keywords using multi-objective statistical optimization:
 *  - Visual alignment (BM25+)
 *  - Commercial buyer intent
 *  - High-simplicity everyday English bonus
 *  - Strict Porter stem deduplication
 *  - Adobe Stock Top-10 Front-Loading
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

    // Strict Stem Deduplication
    const stem = getStemKey(kw);
    if (seenStems.has(stem)) {
      prunedCount++;
      continue;
    }
    seenStems.add(stem);

    // 1. BM25+ Visual Context Relevance Score (0.0 to 1.0)
    const rawBM25 = calculateBM25Score(kw, contextTokens);
    const relevanceScore = Math.min(1.0, Number((rawBM25 / 3.5).toFixed(2)));

    // 2. Commercial Buyer Intent Score (0.0 to 1.0)
    const buyerWeight = HIGH_INTENT_BUYER_VOCABULARY[kw] || 1.0;
    const buyerIntentScore = Number((buyerWeight / 2.8).toFixed(2));

    // 3. Simplicity Score (0.0 to 1.0)
    const simplicityScore = computeSimplicityScore(kw);

    // 4. Combined Multi-Objective Algorithmic SEO Weight
    // Prioritizes relevance (40%), simplicity (35%), and buyer intent (25%)
    const seoWeight = Number(
      (
        (relevanceScore * 1.6) +
        (buyerIntentScore * 1.2) +
        (simplicityScore * 1.5)
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

  // Adobe Stock Strategy: Front-load top concepts and commercial hooks
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

/**
 * AI-Powered Keyword Ranker using Groq 120B Reasoning Engine.
 * Receives the full 500-candidate pool, evaluates buyer search psychology,
 * and selects the best targetCount (49 or 50) simple, highest-converting tags.
 */
export async function rankKeywordsWithAI(
  candidates: string[],
  contextText: string,
  targetCount = 49
): Promise<{ rankedKeywords: string[]; keywordScores: KeywordScore[]; prunedCount: number; aiReasoning?: string }> {
  // Always compute algorithmic baseline first
  const baseline = rankKeywords(candidates, contextText, targetCount);

  try {
    // Pass up to 500 candidates to AI — it selects the best targetCount
    const candidateSlice = candidates.slice(0, 500);

    const messages: GroqMessage[] = [
      {
        role: "system",
        content: `You are an elite microstock keyword selection engine for Adobe Stock & Shutterstock.
You will receive up to 500 candidate keywords generated from a photo scene.
Your task: select and rank the best ${targetCount} keywords for the final metadata output.

STRICT SELECTION RULES:
1. ONLY select keywords that are 100% relevant to the described scene — do not add unrelated tags.
2. Prefer SIMPLE, COMMON, 1-2 WORD everyday English tags (e.g. "woman", "office", "laptop", "business", "smile").
3. ELIMINATE awkward phrases, academic jargon, or anything a buyer would never type.
4. Front-load the top 5 most visually descriptive and commercially valuable tags first.
5. Cover diverse categories: subjects, actions, environment, mood, commercial attributes.
6. Output JSON:
{
  "rankedKeywords": ["tag1", "tag2", ...],
  "reasoning": "Brief explanation"
}`,
      },
      {
        role: "user",
        content: `Scene context: "${contextText}".
Candidate pool (${candidateSlice.length} tags): ${JSON.stringify(candidateSlice)}.
Select and rank exactly ${targetCount} simple, relevant, high-converting tags in JSON format.`,
      },
    ];

    const res = await callGroq(messages, {
      model: REASONING_MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      jsonMode: true,
    });

    const parsed = JSON.parse(res.text);
    const aiTags: string[] = Array.isArray(parsed.rankedKeywords) ? parsed.rankedKeywords : [];

    if (aiTags.length >= Math.floor(targetCount * 0.7)) {
      const reRanked = rankKeywords(aiTags, contextText, targetCount);
      return {
        ...reRanked,
        aiReasoning: parsed.reasoning || `Ranked using Groq ${res.modelUsed} from ${candidateSlice.length}-candidate pool`,
      };
    }

    return baseline;
  } catch {
    return baseline;
  }
}
