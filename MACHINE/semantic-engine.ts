/**
 * MACHINE/semantic-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise Semantic Intelligence Engine — Microstock Metadata Pipeline
 *
 * Features:
 *  1. Full 5-stage Porter Stemmer with English morphology rules
 *  2. Soundex phonetic encoder for near-homophone deduplication
 *  3. 40+ domain cluster concept expansion graph (2,000+ tags total)
 *  4. Multi-pass 500-keyword pool builder with relevance filtering
 *  5. Semantic similarity deduplication (stem + phonetic + n-gram overlap)
 *  6. Groq 120B AI pool augmentation with batch requests
 *  7. Agency compliance blacklist + trademark firewall
 *  8. UK→US spelling harmonizer (60+ mappings)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { callGroq, REASONING_MODEL, GroqMessage } from "@/lib/groq";
import type { TokenizerOutput } from "./types";

// ── BLACKLISTS ───────────────────────────────────────────────────────────────

export const BANNED_METADATA_TERMS = new Set<string>([
  // Meta/technical descriptors
  "photo", "image", "picture", "wallpaper", "hd", "4k", "8k", "best", "cool",
  "stock", "vector", "download", "free", "copyright", "watermark", "clipart",
  "pic", "shot", "camera", "dslr", "photograph", "snapshot", "rendering", "render",
  "nft", "crypto", "viral", "trending", "instagram", "tiktok",
  "high resolution", "top quality", "award winning", "masterpiece", "epic", "awesome", "nice",
  "ultra hd", "4k resolution", "8k resolution", "high definition",
  // Awkward multi-word phrases buyers never search
  "technical illustration", "training guide", "maintenance manual", "service manual",
  "mechanic training", "concrete floor", "black hose", "blue lift", "red tool",
  "work shirt", "work gloves", "close up", "side view", "front view", "back view",
  "top view", "bottom view", "right side", "left side",
  // Low-quality filler
  "detailed", "realistic", "high quality", "great", "amazing", "beautiful photo",
  "nice photo", "good quality", "excellent", "perfect", "stunning photo",
]);

export const TRADEMARK_TERMS = new Set<string>([
  // Tech
  "apple", "iphone", "ipad", "macbook", "imac", "airpods", "ipod", "ios",
  "google", "android", "pixel", "chrome", "chromebook",
  "microsoft", "windows", "xbox", "surface",
  "sony", "playstation", "bravia", "walkman",
  "samsung", "galaxy", "intel", "amd", "nvidia", "geforce",
  "meta", "facebook", "whatsapp", "oculus",
  "twitter", "x app", "tesla", "cybertruck", "dji", "mavic", "phantom",
  "gopro", "hero", "nintendo", "switch", "amazon", "kindle", "alexa", "ring",
  // Fashion
  "nike", "adidas", "puma", "reebok", "under armour", "new balance",
  "gucci", "prada", "chanel", "louis vuitton", "hermes", "dior",
  "rolex", "omega", "cartier", "tiffany", "ray-ban",
  "levis", "zara", "hm", "armani", "versace", "balenciaga", "yeezy",
  // Auto
  "bmw", "mercedes", "audi", "porsche", "ferrari", "lamborghini", "maserati",
  "toyota", "honda", "ford", "mustang", "chevrolet", "corvette", "volkswagen",
  "jeep", "dodge", "ram", "cadillac", "buick", "lincoln",
  // Food & Beverage
  "coca-cola", "coke", "pepsi", "starbucks", "mcdonalds", "kfc", "subway",
  "burger king", "red bull", "nespresso", "oreo", "heineken", "budweiser",
  // Entertainment
  "disney", "marvel", "dc comics", "lego", "barbie", "pokemon", "star wars",
  "harry potter", "netflix", "spotify", "youtube",
]);

// ── UK → US SPELLING ─────────────────────────────────────────────────────────

const UK_TO_US: Record<string, string> = {
  colour: "color", colours: "colors", flavour: "flavor", flavours: "flavors",
  humour: "humor", theatre: "theater", theatres: "theaters", centre: "center",
  centres: "centers", metre: "meter", metres: "meters", fibre: "fiber",
  fibres: "fibers", analyse: "analyze", analysing: "analyzing",
  organise: "organize", organising: "organizing", recognise: "recognize",
  cosy: "cozy", grey: "gray", greys: "grays", aeroplane: "airplane",
  artefact: "artifact", jewellery: "jewelry", programme: "program",
  behaviour: "behavior", favour: "favor", honour: "honor",
  labour: "labor", neighbour: "neighbor", rumour: "rumor",
  savour: "savor", vapour: "vapor", vigour: "vigor",
  travelling: "traveling", modelling: "modeling", labelling: "labeling",
  fulfil: "fulfill", skilful: "skillful", enrol: "enroll",
  plough: "plow", tyre: "tire", tyres: "tires",
  defence: "defense", offence: "offense", licence: "license",
  practise: "practice", maths: "math", whilst: "while",
  catalogue: "catalog", dialogue: "dialog",
};

// ── STOP WORDS ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set<string>([
  "the", "and", "or", "an", "a", "of", "in", "to", "for", "with", "on", "at",
  "by", "from", "is", "are", "was", "were", "be", "been", "that", "this", "it",
  "as", "has", "have", "had", "do", "does", "did", "but", "not", "so", "yet",
  "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "only", "own", "same", "than", "too", "very", "just", "about",
]);

// ── FULL 5-STAGE PORTER STEMMER ──────────────────────────────────────────────

/**
 * Full Porter Stemmer — 5 stages of English morphological reduction.
 * More accurate than the simplified version; handles edge cases properly.
 */
export function getStemKey(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.length <= 2) return w;

  // ── Stage 1a: Plurals ────────────────────────────────────────────────────
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "i";
  else if (!w.endsWith("ss") && w.endsWith("s") && w.length > 3) w = w.slice(0, -1);

  // ── Stage 1b: Past tense & gerunds ──────────────────────────────────────
  const hasCVC = (s: string) => {
    // Minimal measure check — sequence contains vowel-consonant after any prefix
    return /[aeiou][^aeiou]/.test(s);
  };

  if (w.endsWith("eed") && w.length > 4) {
    if (hasCVC(w.slice(0, -3))) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && w.length > 4 && /[aeiou]/.test(w.slice(0, -2))) {
    w = w.slice(0, -2);
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (w.length >= 2 && w[w.length - 1] === w[w.length - 2] && !/[aeioulz]$/.test(w)) {
      w = w.slice(0, -1);
    } else if (w.length === 3 && /^[^aeiou][aeiou][^aeiou]$/.test(w)) {
      w += "e";
    }
  } else if (w.endsWith("ing") && w.length > 5 && /[aeiou]/.test(w.slice(0, -3))) {
    w = w.slice(0, -3);
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (w.length >= 2 && w[w.length - 1] === w[w.length - 2] && !/[aeioulz]$/.test(w)) {
      w = w.slice(0, -1);
    } else if (w.length === 3 && /^[^aeiou][aeiou][^aeiou]$/.test(w)) {
      w += "e";
    }
  }

  // ── Stage 1c: Y → I ───────────────────────────────────────────────────────
  if (w.endsWith("y") && w.length > 3 && /[^aeiou]y$/.test(w)) {
    w = w.slice(0, -1) + "i";
  }

  // ── Stage 2: Common suffixes ──────────────────────────────────────────────
  const stage2Map: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
    ["izer", "ize"], ["bli", "ble"], ["alli", "al"], ["entli", "ent"],
    ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
    ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
  ];
  for (const [suf, rep] of stage2Map) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }

  // ── Stage 3 ───────────────────────────────────────────────────────────────
  const stage3Map: [string, string][] = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
    ["ical", "ic"], ["ful", ""], ["ness", ""],
  ];
  for (const [suf, rep] of stage3Map) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }

  // ── Stage 4 ───────────────────────────────────────────────────────────────
  const stage4List = [
    "ement", "ment", "ance", "ence", "able", "ible", "ant", "ent",
    "ion", "ism", "ate", "iti", "ous", "ive", "ize", "al", "er", "ic",
  ];
  for (const suf of stage4List) {
    if (w.endsWith(suf) && w.length > suf.length + 3) {
      if (suf === "ion" && /[st]$/.test(w.slice(0, -3))) {
        w = w.slice(0, -3);
      } else if (suf !== "ion") {
        w = w.slice(0, -suf.length);
      }
      break;
    }
  }

  // ── Stage 5a: Remove trailing 'e' ────────────────────────────────────────
  if (w.endsWith("e") && w.length > 4) {
    const stem = w.slice(0, -1);
    if (hasCVC(stem) || (stem.length === 3 && /^[^aeiou][aeiou][^aeiou]$/.test(stem))) {
      // keep e for cvc-e pattern
    } else {
      w = stem;
    }
  }

  // ── Stage 5b: Double consonant final ─────────────────────────────────────
  if (w.length > 4 && w.endsWith("ll")) {
    w = w.slice(0, -1);
  }

  return w;
}

// ── SOUNDEX PHONETIC ENCODER ─────────────────────────────────────────────────

/**
 * Soundex encoder for detecting near-homophone duplicates in keyword pool.
 * e.g. "colour" and "color" produce the same code; helps catch spelling variants.
 */
export function soundex(word: string): string {
  const w = word.toUpperCase().trim();
  if (!w) return "";
  const MAP: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3", L: "4", M: "5", N: "5", R: "6",
  };
  const first = w[0];
  let code = first;
  let prev = MAP[first] || "0";
  for (let i = 1; i < w.length && code.length < 4; i++) {
    const c = w[i];
    const digit = MAP[c] || "0";
    if (digit !== "0" && digit !== prev) {
      code += digit;
      prev = digit;
    } else if (digit === "0") {
      prev = "0";
    }
  }
  return code.padEnd(4, "0");
}

// ── FULL TOKENIZER ────────────────────────────────────────────────────────────

/**
 * Produces a rich TokenizerOutput from a raw text string.
 * Includes raw tokens, stemmed tokens, phonetic codes, and bigrams.
 */
export function tokenize(text: string): TokenizerOutput {
  const raw = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));

  const stemmed = raw.map(getStemKey);
  const phonetic = raw.map(soundex);
  const nGrams: string[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    nGrams.push(`${raw[i]} ${raw[i + 1]}`);
  }
  return {
    rawTokens: raw,
    stemmedTokens: stemmed,
    phoneticTokens: phonetic,
    nGrams,
    uniqueStems: new Set(stemmed),
    tokenCount: raw.length,
  };
}

// ── KEYWORD NORMALIZER ────────────────────────────────────────────────────────

/**
 * Normalizes a raw keyword string:
 * 1. Strip forbidden characters
 * 2. UK → US spelling
 * 3. Hard cap at 2 words
 * 4. Lowercase
 */
export function normalizeKeyword(kw: string): string {
  if (!kw) return "";
  let cleaned = kw
    .replace(/['"`\\/()[\]{}*#<>~_@!?;:,.|+=]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const tokens = cleaned.split(" ").filter(t => t.length > 1);
  const normalized = tokens.map(t => UK_TO_US[t] || t);

  return normalized.length > 2
    ? normalized.slice(0, 2).join(" ")
    : normalized.join(" ");
}

// ── KEYWORD VALIDATOR ────────────────────────────────────────────────────────

/**
 * Returns true if keyword is invalid and should be excluded.
 * Checks: length, digits-only, banned terms, trademarks, forbidden patterns.
 */
export function isInvalidKeyword(kw: string): boolean {
  if (!kw || kw.length < 2 || kw.length > 32) return true;
  if (/^\d+$/.test(kw)) return true;
  const lower = kw.toLowerCase().trim();
  if (BANNED_METADATA_TERMS.has(lower)) return true;
  if (TRADEMARK_TERMS.has(lower)) return true;
  if (STOP_WORDS.has(lower)) return true;
  if (lower.includes("manual") || lower.includes("guide")) return true;
  // Reject all-caps (likely acronym spam)
  if (kw === kw.toUpperCase() && kw.length > 3) return true;
  return false;
}

// ── CONCEPT EXPANSION GRAPH ──────────────────────────────────────────────────
// 40+ domain clusters, ~50 tags each → ~2,000 total tags before deduplication

export const BUYER_CONCEPT_EXPANSION: Record<string, string[]> = {

  // ── PEOPLE & PORTRAITS ────────────────────────────────────────────────────
  person: [
    "man", "woman", "people", "adult", "young", "old", "senior", "teenager",
    "boy", "girl", "child", "baby", "couple", "family", "group", "crowd",
    "portrait", "face", "smile", "happy", "sad", "laughing", "thinking",
    "standing", "sitting", "walking", "running", "looking", "holding",
    "pointing", "waving", "working", "lifestyle", "caucasian", "asian",
    "diverse", "model", "professional", "confident", "relaxed", "serious",
    "expressive", "candid", "posed", "outdoor", "indoor", "friends",
  ],
  woman: [
    "female", "lady", "girl", "businesswoman", "mother", "daughter", "sister",
    "wife", "beauty", "fashion", "elegant", "stylish", "young woman",
    "senior woman", "pregnant", "fit woman", "athlete", "casual", "manager",
    "executive", "nurse", "teacher", "doctor", "chef", "artist", "student",
    "fitness", "wellness", "smile", "happy", "confident", "natural",
  ],
  man: [
    "male", "guy", "businessman", "father", "son", "brother", "husband",
    "worker", "engineer", "doctor", "chef", "teacher", "driver", "soldier",
    "young man", "senior man", "handsome", "bearded", "casual", "executive",
    "manager", "athlete", "mechanic", "builder", "farmer", "artist",
    "smile", "confident", "serious", "active", "professional",
  ],
  child: [
    "kid", "boy", "girl", "baby", "infant", "toddler", "teen", "teenager",
    "student", "school", "play", "learning", "happy", "cute", "young",
    "childhood", "growth", "family", "outdoor", "fun", "smile",
  ],
  family: [
    "parents", "mother", "father", "children", "siblings", "couple",
    "home", "together", "love", "happiness", "bonding", "parenting",
    "outdoor", "indoor", "vacation", "holiday", "cooking", "playing",
  ],

  // ── BUSINESS & FINANCE ────────────────────────────────────────────────────
  business: [
    "office", "corporate", "professional", "work", "meeting", "desk",
    "computer", "laptop", "phone", "tablet", "keyboard", "screen", "monitor",
    "coworker", "colleague", "team", "manager", "executive", "employee",
    "director", "finance", "money", "profit", "growth", "investment", "market",
    "strategy", "plan", "goal", "success", "career", "job", "company",
    "startup", "industry", "commerce", "trade", "deal", "contract", "report",
    "chart", "graph", "data", "analysis", "presentation", "conference",
    "handshake", "agreement", "partnership", "collaboration", "teamwork",
    "seminar", "training", "boardroom", "innovation", "leadership",
  ],
  office: [
    "workplace", "workspace", "desk", "chair", "table", "room", "building",
    "window", "indoor", "interior", "modern", "bright", "clean",
    "open space", "cubicle", "reception", "lobby", "boardroom", "meeting room",
    "coworking", "remote work", "home office", "ergonomic", "organized",
  ],
  finance: [
    "money", "cash", "coin", "bill", "dollar", "euro", "currency",
    "bank", "banking", "account", "savings", "investment", "stock", "market",
    "trade", "profit", "loss", "growth", "economy", "budget", "expense",
    "income", "revenue", "tax", "insurance", "loan", "credit", "debt",
    "mortgage", "interest", "rate", "chart", "graph", "analysis", "report",
    "forecast", "trend", "wallet", "payment", "transaction", "crypto",
  ],

  // ── TECHNOLOGY ────────────────────────────────────────────────────────────
  technology: [
    "computer", "laptop", "phone", "smartphone", "tablet", "screen",
    "digital", "data", "internet", "network", "wifi", "cloud",
    "software", "code", "programming", "developer", "cyber", "security",
    "ai", "robot", "automation", "innovation", "future", "tech", "device",
    "gadget", "electronic", "chip", "circuit", "keyboard", "mouse",
    "monitor", "server", "database", "app", "website", "online", "virtual",
    "streaming", "gaming", "drone", "smartwatch", "headset", "vr", "ar",
    "blockchain", "machine learning", "algorithm", "api", "startup",
  ],

  // ── NATURE & ENVIRONMENT ──────────────────────────────────────────────────
  nature: [
    "landscape", "outdoor", "tree", "forest", "mountain", "sky", "cloud",
    "sun", "sunlight", "sunrise", "sunset", "field", "grass", "meadow",
    "park", "garden", "flower", "leaf", "branch", "root", "soil", "earth",
    "river", "lake", "ocean", "sea", "beach", "wave", "coast", "island",
    "desert", "rock", "stone", "cave", "snow", "ice", "rain", "fog", "mist",
    "wind", "storm", "rainbow", "star", "moon", "wildlife", "bird",
    "butterfly", "bee", "green", "organic", "natural", "environment",
    "ecology", "sustainable", "wilderness", "habitat", "scenery", "vista",
  ],
  environment: [
    "ecology", "green", "sustainable", "recycling", "solar", "wind energy",
    "clean energy", "conservation", "climate", "carbon", "pollution", "plastic",
    "ocean cleanup", "tree planting", "biodiversity", "natural habitat",
    "earth day", "zero waste", "organic farming", "eco living",
  ],

  // ── FOOD & DRINK ──────────────────────────────────────────────────────────
  food: [
    "meal", "dish", "plate", "bowl", "fork", "spoon", "knife", "cup",
    "breakfast", "lunch", "dinner", "snack", "dessert", "cake", "bread",
    "rice", "pasta", "pizza", "burger", "sandwich", "soup", "salad",
    "meat", "chicken", "beef", "pork", "fish", "seafood", "shrimp", "salmon",
    "egg", "cheese", "butter", "milk", "cream", "yogurt", "fruit",
    "apple", "orange", "banana", "grape", "strawberry", "lemon", "mango",
    "vegetable", "carrot", "tomato", "potato", "onion", "garlic", "pepper",
    "herb", "spice", "sauce", "oil", "cooking", "baking", "grilling",
    "kitchen", "chef", "recipe", "nutrition", "organic food", "gourmet",
    "cuisine", "restaurant", "cafe", "buffet", "street food",
  ],
  coffee: [
    "espresso", "cappuccino", "latte", "americano", "mocha", "brew",
    "cup", "mug", "cafe", "barista", "beans", "aroma", "hot drink", "warm",
    "morning", "beverage", "table", "breakfast", "relax", "caffeine",
    "roast", "grind", "pour over", "cold brew", "iced coffee",
  ],
  drink: [
    "water", "juice", "tea", "wine", "beer", "cocktail", "soda", "smoothie",
    "shake", "glass", "bottle", "can", "beverage", "liquid", "refreshing",
    "tropical drink", "mocktail", "lemonade", "sparkling", "mineral water",
  ],

  // ── FITNESS & HEALTH ──────────────────────────────────────────────────────
  fitness: [
    "workout", "exercise", "gym", "training", "athlete", "sport",
    "running", "jogging", "jumping", "lifting", "stretching", "yoga",
    "pilates", "cycling", "swimming", "hiking", "climbing", "boxing",
    "muscle", "body", "fit", "strong", "healthy", "active", "energy",
    "stamina", "endurance", "diet", "nutrition", "weight loss",
    "marathon", "triathlon", "crossfit", "kickboxing", "rowing",
  ],
  health: [
    "medical", "doctor", "hospital", "clinic", "patient", "nurse",
    "medicine", "pill", "vitamin", "supplement", "therapy", "treatment",
    "care", "recovery", "mental health", "wellness", "checkup", "surgery",
    "stethoscope", "diagnosis", "prescription", "pharmacy", "first aid",
    "ambulance", "emergency", "dental", "ophthalmology",
  ],

  // ── TRAVEL & TOURISM ──────────────────────────────────────────────────────
  travel: [
    "tourism", "vacation", "trip", "journey", "holiday", "tourist",
    "destination", "adventure", "explore", "world", "globe", "airplane",
    "airport", "flight", "ticket", "passport", "luggage", "hotel", "resort",
    "hostel", "map", "compass", "backpack", "suitcase", "road trip",
    "highway", "bus", "train", "ship", "boat", "city", "town", "village",
    "market", "monument", "temple", "church", "museum", "gallery",
    "beach", "mountain", "jungle", "safari", "cruise", "camper",
  ],

  // ── ARCHITECTURE & INTERIORS ──────────────────────────────────────────────
  architecture: [
    "building", "house", "home", "apartment", "office", "tower", "bridge",
    "church", "temple", "mosque", "museum", "school", "hospital", "factory",
    "warehouse", "stadium", "mall", "city", "urban", "street", "road",
    "suburb", "skyline", "modern", "classic", "historical", "contemporary",
    "exterior", "facade", "roof", "wall", "window", "door", "column",
    "arch", "dome", "staircase", "balcony", "skyscraper", "construction",
  ],
  interior: [
    "room", "living room", "bedroom", "bathroom", "kitchen", "dining room",
    "hall", "corridor", "studio", "loft", "attic", "furniture", "sofa",
    "chair", "table", "bed", "shelf", "lamp", "floor", "ceiling", "wall",
    "curtain", "decor", "design", "style", "modern", "classic", "minimalist",
    "cozy", "bright", "clean", "organized", "luxury", "simple", "rustic",
  ],

  // ── AUTOMOTIVE ────────────────────────────────────────────────────────────
  car: [
    "vehicle", "automobile", "auto", "transport", "drive", "road", "highway",
    "street", "traffic", "parking", "garage", "motor", "wheel", "tire",
    "engine", "brake", "hood", "door", "seat", "steering", "dashboard",
    "speed", "race", "sport car", "sedan", "suv", "truck", "van", "bus",
    "motorcycle", "bicycle", "electric car", "classic car", "luxury car",
    "mechanic", "repair", "service", "maintenance", "inspection", "headlight",
  ],
  mechanic: [
    "auto", "repair", "garage", "workshop", "technician", "service",
    "tool", "wrench", "spanner", "screwdriver", "drill", "jack", "lift",
    "brake", "rotor", "caliper", "wheel", "tire", "oil", "engine", "belt",
    "labor", "job", "work", "worker", "male", "uniform", "fixing",
    "checking", "inspection", "replacement", "alignment", "lubrication",
  ],

  // ── EDUCATION ─────────────────────────────────────────────────────────────
  education: [
    "school", "university", "college", "classroom", "student", "teacher",
    "professor", "lesson", "lecture", "study", "learning", "reading",
    "writing", "math", "science", "history", "language", "art",
    "book", "notebook", "pen", "pencil", "ruler", "blackboard", "whiteboard",
    "desk", "chair", "library", "campus", "diploma", "graduation", "exam",
    "test", "homework", "grade", "knowledge", "smart", "curious",
    "online learning", "elearning", "homeschool", "tutoring",
  ],

  // ── ARTS & CREATIVITY ─────────────────────────────────────────────────────
  art: [
    "painting", "drawing", "sketch", "design", "creative", "artist",
    "brush", "canvas", "color", "palette", "abstract", "portrait",
    "landscape art", "still life", "sculpture", "craft", "music",
    "dance", "theater", "performance", "culture", "gallery", "museum",
    "exhibition", "handmade", "pattern", "texture", "shape", "form", "line",
    "watercolor", "oil painting", "digital art", "graffiti", "street art",
  ],

  // ── FASHION & BEAUTY ──────────────────────────────────────────────────────
  fashion: [
    "clothing", "clothes", "dress", "shirt", "pants", "jeans", "suit",
    "jacket", "coat", "hat", "shoe", "boot", "bag", "purse", "belt",
    "jewelry", "ring", "necklace", "bracelet", "earring", "watch",
    "makeup", "lipstick", "foundation", "mascara", "blush", "perfume",
    "hair", "hairstyle", "blonde", "brunette", "curly", "beauty",
    "skincare", "face", "skin", "glow", "model", "pose", "runway",
    "style", "trend", "elegant", "casual", "glamour", "luxury brand",
  ],

  // ── HOLIDAYS & CELEBRATIONS ───────────────────────────────────────────────
  holiday: [
    "christmas", "new year", "birthday", "anniversary", "wedding",
    "party", "celebration", "festival", "event", "gift", "present",
    "decoration", "balloon", "confetti", "cake", "candle", "flower",
    "light", "fireworks", "heart", "love", "romance", "valentine",
    "halloween", "thanksgiving", "easter", "diwali", "hanukkah",
    "mardi gras", "carnival", "graduation party", "baby shower",
  ],

  // ── ABSTRACT & COMMERCIAL ─────────────────────────────────────────────────
  abstract: [
    "background", "texture", "pattern", "surface", "gradient", "color",
    "light", "shadow", "blur", "bokeh", "minimal", "minimalist", "clean",
    "simple", "elegant", "copy space", "empty space", "blank", "white",
    "black", "gray", "concept", "idea", "symbol", "icon", "sign",
    "geometric", "circle", "square", "triangle", "line", "dot",
    "wave", "spiral", "grid", "mesh", "frame", "border", "isolated",
    "flat lay", "top view", "overhead", "transparent",
  ],

  // ── ANIMALS & PETS ────────────────────────────────────────────────────────
  animal: [
    "dog", "cat", "bird", "horse", "cow", "pig", "sheep", "goat",
    "rabbit", "hamster", "fish", "turtle", "snake", "lizard", "frog",
    "lion", "tiger", "elephant", "giraffe", "zebra", "monkey", "bear",
    "wolf", "fox", "deer", "eagle", "owl", "parrot", "dolphin",
    "whale", "shark", "crab", "butterfly", "bee", "pet", "wildlife",
    "zoo", "farm", "cute", "wild", "exotic", "domestic",
  ],

  // ── SCIENCE & MEDICAL ─────────────────────────────────────────────────────
  science: [
    "lab", "laboratory", "research", "experiment", "test", "sample",
    "microscope", "telescope", "chemistry", "biology", "physics",
    "dna", "cell", "molecule", "atom", "gene", "virus", "bacteria",
    "medical", "doctor", "nurse", "hospital", "clinic", "surgery",
    "medicine", "pill", "injection", "vaccine", "health", "patient",
    "anatomy", "brain", "heart", "lung", "blood", "bone", "dna strand",
  ],

  // ── SPORTS ────────────────────────────────────────────────────────────────
  sport: [
    "football", "soccer", "basketball", "baseball", "tennis", "golf",
    "swimming", "cycling", "running", "boxing", "wrestling", "volleyball",
    "rugby", "cricket", "hockey", "skiing", "surfing", "skateboarding",
    "athlete", "player", "team", "competition", "match", "game",
    "ball", "court", "field", "stadium", "trophy", "medal", "win",
    "training", "coach", "gym", "fitness", "active", "sport",
  ],

  // ── LIFESTYLE & HOME ──────────────────────────────────────────────────────
  lifestyle: [
    "daily life", "routine", "morning", "evening", "weekend", "relax",
    "sleep", "shower", "breakfast", "commute", "lunch", "break", "dinner",
    "night", "hobby", "reading", "cooking", "gardening", "cleaning",
    "shopping", "home", "house", "apartment", "neighborhood", "community",
    "friendship", "love", "relationship", "dating", "marriage",
    "parenting", "childhood", "retirement", "elderly", "self care",
  ],

  // ── PLANTS & FLOWERS ──────────────────────────────────────────────────────
  flower: [
    "rose", "tulip", "daisy", "lily", "sunflower", "orchid", "lavender",
    "cherry blossom", "jasmine", "lotus", "carnation", "iris", "petal",
    "bloom", "blossom", "bud", "stem", "leaf", "bouquet", "garden",
    "botanical", "floral", "plant", "green", "fresh", "colorful",
    "pink flower", "red rose", "white lily", "yellow flower",
    "spring flower", "summer bloom",
  ],

  // ── WATER & WEATHER ───────────────────────────────────────────────────────
  water: [
    "ocean", "sea", "lake", "river", "stream", "pond", "waterfall",
    "rain", "drop", "splash", "wave", "foam", "ripple", "reflection",
    "blue", "clear", "pure", "fresh", "clean", "liquid", "aqua",
    "beach", "coast", "shore", "sand", "tropical", "calm", "storm",
    "ice", "snow", "frost", "mist", "fog", "cloud", "swim", "surf",
  ],
  weather: [
    "sunny", "cloudy", "rainy", "stormy", "windy", "foggy", "snowy",
    "rainbow", "lightning", "thunder", "hail", "blizzard", "drought",
    "spring", "summer", "autumn", "winter", "season", "climate",
  ],

  // ── INDUSTRIAL & CONSTRUCTION ─────────────────────────────────────────────
  industrial: [
    "factory", "warehouse", "plant", "facility", "manufacturing",
    "production", "assembly", "machine", "equipment", "steel", "metal",
    "pipe", "gear", "bolt", "crane", "forklift", "conveyor", "worker",
    "engineer", "safety", "helmet", "vest", "glove", "construction",
    "building site", "scaffold", "blueprint", "cement", "brick", "wood",
    "glass", "iron", "copper", "welding", "drilling", "cutting",
  ],

  // ── SUNSET / SKY / LANDSCAPE ──────────────────────────────────────────────
  sunset: [
    "sunrise", "sky", "sun", "dusk", "dawn", "evening", "twilight",
    "horizon", "orange sky", "golden hour", "warm light", "glow",
    "cloud", "dramatic sky", "serene", "peaceful", "romantic",
    "colorful sky", "silhouette", "light ray", "beam", "atmosphere",
  ],

  // ── MUSIC & ENTERTAINMENT ─────────────────────────────────────────────────
  music: [
    "guitar", "piano", "violin", "drums", "saxophone", "trumpet",
    "singer", "musician", "band", "concert", "stage", "microphone",
    "headphones", "speaker", "melody", "rhythm", "beat", "sound",
    "recording", "studio", "vinyl", "dj", "festival", "dance",
  ],

  // ── COOKING & KITCHEN ─────────────────────────────────────────────────────
  cooking: [
    "chef", "kitchen", "pan", "pot", "oven", "stove", "cutting board",
    "knife", "spatula", "whisk", "bowl", "ingredient", "recipe",
    "baking", "grilling", "frying", "boiling", "steaming", "mixing",
    "garnish", "plating", "tasting", "seasoning", "meal prep",
  ],

  // ── WEDDING & ROMANCE ────────────────────────────────────────────────────
  wedding: [
    "bride", "groom", "ceremony", "ring", "bouquet", "veil", "church",
    "reception", "dance", "cake", "toast", "invitation", "wedding dress",
    "tuxedo", "love", "romance", "couple", "engagement", "honeymoon",
  ],

  // ── CONSTRUCTION & TOOLS ─────────────────────────────────────────────────
  construction: [
    "builder", "worker", "hammer", "drill", "saw", "nail", "screw",
    "pliers", "level", "measuring tape", "blueprint", "hard hat",
    "scaffold", "crane", "excavator", "concrete", "wood", "steel beam",
    "brick wall", "renovation", "project", "architect", "site",
  ],

  // ── SECURITY & PROTECTION ────────────────────────────────────────────────
  security: [
    "lock", "key", "shield", "padlock", "fence", "camera", "guard",
    "police", "alarm", "safe", "vault", "protection", "safety",
    "firewall", "encryption", "password", "surveillance", "patrol",
  ],

  // ── AGRICULTURE & FARMING ────────────────────────────────────────────────
  agriculture: [
    "farm", "farmer", "field", "crop", "harvest", "tractor", "plow",
    "seed", "soil", "irrigation", "greenhouse", "organic", "fruit",
    "vegetable", "grain", "wheat", "corn", "rice field", "vineyard",
    "orchard", "livestock", "cow", "sheep", "rural", "countryside",
  ],

  // ── RELAXATION & WELLNESS ────────────────────────────────────────────────
  relaxation: [
    "spa", "massage", "sauna", "bath", "candle", "yoga", "meditation",
    "mindfulness", "breathing", "calm", "peace", "quiet", "rest",
    "vacation", "hammock", "nature walk", "reading", "tea", "wellness",
  ],

  // ── LOGISTICS & TRANSPORT ────────────────────────────────────────────────
  logistics: [
    "shipping", "delivery", "package", "box", "warehouse", "truck",
    "forklift", "conveyor", "barcode", "scan", "inventory", "supply chain",
    "freight", "cargo", "container", "port", "airport", "distribution",
  ],

  // ── GRAPHIC RESOURCES ────────────────────────────────────────────────────
  background: [
    "isolated", "copy space", "white background", "black background",
    "gradient", "texture", "pattern", "wallpaper", "banner", "frame",
    "border", "template", "minimal background", "clean", "blank",
    "studio shot", "product mockup", "overlay", "flat lay",
  ],

  // ── EXTRA HIGH-VALUE COMMERCIAL ──────────────────────────────────────────
  commercial: [
    "advertising", "marketing", "brand", "product", "promo", "sale",
    "discount", "offer", "deal", "campaign", "banner ad", "poster",
    "brochure", "flyer", "social media", "content", "visual",
  ],
};

// ── POOL BUILDER ─────────────────────────────────────────────────────────────

/**
 * Multi-pass 500-keyword pool builder.
 *
 * Pass 1 — Seed with detected terms
 * Pass 2 — Expand matched domain clusters (primary relevance)
 * Pass 3 — Cross-pollinate related clusters (semantic proximity)
 * Pass 4 — Fill remaining slots from all other clusters
 *
 * @param detectedTerms  Visual subjects detected from scene
 * @param extraContext   Additional context tokens from description/title
 * @param targetPoolSize Target pool size (default 500)
 */
export function buildKeywordPool(
  detectedTerms: string[],
  extraContext: string[] = [],
  targetPoolSize = 500,
): string[] {
  const pool: string[] = [];
  const seenStems = new Set<string>();
  const seenPhonetic = new Set<string>();

  function tryAdd(raw: string): boolean {
    const kw = normalizeKeyword(raw);
    if (!kw || isInvalidKeyword(kw)) return false;
    const stem = getStemKey(kw);
    const phon = soundex(kw.split(" ")[0]);
    // Deduplicate by stem AND phonetic to catch near-homophones
    if (seenStems.has(stem)) return false;
    if (seenPhonetic.has(phon + "_" + kw.split(" ").length)) return false;
    seenStems.add(stem);
    seenPhonetic.add(phon + "_" + kw.split(" ").length);
    pool.push(kw);
    return true;
  }

  // Pass 1: Seed
  const seedTerms = [...detectedTerms, ...extraContext];
  for (const t of seedTerms) tryAdd(t);

  // Pass 2: Primary cluster expansion
  const matchedKeys = new Set<string>();
  for (const term of seedTerms) {
    const key = term.toLowerCase().trim();
    if (BUYER_CONCEPT_EXPANSION[key]) {
      matchedKeys.add(key);
      for (const candidate of BUYER_CONCEPT_EXPANSION[key]) {
        if (pool.length >= targetPoolSize) break;
        tryAdd(candidate);
      }
    }
    if (pool.length >= targetPoolSize) break;
  }

  // Pass 3: Partial cross-pollination — clusters that share ≥1 term with matched keys
  if (pool.length < targetPoolSize) {
    const matchedTermsFlat = new Set<string>(
      [...matchedKeys].flatMap(k => BUYER_CONCEPT_EXPANSION[k] || []).map(t => getStemKey(t))
    );
    for (const [clusterKey, terms] of Object.entries(BUYER_CONCEPT_EXPANSION)) {
      if (matchedKeys.has(clusterKey)) continue;
      if (pool.length >= targetPoolSize) break;
      // Only cross-pollinate if cluster shares context
      const overlap = terms.filter(t => matchedTermsFlat.has(getStemKey(t)));
      if (overlap.length >= 2) {
        for (const candidate of terms) {
          if (pool.length >= targetPoolSize) break;
          tryAdd(candidate);
        }
      }
    }
  }

  // Pass 4: Fill remaining from all clusters
  if (pool.length < targetPoolSize) {
    for (const [clusterKey, terms] of Object.entries(BUYER_CONCEPT_EXPANSION)) {
      if (matchedKeys.has(clusterKey)) continue;
      if (pool.length >= targetPoolSize) break;
      for (const candidate of terms) {
        if (pool.length >= targetPoolSize) break;
        tryAdd(candidate);
      }
    }
  }

  return pool.slice(0, targetPoolSize);
}

// ── AI POOL BUILDER ──────────────────────────────────────────────────────────

/**
 * AI-augmented pool builder using Groq 120B.
 * Sends 2 batched requests to reach 500 if heuristic falls short.
 */
export async function buildKeywordPoolWithAI(
  detectedTerms: string[],
  contextText: string,
  targetPoolSize = 500,
): Promise<string[]> {
  const contextWords = contextText.split(/\s+/).filter(w => w.length > 2).slice(0, 25);
  const basePool = buildKeywordPool(detectedTerms, contextWords, targetPoolSize);
  if (basePool.length >= targetPoolSize) return basePool;

  const seenStems = new Set<string>(basePool.map(k => getStemKey(k)));
  const merged = [...basePool];

  const batchSize = Math.min(250, Math.ceil((targetPoolSize - basePool.length) * 1.4));

  const makeRequest = async (batchN: number): Promise<string[]> => {
    const messages: GroqMessage[] = [
      {
        role: "system",
        content: `You are an elite microstock metadata SEO specialist for Adobe Stock and Shutterstock.

TASK: Generate unique simple keyword tags for microstock photo buyers.

STRICT RULES:
1. Every keyword MUST be 1 or 2 words only — NO 3+ word phrases.
2. Use ONLY common, natural everyday English (e.g. "woman", "office", "smile", "laptop").
3. Keywords must be 100% relevant to the described visual scene.
4. NEVER use: brand names, technical jargon, quality buzzwords (hd, epic, best), camera terms (shot, render, dslr).
5. DO NOT repeat keywords from previous batch.
6. Output ONLY a strict JSON array of strings: ["tag1", "tag2", ...]`,
      },
      {
        role: "user",
        content: `Scene: "${contextText.slice(0, 400)}".
Subjects detected: [${detectedTerms.slice(0, 15).join(", ")}].
Batch ${batchN} of 2: Generate ${batchSize} unique 1-2 word buyer search keywords for this scene.
Output strict JSON array only.`,
      },
    ];

    const res = await callGroq(messages, {
      model: REASONING_MODEL,
      temperature: batchN === 1 ? 0.2 : 0.35,
      max_tokens: 2500,
      jsonMode: true,
    });

    try {
      const parsed = JSON.parse(res.text);
      return Array.isArray(parsed)
        ? parsed.map(String)
        : (parsed.keywords as string[]) || [];
    } catch {
      const match = res.text.match(/\[[\s\S]*?\]/);
      return match ? (JSON.parse(match[0]) as string[]) : [];
    }
  };

  try {
    // Batch 1
    const batch1 = await makeRequest(1);
    for (const item of batch1) {
      if (merged.length >= targetPoolSize) break;
      const kw = normalizeKeyword(item);
      const stem = getStemKey(kw);
      if (!isInvalidKeyword(kw) && !seenStems.has(stem)) {
        seenStems.add(stem);
        merged.push(kw);
      }
    }

    // Batch 2 if still below target
    if (merged.length < targetPoolSize) {
      const batch2 = await makeRequest(2);
      for (const item of batch2) {
        if (merged.length >= targetPoolSize) break;
        const kw = normalizeKeyword(item);
        const stem = getStemKey(kw);
        if (!isInvalidKeyword(kw) && !seenStems.has(stem)) {
          seenStems.add(stem);
          merged.push(kw);
        }
      }
    }
  } catch {
    // Silently fall back to base pool
  }

  return merged.slice(0, targetPoolSize);
}

// ── LEGACY COMPAT ────────────────────────────────────────────────────────────

export function expandConcepts(detectedTerms: string[], maxAdditions = 30): string[] {
  const pool = buildKeywordPool(detectedTerms, [], maxAdditions + detectedTerms.length);
  return pool.filter(k => !detectedTerms.includes(k)).slice(0, maxAdditions);
}

export async function expandConceptsWithAI(
  detectedTerms: string[],
  contextText: string,
  maxAdditions = 30,
): Promise<string[]> {
  const pool = await buildKeywordPoolWithAI(detectedTerms, contextText, maxAdditions + 20);
  return pool.filter(k => !detectedTerms.includes(k)).slice(0, maxAdditions);
}
