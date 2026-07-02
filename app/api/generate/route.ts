import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";

export const maxDuration = 300;

export interface MetadataResult {
  filename: string;
  title: string;
  keywords: string[];
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

const SYSTEM_PROMPT = `You are a world-class Adobe Stock metadata specialist with deep expertise in visual content analysis and stock photography SEO.

Your task: Analyze the provided stock photo with extreme precision and generate highly relevant, commercially optimized metadata.

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
  attempt: number = 1
): Promise<MetadataResult> {
  if (!base64DataUrl.startsWith("data:image/")) {
    throw new Error("Format data URL tidak valid");
  }

  const textPart = visualHints
    ? `Analyze this stock photo and generate Adobe Stock title and keywords following the rules.\n\nFilename: ${filename}\nVisual hints: ${visualHints}`
    : `Analyze this stock photo and generate Adobe Stock title and keywords following the rules.\n\nFilename: ${filename}`;

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
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
  const parsed = JSON.parse(jsonText) as { title?: string; keywords?: string[] };

  if (!parsed.title || !Array.isArray(parsed.keywords)) {
    throw new Error("Format respons AI tidak valid");
  }

  const keywords = parsed.keywords
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  const TARGET_KEYWORDS = 49;

  // Hard-enforce exactly 49 keywords.
  // If AI returned fewer, pad with derived variations from existing keywords.
  // If AI returned more, trim to 49 (keeps highest-priority ones at front).
  let finalKeywords = keywords.slice(0, TARGET_KEYWORDS);

  if (finalKeywords.length < TARGET_KEYWORDS) {
    // Derive additional keywords by combining/splitting existing ones until we hit 49
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

  // Final safety: if still short (edge case), throw so retry logic kicks in
  if (finalKeywords.length !== TARGET_KEYWORDS) {
    throw new Error(
      `AI returned ${finalKeywords.length} keywords after normalization — expected exactly ${TARGET_KEYWORDS}. Retrying.`
    );
  }

  return {
    filename,
    title: parsed.title.trim(),
    keywords: finalKeywords,
    modelUsed: result.modelUsed,
    stabilized: true,
    attempts: attempt,
    usage: result.usage,
  };
}

const DELAY_BETWEEN_IMAGES_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // Track Groq usage per-image for accurate totals (komponen frontend tetap pakai sum dari results.usage)
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;


    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const result = await generateMetadata(image.dataUrl, image.filename, image.visualHints, 1);
        results.push({ ...result, stabilized });
      } catch (error) {
        // Retry sekali untuk kasus parse/response tidak valid
        try {
          const result = await generateMetadata(image.dataUrl, image.filename, image.visualHints, 2);
          results.push({ ...result, stabilized });
        } catch (error2) {
          results.push({
            filename: image.filename,
            title: "",
            keywords: [],
            error:
              (error2 instanceof Error ? error2.message : "Gagal memproses gambar") ||
              (error instanceof Error ? error.message : "Gagal memproses gambar"),
            stabilized,
          });
        }
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

