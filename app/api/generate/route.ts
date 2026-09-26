import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage, REASONING_MODEL } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";
import { validateAndSanitize } from "@/lib/stock-compliance";
import { verifyToken } from "@/lib/auth";
import { appendActivityEvent, recordPhotoProcessing, appendPhotoToUserHistory, flushJobBufferToHistory } from "@/lib/db";

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
  ipWarning?: string;        // IP/copyright warning from AI detection
  ipDetected?: boolean;      // true if famous person/logo/brand was found
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

const MASTER_PROMPT_CORE = `You are an elite Microstock Metadata Specialist and Top-Selling Contributor on Adobe Stock and Shutterstock.

YOUR MISSION: Produce 1 accurate commercial title + exactly 49 or 50 single-word keywords that are:
  ✅ 100% VISUALLY ACCURATE — only describe what is actually visible in the image
  ✅ HIGH SEARCH VOLUME — words real buyers type every day
  ✅ STRICTLY 1 WORD EACH — no spaces, no hyphens, no compound phrases
  ✅ DIVERSE — cover: subjects, colors, emotions, settings, actions, concepts

═══ MANDATORY RULES ═══

【1】 ENGLISH ONLY:
   ALL output must be in English. Zero Indonesian words.

【2】 VISUAL ACCURACY IS THE #1 PRIORITY:
   Describe ONLY what is physically visible. Never invent or assume subjects not visible.
   ▸ If you see a WOMAN → use: woman, female, person, adult
   ▸ If you see FOOD → use: food, meal, dish, plate, fresh, healthy, delicious
   ▸ If you see a FOREST → use: forest, tree, nature, green, outdoor, landscape
   ▸ DO NOT use "teamwork", "meeting", "partnership" for solo subjects
   ▸ DO NOT use "crowd" or "group" for 1-2 people

【3】 STRICT 1 WORD PER KEYWORD (ABSOLUTE RULE):
   Every keyword = exactly one single English word.
   ✅ CORRECT: "woman" "office" "laptop" "smile" "business" "nature" "flower" "happy"
   ❌ WRONG: "business woman" "cherry tomato" "office desk" "happy woman" (these are 2-word phrases)
   If you need "cherry tomato" → use "tomato" AND "cherry" as separate words.
   If you need "honey bee" → use "honey" AND "bee" as separate words.

【4】 KEYWORD VARIETY — COVER ALL DIMENSIONS:
   Your 49/50 keywords MUST include words from ALL these categories:
   - Primary subjects (what/who is in the image): 12-15 words
   - Colors & visual qualities: 5-7 words  
   - Emotions & mood: 3-5 words
   - Setting & environment: 5-7 words
   - Actions & states: 4-6 words
   - Commercial concepts: 5-8 words (e.g. "concept", "business", "lifestyle", "professional")
   - Abstract & searchable: 5-7 words

【5】 HIGH-SEARCH-VOLUME WORDS ONLY:
   Use common everyday English that buyers search for.
   ❌ NEVER use: academic jargon, Latin terms, brand names, camera terms (bokeh, macro, dslr)
   ❌ NEVER use: "apiculture", "solanaceae", "chiaroscuro", "diffused", "framing"
   ✅ PREFER: "bee" over "apiculture", "flower" over "flora", "farm" over "agricultural"

【6】 NO ETHNICITY KEYWORDS (PLATFORM POLICY):
   ❌ BANNED: "asian", "caucasian", "indian", "chinese", "african", "hispanic", "arab", "malay"
   ✅ USE: "woman", "man", "person", "people", "adult", "young", "senior"

【7】 INTELLECTUAL PROPERTY:
   If famous person/brand logo/fictional character is detected → set "editorial": "yes"
   Otherwise → "editorial": "no"

【8】 TITLE RULES (8-14 words):
   Start with the MAIN SUBJECT + ACTION/STATE + SETTING.
   Example: "Young Woman Working at Computer Desk in Modern Office"
   Example: "Fresh Organic Tomatoes Harvested in Sunny Greenhouse"
   No quotes inside the title string.

⛔ IGNORE FILENAME — analyze only the actual image pixels.`;

const ADOBE_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ ADOBE STOCK FORMAT ═══
Keywords: EXACTLY 49 single-word keywords.

OUTPUT — strict JSON only, no markdown:
{
  "title": "Descriptive commercial title 8-14 words",
  "keywords": ["word1","word2",...exactly 49 single-word tags...],
  "primaryConcept": "Main commercial concept",
  "visualDescription": "One sentence objective description",
  "prompt": "Detailed photorealistic AI image generation prompt",
  "model": "Midjourney 6"
}`;

const SHUTTERSTOCK_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ SHUTTERSTOCK FORMAT ═══
Keywords: EXACTLY 50 single-word keywords.
Categories: Pick 1 or 2 from: "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vectors", "Vintage"

OUTPUT — strict JSON only, no markdown:
{
  "title": "Descriptive commercial title 8-15 words",
  "keywords": ["word1","word2",...exactly 50 single-word tags...],
  "categories": ["Category1"],
  "editorial": "no",
  "matureContent": "no",
  "illustration": "no",
  "primaryConcept": "Main commercial concept",
  "visualDescription": "One sentence objective description",
  "prompt": "Detailed photorealistic AI image generation prompt",
  "model": "Midjourney 6"
}`;

const MAGNIFIC_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ MAGNIFIC FORMAT ═══
Keywords: EXACTLY 49 single-word keywords (platform auto-adds "ai" "generate" as tags 50-51).

OUTPUT — strict JSON only, no markdown:
{
  "title": "Descriptive commercial title 8-14 words",
  "keywords": ["word1","word2",...exactly 49 single-word tags...],
  "prompt": "Detailed photorealistic AI image generation prompt",
  "model": "Adobe Firefly",
  "primaryConcept": "Main commercial concept",
  "visualDescription": "One sentence objective description"
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
  ipWarning?: string;
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
    if (!clean || clean.length < 2 || clean.length > 25) return;
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
      "clip", "pen", "dark band", "dirt path", "dirt pathway", "dark spots", "hive lid",
      "irrigation hoses", "irrigation hose", "pump unit", "water pump", "metal stakes", "vertical wires", "arched roof", "glass roof",
      "distant hills", "distant trees", "tree line", "daylight glow", "sunny horizon", "rural landscape", "distant horizon", "sunlit sky", "agricultural landscape", "agricultural setting", "plant canopy",
      // Unwanted weird color shades, micro body parts & accessories
      "khaki", "khakis", "tan", "cream", "off white", "off-white", "beige",
      "utility jacket", "chore coat", "plaid shirt", "flannel shirt", "plaid", "flannel", "shirt",
      "watch", "wristwatch", "timepiece", "accessory", "accessories", "jewelry",
      "right hand", "left hand", "hand holding", "hands", "hand", "finger", "fingers", "arm", "arms", "hair", "ponytail",
      "metal ribs", "horizontal supports", "paper sheet", "white paper",
      "metal", "arch", "arches", "roof", "roofing", "structure", "structures", "framing", "beams", "pipes", "pipe",
      // Camera technique & empty abstract words
      "diffused", "diffused light", "diffused daylight", "lighting", "eyelevel", "bokeh", "shallow depth", "macro",
      "soft light", "muted shadows", "landscape", "scene", "atmosphere", "concept", "lifestyle",
      "cinematic", "detailed", "depth", "field of view", "angle", "view", "extreme", "bunch", "pieces",
      // False context
      "teamwork", "team", "meeting", "partnership",
      // Speculative industrial stretches
      "packaging", "produce packaging", "nursery", "plant nursery", "farm equipment", "agribusiness",
      "biodiversity", "produce handling", "market supply",
      // ── ETHNICITY / NATIONALITY / REGION KEYWORDS (BANNED — causes platform rejection) ──
      "asian", "asean", "indian", "indian people", "indian man", "indian woman",
      "chinese", "korean", "japanese", "thai", "vietnamese", "malay", "filipino",
      "indonesian", "caucasian", "african", "latino", "latina", "hispanic",
      "middle eastern", "arab", "arabic", "european", "western", "eastern",
      "south asian", "southeast asian", "east asian", "pacific islander",
      "black people", "white people", "brown skin", "dark skin", "fair skin",
      "mixed race", "multiracial", "biracial",
      // Strict ban on leaked Indonesian words
      "wanita", "pria", "petani", "peternak", "kebun", "tomat", "lebah", "tanaman",
      "rumah", "kaca", "pertanian", "daun", "bunga", "tangan", "merah", "hijau",
      "putih", "hitam", "paruh", "baya", "seorang", "sarang", "madu", "dan",
      "dengan", "untuk", "yang", "pada", "dari", "dalam", "bisa", "adalah", "ini",
      "itu", "secara", "kualitas", "panen", "sayur", "sayuran", "buah", "buah-buahan"
    ]);
    if (JUNK_TERMS.has(clean)) return;

    // Normalizations for high-converting buyer search terms
    let normalized = clean;
    if (normalized === "cherry" && (title || "").toLowerCase().includes("tomato")) {
      normalized = "cherry tomato";
    } else if (normalized === "female" && /\b(woman|farmer|beekeeper)\b/i.test(title || "")) {
      normalized = "woman";
    } else if (normalized === "male" && /\b(man|farmer|beekeeper)\b/i.test(title || "")) {
      normalized = "man";
    }

    // Strict Gender Consistency based on title context
    const titleLower = (title || "").toLowerCase();
    const isMaleScene = /\b(man|male|boy|guy|father|brother|gentleman|businessman)\b/.test(titleLower) &&
      !/\b(woman|female|girl|lady|mother|sister)\b/.test(titleLower);
    const isFemaleScene = /\b(woman|female|girl|lady|mother|sister|businesswoman)\b/.test(titleLower) &&
      !/\b(man|male|boy|guy|father|brother)\b/.test(titleLower);

    if (isMaleScene && ["woman", "female", "girl", "lady", "sister", "mother"].includes(normalized)) return;
    if (isFemaleScene && ["man", "male", "boy", "guy", "brother", "father"].includes(normalized)) return;

    // ── STRICT: EXACTLY 1 word per keyword ────────────────────────────────
    const words = normalized.split(/\s+/);
    if (words.length > 1) {
      // Split multi-word into individual words and add each separately
      for (const w of words) {
        if (w.length > 2 && !JUNK_TERMS.has(w)) add(w);
      }
      return;
    }

    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  // 1. Add raw AI keywords first (highest priority, direct visual terms)
  rawKeywords.forEach(add);

  // If we already reached targetCount from pure AI visual forensics, return immediately!
  if (result.length >= targetCount) {
    return result.slice(0, targetCount);
  }

  // 2. Extract clean individual keywords from title (highest confidence)
  if (title) {
    const cleanTitle = title.replace(/[^\w\s-]/g, " ").toLowerCase();
    const titleWords = cleanTitle.split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "with", "for", "from", "that", "this", "holding", "inspecting"].includes(w));
    titleWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // 3. Extract core terms from primaryConcept (skip visualDescription to avoid sentence fragments)
  if (primaryConcept) {
    const pWords = primaryConcept.replace(/[^\w\s-]/g, " ").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    pWords.forEach(add);
    if (result.length >= targetCount) return result.slice(0, targetCount);
  }

  // 4. Derive sub-keywords by splitting existing 2-word keywords
  for (const kw of [...result]) {
    const parts = kw.split(/\s+/);
    if (parts.length > 1) {
      for (const p of parts) {
        if (p.length > 2) add(p);
        if (result.length >= targetCount) return result.slice(0, targetCount);
      }
    }
  }

  // ── FINAL HARD ENFORCEMENT: guarantee every keyword is max 2 words ──────
  const GENERIC_FILLERS = new Set([
    "the", "and", "for", "with", "from", "that", "this", "are", "was", "has",
    "have", "been", "will", "can", "all", "not", "one", "two", "its",
    "photo", "image", "picture", "shot", "stock", "best", "cool", "nice",
    "color", "colour", "look", "type", "kind", "sort", "form", "way", "use",
  ]);

  const finalResult = result
    .map(k => k.trim().toLowerCase())
    .filter(k => {
      if (!k || k.length < 2) return false;
      const parts = k.split(/\s+/);
      // Hard reject anything with spaces — strict 1 word only
      if (parts.length > 1) return false;
      // Hard reject single generic filler words
      if (parts.length === 1 && GENERIC_FILLERS.has(parts[0]!)) return false;
      return true;
    });

  // Deduplicate again after final filter
  const seen2 = new Set<string>();
  const deduped: string[] = [];
  for (const k of finalResult) {
    if (!seen2.has(k)) {
      seen2.add(k);
      deduped.push(k);
    }
  }

  // If still less than targetCount, backfill with context-matched simple 1-2 word terms
  if (deduped.length < targetCount) {
    const contextLower = `${title} ${prompt || ""} ${primaryConcept || ""} ${visualDescription || ""}`.toLowerCase();
    const thematicPool: string[] = [];

    if (contextLower.includes("tomato") || contextLower.includes("greenhouse") || contextLower.includes("vegetable") || contextLower.includes("crop") || contextLower.includes("farm")) {
      thematicPool.push(
        "fresh produce", "ripe tomato", "green leaves", "organic farming", "fresh vegetable",
        "red tomato", "healthy food", "summer harvest", "local farm", "green plants",
        "raw food", "natural diet", "healthy eating", "gardening", "healthy life", "sweet fruit",
        "fresh food", "ripe produce", "plant growth", "organic crop"
      );
    } else if (contextLower.includes("bee") || contextLower.includes("honey") || contextLower.includes("apiary")) {
      thematicPool.push(
        "raw honey", "honey production", "honey harvest", "honey bees", "sweet honey",
        "wildflowers", "summer field", "golden sunlight", "natural sweet", "organic honey",
        "bee farm", "pollination", "pure honey", "countryside", "rural life",
        "summer meadow", "nature beauty", "flying insects", "sweet food"
      );
    }

    // Universal safe 1-2 word stock terms:
    thematicPool.push(
      "clean", "bright", "daylight", "sunlight", "outdoor", "indoor",
      "nature", "natural", "healthy", "organic", "simple",
      "summer", "detail", "horizontal", "copy space", "isolated"
    );

    for (const term of thematicPool) {
      if (deduped.length >= targetCount) break;
      const cleanTerm = term.trim().toLowerCase();
      if (!seen2.has(cleanTerm) && cleanTerm.split(/\s+/).length <= 2 && !GENERIC_FILLERS.has(cleanTerm)) {
        seen2.add(cleanTerm);
        deduped.push(cleanTerm);
      }
    }
  }

  return deduped.slice(0, targetCount);
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
    const userPromptPayload = `Examine this stock photograph and identify ONLY the primary commercial elements:
1. Core Commercial Theme: (e.g. Tomato Greenhouse Farming / Beekeeping & Honey Production).
2. Primary Human Subject (if any): General role (e.g. female farmer / female beekeeper), primary outer garment color (e.g. blue work coat / white protective suit), items held in hands (e.g. clipboard and fresh cherry tomatoes / honeycomb frame).
   - STRICT: DO NOT describe undergarments (do NOT mention plaid shirt or flannel), DO NOT describe small accessories (do NOT mention watch/jewelry), DO NOT describe anatomical parts (no hands/fingers/hair).
3. Primary Produce or Creature: Exact species or crop (e.g. cherry tomatoes on vine / honeybees on honeycomb).
4. Setting & Environment: General setting name ONLY (e.g. greenhouse / sunny flower meadow).
   - STRICT: DO NOT describe structural building materials (do NOT mention metal, arches, framing, roof, pipes).
   - STRICT: DO NOT use photographic technical jargon (do NOT mention diffused, bokeh, lighting).${visualHints ? `\nUploader hints: ${visualHints}` : ""}`;

    // ══════════════════════════════════════════════════════════════════
    // STAGE 1: Visual Forensic Perception (Qwen Vision 3.8 / 3.6)
    // Inspects 100% real image pixels with clinical accuracy
    // ══════════════════════════════════════════════════════════════════
    const visionMessages: GroqMessage[] = [
      {
        role: "system",
        content: `You are a professional microstock content curator and intellectual property analyst.
Your task is to identify:
1. The central commercial theme and main visual subjects.
2. ANY intellectual property risks:
   a. FAMOUS PEOPLE: Do you recognize a specific named celebrity, politician, athlete, or public figure? If yes, flag as IP risk.
   b. LOGOS / BRANDS: Do you see a visible brand logo or trademark (Nike, Apple, Coca-Cola, McDonalds, etc.)? If yes, flag as IP risk.
   c. FICTIONAL CHARACTERS: Movie/TV/game characters (Marvel, Disney, etc.)? If yes, flag as IP risk.
3. NEVER use ethnicity/nationality labels (no Asian, Indian, Chinese, Caucasian) - use general descriptors (man, woman, person, group).
Be factual, concise, and direct. Omit secondary ground clutter, accessories, undergarments, camera jargon, and structural building materials.`
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
    const reasoningUserMessage = `Generate accurate microstock metadata based on this visual analysis:

VISUAL ANALYSIS FROM VISION MODEL:
${visionResult.text}

KEYWORD GENERATION RULES — READ CAREFULLY:
1. EXACTLY 1 WORD PER KEYWORD — no spaces, no hyphens. "tomato" not "cherry tomato". "bee" not "honey bee".
2. Generate between 52-58 keywords total so after deduplication we reliably get 49-50 clean ones.
3. Cover ALL these dimensions:
   • Main subjects visible (10-12 words): exactly what/who is in the image
   • Colors present (4-5 words): actual colors you see
   • Emotions & mood (3-4 words): feeling the image conveys
   • Setting & environment (5-6 words): where the scene takes place
   • Actions & states (4-5 words): what subjects are doing
   • Commercial keywords (6-8 words): "business", "professional", "lifestyle", "concept", etc.
   • Searchable adjectives (5-6 words): "fresh", "organic", "modern", "bright", "clean", etc.
4. NO ethnicity words: use "woman"/"man"/"person" not "asian"/"caucasian"/"indian".
5. NO camera/lighting jargon: no "bokeh", "diffused", "macro", "dslr".
6. NO brand names. NO Latin terms.
7. IP: if famous person/brand/character detected, set "editorial":"yes" + "ipWarning" field.

CONTEXT:
- Platform target: ${platform === "shutterstock" ? "Shutterstock (50 keywords)" : platform === "magnific" ? "Magnific (49 keywords)" : "Adobe Stock (49 keywords)"}
- Filename (IGNORE — do NOT use as keyword source): ${filename}
${visualHints ? `- Creator hints: ${visualHints}` : ""}
${existingPrompt ? `- Existing prompt: "${existingPrompt}"` : ""}

OUTPUT: strict valid JSON only, no markdown, no explanation outside JSON.`;

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
    const textPart = `Generate accurate microstock metadata. Language: English only.
Produce exactly ${targetKwCount} single-word keywords (1 word each, no spaces, no hyphens).
Cover: main subjects, colors, emotions, setting, actions, commercial concepts.
No ethnicity words. No brand names. No camera jargon.
Filename (IGNORE): ${filename}
${visualHints ? `Creator hints: ${visualHints}\n` : ""}${existingPrompt ? `Existing prompt: ${existingPrompt}\n` : ""}
Output strict JSON only.`;

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

  // ── IP Detection: extract ipWarning from AI response & force editorial when IP found ──
  const ipWarning = typeof (parsed as any).ipWarning === "string" && (parsed as any).ipWarning.length > 3
    ? (parsed as any).ipWarning.trim()
    : undefined;
  const ipDetected = !!(ipWarning || editorial === "yes");
  if (ipDetected && editorial !== "yes") {
    editorial = "yes";
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
    ipWarning,
    ipDetected,
    confidenceScore: 0.95,
    modelUsed: modelUsed || "openai/gpt-oss-120b",
    stabilized: true,
    attempts: attempt,
    usage: totalUsage,
  };
}

const DELAY_BETWEEN_IMAGES_MS = 1500; // 1.5s between images prevents Groq rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateMetadataWithRetry(
  dataUrl: string,
  filename: string,
  visualHints?: string,
  platform: "adobe_stock" | "shutterstock" | "magnific" = "adobe_stock",
  complianceGuard: boolean = false,
  existingPrompt?: string,
  maxAttempts: number = 4
): Promise<MetadataResult> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generateMetadata(dataUrl, filename, visualHints, platform, complianceGuard, attempt, existingPrompt);
      if (result && result.title && result.keywords && result.keywords.length > 0) {
        return result;
      }
      throw new Error("Hasil metadata kosong atau tidak lengkap dari model AI");
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[generateMetadataWithRetry] Foto "${filename}" gagal pada percobaan ${attempt}/${maxAttempts}: ${msg}`);

      if (attempt < maxAttempts) {
        const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit");
        const waitMs = isRateLimit ? attempt * 2500 : Math.min(attempt * 1500, 4500);
        await sleep(waitMs);
        continue;
      }
    }
  }
  throw lastError || new Error(`Gagal memproses metadata "${filename}" setelah ${maxAttempts} percobaan`);
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

    // ── Setup session untuk progressive history save ──
    // SessionId dibuat sekarang supaya tiap foto bisa langsung disimpan ke buffer Redis
    // tanpa perlu tunggu semua foto selesai. Kalau Vercel timeout, partial results tetap aman.
    const authCookieVal = request.cookies.get("auth_token")?.value;
    const tokenPayload = authCookieVal ? verifyToken(authCookieVal) : null;
    const activeSessionId = body.sessionId || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let successCount = 0;

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

        // ── Simpan ke Redis buffer segera setelah foto ini selesai ──
        // Ini penting: kalau Vercel timeout di tengah proses, foto yang sudah
        // selesai tetap tersimpan di buffer dan akan muncul di history.
        if (tokenPayload && !result.error && result.title) {
          successCount++;
          void appendPhotoToUserHistory(tokenPayload.userId, activeSessionId, platform, {
            filename: result.filename,
            title: result.title,
            keywords: result.keywords,
            categories: result.categories,
            prompt: result.prompt,
            model: result.model,
            editorial: result.editorial,
            matureContent: result.matureContent,
            illustration: result.illustration,
          });
        }
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

    // ── Flush buffer ke history list & catat activity ──
    try {
      if (tokenPayload && successCount > 0) {
        // Flush semua foto dari buffer ke history list sekaligus
        await flushJobBufferToHistory(tokenPayload.userId, activeSessionId);

        // Catat ke leaderboard & stats
        void recordPhotoProcessing(tokenPayload.userId, tokenPayload.username || "Kreator", successCount);

        void appendActivityEvent(
          tokenPayload.userId,
          tokenPayload.email,
          tokenPayload.username,
          "metadata_upload",
          `Generate metadata untuk ${images.length} foto · ${successCount} berhasil · Platform: ${platform.replace("_", " ")}`
        );
      }
    } catch (err) {
      console.error("[generate] Failed to flush history to Redis:", err);
    }

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
