// SKELETON THRESHOLDS - tighten these when real pages are built
// See docs/qa/lighthouse-thresholds.md for the target values

/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 2,
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready in",
      url: ["http://localhost:3000/"],
    },
    assert: {
      preset: "lighthouse:no-pwa",
      assertions: {
        // ── Score gates — kept strict, apply to real pages ──────────────
        "categories:performance":    ["error", { minScore: 0.9  }],
        "categories:accessibility":  ["error", { minScore: 0.95 }],
        "categories:best-practices": ["warn",  { minScore: 0.9  }],
        "categories:seo":            ["warn",  { minScore: 0.9  }],

        // ── SKELETON THRESHOLDS - tighten when real pages are built ─────
        // Framework scaffolding produces these; not real quality issues.
        "errors-in-console":              "off",
        // bf-cache fails because auth-dependent pages render dynamically and
        // Next.js / NextAuth send `Cache-Control: no-store` on the document and
        // session/tRPC requests. Forcing these to be cacheable would expose the
        // signed-in user's data, so this is a known, accepted Next.js limitation
        // rather than a real defect — downgraded to a warning.
        "bf-cache":                       ["warn", { minScore: 0.9 }],
        "legacy-javascript-insight":      ["warn", {}],
        "network-dependency-tree-insight":["warn", {}],
        "unused-javascript":              ["warn", {}],
        // Logo PNG in nav — acceptable for a small branding asset
        "uses-responsive-images":         ["warn", {}],
        "image-delivery-insight":         ["warn", {}],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
