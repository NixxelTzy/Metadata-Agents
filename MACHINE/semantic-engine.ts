/**
 * MACHINE/semantic-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Semantic Intelligence Engine for Microstock Metadata.
 * Features:
 *  1. Microstock Agency Compliance & Blacklist Guard (Adobe Stock & Shutterstock rules)
 *  2. Trademark & Commercial Copyright Risk Firewall
 *  3. Morphological Stemming Engine (Porter Algorithm) for strict deduplication
 *  4. US/UK Spelling Harmonization (US standard for 5x search volume)
 *  5. Domain-Aware Concept Expansion Graph
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Banned microstock spam words, filler, and reject-triggering meta-descriptors
export const BANNED_METADATA_TERMS = new Set([
  "photo", "image", "picture", "wallpaper", "hd", "4k", "8k", "best", "cool",
  "stock", "vector", "illustration", "download", "free", "copyright", "watermark",
  "shutterstock", "adobe", "magnific", "midjourney", "getty", "graphic", "clipart",
  "pic", "shot", "camera", "dslr", "photograph", "snapshot", "rendering", "render",
  "nft", "crypto", "viral", "trending", "instagram", "tiktok", "high resolution",
  "top quality", "award winning", "masterpiece", "epic", "awesome", "nice"
]);

// Trademarked commercial brands strictly prohibited by microstock review algorithms
export const TRADEMARK_TERMS = new Set([
  // Tech & Electronics
  "apple", "iphone", "ipad", "macbook", "imac", "airpods", "ipod", "ios",
  "google", "android", "pixel", "chrome", "chromebook",
  "microsoft", "windows", "xbox", "surface",
  "sony", "playstation", "bravia", "walkman",
  "samsung", "galaxy", "intel", "amd", "nvidia", "geforce",
  "meta", "facebook", "instagram", "whatsapp", "oculus",
  "twitter", "tesla", "cybertruck", "dji", "mavic", "phantom",
  "gopro", "hero", "nintendo", "switch", "amazon", "kindle", "alexa",
  // Fashion & Luxury
  "nike", "adidas", "puma", "reebok", "under armour",
  "gucci", "prada", "chanel", "louis vuitton", "hermes",
  "rolex", "omega", "cartier", "tiffany", "ray-ban",
  "levis", "zara", "h&m", "armani", "versace", "balenciaga",
  // Automotive
  "bmw", "mercedes", "mercedes-benz", "audi", "porsche", "ferrari", "lamborghini",
  "toyota", "honda", "ford", "mustang", "chevrolet", "corvette", "volkswagen",
  // Food & Commercial
  "coca-cola", "coke", "pepsi", "starbucks", "mcdonalds", "kfc", "subway",
  "burger king", "red bull", "nespresso", "oreo", "heineken",
  // Entertainment & Toys
  "disney", "marvel", "lego", "barbie", "pokemon", "star wars"
]);

// US vs UK Spelling Normalizer (standardizes on US English for global microstock indexing)
const UK_TO_US_DICTIONARY: Record<string, string> = {
  colour: "color",
  colours: "colors",
  flavour: "flavor",
  flavours: "flavors",
  humour: "humor",
  theatre: "theater",
  theatres: "theaters",
  centre: "center",
  centres: "centers",
  metre: "meter",
  metres: "meters",
  fibre: "fiber",
  fibres: "fibers",
  analyse: "analyze",
  analysing: "analyzing",
  organise: "organize",
  organising: "organizing",
  recognise: "recognize",
  cosy: "cozy",
  grey: "gray",
  greys: "grays",
  aeroplane: "airplane",
  artefact: "artifact",
  jewellery: "jewelry",
  programme: "program",
};

// High-value concept expansion dictionary with buyer intent tags
const BUYER_CONCEPT_EXPANSION: Record<string, string[]> = {
  coffee: ["caffeine", "espresso", "morning routine", "hot beverage", "coffee shop", "roast bean", "aroma", "breakfast table", "barista", "latte art"],
  nature: ["natural landscape", "environment", "scenic outdoor", "eco friendly", "wilderness", "peaceful scenery", "earth day", "biodiversity", "tranquil nature", "flora"],
  business: ["corporate culture", "office teamwork", "professional career", "strategic planning", "financial growth", "executive leadership", "workplace success", "commercial concept", "modern boardroom"],
  food: ["gourmet cuisine", "culinary dish", "fresh ingredients", "healthy nutrition", "delicious meal", "restaurant dining", "organic food", "appetizing snack", "gastronomy", "chef creation"],
  flower: ["botanical garden", "floral bloom", "spring blossom", "petal texture", "fresh flora", "natural beauty", "wildflower", "blooming season", "fragrant floral"],
  water: ["pure liquid", "refreshing aqua", "clean hydration", "splash effect", "water droplet", "crystal clear", "fluid wave", "marine environment", "hydration wellness"],
  fitness: ["healthy lifestyle", "physical workout", "athletic training", "gym exercise", "wellness vitality", "cardio training", "active wellness", "sport motivation", "endurance"],
  technology: ["digital innovation", "artificial intelligence", "data network", "cyber connectivity", "future tech", "smart device", "cloud computing", "information technology", "high tech"],
  travel: ["tourism destination", "holiday vacation", "journey exploration", "travel adventure", "wanderlust", "scenic getaway", "cultural trip", "world travel", "voyage"],
  sunset: ["golden hour", "twilight horizon", "evening dusk", "sunset glow", "dramatic sky", "sunbeam", "warm sunlight", "peaceful dawn", "tranquil evening"],
  portrait: ["facial expression", "authentic person", "headshot portrait", "individual lifestyle", "human emotion", "candid portrait", "character study", "natural lighting"],
  architecture: ["urban structure", "building exterior", "modern facade", "architectural landmark", "contemporary design", "city skyline", "concrete geometry", "civil engineering"],
  interior: ["interior decor", "living space", "home architecture", "modern room", "furniture arrangement", "clean aesthetics", "indoor lifestyle", "domestic comfort"],
  abstract: ["abstract background", "geometric texture", "creative composition", "digital pattern", "visual concept", "artistic design", "dynamic motion", "minimalist backdrop"],
  health: ["medical healthcare", "wellness concept", "patient care", "clinical medicine", "healthy living", "pharmaceutical", "diagnostic therapy", "hospital clinic"],
};

/**
 * Robust Porter-style morphological stemming for accurate English deduplication.
 * Prevents "running", "runner", "runs", and "run" from eating 4 keyword slots.
 */
export function getStemKey(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.length <= 3) return w;

  // Step 1: Plurals and past tense
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "i";
  else if (w.endsWith("ss")) { /* keep */ }
  else if (w.endsWith("s") && w.length > 3) w = w.slice(0, -1);

  if (w.endsWith("eed") && w.length > 4) w = w.slice(0, -1);
  else if ((w.endsWith("ed") || w.endsWith("ing")) && w.length > 5) {
    if (w.endsWith("ing")) w = w.slice(0, -3);
    else w = w.slice(0, -2);

    // Double consonant cleanup: "runn" -> "run"
    if (w.length >= 3 && w[w.length - 1] === w[w.length - 2] && !["l", "s", "z"].includes(w[w.length - 1])) {
      w = w.slice(0, -1);
    }
  }

  // Step 2: Y to I
  if (w.endsWith("y") && w.length > 3 && !/[aeiou]y$/.test(w)) {
    w = w.slice(0, -1) + "i";
  }

  // Step 3: Common suffixes
  const suffixes: [string, string][] = [
    ["ational", "ate"],
    ["tional", "tion"],
    ["ization", "ize"],
    ["fulness", "ful"],
    ["ousness", "ous"],
    ["aliti", "al"],
    ["iviti", "ive"],
    ["biliti", "ble"],
    ["ative", ""],
    ["alize", "al"],
    ["iciti", "ic"],
    ["ical", "ic"],
    ["ment", ""],
    ["able", ""],
    ["ible", ""],
  ];

  for (const [suf, rep] of suffixes) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }

  return w;
}

/**
 * Deep cleaning & normalization for keywords:
 * 1. Strips quotes, backticks, asterisks, brackets, and leading/trailing punctuation.
 * 2. Converts UK spelling to US spelling.
 * 3. Enforces 1-3 words limit for maximum buyer search performance.
 */
export function normalizeKeyword(kw: string): string {
  if (!kw) return "";
  let cleaned = kw
    .replace(/['"`\\/()[\]{}*#<>~_]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Harmonize UK to US spelling
  const tokens = cleaned.split(" ").filter(t => t.length > 1);
  const normalizedTokens = tokens.map(t => UK_TO_US_DICTIONARY[t] || t);

  // Microstock sweet spot: 1 to 2 words per tag (3 words only if recognized compound like 'copy space background')
  if (normalizedTokens.length > 2) {
    cleaned = normalizedTokens.slice(0, 2).join(" ");
  } else {
    cleaned = normalizedTokens.join(" ");
  }

  return cleaned;
}

/**
 * Checks if a candidate keyword should be excluded due to spam, trademark, length, or stopword rules.
 */
export function isInvalidKeyword(kw: string): boolean {
  if (!kw || kw.length < 2 || kw.length > 35) return true;
  if (/^\d+$/.test(kw)) return true; // Pure digits

  const lower = kw.toLowerCase().trim();
  if (BANNED_METADATA_TERMS.has(lower)) return true;
  if (TRADEMARK_TERMS.has(lower)) return true;

  // Reject single stop words and meaningless prepositions
  const stopWords = new Set([
    "the", "and", "or", "an", "a", "of", "in", "to", "for", "with", "on", "at",
    "by", "from", "is", "are", "was", "were", "be", "been", "that", "this", "it"
  ]);
  if (stopWords.has(lower)) return true;

  return false;
}

/**
 * Deep Concept Expansion using buyer search graphs.
 * Generates commercially viable synonyms and adjacent context tags.
 */
export function expandConcepts(detectedTerms: string[], maxAdditions = 15): string[] {
  const expanded: string[] = [];
  const seenStems = new Set<string>();

  // Register existing stems
  for (const term of detectedTerms) {
    seenStems.add(getStemKey(term));
  }

  for (const term of detectedTerms) {
    const key = term.toLowerCase().trim();
    const matches = BUYER_CONCEPT_EXPANSION[key];

    if (matches) {
      for (const candidate of matches) {
        const stem = getStemKey(candidate);
        if (!seenStems.has(stem)) {
          seenStems.add(stem);
          expanded.push(candidate);
          if (expanded.length >= maxAdditions) break;
        }
      }
    }
    if (expanded.length >= maxAdditions) break;
  }

  return expanded;
}
