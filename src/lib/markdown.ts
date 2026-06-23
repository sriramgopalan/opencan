import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "em", "del", "code", "pre",
  "ul", "ol", "li",
  "blockquote",
  "a",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  code: ["class"],
  pre: ["class"],
};

export async function renderMarkdown(markdown: string): Promise<string> {
  const html = await marked.parse(markdown, { async: false });
  return sanitizeHtml(html as string, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Force external links to open in new tab safely
          ...(attribs.href?.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        },
      }),
    },
  });
}
