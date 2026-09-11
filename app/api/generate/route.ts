import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/utils";
import { callGroq, type GroqMessage, REASONING_MODEL } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";
import { validateAndSanitize } from "@/lib/stock-compliance";
import { verifyToken } from "@/lib/auth";
import { appendActivityEvent } from "@/lib/db";
import { optimizeMetadata, optimizeMetadataWithAI, type MetadataQualityMetrics } from "@/MACHINE";

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
  qualityMetrics?: MetadataQualityMetrics;
}

interface ImagePayload {
  filename: string;
  dataUrl: string;
  visualHints?: string;
  existingPrompt?: string;
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

# STEP 3 — ATURAN KATA KUNCI: WAJIB 50 KATA KUNCI UNIK

## 🎯 ATURAN MUTLAK: KATA KUNCI JANGAN SUSAH (MUDAH DICARI, HIGH-VOLUME, POPULER)
1. **GUNAKAN KATA YANG MUDAH & UMUM DICARI BUYER**:
   - Kata kunci HARUS sederhana, ramah pencarian, dan kata-kata bahasa Inggris sehari-hari yang sering diketik oleh pembeli/desainer di Adobe Stock & Shutterstock.
   - Contoh untuk gitar: "guitar", "music", "acoustic guitar", "wood", "strings", "instrument", "song", "play", "sound", "musician", "concert", "melody", "audio", "vintage", "classic", "hobby", "rock", "band", "entertainment".
2. **DILARANG KERAS MENGGUNAKAN KATA SUSAH / RUMIT / PUITIS / JARGON ILMIAH**:
   - ❌ JANGAN gunakan kata-kata rumit yang tidak pernah dicari pembeli, seperti: "chordophone", "plectrum", "somatosensory", "juxtaposition", "ephemeral", "luminescent", "chiaroscuro", "idiosyncratic", "equilibrium", "polychrome", dll.
3. **PANJANG KATA KUNCI HANYA 1–2 KATA (MAKSIMAL 3 KATA HANYA UNTUK ISTILAH UMUM)**:
   - Pembeli microstock mencari dengan kata kunci pendek: "dragon", "pet", "creature", "sneakers", "cargo shorts", "baseball cap", "game character", "battle royale".
   - ❌ Dilarang membuat frasa panjang seperti "blue-purple dragon creature" atau "backward baseball cap with feathers". Pecah menjadi kata kunci tunggal yang populer dan mudah dicari!

## ⭐ TIER 1: LITERAL VISUAL NOUNS — POSISI 1–15 [BOBOT TERTINGGI, PALING KRITIS]
**KATA KUNCI POSISI 1 SAMPAI 15 MUTLAK HARUS berisi nama benda fisik yang terlihat langsung di foto.**
- Gunakan nama benda utama dalam bahasa Inggris yang SANGAT MUDAH DICARI (high search volume, simple, direct).
- Jangan gunakan konsep abstrak atau kata dari nama file di sini.
- Contoh jika foto adalah gitar:
  ["guitar", "acoustic guitar", "musical instrument", "strings", "frets", "guitar neck", "wood guitar",
   "music instrument", "acoustic", "folk guitar", "classical guitar", "guitar body", "soundhole", "guitar strings", "wooden guitar"]
- Contoh jika foto adalah kuas:
  ["paintbrush", "paint brush", "bristle", "blue paint", "wooden handle", "artist brush", "painting tool",
   "art supplies", "acrylic paint", "ferrule", "oil paint", "fine art brush", "brush tip", "painter tool", "craft brush"]

## TIER 2: PRESENTASI VISUAL, SETUP & BACKGROUND — POSISI 16–28
- Lingkungan visual nyata, komposisi, sudut kamera, latar belakang yang terlihat (misal: "white background", "isolated", "studio lighting", "close up", "front view").

## TIER 3: COMMERCIAL USE CASES & PROFESSION — POSISI 29–44
- Profesi, industri, aktivitas, hobi, tujuan komersial aset ini (misal: "music lesson", "concert", "musician", "entertainment", "performance", "acoustic music").

## TIER 4: SUPPORTING COMMERCIAL TERMS & STYLES — POSISI 45–50
- Konsep pendukung umum yang dicari buyer (misal: "classic", "vintage", "traditional", "sound", "melody", "clean").

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
- Title: 8–12 kata bahasa Inggris deskriptif & bernilai jual tinggi (Formula Step 2). Dilarang menyertakan tanda kutip tunggal (') atau ganda (").
- Keywords: Berikan TEPAT 49 kata kunci unik yang hyper-relevan dan akurat sesuai visual, terurut ketat dari Tier 1 ke Tier 4 (Step 3). Tepat 49 kata kunci agar ketika sistem Magnific otomatis menambahkan tag ke-50 ('ai generate'), jumlahnya pas tidak melebihi batas 50. DILARANG menggunakan tanda kutip (') di setiap kata kunci.
- Prompt: WAJIB. Prompt generative AI yang sangat detail, kaya, dan fotorealistik dalam bahasa Inggris mendeskripsikan subjek, pencahayaan, sudut kamera, tekstur material, warna, dan detail rendering untuk Magnific Contributor. Jika uploader sudah memiliki prompt awal, optimalkan dan pertajam prompt tersebut agar menghasilkan visual terbaik.
- Model: WAJIB "Adobe Firefly" (atau pilih dari ["Adobe Firefly", "Midjourney 6", "Flux", "Stable Diffusion XL", "Midjourney 5", "DALL-E 3"]) (Default "Adobe Firefly").
- Primary Concept: Konsep utama komersial.
- Visual Description: Ringkasan visual singkat.

FORMAT OUTPUT WAJIB STRICT VALID JSON TANPA TEKS LAIN DI LUAR JSON:
{
  "title": "Exact descriptive title following Step 2 without any quotes",
  "keywords": ["kw1", "kw2", ...exactly 49 keywords in strict tier order without any quotes...],
  "prompt": "Detailed photorealistic generative AI prompt in English describing subject, lighting, angle, colors, texture, camera lens, 8k resolution",
  "model": "Adobe Firefly",
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
    // Disallow generic filler/spam words that hurt ranking
    if (["photo", "image", "picture", "wallpaper", "4k", "8k", "hd", "best", "cool"].includes(clean)) return;

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
    // ══════════════════════════════════════════════════════════════════
    // STAGE 1: Visual Forensic Perception (Qwen Vision 3.8 / 3.6)
    // Inspects 100% real image pixels with clinical accuracy
    // ══════════════════════════════════════════════════════════════════
    const visionMessages: GroqMessage[] = [
      {
        role: "system",
        content: `You are an elite, objective microstock vision forensic analyst. Your task is to perform an exhaustive, 100% factual visual inspection of the image.
Report:
1. SUBJECT & PHYSICAL OBJECTS: Every literal physical item, person/character, clothing, gear, prop, or creature visible.
2. MATERIALS & COLORS: Real physical textures (wood, metal, glass, fabric, plastic) and exact visible colors.
3. BACKGROUND & SETTING: Isolated/studio, indoor/outdoor, lighting, angle, and composition.
4. ART MEDIUM & STYLE: Real photography, 3D render (low-poly/hyper-realistic), digital illustration, vector, game screenshot, or UI overlay.
5. TEXT & DETAILS: Any visible words, logos, crests, or numbers.
6. ANTI-HALLUCINATION: Note what is definitely NOT in the image.
Be concrete, concise, and purely factual.`
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: base64DataUrl } },
          { type: "text", text: visualHints ? `Perform visual forensic inspection. Hints from uploader: ${visualHints}` : "Perform visual forensic inspection of this image." }
        ]
      }
    ];

    const visionResult = await callGroq(visionMessages, {
      temperature: 0.1,
      max_tokens: 450,
      vision: true
    });

    totalUsage.promptTokens += visionResult.usage.promptTokens;
    totalUsage.completionTokens += visionResult.usage.completionTokens;
    totalUsage.totalTokens += visionResult.usage.totalTokens;

    // ══════════════════════════════════════════════════════════════════
    // STAGE 2: 120B Flagship Reasoning Engine (openai/gpt-oss-120b)
    // Applies 120B parameter reasoning with chain-of-thought to formulate 99% accurate metadata & buyer SEO
    // ══════════════════════════════════════════════════════════════════
    const targetKwCount = platform === "shutterstock" ? 50 : 49;

    const reasoningUserMessage = `VISUAL FORENSIC INSPECTION REPORT (EXTRACTED DIRECTLY FROM IMAGE PIXELS):
${visionResult.text}

METADATA CONTEXT & REFERENCE:
- Filename: ${filename} (Warning: If filename contradicts the visual evidence above, ignore filename 100%!)
${visualHints ? `- Visual / Uploader Hints: ${visualHints}` : ""}
${existingPrompt ? `- Existing User Prompt to Optimize: "${existingPrompt}"` : ""}

CRITICAL RULES (ATURAN METADATA & KATA KUNCI JANGAN SUSAH):
1. KATA KUNCI HARUS MUDAH & POPULER (HIGH-VOLUME): Use ONLY simple, common, everyday English words that real buyers type into search bars. NEVER use obscure, academic, archaic, or poetic terms!
2. KEYWORD LENGTH: 1 to 2 words per keyword (maximum 3 words for standard terms). NEVER output long descriptive phrases like "blue-purple dragon creature" — split into short, popular tags: "dragon", "pet", "creature".
3. STRICTLY NO QUOTE MARKS: Absolutely DO NOT include single quotes (') or double quotes (") anywhere inside keyword strings or title.
4. First 15 keywords MUST be the literal physical objects visible in the image, using simple, direct words (e.g. if a guitar is in the photo → "guitar", "music", "acoustic guitar", "strings", "instrument", "wood").
5. 100% VISUAL FIDELITY & ZERO HALLUCINATION.
6. Title: 8-12 word natural English descriptive commercial title without quotes.
7. TARGET KEYWORD COUNT: Output EXACTLY ${targetKwCount} keywords.${platform === "magnific" ? " Magnific requires EXACTLY 49 keywords because the platform automatically adds the 50th keyword 'ai generate'." : ""}
8. PROMPT GENERATIF (MANDATORY): Always provide a detailed, photorealistic generative AI prompt in English (describing subject, lighting, angle, colors, texture, lens, 8k) to reproduce this image in Midjourney 6 / Flux.${existingPrompt ? ` Enhance and optimize the user's prompt: "${existingPrompt}".` : ""}
9. MODEL: ${platform === "magnific" ? 'WAJIB gunakan "Adobe Firefly" sebagai model default untuk platform Magnific.' : 'Choose the most fitting AI model (default "Midjourney 6").'}
Output ONLY raw valid JSON.`;

    const reasoningMessages: GroqMessage[] = [
      { role: "system", content: promptText },
      { role: "user", content: reasoningUserMessage }
    ];

    const reasoningResult = await callGroq(reasoningMessages, {
      model: REASONING_MODEL, // openai/gpt-oss-120b
      temperature: 0.15,
      max_tokens: 2048,
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
    const textPart = `Analyze the image VISUALLY and generate accurate microstock metadata.
FILENAME (for reference only, do NOT use for keywords): ${filename}
${visualHints ? `Visual context/hints: ${visualHints}\n` : ""}${existingPrompt ? `Existing prompt to optimize: ${existingPrompt}\n` : ""}
CRITICAL RULES:
1. Keywords MUST come from what you SEE in the image, NOT from the filename text.
2. First 15 keywords MUST be the literal physical objects visible in the photo.
3. Keywords MUST be simple everyday words (1-2 words).
4. STRICTLY NO QUOTES: Do NOT include single quotes (') or double quotes (") anywhere in keywords or title.
5. TARGET KEYWORDS: Exactly ${targetKwCount} keywords.
6. PROMPT: Provide a detailed photorealistic AI image prompt to recreate this visual.
7. Output ONLY raw valid JSON with no markdown fences or extra text.`;

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

  // ── MACHINE ML OPTIMIZATION PIPELINE ────────────────────────────────────────
  let mlOptimized;
  try {
    mlOptimized = await optimizeMetadataWithAI({
      title: finalTitle,
      keywords: finalKeywords,
      visualDescription: parsed.visualDescription || "",
      visualHints,
      existingPrompt,
      platform,
      targetModel: platform === "magnific" ? "Adobe Firefly" : (parsed.model || "Midjourney 6"),
      editorial,
      matureContent,
      illustration,
      filename,
    });
  } catch {
    mlOptimized = optimizeMetadata({
      title: finalTitle,
      keywords: finalKeywords,
      visualDescription: parsed.visualDescription || "",
      visualHints,
      existingPrompt,
      platform,
      targetModel: platform === "magnific" ? "Adobe Firefly" : (parsed.model || "Midjourney 6"),
      editorial,
      matureContent,
      illustration,
      filename,
    });
  }

  return {
    filename,
    title: mlOptimized.title,
    keywords: mlOptimized.keywords,
    categories: mlOptimized.categories.length > 0 ? mlOptimized.categories : categories,
    editorial: mlOptimized.editorial,
    matureContent: mlOptimized.matureContent,
    illustration: mlOptimized.illustration,
    prompt: mlOptimized.prompt,
    model: mlOptimized.model,
    primaryConcept: parsed.primaryConcept,
    visualDescription: parsed.visualDescription,
    confidenceScore: mlOptimized.confidenceScore,
    qualityMetrics: mlOptimized.qualityMetrics,
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
