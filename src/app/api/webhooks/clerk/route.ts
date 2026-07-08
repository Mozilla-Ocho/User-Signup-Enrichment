import { after, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { enrichFast, enrichSummary } from "@/lib/tabstack";
import {
  appProfileKey,
  companyDomain,
  DEFAULT_PROFILE_KEY,
  emptyFacts,
  getProfile,
  normalizeUrl,
  type Enrichment,
} from "@/lib/enrichment";
import {
  cacheCompany,
  claimEnrichment,
  finishEnrichment,
  getCachedCompany,
  recordEnrichment,
} from "@/lib/db";

// Clerk -> user.created -> enrich the company URL -> store in Turso.
//
// We respond 200 fast and do the slow enrichment (classify + extract + research
// can take ~a minute) in `after()`, after the response is sent, so Svix doesn't
// time out and retry. Each run is appended to enrichment_runs (history); the
// latest row is the user's current enrichment.
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type !== "user.created") {
    return new Response("Ignored", { status: 200 });
  }

  const userId = evt.data.id;
  // Signup email — used to derive a Gravatar photo + profile for person
  // (developer) enrichment. Prefer the primary address.
  const emails = evt.data.email_addresses ?? [];
  const email =
    emails.find((e) => e.id === evt.data.primary_email_address_id)
      ?.email_address ??
    emails[0]?.email_address ??
    undefined;
  const meta = evt.data.unsafe_metadata as
    | { companyUrl?: string; enrichmentProfile?: string }
    | undefined;
  const rawUrl =
    typeof meta?.companyUrl === "string" ? meta.companyUrl.trim() : "";
  // Optional explicit profile override; otherwise the profile is auto-classified.
  const profileOverride =
    typeof meta?.enrichmentProfile === "string" ? meta.enrichmentProfile : undefined;
  // Explicit profile intent (undefined = auto-classify); used to match the
  // cache. plannedProfile fills in the default for the pending/failed badge.
  const explicitProfile = profileOverride ?? appProfileKey();
  const plannedProfile = explicitProfile ?? DEFAULT_PROFILE_KEY;

  // Atomic idempotency + concurrency guard: exactly one delivery enriches a
  // given user. A completed claim blocks retries; a failed or abandoned
  // (stale) claim can be re-claimed. On a DB error we 500 so Svix retries.
  let claimed: boolean;
  try {
    claimed = await claimEnrichment(userId);
  } catch (err) {
    console.error("enrichment claim failed:", err);
    return new Response("Claim error", { status: 500 });
  }
  if (!claimed) {
    return new Response("Already processing", { status: 200 });
  }

  if (!rawUrl) {
    await recordEnrichment(
      userId,
      failedRun(DEFAULT_PROFILE_KEY, "", "No company URL provided at signup"),
    );
    await finishEnrichment(userId, false);
    return new Response("No company URL", { status: 200 });
  }

  const companyUrl = normalizeUrl(rawUrl);
  // Person profiles key the cache per-URL so two people on a shared host
  // (github.com/alice vs /bob) don't collide; companies key per-domain.
  const isPerson = explicitProfile
    ? getProfile(explicitProfile).person === true
    : false;
  const cacheKey = isPerson ? companyUrl : companyDomain(companyUrl);

  // Mark pending immediately so the onboarding form can show a loading state.
  await recordEnrichment(userId, pendingRun(companyUrl, plannedProfile));

  after(async () => {
    try {
      // Cross-user cache: reuse a recent, complete run for the same key
      // instead of paying for another extract + research.
      const cached = await getCachedCompany(cacheKey, explicitProfile);
      if (cached) {
        await recordEnrichment(userId, cached);
        await finishEnrichment(userId, true);
        return;
      }

      // Two-phase (#3): write facts + branding fast so the onboarding form
      // fills in immediately, then research the summary in the background and
      // append an upgraded run.
      const fast = await enrichFast(companyUrl, {
        profileKey: profileOverride,
        email,
      });
      await recordEnrichment(userId, fast);

      try {
        const deep = await enrichSummary(fast, { email });
        await recordEnrichment(userId, deep);
        // Only complete results are cached, so a cache hit is always final.
        await cacheCompany(cacheKey, deep);
      } catch (err) {
        console.error("summary research (phase 2) failed:", err);
        // Facts were delivered — just clear the pending flag. Don't cache a
        // summary-less result, so a later same-key signup retries the summary.
        await recordEnrichment(userId, { ...fast, summaryPending: false });
      }
      await finishEnrichment(userId, true);
    } catch (err) {
      console.error("enrichment failed:", err);
      await recordEnrichment(
        userId,
        failedRun(
          plannedProfile,
          companyUrl,
          err instanceof Error ? err.message : "Enrichment failed",
        ),
      );
      await finishEnrichment(userId, false);
    }
  });

  return new Response("Enrichment started", { status: 200 });
}

// Small builders for the repeated Enrichment payloads (pending / failed).
function pendingRun(companyUrl: string, profileKey: string): Enrichment {
  return {
    status: "pending",
    companyUrl,
    profileKey,
    facts: emptyFacts(),
    extra: {},
    summary: "",
    sources: [],
  };
}

function failedRun(
  profileKey: string,
  companyUrl: string,
  error: string,
): Enrichment {
  return {
    status: "failed",
    companyUrl,
    profileKey,
    facts: emptyFacts(),
    extra: {},
    summary: "",
    sources: [],
    error,
  };
}
