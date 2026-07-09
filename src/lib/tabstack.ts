import Tabstack from "@tabstack/sdk";
import {
  BASE_FACT_KEYS,
  buildFactsSchema,
  normalizeBranding,
  normalizeFacts,
  normalizeUrl,
  pickExtras,
  type Branding,
  type CompanyFacts,
  type Enrichment,
  type Source,
} from "./enrichment/schema";
import type { EnrichmentProfile } from "./enrichment/types";
import { classifyProfile } from "./enrichment/classify";
import { appProfileKey, getProfile } from "./enrichment/registry";
import { gravatarAvatarUrl, gravatarProfileUrl } from "./gravatar";

// Lazily instantiated so importing this module (e.g. during `next build`'s
// page-data collection) doesn't require TABSTACK_API_KEY to be set — it's
// only needed once a request actually calls into Tabstack.
let client: Tabstack | undefined;
function getClient(): Tabstack {
  if (!client) {
    // Reads TABSTACK_API_KEY from the environment automatically.
    client = new Tabstack();
  }
  return client;
}

const nowIso = () => new Date().toISOString();

// Pull structured facts (base + the profile's extras) straight off the page.
async function extractFacts(
  url: string,
  profile: EnrichmentProfile,
): Promise<{ facts: CompanyFacts; extra: Record<string, unknown> }> {
  const result = (await getClient().extract.json({
    url,
    json_schema: buildFactsSchema(profile.extraFacts, profile.baseFields),
    effort: "standard",
  })) as Record<string, unknown>;

  return {
    facts: normalizeFacts(result),
    extra: pickExtras(result, profile.extraFacts),
  };
}

// (#1) Cheap branding pass: Open Graph / HTML metadata off the same page gives
// us the logo, site name and description for free. `min` effort keeps it fast
// so it can run in parallel with the facts extract without adding latency.
async function fetchBranding(url: string): Promise<Branding> {
  try {
    const res = await getClient().extract.markdown({
      url,
      metadata: true,
      effort: "min",
    });
    return normalizeBranding(res.metadata as Record<string, unknown> | undefined);
  } catch (err) {
    console.error("branding fetch failed, continuing without it:", err);
    return { logoUrl: null, siteName: null, description: null };
  }
}

// (#2) Gap-fill: extract.json only returns what's literally on the page, so
// fields like industry / employeeRange / foundedYear are often null. generate.json
// *infers* the still-missing fields from the page content, filling more of the
// form. Runs only when something is actually missing (saves a call otherwise).
async function fillGaps(
  url: string,
  profile: EnrichmentProfile,
  facts: CompanyFacts,
  extra: Record<string, unknown>,
): Promise<{ facts: CompanyFacts; extra: Record<string, unknown> }> {
  const baseKeys = profile.baseFields ?? BASE_FACT_KEYS;
  const isMissing = (v: unknown) =>
    v === null || v === undefined || (Array.isArray(v) && v.length === 0);

  // Never re-ask for companyName (required) — only genuinely empty fields.
  const missingBase = baseKeys.filter(
    (k) => k !== "companyName" && isMissing(facts[k]),
  );
  const missingExtra = Object.keys(profile.extraFacts ?? {}).filter((k) =>
    isMissing(extra[k]),
  );
  if (missingBase.length === 0 && missingExtra.length === 0) {
    return { facts, extra };
  }

  const extraSubset: NonNullable<EnrichmentProfile["extraFacts"]> = {};
  for (const k of missingExtra) extraSubset[k] = profile.extraFacts![k];

  try {
    const gen = (await getClient().generate.json({
      url,
      json_schema: buildFactsSchema(extraSubset, missingBase),
      instructions:
        "Infer accurate values for these fields about this company from the " +
        "page content and reasonable, well-supported inference. Normalize " +
        "employee counts to a range like '11-50'. Use null only when a value " +
        "genuinely cannot be determined — do not invent specifics.",
      effort: "standard",
    })) as Record<string, unknown>;

    const genFacts = normalizeFacts(gen);
    const mergedFacts: CompanyFacts = { ...facts };
    const mergedRecord = mergedFacts as unknown as Record<string, unknown>;
    for (const k of missingBase) {
      // Each key maps to its own field type; the runtime value is correct.
      if (!isMissing(genFacts[k])) mergedRecord[k] = genFacts[k];
    }

    const genExtra = pickExtras(gen, extraSubset);
    const mergedExtra = { ...extra };
    for (const k of missingExtra) {
      if (genExtra[k] !== undefined) mergedExtra[k] = genExtra[k];
    }

    return { facts: mergedFacts, extra: mergedExtra };
  } catch (err) {
    console.error("gap-fill (generate.json) failed, using extract only:", err);
    return { facts, extra };
  }
}

// Run autonomous research using the profile's category-specific prompt.
async function researchCompany(
  url: string,
  name: string | null,
  profile: EnrichmentProfile,
  mode: "fast" | "balanced",
  gravatarUrl: string | null,
): Promise<{ summary: string; sources: Source[] }> {
  const stream = await getClient().agent.research({
    query: profile.researchQuery({ url, companyName: name, gravatarUrl }),
    mode,
    // Cap per-page fetches so one slow source can't stall the whole summary.
    fetch_timeout: 20,
  });

  for await (const event of stream) {
    if (event.event === "error") {
      throw new Error(event.data.error.message);
    }
    if (event.event === "complete") {
      const cited = event.data.metadata.citedPages ?? [];
      return {
        summary: event.data.report,
        sources: cited.map((p) => ({ title: p.title ?? p.url, url: p.url })),
      };
    }
  }
  throw new Error("research stream ended without a complete event");
}

// (#3) Phase 1 — fast first paint. Classify, extract facts + branding in
// parallel, then gap-fill. Returns a "ready" enrichment with facts + logo but
// no summary yet (summaryPending: true). Fast enough to beat the onboarding
// poll window so the form fills in immediately instead of spinning.
export async function enrichFast(
  rawUrl: string,
  opts?: { profileKey?: string; email?: string },
): Promise<Enrichment> {
  const companyUrl = normalizeUrl(rawUrl);

  // Precedence: explicit per-call override -> app-wide config -> auto-classify.
  const profileKey =
    opts?.profileKey ??
    appProfileKey() ??
    (await classifyProfile(getClient(), companyUrl));
  const profile = getProfile(profileKey);

  const [{ facts, extra }, branding] = await Promise.all([
    extractFacts(companyUrl, profile),
    fetchBranding(companyUrl),
  ]);

  // For a person profile, fall back to their Gravatar photo when the page has
  // no Open Graph image — a person's avatar is their "logo".
  if (profile.person && opts?.email && !branding.logoUrl) {
    branding.logoUrl = gravatarAvatarUrl(opts.email);
  }

  const filled = await fillGaps(companyUrl, profile, facts, extra);

  return {
    status: "ready",
    companyUrl,
    profileKey: profile.key,
    facts: filled.facts,
    extra: filled.extra,
    branding,
    summary: "",
    sources: [],
    summaryPending: true,
    enrichedAt: nowIso(),
  };
}

// (#3) Phase 2 — deep pass. Researches a cited summary (balanced mode: higher
// quality than the old fast mode) and folds it into the fast result. Runs in
// the background after phase 1 has already been shown to the user.
export async function enrichSummary(
  fast: Enrichment,
  opts?: { email?: string },
): Promise<Enrichment> {
  const profile = getProfile(fast.profileKey);
  const gravatarUrl =
    profile.person && opts?.email ? gravatarProfileUrl(opts.email) : null;
  // "fast" mode keeps the background summary to ~1min instead of the 2-3min
  // balanced pass — the summary is non-blocking, so speed beats depth here.
  const { summary, sources } = await researchCompany(
    fast.companyUrl,
    fast.facts.companyName,
    profile,
    "fast",
    gravatarUrl,
  );
  return {
    ...fast,
    summary,
    sources,
    summaryPending: false,
    enrichedAt: nowIso(),
  };
}
