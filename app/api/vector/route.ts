import { NextRequest, NextResponse } from "next/server";
import { callGroq } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Vector Ideas API — Magic Idea Generator
// ─────────────────────────────────────────────────────────────────────────────

// Semua angle kamera yang tersedia — setiap idea WAJIB pakai angle berbeda
const CAMERA_ANGLES = [
  "extreme bird-eye overhead top-down flat-lay view",
  "dramatic low-angle worm-eye upward perspective",
  "classic straight-on eye-level front view",
  "dynamic 45-degree three-quarter isometric view",
  "extreme close-up macro detail shot",
  "wide establishing panoramic distant view",
  "over-the-shoulder point-of-view perspective",
  "tilted Dutch angle dynamic composition",
  "deep forced-perspective tunnel view",
  "split-screen dual-panel side-by-side layout",
  "circular radiating central-focus composition",
  "diagonal cross-section cutaway technical view",
];

// Prefix subjek per slot agar tidak ada duplikasi karakter/elemen
const SUBJECT_PREFIXES = [
  "A solitary individual",
  "A dynamic group of people",
  "An empty architectural space",
  "A floating object or item",
  "Abstract geometric shapes",
  "A collection of icons or symbols",
  "A landscape or environment",
  "A machine or device",
  "A hand holding or interacting",
  "An overhead arrangement of objects",
  "A cross-section cutaway diagram",
  "A minimalist typographic layout",
];

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json();
    const { action, payload } = body as {
      action: "magic";
      payload: {
        artType?: string;
        concept?: string;
        customTheme?: string;
        faceless?: boolean;
        count?: number;
      };
    };

    // ── Security ──────────────────────────────────────────────────────────────
    const sec = await inspect({
      ip,
      endpoint: "/api/vector",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body: { action },
    });
    if (sec.blocked) {
      void recordIpError(ip);
      return NextResponse.json(
        { error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore },
        { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 }
      );
    }

    if (!action || action !== "magic") {
      return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: MAGIC IDEAS
    // ─────────────────────────────────────────────────────────────────────────
    const {
      artType   = "Vector",
      concept   = "Business",
      customTheme = "",
      faceless  = false,
      count     = 6,
    } = payload || {};

    const safeCount = Math.min(Math.max(Number(count) || 6, 3), 12);

    // Shuffle & pick unique angles for each idea slot
    const shuffledAngles  = [...CAMERA_ANGLES].sort(() => Math.random() - 0.5).slice(0, safeCount);
    const shuffledSubjects = [...SUBJECT_PREFIXES].sort(() => Math.random() - 0.5).slice(0, safeCount);

    // Build per-idea angle & subject assignment string
    const angleAssignments = shuffledAngles
      .map((angle, i) => `  Idea ${i + 1}: angle="${angle}" | subject_prefix="${shuffledSubjects[i]}"`)
      .join("\n");

    const systemMsg = [
      // ── Role ──
      "You are an elite commercial art director specializing in stock content strategy, visual diversity, and AI image prompt engineering.",
      "",
      // ── Core mandate ──
      "CORE MANDATE: Generate a JSON array of unique, commercially valuable art ideas for stock platforms.",
      "Each idea MUST be 100% visually distinct — zero similarity in subject, composition, angle, color mood, or narrative.",
      "",
      // ── Anti-similarity rules ──
      "=== STRICT ANTI-SIMILARITY SYSTEM ===",
      "1. ANGLE DIVERSITY: Each idea is pre-assigned a unique camera angle listed below. You MUST use the exact assigned angle — never repeat or deviate.",
      "2. SUBJECT DIVERSITY: Each idea is pre-assigned a subject prefix. Start the prompt with that subject type.",
      "3. COLOR MOOD DIVERSITY: Every idea must use a completely different color temperature and palette (e.g., warm sunrise tones vs cool midnight blues vs vibrant neon vs muted earth tones vs monochrome accent — never repeat).",
      "4. NARRATIVE DIVERSITY: The story, scene, and emotional message of each idea must be totally different from the others.",
      "5. COMPOSITION DIVERSITY: Different layouts — some asymmetric, some grid, some radial, some diagonal — never two with the same layout.",
      "6. ZERO CONCEPT OVERLAP: If Idea 1 is about 'working', Idea 2 CANNOT be about 'working' even in a different setting.",
      "",
      // ── Quality rules ──
      "=== COMMERCIAL QUALITY REQUIREMENTS ===",
      "- ANTI-SIMILAR CONTENT: The prompt must be so unique it cannot be mistaken for another existing stock image.",
      "- ANTI-QUALITY ISSUES: Include explicit quality keywords (crisp vector lines, no blur, no noise, clean geometric shapes, smooth gradients).",
      "- ANTI-INTELLECTUAL PROPERTY: Never reference brand names, logos, trademarks, celebrities, fictional characters, or copyrighted designs.",
      "- COMMERCIAL VIABILITY: Every idea must have clear commercial use case (marketing, app UI, editorial, packaging, social media).",
      "- STOCK COMPLIANCE: Safe for all audiences, no violence, no political content, no discriminatory imagery.",
      "",
      // ── Concept constraint ──
      `=== CONCEPT CONSTRAINT ===`,
      `All ideas must belong to the concept category: "${concept}".`,
      `All ideas must use the art style: "${artType}".`,
      customTheme ? `User's custom theme (incorporate into ideas): "${customTheme}".` : "",
      faceless ? "CHARACTER RULE: All human figures MUST be completely faceless (silhouettes, back-views, abstract geometric shapes — NO visible faces)." : "",
      "",
      // ── Pre-assigned angles ──
      "=== PRE-ASSIGNED ANGLES & SUBJECT PREFIXES (MANDATORY) ===",
      angleAssignments,
      "",
      // ── JSON format ──
      "=== JSON OUTPUT FORMAT (STRICT) ===",
      "- Return ONLY a valid JSON object. No markdown, no code fences, no explanations outside the JSON.",
      "- Every string value must be on a single line. NO raw newlines or tab characters inside any string value.",
      "- 'prompt' must be 60-90 words, single-line, rich with visual detail, angle, lighting, color, and style keywords.",
      "- 'description' must be 80-130 chars, single-line, describing commercial value and visual concept.",
      `- Generate exactly ${safeCount} ideas.`,
      `{ "ideas": [ { "id": "idea_1", "title": "string (max 75 chars)", "description": "string (80-130 chars, single line)", "prompt": "string (60-90 words, single line, includes assigned angle and subject prefix)", "tags": ["string", "string", "string", "string", "string"], "estimatedSales": "X,XXX+ downloads", "difficulty": "Easy" } ] }`,
    ].filter(Boolean).join("\n");

    const userMsg = [
      `Generate ${safeCount} completely unique art ideas.`,
      `Art Style: ${artType}`,
      `Concept Category: ${concept}`,
      customTheme ? `Custom Theme: ${customTheme}` : "",
      `Faceless Characters: ${faceless ? "YES — all characters must be faceless" : "NO — standard character features"}`,
      "",
      "CRITICAL REMINDER: Each idea must use its PRE-ASSIGNED camera angle and subject prefix. Make every idea look like it belongs to a totally different photo shoot. Maximum visual diversity. Zero similarity.",
    ].filter(Boolean).join("\n");

    const res = await callGroq([
      { role: "system", content: systemMsg },
      { role: "user",   content: userMsg },
    ], { temperature: 0.85, max_tokens: 2800 });

    let ideas: unknown[] = [];
    const match = res.text.match(/\{[\s\S]*\}/);
    if (match) {
      const cleaned = cleanJsonForParsing(match[0]);
      const parsed = JSON.parse(cleaned) as { ideas?: unknown[] };
      ideas = parsed?.ideas ?? [];
    }

    return NextResponse.json({ success: true, ideas, usage: res.usage });

  } catch (error) {
    void recordIpError(ip);
    const msg = error instanceof Error ? error.message : "Terjadi kesalahan internal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── JSON Sanitizer ─────────────────────────────────────────────────────────
function cleanJsonForParsing(str: string): string {
  let inString = false;
  let result   = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && str[i - 1] !== "\\") {
      inString = !inString;
      result += char;
    } else if (inString) {
      if      (char === "\n") result += "\\n";
      else if (char === "\r") { /* skip */ }
      else if (char === "\t") result += " ";
      else                    result += char;
    } else {
      result += char;
    }
  }
  return result;
}
