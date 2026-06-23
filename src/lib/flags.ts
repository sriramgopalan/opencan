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
  STATUS_NOTIFICATIONS: {
    description: "Email the post author when an admin changes its status",
    defaultValue: true,
    owner: "sriramgopalan",
    trackingIssue: "gap-2-notifications",
  },
  MY_POSTS: {
    description: "Authenticated users can view all posts they have submitted via /my-posts",
    defaultValue: true,
    owner: "sriramgopalan",
    trackingIssue: "gap-3-my-posts",
  },
  POST_SEARCH: {
    description: "Search input on board pages to filter posts by title",
    defaultValue: true,
    owner: "sriramgopalan",
    trackingIssue: "gap-4-post-search",
  },
} as const satisfies Record<string, FlagDefinition>;

type FeatureFlag = keyof typeof flags;

export function isEnabled(flag: FeatureFlag): boolean {
  const override = process.env[`FEATURE_${flag}`];
  if (override === "true") return true;
  if (override === "false") return false;
  return flags[flag].defaultValue;
}
