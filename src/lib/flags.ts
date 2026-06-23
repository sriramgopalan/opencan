interface FlagDefinition {
  readonly description: string;
  readonly defaultValue: boolean;
  readonly owner: string;
  readonly trackingIssue: string;
}

const flags = {
  ROADMAP_PAGE: {
    description: "Public /roadmap page showing cross-board posts grouped by lifecycle status",
    defaultValue: true,
    owner: "sriramgopalan",
    trackingIssue: "gap-1-roadmap",
  },
} as const satisfies Record<string, FlagDefinition>;

type FeatureFlag = keyof typeof flags;

export function isEnabled(flag: FeatureFlag): boolean {
  const override = process.env[`FEATURE_${flag}`];
  if (override === "true") return true;
  if (override === "false") return false;
  return flags[flag].defaultValue;
}
