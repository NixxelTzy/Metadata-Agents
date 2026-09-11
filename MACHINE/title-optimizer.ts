/**
 * MACHINE/title-optimizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated AI Title Optimization Engine for Microstock Metadata.
 * Features:
 *  1. Title quality scoring (length, hooks, action words, setting context)
 *  2. Forbidden pattern detection and auto-removal
 *  3. AI-powered title synthesis with 3 alternatives (Groq 120B)
 *  4. Sentence-case enforcement and quote-character stripping
 *  5. Platform-specific compliance (Adobe Stock / Shutterstock rules)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { callGroq, REASONING_MODEL, GroqMessage } from "@/lib/groq";
import { MicrostockPlatform } from "./types";

export interface TitleAnalysis {
  originalTitle: string;
  optimizedTitle: string;
  wordCount: number;
  isOptimalLength: boolean;
  hasCommercialHook: boolean;
  hasActionWord: boolean;
  hasSettingContext: boolean;
  titleScore: number;         // 0 to 100
  issues: string[];
  improvements: string[];
}

export interface TitleOptimizationResult {
  original: string;
  optimized: string;
  alternatives: string[];
  analysis: TitleAnalysis;
  aiEnhanced: boolean;
  confidence: number;         // 0.0 to 1.0
}

// ── Commercial Hook Words (signal buyer value to stock photo purchasers) ──
const COMMERCIAL_HOOK_WORDS = new Set([
  "professional", "modern", "fresh", "clean", "bright", "beautiful", "natural",
  "authentic", "lifestyle", "organic", "healthy", "luxury", "minimal", "creative",
  "vibrant", "elegant", "cozy", "serene", "dynamic", "happy", "confident",
  "successful", "productive", "fit", "wellness", "eco", "sustainable",
  "colorful", "peaceful", "cheerful", "warm", "cool", "crisp", "lush",
  "detailed", "rich", "immersive", "sunny", "rustic", "minimalist", "classic",
  "contemporary", "charming", "inviting", "refreshing"
]);

// ── Action / Verb Words that give energy and narrative to titles ──
const ACTION_WORDS = new Set([
  "working", "running", "cooking", "eating", "drinking", "walking", "sitting",
  "standing", "holding", "looking", "smiling", "exercising", "training", "reading",
  "writing", "talking", "meeting", "traveling", "exploring", "building", "fixing",
  "repairing", "inspecting", "checking", "driving", "riding", "flying", "swimming",
  "cycling", "hiking", "climbing", "celebrating", "shopping", "playing", "relaxing",
  "laughing", "dancing", "presenting", "planning", "designing", "crafting", "baking",
  "gardening", "lifting", "stretching", "meditating", "studying", "teaching",
  "caring", "healing", "serving", "growing", "racing", "competing", "resting",
  "enjoying", "discovering", "photographing", "painting", "cooking"
]);

// ── Setting / Environment Context Words ──
const SETTING_CONTEXT_WORDS = new Set([
  "office", "home", "kitchen", "garden", "park", "street", "city", "mountain",
  "beach", "forest", "studio", "workshop", "garage", "hospital", "school",
  "restaurant", "cafe", "gym", "outdoor", "indoor", "nature", "urban", "rural",
  "field", "road", "market", "store", "lab", "library", "courtyard", "stadium",
  "rooftop", "balcony", "airport", "station", "harbor", "farm", "vineyard",
  "desert", "jungle", "underwater", "village", "countryside", "campus"
]);

// ── Forbidden Patterns ──
const TITLE_FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(hd|4k|8k|uhd|best|top|amazing|awesome|epic|perfect|ultimate|super|great|nice|cool|incredible|stunning|breathtaking)\b/gi,
  /['""\\]/g,
  /\b(photo|image|picture|stock photo|footage|illustration|clipart|vector image)\b/gi,
  /\b(shutterstock|adobe stock|magnific|getty|istockphoto|depositphotos)\b/gi,
];

// ── Filler Words that add no meaning ──
const FILLER_WORDS = new Set([
  "very", "really", "quite", "rather", "somewhat", "extremely", "absolutely",
  "literally", "basically", "essentially", "simply", "just",
]);

function cleanTitleText(text: string): string {
  let cleaned = text;
  for (const pattern of TITLE_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();
}

function toSentenceCase(title: string): string {
  const words = title.split(" ").filter(Boolean);
  if (words.length === 0) return title;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase(), ...words.slice(1).map(w => w.toLowerCase())].join(" ");
}

export function analyzeTitle(title: string, platform: MicrostockPlatform = "adobe_stock"): TitleAnalysis {
  const cleaned = cleanTitleText(title.trim());
  const words = cleaned.split(/\s+/).filter(Boolean);
  const issues: string[] = [];
  const improvements: string[] = [];

  const wordCount = words.length;
  const isOptimalLength = wordCount >= 7 && wordCount <= 13;

  if (wordCount < 5) {
    issues.push(`Title too short — ${wordCount} words (target: 8-12)`);
    improvements.push("Expand with: subject + action + setting + mood modifier");
  } else if (wordCount < 7) {
    improvements.push("Title slightly short — add setting or lighting context");
  } else if (wordCount > 15) {
    issues.push(`Title too long — ${wordCount} words (trim to under 14)`);
    improvements.push("Remove filler adjectives, keep strongest 2 modifiers only");
  }

  for (const pattern of TITLE_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(title)) {
      issues.push("Contains forbidden patterns (camera meta, brand names, or quality buzzwords)");
      improvements.push("Remove: 'hd', 'best', 'photo', agency names, or quote characters");
      break;
    }
  }

  const hasCommercialHook = words.some(w => COMMERCIAL_HOOK_WORDS.has(w.toLowerCase()));
  if (!hasCommercialHook) improvements.push("Add commercial mood: 'professional', 'modern', 'natural', 'fresh'");

  const hasActionWord = words.some(w => ACTION_WORDS.has(w.toLowerCase()));
  if (!hasActionWord && wordCount >= 6) improvements.push("Include action verb: 'working', 'inspecting', 'cooking', etc.");

  const hasSettingContext = words.some(w => SETTING_CONTEXT_WORDS.has(w.toLowerCase()));
  if (!hasSettingContext && wordCount >= 7) improvements.push("Add setting context: 'in workshop', 'at office', 'outdoors'");

  const fillerFound = words.filter(w => FILLER_WORDS.has(w.toLowerCase()));
  if (fillerFound.length > 0) improvements.push(`Remove filler words: ${fillerFound.join(", ")}`);

  let optimizedTitle = words.filter(w => !FILLER_WORDS.has(w.toLowerCase())).join(" ");
  optimizedTitle = toSentenceCase(optimizedTitle);
  if (!optimizedTitle || optimizedTitle.length < 4) optimizedTitle = toSentenceCase(cleaned);

  let titleScore = 60;
  if (isOptimalLength) titleScore += 15;
  else if (wordCount >= 5 && wordCount < 7) titleScore += 5;
  if (hasCommercialHook) titleScore += 8;
  if (hasActionWord) titleScore += 7;
  if (hasSettingContext) titleScore += 7;
  if (issues.length === 0) titleScore += 8;
  titleScore = Math.min(100, Math.max(30, titleScore - issues.length * 10));

  return {
    originalTitle: title.trim(),
    optimizedTitle,
    wordCount,
    isOptimalLength,
    hasCommercialHook,
    hasActionWord,
    hasSettingContext,
    titleScore: Number(titleScore.toFixed(0)),
    issues,
    improvements,
  };
}

export function synthesizeTitleSync(
  rawTitle: string,
  detectedObjects: string[],
  commercialTheme: string,
  platform: MicrostockPlatform = "adobe_stock"
): string {
  const analysis = analyzeTitle(rawTitle, platform);
  if (analysis.titleScore >= 82 && analysis.isOptimalLength) return analysis.optimizedTitle;

  const subject = detectedObjects.slice(0, 2).join(" and ") || "professional subject";
  const theme = commercialTheme || "lifestyle concept";

  if (analysis.wordCount >= 4 && analysis.wordCount < 7) {
    return toSentenceCase(`${analysis.optimizedTitle} with natural lighting and copy space`);
  }
  if (analysis.wordCount < 4) {
    return toSentenceCase(`Professional ${subject} in ${theme} with clean natural background`);
  }
  return analysis.optimizedTitle;
}

export async function optimizeTitleWithAI(
  rawTitle: string,
  context: {
    detectedObjects?: string[];
    commercialTheme?: string;
    platform?: MicrostockPlatform;
    keywords?: string[];
    visualDescription?: string;
  } = {}
): Promise<TitleOptimizationResult> {
  const {
    detectedObjects = [], commercialTheme = "", platform = "adobe_stock",
    keywords = [], visualDescription = "",
  } = context;

  const analysis = analyzeTitle(rawTitle, platform);
  const syncOptimized = synthesizeTitleSync(rawTitle, detectedObjects, commercialTheme, platform);

  if (analysis.titleScore >= 88 && analysis.issues.length === 0 && analysis.isOptimalLength) {
    return { original: rawTitle, optimized: syncOptimized, alternatives: [], analysis, aiEnhanced: false, confidence: analysis.titleScore / 100 };
  }

  try {
    const platformName = platform === "shutterstock" ? "Shutterstock" : "Adobe Stock";
    const messages: GroqMessage[] = [
      {
        role: "system",
        content: `You are an elite microstock title writer for ${platformName}.
STRICT RULES:
1. Length: 7-13 words EXACTLY. Never shorter. Never longer.
2. Format: [Subject] + [Action verb] + [Setting] + [Lighting/mood]
   Good example: "Mechanic inspecting brake rotor in professional auto workshop"
   Good example: "Young woman cooking fresh salad in bright modern kitchen"
3. FORBIDDEN: quotes, brand names, agency names, camera tech (hd 4k dslr), buzzwords (best perfect amazing stunning).
4. Include ONE action verb (inspecting, working, cooking, walking, running, holding).
5. Include ONE setting word (workshop, kitchen, office, beach, gym, outdoor).
6. Simple natural commercial English. Sentence case (first word capitalized, rest lowercase).
Output JSON: {"title1": "...", "title2": "...", "title3": "...", "reasoning": "..."}`
      },
      {
        role: "user",
        content: `Original: "${rawTitle}". Subjects: [${detectedObjects.join(", ")}]. Theme: "${commercialTheme}". Description: "${visualDescription}". Keywords: [${keywords.slice(0, 10).join(", ")}]. Issues: ${analysis.issues.join("; ") || "none"}. Generate 3 better titles in JSON.`
      }
    ];

    const res = await callGroq(messages, { model: REASONING_MODEL, temperature: 0.2, max_tokens: 350, jsonMode: true });
    const parsed = JSON.parse(res.text);
    const candidates: string[] = [parsed.title1, parsed.title2, parsed.title3]
      .filter((t: any) => typeof t === "string" && t.trim().length > 8)
      .map((t: string) => cleanTitleText(t.trim()));

    if (candidates.length === 0) {
      return { original: rawTitle, optimized: syncOptimized, alternatives: [], analysis, aiEnhanced: false, confidence: analysis.titleScore / 100 };
    }

    const scored = candidates.map(t => ({ title: t, score: analyzeTitle(t, platform).titleScore })).sort((a, b) => b.score - a.score);
    const bestTitle = scored[0].title;
    const bestAnalysis = analyzeTitle(bestTitle, platform);

    return {
      original: rawTitle,
      optimized: bestTitle,
      alternatives: scored.slice(1).map(s => s.title),
      analysis: bestAnalysis,
      aiEnhanced: true,
      confidence: Math.min(0.99, bestAnalysis.titleScore / 100),
    };
  } catch {
    return { original: rawTitle, optimized: syncOptimized, alternatives: [], analysis, aiEnhanced: false, confidence: analysis.titleScore / 100 };
  }
}
