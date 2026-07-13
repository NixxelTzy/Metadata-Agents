/**
 * lib/stock-compliance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adobe Stock Generative AI Compliance Engine
 *
 * Implements a multi-layer guard against the Adobe Stock policy:
 *   "Do not submit generative AI content with titles that imply an actual
 *    depiction of newsworthy events."
 *
 * Exported API:
 *   - COMPLIANCE_TITLE_RULES  → inject into any AI system prompt
 *   - isTitleNewsworthy(title) → detect policy violations
 *   - sanitizeTitle(title)     → auto-fix violating titles
 *   - validateAndSanitize(title) → combined util with audit log
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── 1. ANCHOR WORDS ─────────────────────────────────────────────────────────
// Words that safely frame an AI image as non-documentary
const SAFE_ANCHOR_WORDS: readonly string[] = [
  "concept",
  "conceptual",
  "illustration",
  "visualization",
  "abstract",
  "fictional",
  "imaginary",
  "symbolic",
  "generative ai",
  "artistic",
  "creative",
  "rendered",
  "digital art",
  "metaphor",
  "allegory",
];

// ─── 2. REAL CITY / COUNTRY / REGION DATABASE ────────────────────────────────
// Major cities and countries that when combined with disaster/political keywords
// trigger the newsworthy pattern.
const REAL_LOCATIONS: readonly string[] = [
  // Southeast Asia
  "jakarta", "bali", "surabaya", "bandung", "indonesia", "banten", "papua",
  "bangkok", "thailand", "manila", "philippines", "hanoi", "vietnam",
  "singapore", "kuala lumpur", "malaysia", "myanmar", "rangoon", "yangon",
  "cambodia", "phnom penh", "laos", "timor",
  // East Asia
  "tokyo", "osaka", "kyoto", "japan", "beijing", "shanghai", "china",
  "hong kong", "seoul", "korea", "taipei", "taiwan",
  // South Asia
  "india", "mumbai", "delhi", "new delhi", "kolkata", "chennai", "bangalore",
  "pakistan", "karachi", "lahore", "islamabad", "bangladesh", "dhaka",
  "nepal", "kathmandu", "sri lanka", "colombo", "afghanistan", "kabul",
  // Middle East
  "israel", "palestine", "gaza", "west bank", "jerusalem", "tel aviv",
  "iran", "tehran", "iraq", "baghdad", "syria", "damascus",
  "saudi arabia", "riyadh", "turkey", "istanbul", "ankara",
  "yemen", "sanaa", "lebanon", "beirut", "egypt", "cairo",
  "jordan", "amman", "uae", "dubai", "abu dhabi", "qatar", "doha",
  // Europe
  "ukraine", "kyiv", "kiev", "russia", "moscow", "st. petersburg",
  "france", "paris", "germany", "berlin", "uk", "london", "england",
  "italy", "rome", "spain", "madrid", "greece", "athens", "turkey",
  "poland", "warsaw", "hungary", "budapest", "romania", "bucharest",
  "serbia", "belgrade", "croatia", "zagreb", "albania", "kosovo",
  "sweden", "stockholm", "norway", "oslo", "denmark", "copenhagen",
  "netherlands", "amsterdam", "belgium", "brussels", "switzerland", "zurich",
  "austria", "vienna", "portugal", "lisbon", "czech republic", "prague",
  // Americas
  "usa", "new york", "los angeles", "chicago", "washington", "miami",
  "houston", "dallas", "atlanta", "boston", "seattle", "san francisco",
  "canada", "toronto", "vancouver", "montreal", "ottawa",
  "mexico", "mexico city", "brazil", "sao paulo", "rio de janeiro", "brasilia",
  "argentina", "buenos aires", "colombia", "bogota", "venezuela", "caracas",
  "chile", "santiago", "peru", "lima", "ecuador", "quito",
  "cuba", "havana", "haiti", "port-au-prince", "venezuela",
  // Africa
  "nigeria", "lagos", "abuja", "kenya", "nairobi", "ethiopia", "addis ababa",
  "south africa", "johannesburg", "cape town", "pretoria",
  "egypt", "sudan", "khartoum", "somalia", "mogadishu",
  "ghana", "accra", "senegal", "dakar", "tanzania", "dar es salaam",
  "congo", "kinshasa", "cameroon", "yaound",
  "libya", "tripoli", "tunisia", "algiers", "morocco", "rabat",
  // Oceania
  "australia", "sydney", "melbourne", "brisbane", "perth",
  "new zealand", "auckland",
  // Misc regions
  "middle east", "africa", "europe", "asia", "south america",
  "latin america", "east africa", "west africa", "north africa",
  "southeast asia", "central asia", "caucasus", "balkans",
];

// ─── 3. NEWSWORTHY EVENT NOUNS ────────────────────────────────────────────────
// Disaster, crisis, political, and conflict nouns that trigger newsworthy detection
// when combined with a real location name or temporal marker.
const NEWSWORTHY_NOUNS: readonly string[] = [
  // Natural disasters
  "earthquake", "tsunami", "flood", "flooding", "floods", "hurricane",
  "typhoon", "cyclone", "tornado", "volcano", "eruption", "wildfire",
  "bushfire", "drought", "landslide", "avalanche", "blizzard",
  // Human disasters
  "explosion", "blast", "fire", "crash", "collapse", "wreckage",
  "accident", "disaster", "catastrophe", "tragedy",
  // Political / social unrest
  "protest", "protests", "riot", "riots", "demonstration", "uprising",
  "revolution", "coup", "strike", "rally", "march", "rebellion",
  "crackdown", "clash", "clashes", "unrest", "violence",
  // War / conflict
  "war", "battle", "attack", "bombing", "airstrike", "invasion",
  "missile", "warfare", "conflict", "occupation", "siege", "gunfire",
  "shooting", "terror", "terrorism", "massacre", "genocide",
  // Political events
  "election", "elections", "vote", "voting", "ballot", "referendum",
  "inauguration", "summit", "sanction", "sanctions",
  "impeachment", "assassination", "treaty",
  // Breaking news markers
  "breaking", "breaking news", "live", "live coverage", "developing",
  "update", "latest", "report", "news", "coverage",
];

// ─── 4. POLITICAL TITLE WORDS ─────────────────────────────────────────────────
// Political roles that imply a real named person / real event
const POLITICAL_ROLES: readonly string[] = [
  "president", "prime minister", "premier", "chancellor", "minister",
  "senator", "congressman", "congresswoman", "parliament", "governor",
  "mayor", "secretary", "ambassador", "diplomat", "official",
  "leader", "commander", "general", "admiral",
];

// ─── 5. TEMPORAL / NEWSWORTHY DATE PATTERNS ──────────────────────────────────
// Regex patterns that detect specific years, dates, or time references
const TEMPORAL_PATTERNS: readonly RegExp[] = [
  /\b(20[1-9]\d|19\d{2})\b/,            // Year: 2010–2099 or 19xx
  /\btoday\b/i,
  /\bbreaking\b/i,
  /\blive\b.*\b(news|coverage|report)\b/i,
  /\bthis (week|month|year)\b/i,
  /\brecent(ly)?\b/i,
  /\blast (week|month|year)\b/i,
  /\bnow\b/i,
  /\bcurrent(ly)?\b/i,
  /\bongoing\b/i,
  /\bcrisis of \d{4}\b/i,
];

// ─── 6. DIRECT FORBIDDEN PHRASES ─────────────────────────────────────────────
// Hard-coded phrase patterns that are always violations regardless of context
const FORBIDDEN_PHRASE_PATTERNS: readonly RegExp[] = [
  /breaking news/i,
  /\blive\b.{0,20}\b(coverage|update|feed|stream)\b/i,
  /\bnewsworthy\b/i,
  /\bactual (photo|photograph|image|footage)\b/i,
  /\breal (photo|photograph|event|incident|news)\b/i,
  /world war/i,
  /civil war/i,
  /\bnuclear (attack|bomb|strike|explosion)\b/i,
  /\bterror(ist)? attack\b/i,
  /\bcoup d[''`]état\b/i,
  /\bgenocide\b/i,
];

// ─── 7. SAFE CONTEXT OVERRIDES ────────────────────────────────────────────────
// If the title already contains one of these patterns, it is considered safe
// even if other signals are present — the "concept" framing overrides detection.
const SAFE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bconcept(ual)?\b/i,
  /\billustration\b/i,
  /\bvisualization\b/i,
  /\bvisuali[sz]e\b/i,
  /\babstract\b/i,
  /\bfictional\b/i,
  /\bimaginary\b/i,
  /\bsymbolic\b/i,
  /\bgenerative ai\b/i,
  /\bdigital art\b/i,
  /\brendered\b/i,
  /\bartistic\b/i,
  /\bmetaphor(ical)?\b/i,
  /\ballegory\b/i,
  /\bdesign\b/i,
  /\binfographic\b/i,
  /\bcreative\b/i,
  /\bdepiction\b/i,
];

// ─── GENERIC LOCATION SUBSTITUTES ─────────────────────────────────────────────
// Replace real city/country names with generic equivalents
const LOCATION_SUBSTITUTES: Record<string, string> = {
  // Generic replacements
  "southeast asia": "tropical region",
  "middle east": "arid region",
  "east africa": "rural region",
  "west africa": "developing region",
  "latin america": "urban region",
  "south america": "mountain region",
  default_city: "urban city",
  default_country: "developing nation",
  default_coastal: "coastal city",
  default_mountain: "mountain town",
};

function getGenericLocation(original: string): string {
  const lower = original.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LOCATION_SUBSTITUTES, lower)) {
    return LOCATION_SUBSTITUTES[lower]!;
  }
  // Heuristic: if it ends in common city suffixes, use "urban city"
  return "urban city";
}

// ─── 8. CORE DETECTION LOGIC ─────────────────────────────────────────────────

/**
 * Check if the title is already safely framed with a "concept/illustration" anchor.
 * If yes, it passes compliance regardless of other signals.
 */
function hasSafeContext(title: string): boolean {
  return SAFE_CONTEXT_PATTERNS.some((re) => re.test(title));
}

/**
 * Check if title contains a direct forbidden phrase (always a violation).
 */
function hasForbiddenPhrase(title: string): boolean {
  return FORBIDDEN_PHRASE_PATTERNS.some((re) => re.test(title));
}

/**
 * Check if title contains a temporal/date newsworthy marker.
 */
function hasTemporalMarker(title: string): boolean {
  return TEMPORAL_PATTERNS.some((re) => re.test(title));
}

/**
 * Check if title contains a real location name.
 */
function hasRealLocation(lowerTitle: string): string | null {
  // Sort by length descending so multi-word locations match first
  const sorted = [...REAL_LOCATIONS].sort((a, b) => b.length - a.length);
  for (const loc of sorted) {
    // Whole-word match
    const re = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lowerTitle)) return loc;
  }
  return null;
}

/**
 * Check if title contains a newsworthy event noun.
 */
function hasNewsworthyNoun(lowerTitle: string): string | null {
  for (const noun of NEWSWORTHY_NOUNS) {
    const re = new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lowerTitle)) return noun;
  }
  return null;
}

/**
 * Check if title contains a political role word.
 */
function hasPoliticalRole(lowerTitle: string): boolean {
  return POLITICAL_ROLES.some((role) => {
    const re = new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lowerTitle);
  });
}

// ─── 9. PUBLIC VALIDATOR ──────────────────────────────────────────────────────

export interface ComplianceCheckResult {
  /** true = title violates Adobe Stock newsworthy events policy */
  isViolation: boolean;
  /** Human-readable reason for violation (if any) */
  reason?: string;
  /** Which signals triggered the violation */
  signals: ComplianceSignal[];
}

export type ComplianceSignal =
  | "forbidden_phrase"
  | "location_plus_event"
  | "location_plus_political"
  | "temporal_marker_plus_event"
  | "temporal_marker_plus_political"
  | "political_role_standalone"
  | "breaking_news_marker";

/**
 * Analyze a stock image title and determine if it violates
 * Adobe Stock's "newsworthy events" policy for generative AI.
 *
 * @param title - The raw title string from AI output
 * @returns ComplianceCheckResult with isViolation flag and signals
 */
export function isTitleNewsworthy(title: string): ComplianceCheckResult {
  const signals: ComplianceSignal[] = [];

  // Fast-pass: if already safely framed, it's compliant
  if (hasSafeContext(title)) {
    return { isViolation: false, signals: [] };
  }

  const lower = title.toLowerCase();

  // Check 1: Absolute forbidden phrases
  if (hasForbiddenPhrase(title)) {
    signals.push("forbidden_phrase");
  }

  // Check 2: Breaking news marker (subset of forbidden, but explicit signal)
  if (/\bbreaking\b/i.test(title) || /\blive (news|coverage)\b/i.test(title)) {
    if (!signals.includes("forbidden_phrase")) signals.push("breaking_news_marker");
  }

  const foundLocation = hasRealLocation(lower);
  const foundNoun = hasNewsworthyNoun(lower);
  const foundTemporal = hasTemporalMarker(title);
  const foundPolitical = hasPoliticalRole(lower);

  // Check 3: Location + Event noun (e.g., "Flood in Jakarta", "Tokyo Earthquake")
  if (foundLocation && foundNoun) {
    signals.push("location_plus_event");
  }

  // Check 4: Location + Political role (e.g., "President in Washington speech")
  if (foundLocation && foundPolitical) {
    signals.push("location_plus_political");
  }

  // Check 5: Temporal marker + Event noun (e.g., "Today's Earthquake", "2026 Protest")
  if (foundTemporal && foundNoun) {
    signals.push("temporal_marker_plus_event");
  }

  // Check 6: Temporal marker + Political role (e.g., "2025 Election Rally")
  if (foundTemporal && foundPolitical) {
    signals.push("temporal_marker_plus_political");
  }

  // Check 7: Political role without any framing (e.g., "President Giving Speech")
  // Only flag if it also has a newsworthy noun or temporal marker
  if (foundPolitical && (foundNoun || foundTemporal) && signals.length === 0) {
    signals.push("political_role_standalone");
  }

  const isViolation = signals.length > 0;

  let reason: string | undefined;
  if (isViolation) {
    const parts: string[] = [];
    if (foundLocation) parts.push(`real location: "${foundLocation}"`);
    if (foundNoun) parts.push(`newsworthy noun: "${foundNoun}"`);
    if (foundTemporal) parts.push("temporal/date marker");
    if (foundPolitical) parts.push("political role word");
    reason = `Violation signals: [${signals.join(", ")}]. Detected: ${parts.join(", ")}.`;
  }

  return { isViolation, reason, signals };
}

// ─── 10. AUTO-SANITIZER ───────────────────────────────────────────────────────

/**
 * Strategies applied in order to sanitize a violating title.
 * The first strategy that produces a non-violating title wins.
 */

/** Strip specific year numbers from the title */
function stripYears(title: string): string {
  return title.replace(/\b(20[1-9]\d|19\d{2})\b/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Strip temporal news markers */
function stripTemporalMarkers(title: string): string {
  return title
    .replace(/\b(today|breaking|live coverage|live news|ongoing|currently|recent|recently|now|this week|this month|this year|last week|last month|last year)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Replace real location names with generic equivalents */
function replaceLocations(title: string): string {
  let result = title;
  const lower = title.toLowerCase();

  // Sort by length descending (multi-word first)
  const sorted = [...REAL_LOCATIONS].sort((a, b) => b.length - a.length);
  for (const loc of sorted) {
    const re = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (re.test(result)) {
      const substitute = getGenericLocation(loc);
      result = result.replace(re, substitute);
    }
  }

  // Only log if something actually changed
  if (result.toLowerCase() !== lower) {
    console.info(`[stock-compliance] Location replaced in title: "${title}" → "${result}"`);
  }
  return result;
}

/** Replace political role words with neutral alternatives */
function replacePoliticalRoles(title: string): string {
  return title
    .replace(/\bpresident\b/gi, "business leader")
    .replace(/\bprime minister\b/gi, "community leader")
    .replace(/\bminister\b/gi, "official")
    .replace(/\bsenator\b/gi, "delegate")
    .replace(/\bcongressman\b/gi, "representative")
    .replace(/\bcongresswoman\b/gi, "representative")
    .replace(/\bgovernor\b/gi, "regional leader")
    .replace(/\bsecretary\b/gi, "spokesperson")
    .replace(/\bambassador\b/gi, "envoy")
    .replace(/\bparliament\b/gi, "assembly")
    .replace(/\bchancellor\b/gi, "leader")
    .replace(/\bgeneral\b/gi, "commander")
    .replace(/\badmiral\b/gi, "commander")
    .trim();
}

/** Replace newsworthy event nouns with natural, descriptive equivalents */
function replaceNewsworthyNouns(title: string): string {
  return title
    // Natural disasters → visual/environmental descriptions
    .replace(/\bearthquake(s)?\b/gi, "ground tremor")
    .replace(/\btsunami(s)?\b/gi, "ocean wave surge")
    .replace(/\bflooding\b/gi, "rising water surge")
    .replace(/\bfloods?\b/gi, "rising water")
    .replace(/\bhurricane(s)?\b/gi, "powerful storm")
    .replace(/\btyphoon(s)?\b/gi, "tropical storm")
    .replace(/\bcyclone(s)?\b/gi, "severe storm")
    .replace(/\btornado(es)?\b/gi, "windstorm")
    .replace(/\b(volcanic eruption|eruption)\b/gi, "volcanic activity")
    .replace(/\bwildfire(s)?\b/gi, "fire in the wilderness")
    .replace(/\bbushfire(s)?\b/gi, "fire in the landscape")
    .replace(/\blandslide(s)?\b/gi, "terrain movement")
    .replace(/\bavalanche(s)?\b/gi, "mountain slide")
    .replace(/\bblizzard(s)?\b/gi, "winter storm")
    .replace(/\bdrought(s)?\b/gi, "water scarcity")
    // Human incidents → neutral scene descriptions
    .replace(/\bexplosion(s)?\b/gi, "industrial scene")
    .replace(/\bblast(s)?\b/gi, "dramatic scene")
    .replace(/\bcollapse(s)?\b/gi, "structural failure")
    .replace(/\bwreckage\b/gi, "debris scene")
    .replace(/\bcatastrophe(s)?\b/gi, "challenging situation")
    .replace(/\btragedy\b/gi, "difficult situation")
    .replace(/\bdisaster(s)?\b/gi, "challenging environment")
    // Social unrest → neutral public activity
    .replace(/\bprotests?\b/gi, "public gathering")
    .replace(/\briots?\b/gi, "street scene")
    .replace(/\buprising(s)?\b/gi, "social movement")
    .replace(/\brevolution(s)?\b/gi, "social transformation")
    .replace(/\bcoup\b/gi, "power shift")
    .replace(/\brebellion(s)?\b/gi, "resistance movement")
    .replace(/\bcrackdown(s)?\b/gi, "security operation")
    .replace(/\bclashes?\b/gi, "tense encounter")
    .replace(/\bunrest\b/gi, "social tension")
    .replace(/\bstrike(s)?\b/gi, "labor action")
    .replace(/\bdemonstrations?\b/gi, "organized gathering")
    .replace(/\brally\b/gi, "public event")
    .replace(/\bmarch(es)?\b/gi, "procession")
    // Conflict / war → neutral descriptions
    .replace(/\bworld war\b/gi, "global conflict scenario")
    .replace(/\bcivil war\b/gi, "internal conflict")
    .replace(/\bwar(fare)?\b/gi, "armed scenario")
    .replace(/\bbattle(s)?\b/gi, "confrontation scene")
    .replace(/\binvasion(s)?\b/gi, "military operation")
    .replace(/\bbombing(s)?\b/gi, "aerial operation")
    .replace(/\bairstrike(s)?\b/gi, "aerial operation")
    .replace(/\bsiege(s)?\b/gi, "military encirclement")
    .replace(/\bgunfire\b/gi, "action scene")
    .replace(/\bshooting(s)?\b/gi, "action scene")
    .replace(/\bterrorist?\b/gi, "threat scenario")
    .replace(/\bmassacre(s)?\b/gi, "tragic event")
    .replace(/\bgenocide\b/gi, "historical atrocity")
    .replace(/\bmissile(s)?\b/gi, "aerial device")
    .replace(/\boccupation\b/gi, "military presence")
    // Political events → civic descriptions
    .replace(/\belections?\b/gi, "civic process")
    .replace(/\b(vote|voting)\b/gi, "civic participation")
    .replace(/\bballot(s)?\b/gi, "civic decision")
    .replace(/\breferendum\b/gi, "public vote")
    .replace(/\binauguration\b/gi, "leadership ceremony")
    .replace(/\bimpeachment\b/gi, "political procedure")
    .replace(/\bassassination\b/gi, "security crisis")
    .replace(/\bsanctions?\b/gi, "economic measure")
    .replace(/\btreaty\b/gi, "diplomatic agreement")
    .replace(/\bsummit\b/gi, "international meeting")
    // Breaking news markers → remove
    .replace(/\bbreaking news\b/gi, "")
    .replace(/\bbreaking\b/gi, "")
    .replace(/\blive coverage\b/gi, "")
    .replace(/\blive news\b/gi, "")
    .replace(/\bdeveloping\b/gi, "")
    .replace(/\blatest\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Generate a seeded pseudorandom number [0,1) from a string seed.
 * Used to make anchor selection deterministic per title (same title = same template)
 * while varying naturally across different titles.
 */
function seededRandom(seed: string): number {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep 32-bit unsigned
  }
  return hash / 4294967296; // normalize to [0, 1)
}

/**
 * 20+ natural-sounding anchor templates.
 * Each takes a cleaned base phrase and weaves in a compliance anchor word naturally.
 * Templates are varied in structure: suffix, prefix, mid-sentence.
 */
type AnchorTemplate = (base: string) => string;

const NATURAL_ANCHOR_TEMPLATES: readonly AnchorTemplate[] = [
  // Suffix variants (anchor at end)
  (b) => `${b} concept`,
  (b) => `${b} illustration`,
  (b) => `${b} conceptual design`,
  (b) => `${b} visualization`,
  (b) => `${b} creative concept`,
  (b) => `${b} symbolic scene`,
  (b) => `${b} artistic rendering`,
  (b) => `${b} fictional scenario`,
  (b) => `${b} imaginative scene`,
  (b) => `${b} creative visualization`,
  (b) => `${b} conceptual artwork`,
  (b) => `${b} allegorical scene`,
  (b) => `${b} visual metaphor`,
  (b) => `${b} design concept`,
  // Prefix variants (anchor at start)
  (b) => `conceptual ${b}`,
  (b) => `illustrated ${b}`,
  (b) => `abstract ${b} design`,
  (b) => `symbolic ${b} scene`,
  (b) => `imagined ${b}`,
  (b) => `rendered ${b} scene`,
  (b) => `fictional ${b} scenario`,
  (b) => `artistic ${b} visualization`,
];

/**
 * Apply a randomly selected (but deterministically seeded) anchor template.
 * Uses the original title as seed so the same title always gets the same template.
 */
function applyNaturalAnchor(cleanedBase: string, seedTitle: string): string {
  const rng = seededRandom(seedTitle);
  const index = Math.floor(rng * NATURAL_ANCHOR_TEMPLATES.length);
  const template = NATURAL_ANCHOR_TEMPLATES[index]!;
  return template(cleanedBase);
}

/**
 * Ensure the title starts with a capital letter and ends cleanly.
 */
function cleanupTitle(title: string): string {
  const clean = title
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\-–—:;]+/, "")
    .replace(/[,.\-–—:;]+$/, "")
    .trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Enforce max word count (12 words for Adobe Stock title guidelines).
 */
function enforceWordLimit(title: string, maxWords = 12): string {
  const words = title.split(/\s+/);
  if (words.length <= maxWords) return title;
  return words.slice(0, maxWords).join(" ");
}

/**
 * Auto-sanitize a violating title into an Adobe Stock-compliant title.
 *
 * Strategy (applied in order):
 *  1. Strip years and temporal markers
 *  2. Replace real location names with natural generic equivalents
 *  3. Replace political role words with neutral alternatives
 *  4. Replace newsworthy event nouns with descriptive neutral words
 *  5. Apply a randomly-selected (seeded) natural anchor template
 *  6. If title base is too short/mangled (< 3 words), rebuild from original
 *  7. Enforce 12-word limit and capitalize
 *
 * @param title   - Raw title from AI that failed isTitleNewsworthy()
 * @param signals - Signals from the compliance check (unused here, kept for API compat)
 * @returns A sanitized, policy-compliant title string that sounds natural
 */
export function sanitizeTitle(
  title: string,
  signals: ComplianceSignal[] = []
): string {
  // Suppress unused-variable warning — signals kept in signature for API compat
  void signals;

  let working = title;

  // Step 1: Strip years + temporal markers
  working = stripYears(working);
  working = stripTemporalMarkers(working);

  // Step 2: Replace real locations with natural generic equivalents
  working = replaceLocations(working);

  // Step 3: Replace political roles with neutral alternatives
  working = replacePoliticalRoles(working);

  // Step 4: Replace newsworthy nouns with descriptive neutral words
  working = replaceNewsworthyNouns(working);

  // Step 5: Apply a natural, varied anchor template
  // — only if the base itself doesn't already have a safe anchor
  if (!hasSafeContext(working)) {
    // If base is too short/mangled after all replacements, rebuild from original
    const baseWordCount = working.trim().split(/\s+/).filter(Boolean).length;
    if (baseWordCount < 3) {
      // Rebuild: strip the original more gently (only remove the most egregious parts)
      const rebuilt = replaceNewsworthyNouns(
        replacePoliticalRoles(
          replaceLocations(
            stripTemporalMarkers(stripYears(title))
          )
        )
      );
      working = rebuilt.trim() || title.replace(/[^a-zA-Z\s]/g, "").trim();
    }

    // Apply a natural anchor template seeded by the original title
    working = applyNaturalAnchor(working.toLowerCase(), title);
  }

  // Step 6: Final cleanup and word limit
  working = cleanupTitle(working);
  working = enforceWordLimit(working, 12);

  return working;
}

// ─── 11. COMBINED UTIL ────────────────────────────────────────────────────────

export interface SanitizeResult {
  /** The final, compliant title to use */
  title: string;
  /** Whether the original title was modified */
  wasModified: boolean;
  /** Original title (for logging) */
  originalTitle: string;
  /** Compliance check details */
  compliance: ComplianceCheckResult;
}

/**
 * Combined validate + auto-sanitize pipeline.
 * Use this as the single call-site in API routes.
 *
 * @param rawTitle - Title string from AI output
 * @returns SanitizeResult with the final safe title and audit info
 */
export function validateAndSanitize(rawTitle: string): SanitizeResult {
  const compliance = isTitleNewsworthy(rawTitle);

  if (!compliance.isViolation) {
    return {
      title: rawTitle.trim(),
      wasModified: false,
      originalTitle: rawTitle,
      compliance,
    };
  }

  const sanitized = sanitizeTitle(rawTitle, compliance.signals);

  console.warn(
    `[stock-compliance] ⚠ Title violation detected & auto-fixed:\n` +
    `  Original : "${rawTitle}"\n` +
    `  Sanitized: "${sanitized}"\n` +
    `  Reason   : ${compliance.reason ?? "n/a"}\n` +
    `  Signals  : [${compliance.signals.join(", ")}]`
  );

  return {
    title: sanitized,
    wasModified: true,
    originalTitle: rawTitle,
    compliance,
  };
}

// ─── 12. SHARED PROMPT RULES STRING ──────────────────────────────────────────
/**
 * Inject this constant into every AI system prompt that generates stock titles.
 * This is the Layer 1 guard (prompt engineering).
 * The post-processing validator (Layer 2+) in each route.ts handles the rest.
 *
 * Single source of truth — do NOT copy-paste this into individual route files.
 */
export const COMPLIANCE_TITLE_RULES = `
═══ ADOBE STOCK GENERATIVE AI COMPLIANCE — TITLE RULES (MANDATORY) ═══

CRITICAL POLICY: Adobe Stock prohibits generative AI titles that imply the image
is a real photo or documentation of an actual newsworthy event.

❌ FORBIDDEN title structures — NEVER produce these:
  • [Real City/Country] + [Disaster/Conflict noun]
      e.g., "Earthquake in Tokyo", "Flood in Jakarta", "Fire in London"
  • [Political role] + [Action] + [Location]
      e.g., "President Giving Speech in Washington", "Minister Announces Policy"
  • [Year/Date] + [News event]
      e.g., "2026 Election Rally", "Protest Today in Paris", "Breaking War News"
  • Any "Breaking News", "Live Coverage", "Developing Story" phrasing
  • Titles implying real victims, real casualties, or real documentation

✅ REQUIRED title structure — ALWAYS use one of these framings:
  • "Conceptual illustration of [subject] in [generic setting]"
  • "Abstract visualization of [theme] concept"
  • "[Subject] [action] [generic context] concept illustration"
  • "Business team [action related to theme] symbolic visualization"
  • "Corporate [theme] concept with [generic description]"

✅ SAFE anchor words — your title MUST contain at least ONE of these:
  concept | conceptual | illustration | visualization | abstract |
  fictional | imaginary | symbolic | artistic | creative | rendered |
  design | metaphor | allegorical | generative AI

✅ SAFE location words — use GENERIC locations, never specific cities/countries:
  "urban city" | "coastal region" | "mountain area" | "tropical environment" |
  "modern cityscape" | "developing region" | "industrial zone" | "rural landscape"

Example transformations:
  ❌ "Earthquake Rescue Operations in Tokyo 2026"
  ✅ "Emergency rescue operation concept in urban disaster zone"

  ❌ "World Environment Day Protest in Jakarta"
  ✅ "Corporate sustainability concept for world environment day illustration"

  ❌ "President Addressing Nation After Election"
  ✅ "Business leader presenting vision conceptual illustration"

  ❌ "Breaking News: War Erupts in Eastern Europe"
  ✅ "Abstract visualization of global conflict and peace concept"
`.trim();
