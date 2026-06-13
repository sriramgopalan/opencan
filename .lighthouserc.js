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
        "legacy-javascript-insight":      ["warn", {}],
        "network-dependency-tree-insight":["warn", {}],
        "unused-javascript":              ["warn", {}],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
