// Base data model for signup enrichment. Category-specific extras are layered
// on top of this by enrichment profiles (see ./profiles).

export interface CompanyFacts {
  companyName: string | null;
  tagline: string | null;
  industry: string | null;
  products: string[];
  hqLocation: string | null;
  employeeRange: string | null;
  foundedYear: number | null;
}

export interface Source {
  title: string;
  url: string;
}

// Visual/brand facts pulled cheaply from Open Graph / HTML metadata (Tabstack
// extract.markdown), so onboarding can show the company's real logo + name
// instead of a blank form. Display-only — not edited or persisted to the
// confirmed profile.
export interface Branding {
  logoUrl: string | null;
  siteName: string | null;
  description: string | null;
}

export type EnrichmentStatus = "pending" | "ready" | "failed";

export interface Enrichment {
  status: EnrichmentStatus;
  companyUrl: string;
  /** Which enrichment profile was used (registry key). */
  profileKey: string;
  facts: CompanyFacts;
  /** Profile-specific extra facts, keyed by the profile's extraFacts schema. */
  extra: Record<string, unknown>;
  /** Brand metadata (logo, site name) for the onboarding header. */
  branding?: Branding;
  summary: string;
  sources: Source[];
  /**
   * True on a fast first-paint run whose facts are ready but whose summary is
   * still being researched in the background (two-phase enrichment). The
   * onboarding form shows facts immediately and keeps polling for the summary.
   */
  summaryPending?: boolean;
  enrichedAt?: string;
  error?: string;
}

// What the user confirms/corrects on the onboarding form.
export interface CompanyProfile {
  profileKey: string;
  facts: CompanyFacts;
  extra: Record<string, unknown>;
  summary: string;
}

// A loose JSON-schema property definition used inside profiles.
export interface SchemaProperty {
  type: string | string[];
  items?: { type: string };
  enum?: string[];
  description?: string;
}

// Base facts every profile extracts. `description` fields steer the extractor;
// only companyName is required so partial pages still succeed.
export const BASE_FACTS_PROPERTIES: Record<string, SchemaProperty> = {
  companyName: {
    type: ["string", "null"],
    description: "Official company or product name",
  },
  tagline: {
    type: ["string", "null"],
    description: "Short tagline or one-line value proposition",
  },
  industry: {
    type: ["string", "null"],
    description: "Primary industry or market category",
  },
  products: {
    type: "array",
    items: { type: "string" },
    description: "Main products or services the company offers",
  },
  hqLocation: {
    type: ["string", "null"],
    description: "Headquarters location as 'City, Country'",
  },
  employeeRange: {
    type: ["string", "null"],
    description: "Approximate employee count or range, e.g. '11-50'",
  },
  foundedYear: {
    type: ["number", "null"],
    description: "Four-digit year the company was founded",
  },
};

export const BASE_FACT_KEYS = Object.keys(
  BASE_FACTS_PROPERTIES,
) as (keyof CompanyFacts)[];

// Build the extract.json schema for a profile: selected base facts + its extra
// facts. Pass `baseFields` to include only some base fields (e.g. [] for a
// person-centric profile that doesn't describe a company at all).
export function buildFactsSchema(
  extraFacts?: Record<string, SchemaProperty>,
  baseFields?: (keyof CompanyFacts)[],
) {
  const keys = baseFields ?? BASE_FACT_KEYS;
  const baseProps: Record<string, SchemaProperty> = {};
  for (const k of keys) baseProps[k] = BASE_FACTS_PROPERTIES[k];

  return {
    type: "object" as const,
    properties: { ...baseProps, ...(extraFacts ?? {}) },
    required: keys.includes("companyName") ? ["companyName"] : [],
  };
}

export function emptyFacts(): CompanyFacts {
  return {
    companyName: null,
    tagline: null,
    industry: null,
    products: [],
    hqLocation: null,
    employeeRange: null,
    foundedYear: null,
  };
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const strArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim())
    : [];

// Pull just the base fields out of a raw extract result.
export function normalizeFacts(raw: Record<string, unknown>): CompanyFacts {
  return {
    companyName: str(raw.companyName),
    tagline: str(raw.tagline),
    industry: str(raw.industry),
    products: strArr(raw.products),
    hqLocation: str(raw.hqLocation),
    employeeRange: str(raw.employeeRange),
    foundedYear: num(raw.foundedYear),
  };
}

// Build Branding from an extract.markdown metadata object (Open Graph / HTML).
export function normalizeBranding(
  meta: Record<string, unknown> | undefined,
): Branding {
  return {
    logoUrl: str(meta?.image),
    siteName: str(meta?.site_name),
    description: str(meta?.description),
  };
}

// Pull the profile-specific extra fields out of a raw extract result.
export function pickExtras(
  raw: Record<string, unknown>,
  extraFacts?: Record<string, SchemaProperty>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!extraFacts) return out;
  for (const key of Object.keys(extraFacts)) {
    const v = raw[key];
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) {
      out[key] = v;
    }
  }
  return out;
}

// Accept "acme.com" or "https://acme.com" — extract.json needs a full URL.
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Registrable-ish domain for a URL, used as the cross-user cache key so
// "acme.com", "https://acme.com/pricing" and "www.acme.com" all collapse to one
// entry. Best-effort: falls back to the lowercased input on a parse failure.
export function companyDomain(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}
