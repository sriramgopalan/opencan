import { marked } from "marked";

import type { SafeHtml } from "@/lib/sanitize";
import { sanitizeMarkdownHtml } from "@/lib/sanitize";

export function renderMarkdown(markdown: string): SafeHtml {
  const html = marked.parse(markdown, { async: false }) as string;
  return sanitizeMarkdownHtml(html);
}
