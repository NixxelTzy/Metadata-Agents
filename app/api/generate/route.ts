import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";
import { validateAndSanitize } from "@/lib/stock-compliance";

export const runtime = "nodejs"; // Required for Redis (security core)
export const maxDuration = 300;

export interface MetadataResult {
  filename: string;
  title: string;
  keywords: string[];
  categories?: string[];
  editorial?: "yes" | "no";
  matureContent?: "yes" | "no";
  illustration?: "yes" | "no";
  error?: string;
  attempts?: number;
  stabilized?: boolean;
  modelUsed?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ImagePayload {
  filename: string;
  dataUrl: string;
  visualHints?: string;
}

const ADOBE_SYSTEM_PROMPT = `You are a world-class Adobe Stock metadata specialist with deep expertise in visual content analysis and stock photography SEO.

Your task: Analyze the provided stock photo/media frame with extreme precision and generate highly relevant, commercially optimized metadata.

═══ TITLE RULES ═══
- Write EXACTLY in English
- Length: 7–12 words
- Structure: [Main Subject] + [Action/State] + [Setting/Context] + [Mood/Style] when applicable
- Be HYPER-SPECIFIC: describe exactly what is in the image
- Include the most commercially valuable descriptors (lighting, composition, demographic)
- NO generic phrases like "beautiful", "amazing", "great"
- NO questions, ellipsis, or punctuation
- Must be unique and instantly describe this specific image

═══ KEYWORDS RULES ═══
- Provide EXACTLY 49 keywords in English — no more, no less. This is a hard requirement.
- RELEVANCE IS MANDATORY: every keyword must directly relate to actual visual content
- NO hallucinated content: only describe what is genuinely visible in the image
- Structure your 49 keywords in this exact distribution:
  1. PRIMARY (12–14): exact subjects, main objects, people, animals, or items clearly visible
  2. DESCRIPTIVE (10–12): colors, textures, materials, patterns, lighting quality, shadows
  3. CONTEXTUAL (8–10): location type, setting, environment, time of day, season
  4. CONCEPTUAL (7–9): emotions, moods, concepts, themes, symbolism
  5. COMMERCIAL (5–6): use-cases, target audience, business applications
  6. TECHNICAL (3–4): photo style, composition technique, camera angle, image type
- Count carefully before responding — you MUST have exactly 49 items in the keywords array
- Use SINGULAR form for nouns unless plural is more commercially searchable
- Each keyword = 1–3 words maximum
- No duplicates, no brand names, no generic filler words

Respond ONLY with valid JSON — no explanation, no markdown:
{"title": "Exact descriptive title here", "keywords": ["keyword1", "keyword2", ...49 total...]}`;

const SHUTTERSTOCK_SYSTEM_PROMPT = `You are a world-class Shutterstock metadata specialist with deep expertise in visual content analysis, keywording, and stock industry SEO.

Your task: Analyze the provided media frame (photo or video thumbnail) and generate highly relevant, commercially optimized metadata for Shutterstock.

═══ DESCRIPTION / TITLE RULES ═══
- Write EXACTLY in English
- Length: 7–15 words
- Describe the main subject, setting, and context clearly and objectively
- NO generic phrases like "beautiful", "amazing", "great"
- NO questions, ellipsis, or punctuation

═══ KEYWORDS RULES ═══
- Provide EXACTLY 50 keywords in English — no more, no less. This is a hard requirement.
- RELEVANCE IS MANDATORY: every keyword must directly relate to actual visual content
- NO hallucinated content: only describe what is genuinely visible in the image
- Structure your 50 keywords in this exact distribution:
  1. PRIMARY (12–14): exact subjects, main objects, people, animals, or items clearly visible
  2. DESCRIPTIVE (10–12): colors, textures, materials, patterns, lighting quality, shadows
  3. CONTEXTUAL (8–10): location type, setting, environment, time of day, season
  4. CONCEPTUAL (7–9): emotions, moods, concepts, themes, symbolism
  5. COMMERCIAL (5–6): use-cases, target audience, business applications
  6. TECHNICAL (4–5): photo style, composition technique, camera angle, image type
- Count carefully before responding — you MUST have exactly 50 items in the keywords array
- Use SINGULAR form for nouns unless plural is more commercially searchable
- Each keyword = 1–3 words maximum
- No duplicates, no brand names, no generic filler words

═══ CATEGORIES ═══
- Choose exactly 1 or 2 categories from this exact list (do not invent categories):
  "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vectors", "Vintage"

═══ TECHNICAL ATTRIBUTES ═══
- editorial: "yes" if the image/video contains logos, trademarked brands, editorial scenes, or recognizable public crowds without model releases; otherwise "no"
- matureContent: "yes" if the image/video depicts nudity, suggestive themes, violence, or sensitive content; otherwise "no"
- illustration: "yes" if the media is an illustration, digital painting, CGI, 3D render, vector, or generative AI art; "no" if it is a real photograph or live-action video frame

Respond ONLY with valid JSON — no explanation, no markdown:
{
  "title": "Exact descriptive description here",
  "keywords": ["keyword1", "keyword2", ...50 total...],
  "categories": ["Category1", "Category2"],
  "editorial": "yes" | "no",
  "matureContent": "yes" | "no",
  "illustration": "yes" | "no"
}`;

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function generateMetadata(
  base64DataUrl: string,
  filename: string,
  visualHints?: string,
  platform: "adobe_stock" | "shutterstock" = "adobe_stock",
  complianceGuard: boolean = false,
  attempt: number = 1
): Promise<MetadataResult> {
  if (!base64DataUrl.startsWith("data:image/")) {
    throw new Error("Format data URL tidak valid");
  }

  const promptText = platform === "shutterstock" ? SHUTTERSTOCK_SYSTEM_PROMPT : ADOBE_SYSTEM_PROMPT;
  const textPart = visualHints
    ? `Analyze this media frame and generate metadata following the rules.\n\nFilename: ${filename}\nVisual hints: ${visualHints}`
    : `Analyze this media frame and generate metadata following the rules.\n\nFilename: ${filename}`;

  const messages: GroqMessage[] = [
    { role: "system", content: promptText },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: base64DataUrl } },
        { type: "text", text: textPart },
      ],
    },
  ];

  const result = await callGroq(messages, {
    temperature: 0.3,
    max_tokens: 2048,
    vision: true,
  });

  const jsonText = extractJsonFromText(result.text);
  const parsed = JSON.parse(jsonText) as {
    title?: string;
    keywords?: string[];
    categories?: string[];
    editorial?: string;
    matureContent?: string;
    illustration?: string;
  };

  if (!parsed.title || !Array.isArray(parsed.keywords)) {
    throw new Error("Format respons AI tidak valid");
  }

  const keywords = parsed.keywords
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  const TARGET_KEYWORDS = platform === "shutterstock" ? 50 : 49;

  // Hard-enforce exactly target keywords.
  // If AI returned fewer, pad with derived variations from existing keywords.
  // If AI returned more, trim (keeps highest-priority ones at front).
  let finalKeywords = keywords.slice(0, TARGET_KEYWORDS);

  if (finalKeywords.length < TARGET_KEYWORDS) {
    // Derive additional keywords by combining/splitting existing ones until we hit target
    const extras: string[] = [];
    for (const kw of keywords) {
      const parts = kw.split(" ");
      if (parts.length > 1) {
        for (const part of parts) {
          if (
            part.length > 2 &&
            !finalKeywords.includes(part) &&
            !extras.includes(part)
          ) {
            extras.push(part);
          }
        }
      }
      if (finalKeywords.length + extras.length >= TARGET_KEYWORDS) break;
    }
    finalKeywords = [...finalKeywords, ...extras].slice(0, TARGET_KEYWORDS);
  }

  // Fallback padding if still short
  const fallbackKeywords = ["concept", "illustration", "media", "content", "creative", "stock", "design", "background", "art", "graphic"];
  let fallbackIndex = 0;
  while (finalKeywords.length < TARGET_KEYWORDS && fallbackIndex < fallbackKeywords.length) {
    const fallback = fallbackKeywords[fallbackIndex]!;
    if (!finalKeywords.includes(fallback)) {
      finalKeywords.push(fallback);
    }
    fallbackIndex++;
  }

  // Final safety check
  if (finalKeywords.length !== TARGET_KEYWORDS) {
    throw new Error(
      `AI returned ${finalKeywords.length} keywords after normalization — expected exactly ${TARGET_KEYWORDS}. Retrying.`
    );
  }

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

  let finalTitle = parsed.title.trim();
  if (complianceGuard) {
    const check = validateAndSanitize(finalTitle);
    finalTitle = check.title;
  }

  return {
    filename,
    title: finalTitle,
    keywords: finalKeywords,
    categories,
    editorial,
    matureContent,
    illustration,
    modelUsed: result.modelUsed,
    stabilized: true,
    attempts: attempt,
    usage: result.usage,
  };
}

const DELAY_BETWEEN_IMAGES_MS = 1500; // 1.5s between images prevents Groq rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateMetadataWithRetry(
  dataUrl: string,
  filename: string,
  visualHints?: string,
  platform: "adobe_stock" | "shutterstock" = "adobe_stock",
  complianceGuard: boolean = false,
): Promise<MetadataResult> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateMetadata(dataUrl, filename, visualHints, platform, complianceGuard, attempt);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If rate limited and more attempts left, wait before retrying
      if ((msg.includes("429") || msg.includes("rate limit") || msg.includes("Rate limit")) && attempt < MAX_ATTEMPTS) {
        const waitMs = attempt * 8000; // 8s, 16s
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
    const sec = await inspect({
      ip,
      endpoint: "/api/generate",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body: { stabilized, imageCount: Array.isArray(images) ? images.length : 0 }, // don't scan base64 images
    });
    if (sec.blocked) {
      void recordIpError(ip);
      return NextResponse.json({ error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
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
    const platform = body.platform === "shutterstock" ? "shutterstock" : "adobe_stock";
    const complianceGuard = body.complianceGuard === true;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const result = await generateMetadataWithRetry(image!.dataUrl, image!.filename, image!.visualHints, platform, complianceGuard);
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
