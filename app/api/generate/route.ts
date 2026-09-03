import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage } from "@/lib/groq";
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
}

interface ImagePayload {
  filename: string;
  dataUrl: string;
  visualHints?: string;
}

const MASTER_PROMPT_CORE = `# MASTER PROMPT — HIGH-CONVERTING MICROSTOCK METADATA OPTIMIZER
### Adobe Stock • Shutterstock • Magnific Contributor

Anda adalah **World-Class Microstock SEO & Metadata Specialist** dengan pengalaman mendalam dalam algoritma pencarian Adobe Stock, Shutterstock, dan Magnific.
Tujuan Anda adalah menghasilkan metadata yang **SANGAT AKURAT, HYPER-RELEVANT DENGAN VISUAL, BERBOBOT SEO TINGGI, DAN MEMAKSIMALKAN POTENSI PENJUALAN (COMMERCIAL CONVERSION / SALES).**

---

# CORE PRINCIPLE: VISUAL ACCURACY & BUYER SEARCH INTENT
1. **VISUAL ACCURACY IS ABSOLUTE**: Semua judul dan kata kunci HARUS 100% merefleksikan apa yang benar-benar terlihat di gambar. Dilarang mengarang hal yang tidak terlihat.
2. **BUYER SEARCH INTENT FIRST**: Pikirkan kata kunci yang diketik seorang Art Director, Designer, atau Buyer saat mencari aset ini di mesin pencari.
3. **NO FLUFF / NO SPAM**: Dilarang memasukkan kata spam: "photo", "image", "picture", "wallpaper", "hd", "4k", "8k", "best", "cool".

---

# ⛔ ATURAN SUPER KRITIS — FILENAME BIAS ADALAH KESALAHAN FATAL ⛔
**NAMA FILE ADALAH SAMPAH METADATA. JANGAN PERNAH BIARKAN NAMA FILE MEMPENGARUHI KATA KUNCI ATAU JUDUL.**

Contoh situasi berbahaya:
- Nama file: "Digital_payment_stock_photograph_guitar_2K.jpeg"
- Gambar berisi: Gitar akustik kayu
- BENAR: keywords[0] = "guitar", keywords[1] = "acoustic guitar", keywords[2] = "musical instrument"
- SALAH: keywords[0] = "digital payment", keywords[1] = "cashless", keywords[2] = "payment system"

**ATURAN MUTLAK: Analisis HANYA piksel visual gambar. Nama file diabaikan 100% untuk konten kata kunci.**
Bayangkan Anda tidak tahu nama filenya sama sekali — deskripsikan hanya apa yang Anda lihat secara visual.

---

# STEP 1 — FORENSIK VISUAL MENDALAM (6 DIMENSI WAJIB)
Analisis seluruh elemen visual sebelum membuat metadata:
1. **SUBJECT & COMPONENT PARTS**: Subjek utama secara spesifik + seluruh bagian fisiknya.
2. **MATERIALS, TEXTURES & COLORS**: Kayu, kaca, logam, plastik, kanvas, glossy, matte, warna nyata.
3. **SETUP, ENVIRONMENT & BACKGROUND**: Isolated on white, outdoor, modern interior, dark background, copy space.
4. **COMPOSITION & ANGLE**: Close-up, macro, overhead, flat lay, side view, single object.
5. **LIGHTING & MOOD**: Studio lighting, natural sunlight, rim light, high key, bright, professional.
6. **COMMERCIAL USE & INDUSTRY**: Grafis, periklanan, edukasi, seni, hobi, teknologi, lifestyle, bisnis.

---

# STEP 2 — TITLE FORMULA (BERBOBOT SEO & PENJUALAN TINGGI)
Buat judul 1 kalimat bahasa Inggris alami (8–12 kata).
Rumus: \`[Material/Style/Adjective] + [Specific Primary Subject] + [Action/Detail/Color] + [Environment/Background]\`

Contoh:
- Gitar: \`Acoustic Wooden Guitar with Strings and Fretboard Isolated on White Background\`
- Kuas lukis: \`Artist Paintbrush with Blue Paint on Bristles Isolated on White Background\`
- Helm sepeda: \`Modern Aerodynamic White Cycling Helmet Isolated on Plain White Background\`

---

# STEP 3 — ATURAN KATA KUNCI: WAJIB MINIMAL 52–60 KATA KUNCI UNIK

## ⭐ TIER 1: LITERAL VISUAL NOUNS — POSISI 1–15 [BOBOT TERTINGGI, PALING KRITIS]
**KATA KUNCI POSISI 1 SAMPAI 15 MUTLAK HARUS berisi nama benda fisik yang terlihat langsung di foto.**
- Nama benda utama dalam bahasa Inggris yang MUDAH DICARI (high search volume, simple, direct).
- Jangan gunakan konsep abstrak atau kata dari nama file di sini.
- Contoh jika foto adalah gitar:
  ["guitar", "acoustic guitar", "musical instrument", "strings", "frets", "guitar neck", "wood guitar",
   "music instrument", "acoustic", "folk guitar", "classical guitar", "guitar body", "soundhole", "guitar strings", "wooden guitar"]
- Contoh jika foto adalah kuas:
  ["paintbrush", "paint brush", "bristle", "blue paint", "wooden handle", "artist brush", "painting tool",
   "art supplies", "acrylic paint", "ferrule", "oil paint", "fine art brush", "brush tip", "painter tool", "craft brush"]

## TIER 2: PRESENTASI VISUAL, SETUP & BACKGROUND — POSISI 16–28
- Lingkungan visual nyata, komposisi, sudut kamera, latar belakang yang terlihat.

## TIER 3: COMMERCIAL USE CASES & PROFESSION — POSISI 29–44
- Profesi, industri, aktivitas, hobi, tujuan komersial aset ini.

## TIER 4: SUPPORTING COMMERCIAL TERMS & STYLES — POSISI 45–60+
- Konsep pendukung, kualitas visual, istilah pelengkap yang dicari buyer.

---

# STEP 4 — PROMPT GENERATIF & AI REPRODUCTION
Field "prompt": Prompt AI fotorealistik bahasa Inggris yang detail dan presisi (subjek, warna, pencahayaan studio, sudut kamera, tekstur, lensa, 8k quality, background) untuk mereproduksi aset secara identik.`;

const ADOBE_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPESIFIK: ADOBE STOCK ═══
- Title: 8–12 kata bahasa Inggris deskriptif & bernilai jual tinggi (Formula Step 2).
- Keywords: Berikan MINIMAL 50–60 kata kunci unik yang hyper-relevan dan akurat sesuai visual, terurut ketat dari Tier 1 ke Tier 4 (Step 3).
- Prompt: Prompt AI fotorealistik lengkap untuk reproduksi gambar di Magnific / Midjourney.
- Model: Model AI yang sesuai (default "Midjourney 6").
- Primary Concept: Konsep utama komersial.
- Visual Description: Ringkasan visual singkat.

FORMAT OUTPUT WAJIB STRICT VALID JSON TANPA TEKS LAIN DI LUAR JSON:
{
  "title": "Exact descriptive title following Step 2",
  "keywords": ["kw1", "kw2", ...at least 50-60 keywords in strict tier order...],
  "primaryConcept": "Primary concept name",
  "visualDescription": "Brief summary of visual",
  "prompt": "Detailed AI image prompt recreating subject, lighting, angle, details",
  "model": "Midjourney 6"
}`;

const SHUTTERSTOCK_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPESIFIK: SHUTTERSTOCK ═══
- Title / Description: 8–15 kata bahasa Inggris deskriptif & bernilai jual tinggi (Formula Step 2).
- Keywords: Berikan MINIMAL 50–60 kata kunci unik yang hyper-relevan dan akurat sesuai visual, terurut ketat dari Tier 1 ke Tier 4 (Step 3).
- Categories: Pilih tepat 1 atau 2 kategori yang paling akurat dari daftar resmi Shutterstock:
  "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vectors", "Vintage"
- Editorial: "yes" | "no" (Pilih "yes" jika screenshot game/UI/merek, "no" jika objek stok bebas lisensi)
- Mature Content: "no"
- Illustration: "yes" jika vektor/render 3D/ilustrasi, "no" jika foto nyata
- Prompt: Prompt AI fotorealistik lengkap untuk reproduksi gambar.
- Model: Model AI (default "Midjourney 6").
- Primary Concept: Konsep utama komersial.
- Visual Description: Ringkasan visual singkat.

FORMAT OUTPUT WAJIB STRICT VALID JSON TANPA TEKS LAIN DI LUAR JSON:
{
  "title": "Exact descriptive title following Step 2",
  "keywords": ["kw1", "kw2", ...at least 50-60 keywords in strict tier order...],
  "categories": ["The Arts", "Backgrounds/Textures"],
  "editorial": "no",
  "matureContent": "no",
  "illustration": "no",
  "primaryConcept": "Primary concept",
  "visualDescription": "Brief summary",
  "prompt": "Detailed AI image prompt recreating subject, lighting, angle, details",
  "model": "Midjourney 6"
}`;

const MAGNIFIC_SYSTEM_PROMPT = `${MASTER_PROMPT_CORE}

═══ PLATFORM SPESIFIK: MAGNIFIC CONTRIBUTOR ═══
- Title: 8–12 kata bahasa Inggris deskriptif & bernilai jual tinggi (Formula Step 2).
- Keywords: Berikan MINIMAL 50–60 kata kunci unik yang hyper-relevan dan akurat sesuai visual, terurut ketat dari Tier 1 ke Tier 4 (Step 3).
- Prompt: WAJIB. Prompt generative AI yang sangat detail, kaya, dan fotorealistik dalam bahasa Inggris mendeskripsikan subjek, pencahayaan, sudut kamera, tekstur material, warna, dan detail rendering untuk Magnific Contributor.
- Model: WAJIB. Pilih model AI yang paling cocok dari ["Midjourney 6", "Flux", "Stable Diffusion XL", "Midjourney 5", "DALL-E 3", "Adobe Firefly"] (Default "Midjourney 6").
- Primary Concept: Konsep utama komersial.
- Visual Description: Ringkasan visual singkat.

FORMAT OUTPUT WAJIB STRICT VALID JSON TANPA TEKS LAIN DI LUAR JSON:
{
  "title": "Exact descriptive title following Step 2",
  "keywords": ["kw1", "kw2", ...at least 50-60 keywords in strict tier order...],
  "prompt": "Detailed photorealistic generative AI prompt in English describing subject, lighting, angle, colors, texture, camera lens, 8k resolution",
  "model": "Midjourney 6",
  "primaryConcept": "Primary concept name",
  "visualDescription": "Brief visual summary"
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

function safeParseMetadataJson(jsonText: string, filename: string): {
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

  // Step 2: If parsed successfully as object
  if (parsed && typeof parsed === "object") {
    let title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const rawKw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = rawKw.map((k: any) => String(k).trim()).filter(Boolean);
    const primaryConcept = typeof parsed.primaryConcept === "string" ? parsed.primaryConcept.trim() : "";
    const visualDescription = typeof parsed.visualDescription === "string" ? parsed.visualDescription.trim() : "";
    const prompt = typeof parsed.prompt === "string" && parsed.prompt.length > 5
      ? parsed.prompt.trim()
      : (visualDescription || `${title}, photorealistic, high resolution, cinematic lighting, 8k, detailed textures`);
    const model = typeof parsed.model === "string" && parsed.model.length > 2
      ? parsed.model.trim()
      : "Midjourney 6";

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
      title,
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

  const primaryConcept = conceptMatch ? conceptMatch[1].trim() : "";
  const visualDescription = descMatch ? descMatch[1].trim() : "";
  let title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "";
  const model = modelMatch ? modelMatch[1].trim() : "Midjourney 6";
  const prompt = promptMatch ? promptMatch[1].trim() : (visualDescription || `${title || filename}, professional photography, 8k, detailed`);

  const extractedKeywords: string[] = [];
  if (keywordsMatch && keywordsMatch[1]) {
    const rawMatch = keywordsMatch[1];
    if (rawMatch.includes(",")) {
      rawMatch.split(",").forEach((item) => {
        const clean = item.replace(/[\[\]"'\r\n]/g, "").trim();
        if (clean.length > 1) extractedKeywords.push(clean);
      });
    } else {
      const matches = rawMatch.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach((m) => extractedKeywords.push(m.replace(/"/g, "").trim()));
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
    title,
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
    const clean = k.trim().toLowerCase().replace(/^[,\-–—\s]+|[,\-–—\s]+$/g, "");
    if (!clean || clean.length < 2 || clean.length > 35) return;
    // Disallow generic filler/spam words that hurt ranking
    if (["photo", "image", "picture", "wallpaper", "4k", "8k", "hd", "best", "cool"].includes(clean)) return;
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

  // Universal neutral photography terms (safe for all images):
  const neutralStockTerms = [
    "composition", "perspective", "sharp focus", "detailed texture",
    "vibrant color", "commercial asset", "professional photography",
    "creative visual", "modern design", "digital asset", "high quality",
    "focal point", "clean presentation", "contemporary style"
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
  attempt: number = 1
): Promise<MetadataResult> {
  if (!base64DataUrl.startsWith("data:image/")) {
    throw new Error("Format data URL tidak valid");
  }

  const promptText = platform === "shutterstock" ? SHUTTERSTOCK_SYSTEM_PROMPT : platform === "magnific" ? MAGNIFIC_SYSTEM_PROMPT : ADOBE_SYSTEM_PROMPT;
  const textPart = visualHints
    ? `Analyze the image VISUALLY and generate accurate microstock metadata.
FILENAME (for reference only, do NOT use for keywords): ${filename}
Visual context/hints from uploader: ${visualHints}

CRITICAL RULES:
1. Keywords MUST come from what you SEE in the image, NOT from the filename text.
2. First 15 keywords MUST be the literal physical objects visible in the photo.
3. Output ONLY raw valid JSON with no markdown fences or extra text.`
    : `Analyze the image VISUALLY and generate accurate microstock metadata.
FILENAME (for reference only, do NOT use for keywords): ${filename}

CRITICAL RULES:
1. Keywords MUST come from what you SEE in the image, NOT from the filename text.
2. First 15 keywords MUST be the literal physical objects visible in the photo (e.g. if you see a guitar → "guitar", "acoustic guitar", "strings", "musical instrument").
3. Output ONLY raw valid JSON with no markdown fences or extra text.`;

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
    temperature: 0.15,
    max_tokens: 3072,
    vision: true,
    jsonMode: true,
  });

  const parsed = safeParseMetadataJson(result.text, filename);

  const rawKeywords = parsed.keywords
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  const TARGET_KEYWORDS = platform === "shutterstock" || platform === "magnific" ? 50 : 49;

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
    prompt: parsed.prompt,
    model: parsed.model,
    primaryConcept: parsed.primaryConcept,
    visualDescription: parsed.visualDescription,
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
  platform: "adobe_stock" | "shutterstock" | "magnific" = "adobe_stock",
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
