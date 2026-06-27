/**
 * Input sanitization and validation utilities.
 * Protects against injection attacks: SQL, XSS, command injection, path traversal.
 * No external dependencies — uses built-in JS/TS capabilities.
 */

/** Top 20 most commonly used (and therefore weak) passwords */
export const COMMON_PASSWORDS: string[] = [
  "123456",
  "password",
  "123456789",
  "12345678",
  "12345",
  "1234567",
  "1234567890",
  "qwerty",
  "abc123",
  "111111",
  "password1",
  "iloveyou",
  "admin",
  "letmein",
  "welcome",
  "monkey",
  "dragon",
  "master",
  "sunshine",
  "princess",
];

/**
 * Strip null bytes, ASCII control characters, and normalize unicode.
 * @param input - Raw string input
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength = 10_000): string {
  if (typeof input !== "string") return "";
  let result = input
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove ASCII control characters except tab, newline, carriage return
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Normalize unicode (NFC form)
    .normalize("NFC")
    .trim();

  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }
  return result;
}

/**
 * Validate and normalize an email address.
 * @param email - Raw email string
 * @returns Lowercased, trimmed email or null if invalid
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase().normalize("NFC");
  // RFC 5322 simplified pattern
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normalized)) return null;
  if (normalized.length > 254) return null;
  return normalized;
}

/**
 * Validate and sanitize a username.
 * Only alphanumeric characters and underscores allowed, 3–32 characters.
 * @param username - Raw username string
 * @returns Sanitized username or null if invalid
 */
export function sanitizeUsername(username: string): string | null {
  if (typeof username !== "string") return null;
  const trimmed = username.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;
  if (!usernameRegex.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate password strength and check against common password list.
 * @param password - Raw password string
 * @returns Object with `valid` flag and list of issues
 */
export function sanitizePassword(
  password: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (typeof password !== "string" || password.length === 0) {
    return { valid: false, issues: ["Password is required"] };
  }
  if (password.length < 8) {
    issues.push("Password must be at least 8 characters long");
  }
  if (password.length > 128) {
    issues.push("Password must not exceed 128 characters");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("Password must contain at least one digit");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("Password must contain at least one special character");
  }
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    issues.push("Password is too common — please choose a more unique password");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Strip all HTML tags and script content from a string.
 * @param html - Raw HTML string
 * @returns Plain text with all tags removed
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string") return "";
  return html
    // Remove script blocks entirely (including content)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    // Remove style blocks
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

/**
 * Detect potential SQL injection patterns in a string.
 * @param input - String to check
 * @returns true if SQL injection patterns are detected
 */
export function detectSqlInjection(input: string): boolean {
  if (typeof input !== "string") return false;
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|GRANT|REVOKE)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\bOR\b\s+[\w'"`]+\s*=\s*[\w'"`]+)/i,
    /(\bAND\b\s+[\w'"`]+\s*=\s*[\w'"`]+)/i,
    /'\s*(OR|AND)\s*'/i,
    /;\s*(DROP|DELETE|INSERT|UPDATE|EXEC)/i,
    /WAITFOR\s+DELAY/i,
    /BENCHMARK\s*\(/i,
    /SLEEP\s*\(/i,
    /xp_cmdshell/i,
    /INTO\s+(OUTFILE|DUMPFILE)/i,
    /LOAD_FILE\s*\(/i,
  ];
  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential XSS (Cross-Site Scripting) patterns in a string.
 * @param input - String to check
 * @returns true if XSS patterns are detected
 */
export function detectXss(input: string): boolean {
  if (typeof input !== "string") return false;
  const xssPatterns = [
    /<script[\s>]/i,
    /<\/script>/i,
    /javascript\s*:/i,
    /vbscript\s*:/i,
    /on\w+\s*=/i, // onerror=, onclick=, etc.
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<link/i,
    /<meta/i,
    /data\s*:\s*text\/html/i,
    /expression\s*\(/i,
    /-moz-binding/i,
    /&#\d+;/,
    /&#x[0-9a-f]+;/i,
    /\x00/,
  ];
  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect command injection patterns (shell metacharacters).
 * @param input - String to check
 * @returns true if command injection patterns are detected
 */
export function detectCommandInjection(input: string): boolean {
  if (typeof input !== "string") return false;
  const cmdPatterns = [
    /[;&|`$(){}[\]<>]/,
    /\$\(/,
    /`[^`]*`/,
    /\|\|/,
    /&&/,
    /\bncat\b/i,
    /\bnetcat\b/i,
    /\bwget\b/i,
    /\bcurl\b/i,
    /\bbash\b/i,
    /\bsh\b/i,
    /\bpowershell\b/i,
    /\bcmd\.exe\b/i,
    /%0a/i, // URL-encoded newline
    /%0d/i, // URL-encoded carriage return
  ];
  return cmdPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect path traversal patterns.
 * @param input - String to check
 * @returns true if path traversal patterns are detected
 */
export function detectPathTraversal(input: string): boolean {
  if (typeof input !== "string") return false;
  const pathPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /\.\.%2F/i,
    /\.\.%5C/i,
    /%2E%2E%2F/i,
    /%2E%2E\//i,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /\/proc\/self/i,
    /\/windows\/system32/i,
    /\.\.[/\\]/,
  ];
  return pathPatterns.some((pattern) => pattern.test(input));
}

/**
 * Recursively sanitize all string values in an object.
 * Handles nested objects and arrays up to the specified depth.
 * @param obj - Object to sanitize
 * @param maxDepth - Maximum recursion depth (default: 10)
 * @returns Sanitized copy of the object
 */
export function sanitizeObject<T>(obj: T, maxDepth = 10): T {
  return sanitizeValue(obj, maxDepth, 0) as T;
}

function sanitizeValue(value: unknown, maxDepth: number, currentDepth: number): unknown {
  if (currentDepth >= maxDepth) return value;

  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, maxDepth, currentDepth + 1));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeValue(v, maxDepth, currentDepth + 1);
    }
    return result;
  }
  return value;
}
