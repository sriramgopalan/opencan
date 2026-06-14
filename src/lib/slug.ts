const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "dashboard",
  "settings",
  "admin",
  "roadmap",
  "changelog",
  "feedback",
  "public",
  "health",
  "robots",
  "sitemap",
  "static",
  "assets",
]);

const SLUG_REGEX = /^[a-z][a-z0-9-]*$/;
const SLUG_MIN = 3;
const SLUG_MAX = 50;

export function isSlugReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function isSlugFormatValid(slug: string): boolean {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return false;
  if (slug.endsWith("-")) return false;
  if (slug.includes("--")) return false;
  return SLUG_REGEX.test(slug);
}

export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX) || "board";
}

const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";
// Not cryptographically random — acceptable for slug
// collision-avoidance only. Never use for tokens or secrets.
export function generateRandomSuffix(length = 4): string {
  return Array.from({ length }, () =>
    CHARSET[Math.floor(Math.random() * CHARSET.length)],
  ).join("");
}
