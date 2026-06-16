import sanitizeHtml from "sanitize-html";

export function stripHtml(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}
