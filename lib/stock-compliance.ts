/**
 * lib/stock-compliance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adobe Stock Generative AI Compliance Engine (Seeded & Natural)
 *
 * Implements a multi-layer guard against the Adobe Stock policy:
 *   "Do not submit generative AI content with titles that imply an actual
 *    depiction of newsworthy events."
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SAFE_ANCHOR_WORDS: readonly string[] = [
  "concept", "conceptual", "illustration", "visualization", "abstract",
  "fictional", "imaginary", "symbolic", "generative ai", "artistic",
  "creative", "rendered", "digital art", "metaphor", "allegory"
];

const REAL_LOCATIONS: readonly string[] = [
  "jakarta", "bali", "surabaya", "bandung", "indonesia", "banten", "papua",
  "bangkok", "thailand", "manila", "philippines", "hanoi", "vietnam",
  "singapore", "kuala lumpur", "malaysia", "myanmar", "rangoon", "yangon",
  "cambodia", "phnom penh", "laos", "timor", "tokyo", "osaka", "kyoto",
  "japan", "beijing", "shanghai", "china", "hong kong", "seoul", "korea",
  "taipei", "taiwan", "india", "mumbai", "delhi", "new delhi", "kolkata",
  "chennai", "bangalore", "pakistan", "karachi", "lahore", "islamabad",
  "bangladesh", "dhaka", "nepal", "kathmandu", "sri lanka", "colombo",
  "afghanistan", "kabul", "israel", "palestine", "gaza", "west bank",
  "jerusalem", "tel aviv", "iran", "tehran", "iraq", "baghdad", "syria",
  "damascus", "saudi arabia", "riyadh", "turkey", "istanbul", "ankara",
  "yemen", "sanaa", "lebanon", "beirut", "egypt", "cairo", "jordan",
  "amman", "uae", "dubai", "abu dhabi", "qatar", "doha", "ukraine", "kyiv",
  "kiev", "russia", "moscow", "st. petersburg", "france", "paris", "germany",
  "berlin", "uk", "london", "england", "italy", "rome", "spain", "madrid",
  "greece", "athens", "poland", "warsaw", "hungary", "budapest", "romania",
  "bucharest", "serbia", "belgrade", "croatia", "zagreb", "albania", "kosovo",
  "sweden", "stockholm", "norway", "oslo", "denmark", "copenhagen",
  "netherlands", "amsterdam", "belgium", "brussels", "switzerland", "zurich",
  "austria", "vienna", "portugal", "lisbon", "czech republic", "prague",
  "usa", "new york", "los angeles", "chicago", "washington", "miami",
  "houston", "dallas", "atlanta", "boston", "seattle", "san francisco",
  "canada", "toronto", "vancouver", "montreal", "ottawa", "mexico",
  "mexico city", "brazil", "sao paulo", "rio de janeiro", "brasilia",
  "argentina", "buenos aires", "colombia", "bogota", "venezuela", "caracas",
  "chile", "santiago", "peru", "lima", "ecuador", "quito", "cuba", "havana",
  "haiti", "port-au-prince", "nigeria", "lagos", "abuja", "kenya", "nairobi",
  "ethiopia", "addis ababa", "south africa", "johannesburg", "cape town",
  "pretoria", "sudan", "khartoum", "somalia", "mogadishu", "ghana", "accra",
  "senegal", "dakar", "tanzania", "dar es salaam", "congo", "kinshasa",
  "cameroon", "yaound", "libya", "tripoli", "tunisia", "algiers", "morocco",
  "rabat", "australia", "sydney", "melbourne", "brisbane", "perth",
  "new zealand", "auckland", "middle east", "africa", "europe", "asia",
  "south america", "latin america"
];

const NEWSWORTHY_NOUNS: readonly string[] = [
  "earthquake", "tsunami", "flood", "flooding", "floods", "hurricane",
  "typhoon", "cyclone", "tornado", "volcano", "eruption", "wildfire",
  "bushfire", "drought", "landslide", "avalanche", "blizzard", "explosion",
  "blast", "fire", "crash", "collapse", "wreckage", "accident", "disaster",
  "catastrophe", "tragedy", "protest", "protests", "riot", "riots",
  "demonstration", "uprising", "revolution", "coup", "strike", "rally",
  "march", "rebellion", "crackdown", "clash", "clashes", "unrest", "violence",
  "war", "battle", "attack", "bombing", "airstrike", "invasion", "missile",
  "warfare", "conflict", "occupation", "siege", "gunfire", "shooting",
  "terror", "terrorism", "massacre", "genocide", "election", "elections",
  "vote", "voting", "ballot", "referendum", "inauguration", "summit",
  "sanction", "sanctions", "impeachment", "assassination", "treaty",
  "breaking", "live", "developing", "update", "latest", "report", "news"
];

const POLITICAL_ROLES: readonly string[] = [
  "president", "prime minister", "premier", "chancellor", "minister",
  "senator", "congressman", "congresswoman", "parliament", "governor",
  "mayor", "secretary", "ambassador", "diplomat", "official", "leader",
  "commander", "general", "admiral"
];

const TEMPORAL_PATTERNS: readonly RegExp[] = [
  /\b(20[1-9]\d|19\d{2})\b/,
  /\btoday\b/i,
  /\bbreaking\b/i,
  /\blive\b.*\b(news|coverage|report)\b/i,
  /\bthis (week|month|year)\b/i,
  /\brecent(ly)?\b/i,
  /\bnow\b/i,
  /\bongoing\b/i
];

const FORBIDDEN_PHRASE_PATTERNS: readonly RegExp[] = [
  /breaking news/i,
  /\blive\b.{0,20}\b(coverage|update|feed|stream)\b/i,
  /\bnewsworthy\b/i,
  /world war/i,
  /civil war/i,
  /\bterror(ist)? attack\b/i,
  /\bcoup d[''`]état\b/i
];

const SAFE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bconcept(ual)?\b/i, /\billustration\b/i, /\bvisualization\b/i,
  /\babstract\b/i, /\bfictional\b/i, /\bimaginary\b/i, /\bsymbolic\b/i,
  /\bgenerative ai\b/i, /\bdigital art\b/i, /\brendered\b/i,
  /\bartistic\b/i, /\bmetaphor(ical)?\b/i, /\bdesign\b/i
];

function hasSafeContext(title: string): boolean {
  return SAFE_CONTEXT_PATTERNS.some((re) => re.test(title));
}

function hasForbiddenPhrase(title: string): boolean {
  return FORBIDDEN_PHRASE_PATTERNS.some((re) => re.test(title));
}

function hasTemporalMarker(title: string): boolean {
  return TEMPORAL_PATTERNS.some((re) => re.test(title));
}

function hasRealLocation(lowerTitle: string): string | null {
  const sorted = [...REAL_LOCATIONS].sort((a, b) => b.length - a.length);
  for (const loc of sorted) {
    const re = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lowerTitle)) return loc;
  }
  return null;
}

function hasNewsworthyNoun(lowerTitle: string): string | null {
  for (const noun of NEWSWORTHY_NOUNS) {
    const re = new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lowerTitle)) return noun;
  }
  return null;
}

function hasPoliticalRole(lowerTitle: string): boolean {
  return POLITICAL_ROLES.some((role) => {
    const re = new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lowerTitle);
  });
}

export interface ComplianceCheckResult {
  isViolation: boolean;
  reason?: string;
  signals: string[];
}

export function isTitleNewsworthy(title: string): ComplianceCheckResult {
  const signals: string[] = [];
  if (hasSafeContext(title)) return { isViolation: false, signals: [] };

  const lower = title.toLowerCase();

  if (hasForbiddenPhrase(title)) signals.push("forbidden_phrase");
  
  const foundLocation = hasRealLocation(lower);
  const foundNoun = hasNewsworthyNoun(lower);
  const foundTemporal = hasTemporalMarker(title);
  const foundPolitical = hasPoliticalRole(lower);

  if (foundLocation && foundNoun) signals.push("location_plus_event");
  if (foundLocation && foundPolitical) signals.push("location_plus_political");
  if (foundTemporal && foundNoun) signals.push("temporal_marker_plus_event");
  if (foundTemporal && foundPolitical) signals.push("temporal_marker_plus_political");
  if (foundPolitical && (foundNoun || foundTemporal)) signals.push("political_role_unframed");

  const isViolation = signals.length > 0;
  return {
    isViolation,
    signals,
    reason: isViolation ? `Detected signals: [${signals.join(", ")}]` : undefined
  };
}

function stripYears(title: string): string {
  return title.replace(/\b(20[1-9]\d|19\d{2})\b/g, "").replace(/\s{2,}/g, " ").trim();
}

function stripTemporalMarkers(title: string): string {
  return title
    .replace(/\b(today|breaking|live coverage|live news|ongoing|currently|recent|recently|now|this week|this month|this year|last week|last month|last year)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function replaceLocations(title: string): string {
  let result = title;
  const sorted = [...REAL_LOCATIONS].sort((a, b) => b.length - a.length);
  for (const loc of sorted) {
    const re = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (re.test(result)) {
      result = result.replace(re, "urban city");
    }
  }
  return result;
}

function replacePoliticalRoles(title: string): string {
  return title
    .replace(/\bpresident\b/gi, "business leader")
    .replace(/\bprime minister\b/gi, "community leader")
    .replace(/\bminister\b/gi, "official")
    .replace(/\bsenator\b/gi, "delegate")
    .replace(/\bgovernor\b/gi, "regional leader")
    .replace(/\bparliament\b/gi, "assembly")
    .trim();
}

function replaceNewsworthyNouns(title: string): string {
  return title
    .replace(/\bearthquake(s)?\b/gi, "ground tremor")
    .replace(/\btsunami(s)?\b/gi, "ocean wave surge")
    .replace(/\bflooding\b/gi, "rising water surge")
    .replace(/\bfloods?\b/gi, "rising water")
    .replace(/\bhurricane(s)?\b/gi, "powerful storm")
    .replace(/\btyphoon(s)?\b/gi, "tropical storm")
    .replace(/\bwildfire(s)?\b/gi, "fire in the wilderness")
    .replace(/\bexplosion(s)?\b/gi, "industrial scene")
    .replace(/\bprotests?\b/gi, "public gathering")
    .replace(/\briots?\b/gi, "street scene")
    .replace(/\buprising(s)?\b/gi, "social movement")
    .replace(/\bwar(fare)?\b/gi, "armed scenario")
    .replace(/\bbattle(s)?\b/gi, "confrontation scene")
    .replace(/\belections?\b/gi, "civic process")
    .replace(/\b(vote|voting)\b/gi, "civic participation")
    .replace(/\bbreaking news\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function seededRandom(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash / 4294967296;
}

type AnchorTemplate = (base: string) => string;
const NATURAL_ANCHOR_TEMPLATES: readonly AnchorTemplate[] = [
  (b) => `${b} concept`,
  (b) => `${b} illustration`,
  (b) => `${b} conceptual design`,
  (b) => `${b} visualization`,
  (b) => `${b} creative concept`,
  (b) => `${b} symbolic scene`,
  (b) => `${b} artistic rendering`,
  (b) => `${b} fictional scenario`,
  (b) => `${b} imaginative scene`,
  (b) => `conceptual ${b}`,
  (b) => `illustrated ${b}`,
  (b) => `abstract ${b} design`,
  (b) => `symbolic ${b} scene`
];

function applyNaturalAnchor(cleanedBase: string, seedTitle: string): string {
  const rng = seededRandom(seedTitle);
  const index = Math.floor(rng * NATURAL_ANCHOR_TEMPLATES.length);
  return NATURAL_ANCHOR_TEMPLATES[index]!(cleanedBase);
}

export function sanitizeTitle(title: string): string {
  let working = title;

  working = stripYears(working);
  working = stripTemporalMarkers(working);
  working = replaceLocations(working);
  working = replacePoliticalRoles(working);
  working = replaceNewsworthyNouns(working);

  if (!hasSafeContext(working)) {
    const wordCount = working.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      working = `conceptual illustration of ${working.toLowerCase()}`;
    } else {
      working = applyNaturalAnchor(working.toLowerCase(), title);
    }
  }

  const clean = working
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\-–—:;]+/, "")
    .replace(/[,.\-–—:;]+$/, "")
    .trim();
  const finalized = clean.charAt(0).toUpperCase() + clean.slice(1);
  return finalized.split(/\s+/).slice(0, 12).join(" ");
}

export function validateAndSanitize(rawTitle: string): { title: string; wasModified: boolean } {
  const compliance = isTitleNewsworthy(rawTitle);
  if (!compliance.isViolation) {
    return { title: rawTitle.trim(), wasModified: false };
  }
  return { title: sanitizeTitle(rawTitle), wasModified: true };
}
