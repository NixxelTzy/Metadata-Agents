/**
 * MACHINE/feature-extractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computer Vision & Photographic Forensic Feature Extraction Engine.
 * Combines zero-latency heuristic visual signal analysis with Groq AI
 * Neural Vision & 120B Chain-of-Thought Reasoning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { VisualFeatureVector, ColorTemperature } from "./types";
import { callGroq, REASONING_MODEL, VISION_MODEL, GroqMessage } from "@/lib/groq";

// Photographic lighting pattern mapping
const LIGHTING_PATTERNS = [
  { pattern: /golden hour|sunset|sunrise|dawn|dusk/i, style: "warm directional golden hour sunlight" },
  { pattern: /studio|white background|isolated|lightbox/i, style: "even high-key professional studio lighting" },
  { pattern: /dramatic|chiaroscuro|low key|shadows|moody|dark/i, style: "dramatic low-key moody chiaroscuro lighting" },
  { pattern: /neon|glow|cyberpunk|fluorescent|night city/i, style: "vibrant saturated neon backlight" },
  { pattern: /soft|diffused|cloudy|overcast|window light/i, style: "soft diffused natural daylight" },
  { pattern: /direct sun|harsh|hard light|bright sun/i, style: "crisp direct sunlight with sharp cast shadows" },
  { pattern: /rim light|backlit|silhouette/i, style: "subtle rim lighting with luminous edge separation" },
];

// Compositional geometry patterns
const COMPOSITION_PATTERNS = [
  { pattern: /close-?up|macro|detail|texture/i, style: "macro close-up with shallow depth of field", depth: "macro" as const },
  { pattern: /flat lay|top-?down|overhead|bird'?s eye/i, style: "overhead 90-degree flat lay arrangement", depth: "shallow" as const },
  { pattern: /wide|landscape|panoramic|scenic|vista/i, style: "expansive wide-angle panoramic vista", depth: "panoramic" as const },
  { pattern: /portrait|profile|headshot|face/i, style: "centered professional subject portrait", depth: "shallow" as const },
  { pattern: /rule of thirds|offset|side/i, style: "rule-of-thirds composition with generous negative space", depth: "deep" as const },
  { pattern: /minimal|clean|empty space|copy space/i, style: "minimalist layout with ample commercial copy space", depth: "deep" as const },
  { pattern: /symmetry|centered|geometric/i, style: "centered geometric symmetrical balance", depth: "deep" as const },
];

// Color palette definitions and microstock commercial psychology
const COLOR_PSYCHOLOGY_MAP: Record<string, string> = {
  blue: "evokes trust, corporate stability, serenity, and professional clarity",
  green: "symbolizes organic growth, ecological sustainability, health, and vitality",
  red: "stimulates passion, high energy, urgency, and bold visual impact",
  gold: "signals premium luxury, prestige, prosperity, and golden warmth",
  yellow: "communicates optimism, cheerful daylight, intellect, and freshness",
  orange: "delivers friendly enthusiasm, creative warmth, and youthful drive",
  purple: "embodies luxury, creative elegance, sophistication, and mystery",
  white: "represents purity, modern minimalism, clinical hygiene, and clarity",
  black: "conveys timeless elegance, premium contrast, strength, and authority",
  brown: "transmits grounded authenticity, rustic comfort, and natural earthiness",
  teal: "blends modern technology with calming coastal aesthetics",
  pink: "expresses gentle care, modern lifestyle, delicacy, and romance",
};

/**
 * Fast Heuristic Feature Extractor (Deterministic, Zero-Latency Baseline)
 */
export function extractVisualFeatures(
  visualDescription: string,
  hints?: string,
  title?: string
): VisualFeatureVector {
  const combinedText = `${visualDescription} ${hints || ""} ${title || ""}`.toLowerCase();

  // 1. Color Temperature
  const warmMatches = (combinedText.match(/\b(sunset|sunrise|gold|golden|warm|orange|yellow|amber|fire|autumn|desert|sunny|cozy)\b/g) || []).length;
  const coolMatches = (combinedText.match(/\b(night|blue|cyan|winter|snow|ice|frost|neon|cold|underwater|aqua|sky|ocean|steel)\b/g) || []).length;

  let colorTemperature: ColorTemperature = "neutral";
  if (warmMatches > coolMatches) colorTemperature = "warm";
  else if (coolMatches > warmMatches) colorTemperature = "cool";

  // 2. Dominant Colors
  const COLOR_PALETTE = [
    "blue", "green", "white", "black", "gold", "red", "orange", "yellow",
    "purple", "brown", "teal", "pink", "gray", "silver", "bronze", "cyan", "amber"
  ];
  const detectedColors: string[] = [];
  for (const color of COLOR_PALETTE) {
    const regex = new RegExp(`\\b${color}\\b`, "i");
    if (regex.test(combinedText)) {
      detectedColors.push(color);
    }
  }
  if (detectedColors.length === 0) {
    detectedColors.push(colorTemperature === "warm" ? "gold" : colorTemperature === "cool" ? "blue" : "white");
  }

  // 3. Lighting Style
  let lightingStyle = "balanced ambient daylight";
  for (const item of LIGHTING_PATTERNS) {
    if (item.pattern.test(combinedText)) {
      lightingStyle = item.style;
      break;
    }
  }

  // 4. Composition & Depth
  let composition = "balanced commercial framing with depth";
  let focalDepth: VisualFeatureVector["focalDepth"] = "deep";
  for (const item of COMPOSITION_PATTERNS) {
    if (item.pattern.test(combinedText)) {
      composition = item.style;
      focalDepth = item.depth;
      break;
    }
  }

  // 5. Detected Subjects / Objects
  const detectedObjects: string[] = [];
  const subjectRegex = /\b(person|man|woman|child|dog|cat|bird|animal|car|vehicle|building|tree|plant|flower|coffee|food|meal|fruit|computer|phone|water|lake|river|ocean|sea|beach|mountain|forest|sunset|sunrise|sky|cloud|office|street|house|room|cup|leaf|droplet|hand|face|landscape|skyline|furniture|product|athlete|garden|desk|table)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = subjectRegex.exec(combinedText)) !== null) {
    const obj = match[1].toLowerCase();
    if (!detectedObjects.includes(obj)) {
      detectedObjects.push(obj);
    }
  }

  // 6. Emotional Mood Signals
  const MOOD_CANDIDATES = [
    "serene", "energetic", "dramatic", "joyful", "luxurious", "rustic",
    "modern", "mysterious", "peaceful", "fresh", "vibrant", "cozy",
    "confident", "tranquil", "inspirational", "authentic"
  ];
  const perceivedMood: string[] = [];
  for (const m of MOOD_CANDIDATES) {
    if (combinedText.includes(m)) perceivedMood.push(m);
  }
  if (perceivedMood.length === 0) {
    perceivedMood.push("commercial", "professional", "authentic");
  }

  // 7. Copy Space Suitability Assessment
  const hasCopySpaceClues = /\b(copy space|empty space|isolated|minimalist|clean background|negative space|blank)\b/i.test(combinedText);
  const copySpaceSuitability = {
    hasCopySpace: hasCopySpaceClues,
    location: hasCopySpaceClues ? ("right" as const) : ("none" as const),
    score: hasCopySpaceClues ? 0.92 : 0.45,
  };

  // 8. Complexity Score (0.1 to 1.0)
  const tokenCount = combinedText.split(/\s+/).length;
  const complexityScore = Math.min(
    1.0,
    Math.max(
      0.2,
      Number(
        (
          Math.min(detectedObjects.length * 0.12, 0.4) +
          Math.min(detectedColors.length * 0.08, 0.3) +
          Math.min(tokenCount * 0.006, 0.3)
        ).toFixed(2)
      )
    )
  );

  // 9. Color Psychology & Commercial Theme
  const primaryColor = detectedColors[0] || "blue";
  const colorPsychology = COLOR_PSYCHOLOGY_MAP[primaryColor] || "clean commercial contrast with balanced appeal";
  const commercialTheme = detectedObjects.length > 0
    ? `${detectedObjects.slice(0, 2).join(" and ")} commercial concept`
    : "versatile high-conversion stock asset";

  return {
    dominantColors: detectedColors.slice(0, 5),
    colorTemperature,
    lightingStyle,
    composition,
    detectedObjects,
    sceneContext: combinedText.slice(0, 250),
    perceivedMood,
    complexityScore,
    focalDepth,
    copySpaceSuitability,
    colorPsychology,
    commercialTheme,
    buyerIntentSignals: ["commercial asset", "stock licensing", "editorial viability"],
  };
}

/**
 * AI-Augmented Feature Extractor using Groq Neural Vision / Reasoning (120B Model).
 * Executes structured visual forensic decomposition.
 */
export async function extractVisualFeaturesWithAI(
  visualDescription: string,
  hints?: string,
  dataUrl?: string
): Promise<VisualFeatureVector> {
  const baseline = extractVisualFeatures(visualDescription, hints);

  try {
    const isVision = Boolean(dataUrl && dataUrl.startsWith("data:image"));
    const messages: GroqMessage[] = isVision
      ? [
          {
            role: "system",
            content: "You are an elite microstock computer vision and photographic forensic analyst. Extract visual signals in strict JSON format."
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl! } },
              {
                type: "text",
                text: `Analyze this image for high-commercial-value microstock attributes. Output strict JSON:
{
  "dominantColors": ["color1", "color2", "color3"],
  "colorTemperature": "warm" | "cool" | "neutral",
  "lightingStyle": "concise description of lighting direction and quality",
  "composition": "concise description of camera framing and composition",
  "focalDepth": "shallow" | "deep" | "macro" | "panoramic",
  "detectedObjects": ["object1", "object2", "object3"],
  "perceivedMood": ["mood1", "mood2"],
  "colorPsychology": "commercial psychological impact of the palette",
  "commercialTheme": "specific commercial advertising theme",
  "copySpace": { "hasCopySpace": boolean, "location": "left"|"right"|"top"|"bottom"|"center"|"none" }
}`
              }
            ]
          }
        ]
      : [
          {
            role: "system",
            content: "You are an elite microstock photo analyst. Extract deep visual signals in strict JSON format."
          },
          {
            role: "user",
            content: `Analyze this visual description: "${visualDescription}". Context hints: "${hints || ""}".
Output strict JSON with keys: dominantColors (string[]), colorTemperature ("warm"|"cool"|"neutral"), lightingStyle (string), composition (string), focalDepth ("shallow"|"deep"|"macro"|"panoramic"), detectedObjects (string[]), perceivedMood (string[]), colorPsychology (string), commercialTheme (string), copySpace (object).`
          }
        ];

    const res = await callGroq(messages, {
      model: isVision ? VISION_MODEL : REASONING_MODEL,
      temperature: 0.1,
      max_tokens: 500,
      jsonMode: true,
      vision: isVision,
    });

    const parsed = JSON.parse(res.text);

    return {
      dominantColors: Array.isArray(parsed.dominantColors) && parsed.dominantColors.length > 0
        ? parsed.dominantColors.slice(0, 5)
        : baseline.dominantColors,
      colorTemperature: ["warm", "cool", "neutral"].includes(parsed.colorTemperature)
        ? parsed.colorTemperature
        : baseline.colorTemperature,
      lightingStyle: parsed.lightingStyle || baseline.lightingStyle,
      composition: parsed.composition || baseline.composition,
      focalDepth: ["shallow", "deep", "macro", "panoramic"].includes(parsed.focalDepth)
        ? parsed.focalDepth
        : baseline.focalDepth,
      detectedObjects: Array.isArray(parsed.detectedObjects) && parsed.detectedObjects.length > 0
        ? parsed.detectedObjects.map(String)
        : baseline.detectedObjects,
      sceneContext: visualDescription.slice(0, 250),
      perceivedMood: Array.isArray(parsed.perceivedMood) && parsed.perceivedMood.length > 0
        ? parsed.perceivedMood.map(String)
        : baseline.perceivedMood,
      complexityScore: baseline.complexityScore,
      aiForensicNotes: `AI Visual Forensics by Groq (${res.modelUsed})`,
      colorPsychology: parsed.colorPsychology || baseline.colorPsychology,
      commercialTheme: parsed.commercialTheme || baseline.commercialTheme,
      copySpaceSuitability: parsed.copySpace ? {
        hasCopySpace: Boolean(parsed.copySpace.hasCopySpace),
        location: parsed.copySpace.location || "none",
        score: parsed.copySpace.hasCopySpace ? 0.95 : 0.40,
      } : baseline.copySpaceSuitability,
      buyerIntentSignals: ["high commercial appeal", "verified visual forensic alignment"],
    };
  } catch {
    // Zero-latency seamless fallback to baseline heuristic
    return baseline;
  }
}
