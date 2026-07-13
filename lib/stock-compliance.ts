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

/** Replace newsworthy event nouns with softer equivalents */
function replaceNewsworthyNouns(title: string): string {
  return title
    // Disasters → generic "emergency"
    .replace(/\b(earthquake|tsunami|flood(ing|s)?|hurricane|typhoon|cyclone|tornado|eruption|wildfire|bushfire|landslide|avalanche|blizzard)\b/gi, "emergency event")
    .replace(/\b(explosion|blast|collapse|wreckage|catastrophe|tragedy)\b/gi, "crisis event")
    // Conflict → generic "conflict"
    .replace(/\b(war|battle|invasion|bombing|airstrike|siege|gunfire|shooting|terror(ist)?|massacre|genocide)\b/gi, "conflict")
    .replace(/\b(missile|warfare|occupation)\b/gi, "crisis")
    // Social unrest → generic "social movement"
    .replace(/\b(protest(s)?|riot(s)?|uprising|revolution|coup|strike|rebellion|crackdown|clash(es)?|unrest)\b/gi, "social movement")
    .replace(/\b(demonstration(s)?|rally|march)\b/gi, "gathering")
    // Political events → generic
    .replace(/\b(election(s)?|vote|voting|ballot|referendum|inauguration|impeachment|assassination|sanction(s)?)\b/gi, "civic event")
    .replace(/\b(summit)\b/gi, "conference")
    // Breaking news → remove
    .replace(/\b(breaking|breaking news|live coverage|live news|developing|update(s)?|latest|coverage)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Pick an appropriate conceptual prefix based on the content signals.
 */
function pickPrefix(signals: ComplianceSignal[]): string {
  if (signals.includes("location_plus_event") || signals.includes("temporal_marker_plus_event")) {
    return "Conceptual illustration of";
  }
  if (signals.includes("location_plus_political") || signals.includes("temporal_marker_plus_political")) {
    return "Corporate visualization of";
  }
  if (signals.includes("forbidden_phrase") || signals.includes("breaking_news_marker")) {
    return "Abstract concept of";
  }
  return "Conceptual illustration of";
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
 *  2. Replace real location names with generic equivalents
 *  3. Replace political role words with neutral words
 *  4. Replace newsworthy event nouns with softer equivalents
 *  5. If still violating, prepend a "Conceptual illustration of" prefix
 *  6. If the base title is too mangled (< 3 words), use a safe fallback prefix
 *  7. Enforce 12-word limit and capitalize
 *
 * @param title - Raw title from AI that failed isTitleNewsworthy()
 * @param signals - Signals from the compliance check (to pick best prefix)
 * @returns A sanitized, policy-compliant title string
 */
export function sanitizeTitle(
  title: string,
  signals: ComplianceSignal[] = []
): string {
  let working = title;

  // Step 1: Strip years + temporal markers
  working = stripYears(working);
  working = stripTemporalMarkers(working);

  // Step 2: Replace real locations
  working = replaceLocations(working);

  // Step 3: Replace political roles
  working = replacePoliticalRoles(working);

  // Step 4: Replace newsworthy nouns
  working = replaceNewsworthyNouns(working);

  // Step 5: If still violating after all replacements, prepend conceptual prefix
  const recheck = isTitleNewsworthy(working);
  if (recheck.isViolation) {
    const prefix = pickPrefix(signals);
    working = `${prefix} ${working.toLowerCase()}`;
  }

  // Step 6: If title is too short/mangled after stripping, use prefix + cleaned version
  const wordCount = working.trim().split(/\s+/).length;
  if (wordCount < 3) {
    const prefix = pickPrefix(signals);
    // Use a stripped-down version of the original
    const stripped = replaceNewsworthyNouns(replaceLocations(stripYears(title)));
    working = `${prefix} ${stripped.toLowerCase()}`;
  }

  // Step 7: Final cleanup
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
