import type { EnrichmentProfile } from "./types";
import { generic } from "./profiles/generic";
import { devtools } from "./profiles/devtools";
import { saas } from "./profiles/saas";
import { developer } from "./profiles/developer";

// Central registry. Add a profile file under ./profiles, import it here, and
// it becomes available to the classifier and the onboarding form automatically.
export const PROFILES: Record<string, EnrichmentProfile> = {
  [generic.key]: generic,
  [devtools.key]: devtools,
  [saas.key]: saas,
  [developer.key]: developer,
};

export const DEFAULT_PROFILE_KEY = generic.key;

export function getProfile(key?: string | null): EnrichmentProfile {
  return (key && PROFILES[key]) || PROFILES[DEFAULT_PROFILE_KEY];
}

export function profileKeys(): string[] {
  return Object.keys(PROFILES);
}

export function profileList(): EnrichmentProfile[] {
  return Object.values(PROFILES);
}

// Profiles the auto-classifier is allowed to pick (excludes explicit-only ones
// like `developer`). The default profile is always included as a safety net.
export function autoClassifyProfiles(): EnrichmentProfile[] {
  return profileList().filter(
    (p) => p.autoClassify !== false || p.key === DEFAULT_PROFILE_KEY,
  );
}

/**
 * App-wide profile override. Set `ENRICHMENT_PROFILE` to a profile key (e.g.
 * "devtools") to force every signup to use that profile and skip auto-
 * classification. Leave it unset or "auto" to classify each company. This is
 * the common single-market deployment case.
 */
export function appProfileKey(): string | undefined {
  const v = process.env.ENRICHMENT_PROFILE?.trim();
  if (!v || v.toLowerCase() === "auto") return undefined;
  if (PROFILES[v]) return v;
  console.warn(
    `ENRICHMENT_PROFILE="${v}" is not a known profile; ignoring. Known: ${profileKeys().join(", ")}`,
  );
  return undefined;
}
