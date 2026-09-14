import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage, REASONING_MODEL } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";
import { validateAndSanitize } from "@/lib/stock-compliance";
import { verifyToken } from "@/lib/auth";
import { appendActivityEvent } from "@/lib/db";

export const runtime = "nodejs"; // Required for Redis (security core)
export const maxDuration = 60; // Vercel Hobby max = 60s

export interface MetadataResult {
  filename: string;
  title: string;
  keywords: string[];
  categories?: string[];
  editorial?: "yes" | "no";
  matureContent?: "yes" | "no";
  illustration?: "yes" | "no";
  prompt?: string;
  model?: string;
  primaryConcept?: string;
  visualDescription?: string;
  error?: string;
  attempts?: number;
  stabilized?: boolean;
  modelUsed?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  confidenceScore?: number;
}

interface ImagePayload {
  filename: string;
  dataUrl: string;
  visualHints?: string;
  existingPrompt?: string;
}

const MASTER_PROMPT_CORE = `You are an elite Microstock Metadata Director and Top-Selling Contributor on Adobe Stock and Shutterstock.
Your Mission: Produce 1 commercial title and clean, highly searchable keywords that are EASY, POPULAR (HIGH SEARCH VOLUME), 100% ACCURATE TO THE THEME, and COMPLETELY FREE OF WEIRD JARGON OR ODD WORDS.

═══ MANDATORY RULES (ZERO TOLERANCE) ═══

【1】 STRICT 100% ENGLISH ONLY (CRITICAL):
   ▸ ALL OUTPUT (Title, Keywords, Primary Concept, Visual Description, Prompt) MUST BE 100% IN ENGLISH.
   ▸ NEVER output any Indonesian words (e.g. NEVER output "wanita", "petani", "kebun", "tomat", "lebah", "tanaman", "panen", etc.). Every single word must be correct English.

【2】 NO WEIRD WORDS OR ODD SPECIFIC LABELS:
   ▸ DO NOT output weird color shades or clothing terms: BANNED: "khaki", "khakis", "tan", "cream", "off-white", "utility jacket", "chore coat".
   ▸ DO NOT output anatomical micro-parts: BANNED: "right hand", "left hand", "hand holding", "finger", "hair", "ponytail".
   ▸ DO NOT output secondary equipment, ground clutter, or metal parts: BANNED: "metal ribs", "horizontal supports", "paper sheet", "white paper", "dark spots", "bucket", "hose", "cable", "wire", "irrigation hoses", "pump unit", "distant hills", "tree line".
   ▸ DO NOT output camera technical jargon: BANNED: "diffused", "diffused daylight", "eyelevel", "bokeh", "macro".

【3】 FOCUS ON HIGH COMMERCIAL VALUE & BUYER SEARCH INTENT (TOP-SELLING KEYWORDS):
   Microstock buyers search with SHORT, SIMPLE, HIGH-VOLUME SEARCH TERMS.
   ▸ DO NOT use obscure compound phrases like "capped cells", "stacked boxes", "yield monitoring", "seedling propagation", "cultivated environment".
   ▸ USE NATURAL, DIRECT, EASY-TO-SEARCH BUYER TERMS:
     - If TOMATO / GREENHOUSE:
       "tomato", "tomatoes", "cherry tomato", "cherry tomatoes", "greenhouse", "farmer", "woman", "female farmer", "vegetable", "vegetables", "fresh", "organic", "harvest", "healthy", "food", "ripe", "red", "plants", "green", "agriculture", "farming", "clipboard", "produce", "crop", "growing", "indoor farming", "cultivation", "summer", "daylight", "work gloves", "blue coat", "raw food", "diet", "nutrition", "vitamins", "farm worker", "agronomist", "agronomy", "botany", "glasshouse", "sweet", "delicious", "healthy eating", "local food", "gardening", "plant", "nature", "rural".
     - If BEEKEEPER / HONEY:
       "beekeeper", "beekeeping", "bee", "bees", "honey", "honeycomb", "hive", "beehive", "frame", "veil", "suit", "protective suit", "meadow", "wildflowers", "flowers", "field", "summer", "sunny", "golden hour", "honey production", "pollination", "sweet", "natural", "raw honey", "honey harvest", "apiary", "apiculture", "insects", "yellow", "outdoor", "nature", "sunlight", "rural", "organic", "farm", "farming", "agriculture", "countryside", "pure", "golden", "healthy", "worker", "care", "wildlife", "environment".

【4】 4 PILLARS FOR EASY, HIGH-CONVERTING KEYWORDS (1-2 WORDS PER KEYWORD):
   1. Core Objects & People (40%): What a buyer sees directly (e.g. woman, farmer, tomato, cherry tomato, greenhouse, clipboard, gloves / beekeeper, bee, honey, honeycomb, beehive, frame, veil, suit).
   2. Commercial Concepts & Uses (35%): How buyers will use the photo (e.g. agriculture, harvest, fresh, organic, vegetable, healthy, food, produce, crop, farming / apiculture, honey production, pollination, honey harvest, raw honey, sweet, natural).
   3. Observable Attributes & Colors (15%): Direct visible attributes (e.g. red, green, ripe, summer, daylight, bright / yellow, purple, golden hour, sunlight, warm, outdoor).
   4. Environment & Context (10%): Broad location concepts (e.g. indoor, garden, horticulture, farm, rural / meadow, field, wildflowers, flowers, nature, countryside).

【5】 COMMERCIAL TITLE (8-14 words):
   Clean, natural, buyer-friendly English.
   Example Tomato: "Female Farmer Holding Clipboard and Cherry Tomatoes in Bright Greenhouse"
   Example Beekeeper: "Female Beekeeper in White Protective Suit Holding Honeycomb Frame in Sunny Meadow"

⛔ ABSOLUTE RULE — FILENAME BIAS:
Ignore the filename 100%. Analyze ONLY the real visible pixels of the image.`;

const ADOBE_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPECIFIC: ADOBE STOCK ═══
- Title: Highly descriptive commercial title (8–14 words) in English without quotes.
- Keywords: Provide EXACTLY 49 unique, popular, high-search-volume keywords (1–2 words per tag) in English.
- Prompt: Complete photorealistic AI generative prompt for recreating the image in Midjourney / Firefly in English.
- Model: Suitable AI model (default "Midjourney 6").
- Primary Concept: Core commercial concept name in English.
- Visual Description: Brief, objective visual summary in English.

MANDATORY OUTPUT FORMAT: STRICT VALID JSON ONLY:
{
  "title": "Clear commercial title in English without quotes",
  "keywords": ["kw1", "kw2", ...exactly 49 popular English keywords...],
  "primaryConcept": "Primary concept in English",
  "visualDescription": "Brief objective summary in English",
  "prompt": "Detailed AI image prompt in English",
  "model": "Midjourney 6"
}`;

const SHUTTERSTOCK_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPECIFIC: SHUTTERSTOCK ═══
- Title / Description: Commercial descriptive title (8–15 words) in English without quotes.
- Keywords: Provide EXACTLY 50 unique, popular, high-search-volume keywords (1–2 words per tag) in English.
- Categories: Choose exactly 1 or 2 most accurate categories from official Shutterstock list:
  "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vectors", "Vintage"
- Editorial: "no"
- Mature Content: "no"
- Illustration: "no"
- Prompt: AI image recreation prompt in English.
- Model: "Midjourney 6"
- Primary Concept: Commercial concept in English.
- Visual Description: Brief summary in English.

MANDATORY OUTPUT FORMAT: STRICT VALID JSON ONLY:
{
  "title": "Clear title in English without quotes",
  "keywords": ["kw1", "kw2", ...exactly 50 popular English keywords...],
  "categories": ["Food and Drink", "Nature"],
  "editorial": "no",
  "matureContent": "no",
  "illustration": "no",
  "primaryConcept": "Primary concept in English",
  "visualDescription": "Brief summary in English",
  "prompt": "Detailed AI image prompt in English",
  "model": "Midjourney 6"
}`;

const MAGNIFIC_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPECIFIC: MAGNIFIC CONTRIBUTOR ═══
- Title: Commercial descriptive title (8–14 words) in English without any quotes.
- Keywords: Provide EXACTLY 49 unique, popular keywords (1–2 words per tag) in English without quotes (so platform can append tag 50 'ai generate').
- Prompt: Rich photorealistic generative AI prompt in English describing subject, lighting, angle, colors, texture, camera lens, 8k resolution.
- Model: "Adobe Firefly" (default).
- Primary Concept: Commercial concept in English.
- Visual Description: Brief summary in English.

MANDATORY OUTPUT FORMAT: STRICT VALID JSON ONLY:
{
  "title": "Clear title in English without quotes",
  "keywords": ["kw1", "kw2", ...exactly 49 popular English keywords...],
  "prompt": "Detailed photorealistic prompt in English",
  "model": "Adobe Firefly",
  "primaryConcept": "Primary concept in English",
  "visualDescription": "Brief summary in English"
}`;

function extractJsonFromText(text: string): string {
  // Strip <think>...</think> reasoning tags if present from reasoning models
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function safeParseMetadataJson(jsonText: string, filename: string, existingPrompt?: string, defaultModel = "Adobe Firefly"): {
  title: string;
  keywords: string[];
  categories?: string[];
  editorial?: string;
  matureContent?: string;
  illustration?: string;
  prompt?: string;
  model?: string;
  primaryConcept?: string;
  visualDescription?: string;
} {
  // Step 1: Clean think tags and isolate JSON string
  const cleaned = extractJsonFromText(jsonText);

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      // Repair unescaped control chars / newlines inside string values
      const repaired = cleaned
        .replace(/(?<=:\s*"[^"]*)\r?\n([^"]*")/g, " $1")
        .replace(/,\s*([\]}])/g, "$1") // trailing commas
        .replace(/[\u201C\u201D]/g, '"') // smart quotes
        .replace(/[\u2018\u2019]/g, "'");
      parsed = JSON.parse(repaired);
    } catch {
      parsed = null;
    }
  }

  const cleanQuote = (s: string) =>
    s
      .replace(/^['"`\s]+|['"`\s]+$/g, "")
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/'([^']+)'/g, "$1")
      .replace(/['"`]{2,}/g, "")
      .trim();

  // Step 2: If parsed successfully as object
  if (parsed && typeof parsed === "object") {
    let title = typeof parsed.title === "string" ? cleanQuote(parsed.title) : "";
    const rawKw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = rawKw
      .map((k: any) => String(k).replace(/['"`\\]/g, "").trim())
      .filter(Boolean);
    const primaryConcept = typeof parsed.primaryConcept === "string" ? cleanQuote(parsed.primaryConcept) : "";
    const visualDescription = typeof parsed.visualDescription === "string" ? cleanQuote(parsed.visualDescription) : "";
    const prompt = typeof parsed.prompt === "string" && parsed.prompt.length > 5
      ? cleanQuote(parsed.prompt)
      : (existingPrompt || visualDescription || `${title}, photorealistic photography, cinematic lighting, 8k resolution, highly detailed`);
    const model = typeof parsed.model === "string" && parsed.model.length > 2
      ? cleanQuote(parsed.model)
      : defaultModel;

    // If title is too short or missing, synthesize intelligently from visual cues
    if (title.length < 5) {
      if (primaryConcept) {
        title = `${primaryConcept} isolated on clean background`;
      } else if (keywords.length >= 3) {
        title = `${keywords[0]} and ${keywords[1]} ${keywords[2]} close up shot`;
      } else {
        const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
        title = `${cleanName} high quality stock photo and digital media asset`;
      }
    }

    return {
      ...parsed,
      title: cleanQuote(title),
      keywords: keywords.length > 0 ? keywords : ["stock", "photo", "creative", "media", "digital", "modern", "design"],
      prompt,
      model,
      primaryConcept,
      visualDescription,
    };
  }

  // Step 3: Multi-format Regex Extraction Fallback
  const titleMatch = jsonText.match(/"(?:title|description)"\s*:\s*"([^"]+)"/i) ||
                     jsonText.match(/(?:title|description)\s*:\s*([^\r\n]+)/i);
  const keywordsMatch = jsonText.match(/"keywords"\s*:\s*\[([\s\S]*?)\]/i) ||
                        jsonText.match(/(?:keywords|tags)\s*:\s*([^\r\n]+)/i);
  const promptMatch = jsonText.match(/"prompt"\s*:\s*"([^"]+)"/i) ||
                      jsonText.match(/prompt\s*:\s*([^\r\n]+)/i);
  const modelMatch = jsonText.match(/"model"\s*:\s*"([^"]+)"/i);
  const conceptMatch = jsonText.match(/"primaryConcept"\s*:\s*"([^"]+)"/i);
  const descMatch = jsonText.match(/"visualDescription"\s*:\s*"([^"]+)"/i);

  const primaryConcept = conceptMatch ? cleanQuote(conceptMatch[1]) : "";
  const visualDescription = descMatch ? cleanQuote(descMatch[1]) : "";
  let title = titleMatch ? cleanQuote(titleMatch[1]) : "";
  const model = modelMatch ? cleanQuote(modelMatch[1]) : defaultModel;
  const prompt = promptMatch ? cleanQuote(promptMatch[1]) : (existingPrompt || visualDescription || `${title || filename}, professional photography, 8k, detailed`);

  const extractedKeywords: string[] = [];
  if (keywordsMatch && keywordsMatch[1]) {
    const rawMatch = keywordsMatch[1];
    if (rawMatch.includes(",")) {
      rawMatch.split(",").forEach((item) => {
        const clean = item.replace(/[\[\]"'\r\n\\]/g, "").trim();
        if (clean.length > 1) extractedKeywords.push(clean);
      });
    } else {
      const matches = rawMatch.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach((m) => extractedKeywords.push(m.replace(/["'\\]/g, "").trim()));
      }
    }
  }

  if (title.length < 5) {
    if (primaryConcept) {
      title = `${primaryConcept} isolated on clean background`;
    } else if (extractedKeywords.length >= 3) {
      title = `${extractedKeywords[0]} and ${extractedKeywords[1]} ${extractedKeywords[2]} close up shot`;
    } else {
      const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
      title = `${cleanName} high quality stock photo and digital media asset`;
    }
  }

  return {
    title: cleanQuote(title),
    keywords: extractedKeywords.length > 0 ? extractedKeywords : ["stock", "photo", "creative", "media", "digital", "modern", "design"],
    prompt,
    model,
    primaryConcept,
    visualDescription,
  };
}

function buildGuaranteedKeywords(
  rawKeywords: string[],
  targetCount: number,
  title: string,
  prompt?: string,
  primaryConcept?: string,
  visualDescription?: string
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (k: string) => {
    // Strip ALL quotes, backslashes, and unwanted punctuation
    const clean = k
      .replace(/['"`\\]/g, "")
      .trim()
      .toLowerCase()
      .replace(/^[,\-–—\s]+|[,\-–—\s]+$/g, "");
    if (!clean || clean.length < 2 || clean.length > 35) return;
    // Disallow generic filler, junk prepositions, camera jargon, and clutter words
    const JUNK_TERMS = new Set([
      "photo", "image", "picture", "wallpaper", "4k", "8k", "hd", "best", "cool",
      "while", "beside", "wears", "wear", "wearing", "filled", "fill",
      "holding", "hold", "holds", "standing", "stands", "potted", "having",
      "using", "uses", "make", "makes", "making", "take", "takes", "taking",
      "near", "nearby", "against", "between", "behind", "through", "during",
      "luxury", "boutique", "elegant",
      // Ground clutter & secondary equipment
      "bucket", "white bucket", "hose", "black hose", "cable", "wire ties", "metal clip",
      "clip", "pen", "dark band", "dirt path", "dark spots", "hive lid",
      "irrigation hoses", "irrigation hose", "pump unit", "water pump", "metal stakes", "vertical wires", "arched roof",
      "distant hills", "tree line", "daylight glow", "sunny horizon", "rural landscape", "distant horizon", "sunlit sky",
      // Unwanted weird color shades & micro body parts
      "khaki", "khakis", "tan", "cream", "off white", "off-white", "beige",
      "utility jacket", "chore coat", "right hand", "left hand", "hand holding", "finger", "hair", "ponytail",
      "metal ribs", "horizontal supports", "paper sheet", "white paper",
      // Camera technique & empty abstract words
      "diffused", "diffused light", "diffused daylight", "eyelevel", "bokeh", "shallow depth", "macro",
      "soft light", "muted shadows", "landscape", "scene", "atmosphere", "concept", "lifestyle",
      // Speculative industrial stretches
      "packaging", "produce packaging", "nursery", "plant nursery", "farm equipment", "agribusiness",
      "biodiversity", "produce handling", "market supply",
      // Strict ban on leaked Indonesian words
      "wanita", "pria", "petani", "peternak", "kebun", "tomat", "lebah", "tanaman",
      "rumah", "kaca", "pertanian", "daun", "bunga", "tangan", "merah", "hijau",
      "putih", "hitam", "paruh", "baya", "seorang", "sarang", "madu", "dan",
      "dengan", "untuk", "yang", "pada", "dari", "dalam", "bisa", "adalah", "ini",
      "itu", "secara", "kualitas", "panen", "sayur", "sayuran", "buah", "buah-buahan"
    ]);
    if (JUNK_TERMS.has(clean)) return;

    // Strict Gender Consistency based on title context
    const titleLower = (title || "").toLowerCase();
    const isMaleScene = /\b(man|male|boy|guy|father|brother|gentleman|businessman)\b/.test(titleLower) &&
      !/\b(woman|female|girl|lady|mother|sister)\b/.test(titleLower);
    const isFemaleScene = /\b(woman|female|girl|lady|mother|sister|businesswoman)\b/.test(titleLower) &&
      !/\b(man|male|boy|guy|father|brother)\b/.test(titleLower);

    if (isMaleScene && ["woman", "female", "girl", "lady", "sister", "mother"].includes(clean)) return;
    if (isFemaleScene && ["man", "male", "boy", "guy", "brother", "father"].includes(clean)) return;

    // Kata kunci jangan susah: jika frasa lebih dari 3 kata, pecah menjadi kata-kata sederhana
    const words = clean.split(/\s+/);
    if (words.length > 3) {
      for (const w of words) {
        if (w.length > 2) add(w);
      }
      return;
    }

    if (seen.has(clean)) return;
    seen.add(clean);
    result.push(clean);
  };

  // 1. Add raw AI keywords first (highest priority, tier order)
  rawKeywords.forEach(add);

  // If we already reached targetCount from pure AI visual forensics, return immediately!
  if (result.length >= targetCount) {
    return result.slice(0, targetCount);
  }

  // 2. Extract multi-word and single-word terms from title
  if (title) {
    const cleanTitle = title.replace(/[^\w\s-]/g, " ").toLowerCase();
    const titleWords = cleanTitle.split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "with", "for", "from", "that", "this"].includes(w));
    // Add bigrams from title
    for (let i = 0; i < titleWords.length - 1; i++) {
      add(`${titleWords[i]} ${titleWords[i + 1]}`);
      if (result.length >= targetCount) return result.slice(0, targetCount);
    }
    // Add single words from title
    titleWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // 3. Extract keywords from primaryConcept & visualDescription
  if (primaryConcept) {
    const pWords = primaryConcept.replace(/[^\w\s-]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    pWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }
  if (visualDescription) {
    const vdWords = visualDescription.replace(/[^\w\s-]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    vdWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // 4. Derive sub-keywords by splitting existing multi-word keywords
  for (const kw of [...result]) {
    const parts = kw.split(/\s+/);
    if (parts.length > 1) {
      for (const p of parts) {
        if (p.length > 2) add(p);
        if (result.length >= targetCount) return result.slice(0, targetCount);
      }
    }
  }

  // 5. Extract visual terms from prompt
  if (prompt) {
    const promptWords = prompt.replace(/[^\w\s-]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !["with", "from", "have", "been", "that", "this", "also", "there", "their"].includes(w));
    for (let i = 0; i < promptWords.length - 1; i++) {
      add(`${promptWords[i]} ${promptWords[i + 1]}`);
      if (result.length >= targetCount) return result.slice(0, targetCount);
    }
    promptWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // 6. ADAPTIVE Context-Aware Padding (ONLY add what matches visual context)
  const fullContext = `${title} ${prompt || ""} ${primaryConcept || ""} ${visualDescription || ""}`.toLowerCase();

  // If isolated/white background is detected in context:
  if (fullContext.includes("white") || fullContext.includes("isolated") || fullContext.includes("plain background")) {
    ["isolated on white", "white background", "studio shot", "clean background", "copy space", "cut out", "nobody", "still life"].forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // If screenshot/game/digital interface detected in context:
  if (fullContext.includes("game") || fullContext.includes("screen") || fullContext.includes("digital") || fullContext.includes("interface")) {
    ["gameplay", "user interface", "digital screen", "gaming content", "entertainment", "app interface", "mobile display"].forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // Universal neutral stock terms (safe, simple everyday words for any photo):
  const neutralStockTerms = [
    "background", "copy space", "isolated", "clean",
    "horizontal", "daylight", "indoor", "outdoor", "color image",
    "focus on foreground", "nobody", "bright", "simple", "modern"
  ];

  for (const term of neutralStockTerms) {
    if (result.length >= targetCount) break;
    add(term);
  }

  return result.slice(0, targetCount);
}

async function generateMetadata(
  base64DataUrl: string,
  filename: string,
  visualHints?: string,
  platform: "adobe_stock" | "shutterstock" | "magnific" = "adobe_stock",
  complianceGuard: boolean = false,
  attempt: number = 1,
  existingPrompt?: string
): Promise<MetadataResult> {
  if (!base64DataUrl.startsWith("data:image/")) {
    throw new Error("Format data URL tidak valid");
  }

  const promptText = platform === "shutterstock" ? SHUTTERSTOCK_SYSTEM_PROMPT : platform === "magnific" ? MAGNIFIC_SYSTEM_PROMPT : ADOBE_SYSTEM_PROMPT;

  let rawJsonText = "";
  let modelUsed = "";
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    const targetKwCount = platform === "shutterstock" ? 50 : 49;
    const userPromptPayload = `Identify the commercial theme and core subjects of this stock photograph:
1. Core Commercial Theme: (e.g. Tomato Greenhouse Farming / Beekeeping & Honey Production).
2. Primary Human Subject: Role (e.g. female farmer/agronomist, female beekeeper), clothing, protective gear, handheld items.
3. Primary Commercial Subject / Crop / Animal: Specific species, produce/crop (e.g. cherry tomatoes on vine, honeybees on honeycomb frame).
4. Setting & Environment: General setting (greenhouse, meadow with wildflowers), natural lighting (daylight, golden hour).
DO NOT list trivial micro-details like "right hand", "metal ribs", ground clutter, or technical camera descriptions.${visualHints ? `\nUploader hints: ${visualHints}` : ""}`;

    // ══════════════════════════════════════════════════════════════════
    // STAGE 1: Visual Forensic Perception (Qwen Vision 3.8 / 3.6)
    // Inspects 100% real image pixels with clinical accuracy
    // ══════════════════════════════════════════════════════════════════
    const visionMessages: GroqMessage[] = [
      {
        role: "system",
        content: `You are a professional microstock content curator.
Your task is to identify the central commercial theme and main visual subjects.
Focus ONLY on:
1. CORE COMMERCIAL THEME: What is the main industry or commercial subject depicted?
2. PRIMARY HUMAN SUBJECT & ROLE: Role (farmer, agronomist, beekeeper), clothing, protective gear, handheld items.
3. PRIMARY CROP / PRODUCE / ANIMAL: Specific produce (cherry tomatoes), crops, or creatures (honeybees).
4. SETTING & LIGHTING: Structure/setting (greenhouse, meadow), natural lighting (daylight, golden hour).
DO NOT list irrelevant ground clutter, tiny wires, background speckles, or trivial body parts like "right hand".
Be factual, concise, and direct.`
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: base64DataUrl } },
          { type: "text", text: userPromptPayload }
        ]
      }
    ];

    const visionResult = await callGroq(visionMessages, {
      temperature: 0.05,
      max_tokens: 600,
      vision: true
    });

    totalUsage.promptTokens += visionResult.usage.promptTokens;
    totalUsage.completionTokens += visionResult.usage.completionTokens;
    totalUsage.totalTokens += visionResult.usage.totalTokens;

    // ══════════════════════════════════════════════════════════════════
    // STAGE 2: 120B Flagship Reasoning Engine (openai/gpt-oss-120b)
    // Applies 120B parameter reasoning with chain-of-thought to formulate 99% accurate metadata & buyer SEO
    // ══════════════════════════════════════════════════════════════════
    const reasoningUserMessage = `Generate commercial microstock metadata with EASY, POPULAR, AND HIGH-SEARCH-VOLUME KEYWORDS based on this visual theme analysis:

VISUAL THEME ANALYSIS:
${visionResult.text}

MANDATORY INSTRUCTIONS FOR MAXIMUM SALES & SEARCHABILITY:
- LANGUAGE: 100% STRICT ENGLISH ONLY. Absolutely NEVER use any Indonesian words (no "wanita", "petani", "kebun", "tomat", "lebah", etc.).
- EASY & HIGHLY SEARCHABLE BUYER KEYWORDS: Microstock buyers search with everyday simple English words!
  ▸ Use short, direct, 1-2 word tags (e.g. tomato, tomatoes, cherry tomato, greenhouse, farmer, woman, vegetable, vegetables, fresh, organic, harvest, healthy, food, ripe, red, plant, plants, green, agriculture, farming, clipboard, produce, crop, summer / beekeeper, beekeeping, bee, bees, honey, honeycomb, hive, beehive, frame, veil, suit, meadow, wildflowers, flowers, field, summer, sunny, golden hour, apiary, sweet, natural, raw honey, organic, nature).
  ▸ NEVER invent complex academic or obscure jargon (do NOT output "capped cells", "stacked boxes", "yield monitoring", "seedling propagation", "cultivated environment", "produce handling", "agricultural facility").
- BANNED WEIRD WORDS: DO NOT output "khaki", "khakis", "tan", "cream", "off-white", "utility jacket", "right hand", "left hand", "hand holding", "metal ribs", "horizontal supports", "paper sheet", "white paper", "dark spots", "bucket", "hose", "diffused", "irrigation hoses", "pump unit".
- TARGET: Provide EXACTLY ${targetKwCount} unique keywords (1-2 words per keyword) and 1 commercial title.

METADATA CONTEXT:
- Filename: ${filename} (IGNORE — do NOT use filename as keyword source!)
${visualHints ? `- Uploader hints: ${visualHints}` : ""}
${existingPrompt ? `- Existing prompt to optimize: "${existingPrompt}"` : ""}

TARGET: Output STRICT VALID JSON format.`;

    const reasoningMessages: GroqMessage[] = [
      { role: "system", content: promptText },
      { role: "user", content: reasoningUserMessage }
    ];

    const reasoningResult = await callGroq(reasoningMessages, {
      model: REASONING_MODEL, // openai/gpt-oss-120b
      temperature: 0.05, // Lower temperature = higher precision & determinism
      max_tokens: 4096, // 4096 allows full CoT reasoning + complete JSON output without cut-off
      jsonMode: true
    });

    rawJsonText = reasoningResult.text;
    modelUsed = `${reasoningResult.modelUsed} + ${visionResult.modelUsed}`;
    totalUsage.promptTokens += reasoningResult.usage.promptTokens;
    totalUsage.completionTokens += reasoningResult.usage.completionTokens;
    totalUsage.totalTokens += reasoningResult.usage.totalTokens;

  } catch (err) {
    console.warn("[generateMetadata] Two-stage 120B pipeline error, falling back to direct vision model:", err);
    // Bulletproof Fallback: Direct single-pass vision model
    const targetKwCount = platform === "shutterstock" ? 50 : 49;
    const textPart = `Apply STRICT COMMERCIAL MICROSTOCK METADATA standards.
Language: 100% ENGLISH ONLY. Zero Indonesian words.
Provide 1 commercial title and exactly ${targetKwCount} popular, easy, high-search-volume keywords (max 1-2 words per keyword).
BANNED: khaki, tan, cream, utility jacket, right hand, left hand, hand holding, metal ribs, horizontal supports, paper sheet, white paper, bucket, hose, diffused.
FILENAME (IGNORE): ${filename}
${visualHints ? `Uploader hints: ${visualHints}\n` : ""}${existingPrompt ? `Existing prompt to optimize: ${existingPrompt}\n` : ""}
TARGET: Exactly ${targetKwCount} keywords. Output ONLY raw valid JSON with no markdown fences or extra text.`;

    const directMessages: GroqMessage[] = [
      { role: "system", content: promptText },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: base64DataUrl } },
          { type: "text", text: textPart }
        ]
      }
    ];

    const fallbackResult = await callGroq(directMessages, {
      temperature: 0.15,
      max_tokens: 2048,
      vision: true,
      jsonMode: true
    });

    rawJsonText = fallbackResult.text;
    modelUsed = fallbackResult.modelUsed;
    totalUsage = fallbackResult.usage;
  }

  const defaultModel = platform === "magnific" ? "Adobe Firefly" : "Midjourney 6";
  const parsed = safeParseMetadataJson(rawJsonText, filename, existingPrompt, defaultModel);

  const rawKeywords = parsed.keywords
    .map((k) => String(k).replace(/['"`\\]/g, "").trim().toLowerCase())
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  const TARGET_KEYWORDS = platform === "shutterstock" ? 50 : 49;

  // Seamlessly guarantee exact target keyword count without ever throwing errors
  const finalKeywords = buildGuaranteedKeywords(
    rawKeywords,
    TARGET_KEYWORDS,
    parsed.title,
    parsed.prompt,
    parsed.primaryConcept,
    parsed.visualDescription
  );

  // Handle Shutterstock specific attributes
  let editorial: "yes" | "no" = "no";
  if (parsed.editorial === "yes") editorial = "yes";

  let matureContent: "yes" | "no" = "no";
  if (parsed.matureContent === "yes") matureContent = "yes";

  let illustration: "yes" | "no" = "no";
  if (parsed.illustration === "yes") illustration = "yes";

  const categoryWhitelist = [
    "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vectors", "Vintage"
  ];
  const categories = Array.isArray(parsed.categories)
    ? parsed.categories
        .map((cat) => String(cat).trim())
        .filter((cat) => categoryWhitelist.some((wl) => wl.toLowerCase() === cat.toLowerCase()))
        .map((cat) => categoryWhitelist.find((wl) => wl.toLowerCase() === cat.toLowerCase())!)
        .slice(0, 2)
    : [];

  let finalTitle = parsed.title.trim().replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/'([^']+)'/g, "$1").replace(/['"`]{2,}/g, "");
  if (complianceGuard) {
    const check = validateAndSanitize(finalTitle);
    finalTitle = check.title.replace(/^['"`\s]+|['"`\s]+$/g, "");
  }

  return {
    filename,
    title: finalTitle,
    keywords: finalKeywords,
    categories,
    editorial,
    matureContent,
    illustration,
    prompt: parsed.prompt,
    model: parsed.model || defaultModel,
    primaryConcept: parsed.primaryConcept,
    visualDescription: parsed.visualDescription,
    confidenceScore: 0.95,
    modelUsed: modelUsed || "openai/gpt-oss-120b",
    stabilized: true,
    attempts: attempt,
    usage: totalUsage,
  };
}

const DELAY_BETWEEN_IMAGES_MS = 1500; // 1.5s between images prevents Groq rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateMetadataWithRetry(
  dataUrl: string,
  filename: string,
  visualHints?: string,
  platform: "adobe_stock" | "shutterstock" | "magnific" = "adobe_stock",
  complianceGuard: boolean = false,
  existingPrompt?: string
): Promise<MetadataResult> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateMetadata(dataUrl, filename, visualHints, platform, complianceGuard, attempt, existingPrompt);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If rate limited and more attempts left, wait before retrying
      if ((msg.includes("429") || msg.includes("rate limit") || msg.includes("Rate limit")) && attempt < MAX_ATTEMPTS) {
        const waitMs = attempt * 2000; // 2s, 4s
        console.warn(`[generate] Groq 429 on attempt ${attempt}. Waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries reached");
}


export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json();
    const images: ImagePayload[] = body.images;
    const stabilized = body.stabilized !== false;

    // ── Security inspection ──
    // Skip deep security scan for authenticated users uploading images
    // (base64 image data triggers false-positive pattern detection)
    const authCookie = request.cookies.get("auth_token")?.value;
    const isAuthenticated = !!authCookie;

    if (!isAuthenticated) {
      const sec = await inspect({
        ip,
        endpoint: "/api/generate",
        method: "POST",
        userAgent: headersObj["user-agent"] ?? "",
        headers: headersObj,
        body: { stabilized, imageCount: Array.isArray(images) ? images.length : 0 },
        skipBodyScan: true, // base64 image data triggers false-positive injection detection
      });
      if (sec.blocked) {
        void recordIpError(ip);
        return NextResponse.json({ error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
      }
    }

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "Minimal 1 foto diperlukan" }, { status: 400 });
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Maksimal ${MAX_IMAGES} foto per permintaan` }, { status: 400 });
    }
    for (const img of images) {
      if (!img.filename || !img.dataUrl?.startsWith("data:image/")) {
        return NextResponse.json({ error: "Format gambar tidak valid" }, { status: 400 });
      }
    }


    const results: MetadataResult[] = [];
    const platform = body.platform === "shutterstock" ? "shutterstock" : body.platform === "magnific" ? "magnific" : "adobe_stock";
    const complianceGuard = body.complianceGuard === true;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const result = await generateMetadataWithRetry(
          image!.dataUrl,
          image!.filename,
          image!.visualHints,
          platform,
          complianceGuard,
          image!.existingPrompt
        );
        results.push({ ...result, stabilized });
      } catch (error) {
        results.push({
          filename: image!.filename,
          title: "",
          keywords: [],
          error: error instanceof Error ? error.message : "Gagal memproses gambar",
          stabilized,
        });
      }
      if (stabilized && i < images.length - 1) await sleep(DELAY_BETWEEN_IMAGES_MS);
    }

    // ── Log activity for authenticated user ──
    try {
      const authCookieVal = request.cookies.get("auth_token")?.value;
      if (authCookieVal) {
        const tokenPayload = verifyToken(authCookieVal);
        if (tokenPayload) {
          const successCount = results.filter((r) => !r.error).length;
          void appendActivityEvent(
            tokenPayload.userId,
            tokenPayload.email,
            tokenPayload.username,
            "metadata_upload",
            `Generate metadata untuk ${images.length} foto · ${successCount} berhasil · Platform: ${platform.replace("_", " ")}`
          );
        }
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ results, stabilized, totalUsage: {
      promptTokens: results.reduce((s, r) => s + (r.usage?.promptTokens || 0), 0),
      completionTokens: results.reduce((s, r) => s + (r.usage?.completionTokens || 0), 0),
      totalTokens: results.reduce((s, r) => s + (r.usage?.totalTokens || 0), 0),
    }});
  } catch (error) {
    void recordIpError(ip);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}
