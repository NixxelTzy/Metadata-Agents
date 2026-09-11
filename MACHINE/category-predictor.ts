/**
 * MACHINE/category-predictor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Agency Category Classification Engine (Shutterstock & Adobe Stock).
 * Utilizes Bayesian multi-modal fusion of visual features, keyword vectors,
 * and contextual linguistic signals with negative disambiguation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CategoryPrediction, VisualFeatureVector, MicrostockPlatform } from "./types";
import { callGroq, REASONING_MODEL, GroqMessage } from "@/lib/groq";

interface CategoryDefinition {
  name: string;
  coreTerms: string[];       // Weight 2.5
  supportTerms: string[];    // Weight 1.2
  negativeTerms?: string[];  // Penalty -2.0 (disambiguation)
  baseWeight: number;
}

// Official Shutterstock Taxonomy (21 Categories)
const SHUTTERSTOCK_CATEGORIES: CategoryDefinition[] = [
  {
    name: "Nature",
    coreTerms: ["nature", "landscape", "forest", "mountain", "ocean", "river", "wilderness", "sunset", "sunrise", "sky", "scenic"],
    supportTerms: ["tree", "plant", "outdoor", "leaf", "natural", "earth", "horizon", "sunlight", "field", "lake"],
    negativeTerms: ["skyscraper", "factory", "computer", "smartphone"],
    baseWeight: 1.25,
  },
  {
    name: "Backgrounds/Textures",
    coreTerms: ["background", "texture", "pattern", "backdrop", "wallpaper", "surface", "abstract texture", "minimalist background"],
    supportTerms: ["isolated", "copy space", "minimal", "gradient", "clean", "blank", "canvas", "empty space", "smooth"],
    baseWeight: 1.15,
  },
  {
    name: "Food and Drink",
    coreTerms: ["food", "drink", "coffee", "beverage", "meal", "cooking", "cuisine", "gourmet", "breakfast", "dinner"],
    supportTerms: ["fruit", "vegetable", "kitchen", "plate", "snack", "dessert", "recipe", "delicious", "tasty", "fresh", "dish"],
    negativeTerms: ["industrial machine", "circuit board"],
    baseWeight: 1.3,
  },
  {
    name: "Business/Finance",
    coreTerms: ["business", "finance", "corporate", "office", "money", "investment", "strategy", "executive", "meeting"],
    supportTerms: ["professional", "workplace", "chart", "graph", "career", "success", "company", "colleagues", "banking"],
    baseWeight: 1.25,
  },
  {
    name: "Technology",
    coreTerms: ["technology", "computer", "digital", "artificial intelligence", "data", "cyber", "network", "software"],
    supportTerms: ["phone", "screen", "internet", "device", "electronic", "futuristic", "hardware", "innovation", "code"],
    baseWeight: 1.2,
  },
  {
    name: "People",
    coreTerms: ["person", "people", "man", "woman", "portrait", "human", "lifestyle", "family", "child", "crowd"],
    supportTerms: ["face", "model", "worker", "friend", "happy", "smile", "looking", "hands", "standing", "young", "adult"],
    baseWeight: 1.25,
  },
  {
    name: "Buildings/Landmarks",
    coreTerms: ["building", "architecture", "skyscraper", "cityscape", "landmark", "monument", "urban", "facade", "bridge"],
    supportTerms: ["city", "street", "house", "exterior", "tower", "construction", "downtown", "historical", "structure"],
    baseWeight: 1.15,
  },
  {
    name: "Objects",
    coreTerms: ["object", "product", "item", "tool", "gadget", "isolated on white", "equipment"],
    supportTerms: ["single", "tableware", "glass", "box", "package", "container", "still life"],
    baseWeight: 1.05,
  },
  {
    name: "Interiors",
    coreTerms: ["interior", "room", "furniture", "living room", "bedroom", "kitchen interior", "home decor"],
    supportTerms: ["indoor", "decor", "chair", "table", "modern interior", "cozy room", "sofa", "architectural interior"],
    baseWeight: 1.15,
  },
  {
    name: "Healthcare/Medical",
    coreTerms: ["healthcare", "medical", "doctor", "medicine", "hospital", "clinic", "patient", "nurse", "pharmacy"],
    supportTerms: ["health", "therapy", "care", "pill", "wellness", "treatment", "clinical", "diagnostic", "examination"],
    baseWeight: 1.3,
  },
  {
    name: "Beauty/Fashion",
    coreTerms: ["fashion", "beauty", "style", "model", "clothing", "makeup", "cosmetics", "dress", "glamour"],
    supportTerms: ["jewelry", "skincare", "hair", "stylish", "runway", "outfit", "aesthetic", "elegance", "pose"],
    baseWeight: 1.15,
  },
  {
    name: "Industrial",
    coreTerms: ["industry", "industrial", "factory", "manufacturing", "construction site", "heavy machinery", "engineering"],
    supportTerms: ["warehouse", "production", "worker", "steel", "welding", "equipment", "builder", "crane"],
    baseWeight: 1.1,
  },
  {
    name: "Sports/Recreation",
    coreTerms: ["sport", "sports", "fitness", "athlete", "workout", "exercise", "training", "running", "gym"],
    supportTerms: ["running", "jogging", "yoga", "ball", "match", "competition", "active", "endurance", "stadium"],
    baseWeight: 1.2,
  },
  {
    name: "Transportation",
    coreTerms: ["transportation", "vehicle", "car", "road", "airplane", "flight", "traffic", "train", "ship"],
    supportTerms: ["automobile", "travel", "highway", "drive", "airport", "vessel", "transport", "freight", "logistics"],
    baseWeight: 1.15,
  },
  {
    name: "Animals/Wildlife",
    coreTerms: ["animal", "wildlife", "dog", "cat", "bird", "pet", "creature", "safari", "mammal", "fauna"],
    supportTerms: ["fur", "cute", "canine", "feline", "feather", "species", "zoo", "nature wildlife"],
    baseWeight: 1.3,
  },
  {
    name: "The Arts",
    coreTerms: ["art", "creative", "artistic", "painting", "illustration", "sculpture", "craft", "drawing"],
    supportTerms: ["canvas", "paint", "colorful", "design", "gallery", "expressive", "culture", "artwork"],
    baseWeight: 1.05,
  },
  {
    name: "Abstract",
    coreTerms: ["abstract", "concept", "geometry", "visual effects", "motion blur", "flowing lines", "3d render"],
    supportTerms: ["gradient", "creative concept", "futuristic", "composition", "symbolic", "dynamism"],
    baseWeight: 1.0,
  },
  {
    name: "Parks/Outdoor",
    coreTerms: ["park", "garden", "public park", "botanical", "lawn", "greenery", "recreation park"],
    supportTerms: ["walkway", "bench", "trees", "outdoor leisure", "public garden", "courtyard"],
    baseWeight: 1.05,
  },
  {
    name: "Education",
    coreTerms: ["education", "school", "student", "study", "learning", "classroom", "university", "college"],
    supportTerms: ["book", "library", "exam", "teacher", "academic", "knowledge", "pencil", "campus"],
    baseWeight: 1.2,
  },
  {
    name: "Holidays",
    coreTerms: ["holiday", "christmas", "new year", "halloween", "thanksgiving", "easter", "valentine", "celebration"],
    supportTerms: ["festival", "party", "gift", "decoration", "festive", "traditional", "event", "fireworks"],
    baseWeight: 1.3,
  },
  {
    name: "Miscellaneous",
    coreTerms: ["general concept", "miscellaneous", "symbol", "sign"],
    supportTerms: ["idea", "universal", "metaphor"],
    baseWeight: 0.7,
  }
];

// Official Adobe Stock Taxonomy Categories
const ADOBE_STOCK_CATEGORIES: CategoryDefinition[] = [
  { name: "Animals", coreTerms: ["animal", "wildlife", "dog", "cat", "bird", "pet", "fauna"], supportTerms: ["safari", "creature"], baseWeight: 1.25 },
  { name: "Buildings and Architecture", coreTerms: ["building", "architecture", "skyscraper", "house", "structure", "city"], supportTerms: ["urban", "facade", "interior"], baseWeight: 1.2 },
  { name: "Business", coreTerms: ["business", "office", "finance", "corporate", "meeting", "work"], supportTerms: ["strategy", "professional", "company"], baseWeight: 1.25 },
  { name: "Drinks", coreTerms: ["drink", "coffee", "beverage", "tea", "cocktail", "water", "juice"], supportTerms: ["glass", "cup", "bar", "refreshment"], baseWeight: 1.25 },
  { name: "Food", coreTerms: ["food", "meal", "cuisine", "snack", "cooking", "dessert", "fruit"], supportTerms: ["vegetable", "plate", "nutrition", "gourmet"], baseWeight: 1.25 },
  { name: "The Environment", coreTerms: ["environment", "ecology", "green energy", "recycling", "climate", "sustainable"], supportTerms: ["nature", "conservation", "eco"], baseWeight: 1.2 },
  { name: "States of Mind", coreTerms: ["emotion", "serene", "peaceful", "stress", "joy", "contemplation", "freedom"], supportTerms: ["feeling", "mood", "mindset", "tranquil"], baseWeight: 1.15 },
  { name: "Graphic Resources", coreTerms: ["background", "texture", "pattern", "banner", "frame", "copy space", "isolated"], supportTerms: ["backdrop", "template", "minimalist"], baseWeight: 1.2 },
  { name: "Hobbies and Leisure", coreTerms: ["hobby", "leisure", "craft", "gardening", "gaming", "relaxation", "reading"], supportTerms: ["pastime", "activity", "fun"], baseWeight: 1.1 },
  { name: "Industry", coreTerms: ["industry", "factory", "manufacturing", "construction", "warehouse", "engineering"], supportTerms: ["heavy machine", "worker", "production"], baseWeight: 1.15 },
  { name: "Landscapes", coreTerms: ["landscape", "mountain", "forest", "sunset", "sunrise", "ocean", "river", "beach"], supportTerms: ["scenic", "horizon", "outdoor", "valley"], baseWeight: 1.25 },
  { name: "Lifestyle", coreTerms: ["lifestyle", "daily life", "home life", "routine", "wellbeing", "modern living"], supportTerms: ["family", "friends", "activity"], baseWeight: 1.2 },
  { name: "People", coreTerms: ["person", "people", "portrait", "man", "woman", "child", "human", "face"], supportTerms: ["model", "crowd", "standing", "worker"], baseWeight: 1.25 },
  { name: "Plants and Flowers", coreTerms: ["plant", "flower", "floral", "bloom", "botanical", "leaf", "tree", "rose"], supportTerms: ["garden", "blossom", "petal", "flora"], baseWeight: 1.25 },
  { name: "Science", coreTerms: ["science", "laboratory", "research", "scientific", "microscope", "chemistry", "biology"], supportTerms: ["experiment", "dna", "medical test"], baseWeight: 1.2 },
  { name: "Sports", coreTerms: ["sports", "fitness", "exercise", "athlete", "workout", "gym", "training"], supportTerms: ["running", "active", "competition"], baseWeight: 1.2 },
  { name: "Technology", coreTerms: ["technology", "computer", "digital", "ai", "tech", "software", "network", "cyber"], supportTerms: ["phone", "screen", "device", "data"], baseWeight: 1.25 },
  { name: "Transport", coreTerms: ["transport", "car", "vehicle", "airplane", "road", "train", "ship", "highway"], supportTerms: ["traffic", "drive", "commute"], baseWeight: 1.15 },
  { name: "Travel", coreTerms: ["travel", "tourism", "vacation", "destination", "trip", "holiday", "tourist"], supportTerms: ["explore", "adventure", "journey"], baseWeight: 1.2 },
];

/**
 * Classifies image context into primary, secondary, and tertiary microstock categories
 * tailored to the requested platform (Shutterstock or Adobe Stock).
 */
export function classifyCategory(
  keywords: string[],
  features?: VisualFeatureVector,
  title?: string,
  platform: MicrostockPlatform = "adobe_stock"
): CategoryPrediction {
  const taxonomy = platform === "shutterstock" ? SHUTTERSTOCK_CATEGORIES : ADOBE_STOCK_CATEGORIES;

  // Build combined text corpus
  const textParts = [
    title || "",
    keywords.join(" "),
    features?.detectedObjects.join(" ") || "",
    features?.sceneContext || "",
    features?.commercialTheme || "",
    features?.lightingStyle || "",
  ];
  const textCorpus = textParts.join(" ").toLowerCase();

  const scoredCategories = taxonomy.map((cat) => {
    let score = 0;
    const matched: string[] = [];

    // 1. Core Term Matches (Weight 2.5)
    for (const term of cat.coreTerms) {
      const regex = new RegExp(`\\b${term}\\b`, "i");
      if (regex.test(textCorpus)) {
        score += 2.5 * cat.baseWeight;
        matched.push(term);
      }
    }

    // 2. Support Term Matches (Weight 1.2)
    for (const term of cat.supportTerms) {
      const regex = new RegExp(`\\b${term}\\b`, "i");
      if (regex.test(textCorpus)) {
        score += 1.2 * cat.baseWeight;
        matched.push(term);
      }
    }

    // 3. Negative Disambiguation Penalties (-2.0)
    if (cat.negativeTerms) {
      for (const neg of cat.negativeTerms) {
        const regex = new RegExp(`\\b${neg}\\b`, "i");
        if (regex.test(textCorpus)) {
          score -= 2.0;
        }
      }
    }

    // 4. Visual Feature Cross-Validation Boost
    if (features) {
      if (cat.name.includes("Food") && features.detectedObjects.some(o => ["coffee", "cup", "plate", "food", "fruit", "drink"].includes(o))) {
        score += 3.0;
      }
      if (cat.name.includes("People") && features.detectedObjects.some(o => ["person", "man", "woman", "child", "face"].includes(o))) {
        score += 3.0;
      }
      if ((cat.name.includes("Nature") || cat.name.includes("Landscapes")) && features.colorTemperature === "warm" && textCorpus.includes("sunset")) {
        score += 2.5;
      }
      if (cat.name.includes("Graphic") || cat.name.includes("Backgrounds")) {
        if (features.composition.includes("minimal") || features.copySpaceSuitability?.hasCopySpace) {
          score += 2.0;
        }
      }
    }

    return {
      name: cat.name,
      score: Math.max(0, score),
      matched,
    };
  });

  scoredCategories.sort((a, b) => b.score - a.score);

  const top1 = scoredCategories[0];
  const top2 = scoredCategories[1];
  const top3 = scoredCategories[2];

  const primaryCategory = top1 && top1.score > 0
    ? top1.name
    : (platform === "shutterstock" ? "Backgrounds/Textures" : "Graphic Resources");

  const secondaryCategory = top2 && top2.score > 0
    ? top2.name
    : (primaryCategory === "Food" || primaryCategory === "Drinks" ? "Lifestyle" : "Objects");

  const tertiaryCategory = top3 && top3.score > 0 ? top3.name : undefined;

  // Confidence computation based on top score margin & evidence count
  const rawConfidence = top1.score > 0
    ? Math.min(0.99, 0.70 + Math.min(0.28, (top1.score * 0.03) + (top1.matched.length * 0.02)))
    : 0.65;

  const confidence = Number(rawConfidence.toFixed(2));
  const matchedSignals = Array.from(new Set([...(top1?.matched || []), ...(top2?.matched || [])])).slice(0, 8);

  const reasoning = `Classified as primary '${primaryCategory}' and secondary '${secondaryCategory}' with ${Math.round(confidence * 100)}% confidence based on signals: ${matchedSignals.slice(0, 4).join(", ")}.`;

  return {
    primaryCategory,
    secondaryCategory,
    tertiaryCategory,
    confidence,
    matchedSignals,
    reasoning,
    platformTaxonomy: platform === "shutterstock" ? "shutterstock" : "adobe_stock",
  };
}

/**
 * AI-Augmented Category Classifier using Groq 120B Reasoning Engine.
 * Evaluates visual context against official microstock taxonomy.
 */
export async function classifyCategoryWithAI(
  keywords: string[],
  features?: VisualFeatureVector,
  title?: string,
  platform: MicrostockPlatform = "adobe_stock"
): Promise<CategoryPrediction> {
  const baseline = classifyCategory(keywords, features, title, platform);

  try {
    const validTaxonomy = platform === "shutterstock"
      ? SHUTTERSTOCK_CATEGORIES.map(c => c.name)
      : ADOBE_STOCK_CATEGORIES.map(c => c.name);

    const messages: GroqMessage[] = [
      {
        role: "system",
        content: `You are an elite microstock classification AI. Predict the best primary and secondary categories for ${platform}.
Allowed categories for ${platform}: [${validTaxonomy.join(", ")}].
Output JSON:
{
  "primaryCategory": "exact category from allowed list",
  "secondaryCategory": "exact category from allowed list",
  "confidence": 0.95,
  "reasoning": "Brief explanation of category selection"
}`
      },
      {
        role: "user",
        content: `Title: "${title || ""}". Visual features: ${JSON.stringify(features?.detectedObjects || [])}.
Top keywords: ${keywords.slice(0, 20).join(", ")}.
Determine the optimal primary and secondary categories from the allowed list in JSON format.`
      }
    ];

    const res = await callGroq(messages, {
      model: REASONING_MODEL,
      temperature: 0.1,
      max_tokens: 300,
      jsonMode: true,
    });

    const parsed = JSON.parse(res.text);

    if (validTaxonomy.includes(parsed.primaryCategory)) {
      const sec = validTaxonomy.includes(parsed.secondaryCategory) ? parsed.secondaryCategory : baseline.secondaryCategory;
      return {
        primaryCategory: parsed.primaryCategory,
        secondaryCategory: sec,
        confidence: Math.min(0.99, Math.max(0.75, Number(parsed.confidence) || 0.95)),
        matchedSignals: baseline.matchedSignals,
        reasoning: parsed.reasoning || `AI Categorization via Groq (${res.modelUsed})`,
        platformTaxonomy: platform === "shutterstock" ? "shutterstock" : "adobe_stock",
      };
    }

    return baseline;
  } catch {
    return baseline;
  }
}
