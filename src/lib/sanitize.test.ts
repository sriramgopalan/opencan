import { describe, expect, it } from "vitest";

import { sanitizeMarkdownHtml, stripHtml } from "@/lib/sanitize";

describe("stripHtml", () => {
  it("removes all HTML tags", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("returns plain text unchanged", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });
});

describe("sanitizeMarkdownHtml", () => {
  it("returns SafeHtml branded string", () => {
    const result = sanitizeMarkdownHtml("<p>Hello</p>");
    expect(result).toBe("<p>Hello</p>");
  });

  it("strips disallowed tags like script", () => {
    const result = sanitizeMarkdownHtml('<script>alert("xss")</script><p>Safe</p>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>Safe</p>");
  });

  it("adds rel=noopener to external links", () => {
    const result = sanitizeMarkdownHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("does not add target to internal links", () => {
    const result = sanitizeMarkdownHtml('<a href="/internal">link</a>');
    expect(result).not.toContain("target");
  });

  it("allows code tags with class attribute", () => {
    const result = sanitizeMarkdownHtml('<code class="language-ts">const x = 1;</code>');
    expect(result).toContain('<code class="language-ts">');
  });
});
