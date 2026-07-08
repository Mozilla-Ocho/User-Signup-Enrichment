import type { CompanyFacts, SchemaProperty } from "./schema";

export interface ProfileContext {
  url: string;
  companyName: string | null;
  /**
   * Public Gravatar profile URL derived from the signup email, when available.
   * Person-oriented profiles (e.g. `developer`) can point research at it for
   * bio, location, and verified social accounts.
   */
  gravatarUrl?: string | null;
}

/**
 * An enrichment profile tailors how we fetch enrichment for a category of
 * company. Each profile lives in its own file under ./profiles so it can be
 * expanded and iterated on in isolation. Add a new one, register it in
 * ./registry, and the classifier can pick it automatically.
 */
export interface EnrichmentProfile {
  /** Stable registry key, e.g. "devtools". Stored on the enrichment result. */
  key: string;
  /** Human label for UI. */
  label: string;
  /** One-line hint shown to the classifier to help it choose this profile. */
  classifierHint: string;
  /**
   * Whether the auto-classifier may select this profile. Defaults to true.
   * Set false for profiles that only make sense as an explicit choice — e.g.
   * `developer`, which describes a person and would wrongly swallow companies.
   */
  autoClassify?: boolean;
  /**
   * Marks a profile that describes a PERSON rather than a company. Drives
   * behavior that must not be keyed on a specific profile name: the cross-user
   * cache keys per-URL instead of per-domain (so two people on github.com don't
   * collide), and a Gravatar photo can back-fill the branding logo.
   */
  person?: boolean;
  /**
   * Which shared base facts (company-oriented: companyName, tagline, etc.) this
   * profile uses. Defaults to all of them. Set to `[]` for a profile that
   * describes something other than a company (e.g. a developer).
   */
  baseFields?: (keyof CompanyFacts)[];
  /**
   * Extra JSON-schema properties merged into the (selected) base facts schema
   * for this category's extract.json call. Also drives the extra fields
   * rendered on the onboarding form.
   */
  extraFacts?: Record<string, SchemaProperty>;
  /** Builds the agent.research query for this category. */
  researchQuery: (ctx: ProfileContext) => string;
}
