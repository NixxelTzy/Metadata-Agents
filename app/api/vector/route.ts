import { NextRequest, NextResponse } from "next/server";
import { callGroq } from "@/lib/groq";
import { inspect, getClientIp, recordIpError } from "@/lib/security/core";

export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Vector Creator API — powered by Groq (same key as metadata + AI chat)
// Actions:
//   generate  → Full prompt generation + metadata for vector art
//   magic     → Generate creative vector prompt ideas
//   enhance   → Enhance / rewrite a user prompt for vector quality
// ─────────────────────────────────────────────────────────────────────────────

const VECTOR_SYSTEM_PROMPT = `You are an elite vector art director and Adobe Stock vector specialist.
You generate highly commercial, technically precise, and market-optimized prompts for vector illustration creation.

Your output must consider:
- Vector art style (flat vector, outline/line art, gradient mesh, icon-style, infographic, etc.)
- Commercial viability on Adobe Stock marketplace
- SEO-optimized keywords for vector discovery
- Lighting, color palette, and composition for 2D vector aesthetics
- Faceless/anonymous character design when requested
- Consistency in style, stroke weight, and color palette across a series

All vector prompts MUST be in English and optimized for AI image generation tools.`;

export async function POST(request: NextRequest) {
  const headersObj: Record<string, string> = {};
  request.headers.forEach((v, k) => { headersObj[k] = v; });
  const ip = getClientIp(headersObj);

  try {
    const body = await request.json();
    const { action, payload } = body as {
      action: "generate" | "magic" | "enhance" | "generate_svg";
      payload: {
        prompt?: string;
        theme?: string;
        style?: string;
        ratio?: string;
        faceless?: boolean;
        consistency?: boolean;
        mode?: "prompt" | "noprompt";
        colorPalette?: string;
        complexity?: "simple" | "medium" | "complex";
        targetUse?: string;
        count?: number;
      };
    };

    // ── Security inspection ──
    const sec = await inspect({
      ip,
      endpoint: "/api/vector",
      method: "POST",
      userAgent: headersObj["user-agent"] ?? "",
      headers: headersObj,
      body: { action, prompt: payload?.prompt, theme: payload?.theme },
    });
    if (sec.blocked) {
      recordIpError(ip);
      return NextResponse.json({ error: "Akses ditolak", reason: sec.reason, threatScore: sec.threatScore }, { status: sec.signals.some(s => s.type === "rate_limit") ? 429 : 403 });
    }

    if (!action) {
      return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: MAGIC IDEAS — Generate creative vector concept ideas
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "magic") {
      const { theme = "business", style = "flat", count = 6, faceless = false } = payload || {};

      const systemMsg = [
        VECTOR_SYSTEM_PROMPT,
        "Generate creative and highly marketable vector art concepts.",
        "Return ONLY a valid JSON object:",
        `{ "ideas": [ { "id": "string", "title": "string", "description": "string", "prompt": "string", "tags": ["string", ...], "estimatedSales": "string", "difficulty": "Easy" | "Medium" | "Complex" } ] }`,
        "Each prompt should be 20-40 words, detailed, and ready to use in an AI image generator.",
      ].join("\n");

      const userMsg = [
        `Theme: ${theme}`,
        `Vector Style: ${style === "flat" ? "Flat Vector" : style === "outline" ? "Outline / Line Art" : "Flat Vector + Outline Hybrid"}`,
        `Faceless Characters: ${faceless ? "YES — no faces, use abstract or back-view silhouettes" : "NO — normal characters allowed"}`,
        `Count: ${count} ideas`,
        "",
        "Generate diverse, highly commercial vector art concepts for Adobe Stock.",
      ].join("\n");

      const res = await callGroq([
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ], { temperature: 0.75, max_tokens: 3000 });

      let ideas: any[] = [];
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { ideas?: unknown[] };
        ideas = parsed?.ideas ?? [];
      }

      return NextResponse.json({ success: true, ideas, usage: res.usage });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: ENHANCE — AI rewrites / improves a user-written prompt
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "enhance") {
      const { prompt = "", style = "flat", faceless = false, ratio = "1:1", colorPalette = "", targetUse = "" } = payload || {};

      if (!prompt.trim()) {
        return NextResponse.json({ error: "Prompt tidak boleh kosong untuk enhance" }, { status: 400 });
      }

      const systemMsg = [
        VECTOR_SYSTEM_PROMPT,
        "Enhance and rewrite the user's vector art prompt to be more detailed, precise, and commercially valuable.",
        "Return ONLY a valid JSON object:",
        `{ "enhanced": "string (enhanced prompt, 25-50 words)", "title": "string (commercial title)", "keywords": ["string",...], "styleGuide": { "palette": "string", "strokeWeight": "string", "composition": "string" }, "tips": ["string",...] }`,
      ].join("\n");

      const styleLabel = style === "flat" ? "flat vector" : style === "outline" ? "outline line art" : "flat vector + outline hybrid";
      const userMsg = [
        `Original Prompt: ${prompt}`,
        `Style: ${styleLabel}`,
        `Aspect Ratio: ${ratio}`,
        `Faceless: ${faceless ? "yes" : "no"}`,
        colorPalette ? `Color Palette: ${colorPalette}` : "",
        targetUse ? `Target Use: ${targetUse}` : "",
        "",
        "Enhance this prompt for maximum commercial vector art quality.",
      ].filter(Boolean).join("\n");

      const res = await callGroq([
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ], { temperature: 0.4, max_tokens: 2000 });

      let enhanced: any = null;
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        enhanced = JSON.parse(match[0]);
      }

      return NextResponse.json({ success: true, enhanced, usage: res.usage });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: GENERATE — Full vector prompt generation with all parameters
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "generate") {
      const {
        prompt = "",
        theme = "business workspace",
        style = "flat",
        ratio = "1:1",
        faceless = false,
        consistency = false,
        mode = "noprompt",
        colorPalette = "professional blue, white, gray",
        complexity = "medium",
        targetUse = "commercial stock illustration",
        count = 4,
      } = payload || {};

      const styleLabel = style === "flat" ? "flat vector illustration"
        : style === "outline" ? "outline line art vector"
        : "flat vector with outline hybrid illustration";

      const ratioMap: Record<string, string> = {
        "1:1": "square (1:1), 1024x1024px",
        "16:9": "landscape (16:9), 1920x1080px",
        "9:16": "portrait (9:16), 1080x1920px",
        "4:3": "standard (4:3), 1600x1200px",
        "3:4": "portrait (3:4), 1200x1600px",
        "21:9": "ultrawide (21:9), 2560x1080px",
      };
      const ratioDesc = ratioMap[ratio] || ratio;

      const consistencyNote = consistency
        ? "IMPORTANT: Maintain strict visual consistency — same stroke weight, same color palette, same style across all generated prompts."
        : "Each prompt can have variation in composition and layout while keeping the same style.";

      const facelessNote = faceless
        ? "CRITICAL: All human characters must be FACELESS — use silhouettes, back views, or abstract geometric representations. No faces visible."
        : "Characters can have faces if included.";

      const systemMsg = [
        VECTOR_SYSTEM_PROMPT,
        "Generate a complete vector art creation plan with optimized prompts, metadata, and technical specs.",
        "Return ONLY a valid JSON object:",
        `{
          "plan": {
            "conceptTitle": "string",
            "commercialHook": "string (Indonesian, explains commercial value)",
            "styleGuide": {
              "palette": "string",
              "strokeWeight": "string",
              "typography": "string",
              "composition": "string"
            }
          },
          "prompts": [
            {
              "id": "string",
              "label": "string (e.g. 'Hero Shot', 'Detail Close-up', etc.)",
              "prompt": "string (full generation prompt, 30-60 words)",
              "negativePrompt": "string (what to avoid)",
              "metadata": {
                "title": "string (Adobe Stock title)",
                "keywords": ["string",...]
              },
              "technicalSpec": {
                "ratio": "string",
                "complexity": "string",
                "colorCount": number
              }
            }
          ],
          "setTips": ["string",...],
          "complianceNotes": ["string",...]
        }`,
      ].join("\n");

      const userMsg = [
        mode === "prompt"
          ? `User Prompt: ${prompt}`
          : `Theme (Autopilot): ${theme}`,
        `Vector Style: ${styleLabel}`,
        `Aspect Ratio: ${ratioDesc}`,
        `Complexity Level: ${complexity}`,
        `Color Palette: ${colorPalette}`,
        `Target Use: ${targetUse}`,
        `Number of Prompts: ${count}`,
        "",
        facelessNote,
        "",
        consistencyNote,
        "",
        "Generate a complete, professional vector art creation plan now.",
      ].join("\n");

      const res = await callGroq([
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ], { temperature: 0.45, max_tokens: 4000 });

      let result: any = null;
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      }

      return NextResponse.json({ success: true, result, usage: res.usage });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: GENERATE_SVG — Generate before (sketch) and after (final vector)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "generate_svg") {
      const {
        prompt = "",
        theme = "Flat Vector + Outline",
        style = "flat",
        ratio = "1:1",
        faceless = false,
        colorPalette = "Professional Blue & White",
      } = payload || {};

      const ratioMap: Record<string, { w: number; h: number }> = {
        "1:1": { w: 800, h: 800 },
        "16:9": { w: 1200, h: 675 },
        "9:16": { w: 675, h: 1200 },
        "4:3": { w: 800, h: 600 },
        "3:4": { w: 600, h: 800 },
        "21:9": { w: 1400, h: 600 },
      };
      const dimensions = ratioMap[ratio] || { w: 800, h: 800 };

      const systemMsg = [
        "You are an elite vector graphic designer and professional SVG illustrator.",
        "Your task is to generate two beautiful, clean, responsive, and valid SVG codes representing the 'Before' and 'After' states of a commercial vector asset.",
        "",
        "RULES FOR THE 'BEFORE' SVG:",
        "- Resembles a wireframe sketch, draft blueprint, or thin line outline of the concept.",
        "- Color palette should be monochromatic: light gray background, dark gray or black thin strokes (stroke-width: 1 or 2).",
        "- Use NO fills, or only semi-transparent light fills to outline shapes.",
        "- MUST contain the exact same geometric layout and subject composition as the 'After' SVG.",
        "",
        "RULES FOR THE 'AFTER' SVG:",
        "- The final premium commercial masterpiece vector illustration.",
        "- Rich flat vector shapes, gradients, shading, highlights, and crisp outlines.",
        "- Feature beautiful modern linearGradients or radialGradients defined inside <defs>.",
        "- Style: Match the requested style.",
        faceless ? "- Character constraints: Any human must be completely faceless (silhouette, abstract, back view)." : "",
        "",
        "GENERAL TECHNICAL RULES:",
        `- Use viewBox="0 0 ${dimensions.w} ${dimensions.h}" on both SVGs.`,
        "- Ensure ALL tags are correctly opened and closed. Make the SVGs visually appealing, using multiple layers of objects, shadows, highlights, and custom paths.",
        "- Do not use external CSS or fonts. All styles must be inline attributes (fill, stroke, stroke-width, filter, opacity, gradient).",
        "",
        "You must return ONLY a valid JSON object matching this schema. No markdown formatting outside of JSON, no explanations:",
        `{
          "title": "Short descriptive title of the design",
          "beforeSvg": "<svg viewBox=\\\"0 0 ${dimensions.w} ${dimensions.h}\\\" xmlns=\\\"http://www.w3.org/2000/svg\\\">... (complete before code) ...</svg>",
          "afterSvg": "<svg viewBox=\\\"0 0 ${dimensions.w} ${dimensions.h}\\\" xmlns=\\\"http://www.w3.org/2000/svg\\\">... (complete after code) ...</svg>"
        }`
      ].filter(Boolean).join("\n");

      const userMsg = [
        `Concept / Prompt: ${prompt || theme}`,
        `Vector Style: ${style}`,
        `Color Palette: ${colorPalette}`,
        `Faceless Characters: ${faceless ? "Yes" : "No"}`,
        `Dimensions: ${dimensions.w}x${dimensions.h} pixels`,
        "",
        "Write the complete, extremely beautiful Before and After SVG codes inside the JSON object."
      ].join("\n");

      const res = await callGroq([
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ], { temperature: 0.5, max_tokens: 4096 });

      let result: any = null;
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error("AI did not return a valid JSON response");
      }

      return NextResponse.json({ success: true, result, usage: res.usage });
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });

  } catch (error) {
    recordIpError(ip);
    const msg = error instanceof Error ? error.message : "Terjadi kesalahan internal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
