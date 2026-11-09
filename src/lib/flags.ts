// ADR-005: every in-progress feature is gated here until it ships; the flag and
// all of its guards are deleted once the feature is stable. Add a flag like:
//
//   MY_FEATURE: {
//     description: "What the feature does",
//     defaultValue: false,
//     owner: "sriramgopalan",
//     trackingIssue: "gap-8-my-feature",
//   },
//
// and gate server-side with `isEnabled("MY_FEATURE")`. Override per deployment
// with FEATURE_MY_FEATURE=true|false.

interface FlagDefinition {
  readonly description: string;
  readonly defaultValue: boolean;
  readonly owner: string;
  readonly trackingIssue: string;
}

const flags = {} as const satisfies Record<string, FlagDefinition>;

type FeatureFlag = keyof typeof flags;

/** Resolves a flag: FEATURE_<name> env override ("true"/"false") wins, else the default. */
export function evaluateFlag(name: string, defaultValue: boolean): boolean {
  const override = process.env[`FEATURE_${name}`];
  if (override === "true") return true;
  if (override === "false") return false;
  return defaultValue;
}

export function isEnabled(flag: FeatureFlag): boolean {
  const definition: FlagDefinition = flags[flag];
  return evaluateFlag(flag, definition.defaultValue);
}
