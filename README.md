# signup-enrichment

Signup enrichment with **Clerk** + **Tabstack** + **Turso**. A user signs up
with just an email and a company URL. A Clerk `user.created` webhook fires;
Tabstack `extract.json` pulls structured facts and `agent.research` writes a
short cited summary from that URL; the result is stored in Turso. The onboarding
form then shows up **prefilled** instead of blank, and the user corrects
anything wrong.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- [Clerk](https://clerk.com) — auth + webhook (+ a tiny `onboardingComplete` flag)
- [Tabstack](https://tabstack.ai) — `extract.json` (facts) + `agent.research` (summary)
- [Turso](https://turso.tech) — libSQL store of record: enrichment **history**,
  the confirmed **profile**, and a cross-user company **cache**

## Why Turso (not Clerk metadata)

Clerk `publicMetadata` has a small size cap and every read hits the Clerk API.
The full enrichment payload (facts + summary + sources) can outgrow it, and the
onboarding form polls for status. So Turso is the store of record and Clerk
keeps only auth + a small `onboardingComplete` flag. Three tables (`src/lib/db.ts`):

- **`enrichment_runs`** — append-only, one row per run. The latest row for a user
  is their current enrichment, so history accumulates instead of overwriting.
- **`user_profiles`** — the profile a user confirmed on onboarding (one per user).
- **`company_cache`** — keyed by domain, TTL 30d. Two signups from the same
  company reuse one enrichment instead of both paying for extract + research.

## Flow

```
sign-up (email → company URL)
   ├─ work email  → URL derived from the email domain (no URL field shown)
   ├─ personal email (gmail, etc.) → user is asked for the URL
   └─ companyUrl stored in Clerk unsafeMetadata
Clerk  user.created  webhook  ──▶  /api/webhooks/clerk
   ├─ records enrichment_run { status: "pending" }    (fast, returns 200)
   └─ after():
        ├─ company_cache hit for the domain?  → reuse it (skip Tabstack)
        └─ miss → enrichCompany(url)
             ├─ tabstack.extract.json  → structured facts
             ├─ tabstack.agent.research → summary + sources
             └─ upsert company_cache
        └─ records enrichment_run { status: "ready", ... } in Turso
/onboarding
   ├─ polls /api/enrichment/status while pending (reads latest run from Turso)
   ├─ prefills the form from the latest enrichment_run
   └─ Save → user_profiles (corrected) + Clerk onboardingComplete flag
```

## Setup

1. Install deps:

   ```bash
   pnpm install
   ```

2. Copy env and fill in keys:

   ```bash
   cp .env.local.example .env.local
   ```

   - **Clerk**: create an app, copy the publishable + secret keys.
     Enable **Email verification code** sign-up (Email address, no password) so
     the passwordless flow in `src/app/sign-up` works.
   - **Tabstack**: get an API key from [console.tabstack.ai](https://console.tabstack.ai).
   - **Turso**: `turso db create signup-enrichment`, then set
     `TURSO_DATABASE_URL` (`turso db show --url signup-enrichment`) and
     `TURSO_AUTH_TOKEN` (`turso db tokens create signup-enrichment`). For local
     dev you can skip Turso entirely and use a file: `TURSO_DATABASE_URL=file:local.db`.
     Tables are created automatically on first use.

3. **Clerk webhook**: in the Clerk Dashboard → **Webhooks**, add an endpoint at
   `https://<your-host>/api/webhooks/clerk`, subscribe to **`user.created`**, and
   copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

   For local dev, expose your server (e.g. `ngrok http 3000`) and point the
   webhook at the tunnel URL.

4. Run:

   ```bash
   pnpm dev
   ```

## Key files

| Path | Role |
| --- | --- |
| `src/app/sign-up/[[...sign-up]]/page.tsx` | Custom passwordless sign-up (email + company URL) |
| `src/app/api/webhooks/clerk/route.ts` | Verifies webhook, runs enrichment in `after()` |
| `src/lib/tabstack.ts` | `enrichCompany()` — extract facts + research summary |
| `src/lib/db.ts` | Turso client + schema + runs / profile / cache queries |
| `src/lib/enrichment/schema.ts` | Data model + extract JSON schema |
| `src/app/onboarding/` | Prefilled form + status polling |
| `src/app/actions.ts` | `saveProfile()` server action |

## Enrichment profiles (configurable prompts + schema)

How we fetch enrichment is configurable per company category. Each profile
lives in its own file under `src/lib/enrichment/profiles/` and defines:

- **`extraFacts`** — category-specific JSON-schema fields merged into the base
  `extract.json` schema (and rendered automatically on the onboarding form).
- **`researchQuery`** — the `agent.research` prompt template for that category.
- **`classifierHint`** — one line telling the classifier when to pick it.

```
src/lib/enrichment/
├── schema.ts              # base facts + schema builder + normalizers
├── types.ts               # EnrichmentProfile interface
├── registry.ts            # collects profiles, getProfile(), DEFAULT_PROFILE_KEY
├── classify.ts            # auto-selects a profile for a URL (cheap extract)
└── profiles/
    ├── generic.ts         # fallback
    ├── devtools.ts        # SDKs, languages, apiType, hasOpenSource, pricingModel
    ├── saas.ts            # targetMarket, pricingTiers, integrations, useCase
    └── developer.ts       # PERSON profile — languages, frameworks, projects, seniority
```

Most profiles enrich a **company** (base facts + extras). A profile can also
enrich something else entirely: `developer` sets `baseFields: []` (opting out of
the company base facts) and describes a **person** from their GitHub / personal
URL — for a devtool or SaaS whose signups are individual developers. Set
`ENRICHMENT_PROFILE=developer` to enrich every signup as a developer.

The `developer` profile also uses the signup email's **Gravatar** (`src/lib/gravatar.ts`):
the avatar becomes the onboarding logo when the page has no Open Graph image, and
the public Gravatar profile URL is handed to `agent.research` as an extra source
(bio, location, verified GitHub/X/LinkedIn accounts).

### Choosing the profile

Which profile a signup uses is resolved with this precedence:

1. **Per-user override** — `unsafeMetadata.enrichmentProfile` set at signup.
2. **App-wide config** — `ENRICHMENT_PROFILE` env var (e.g. `devtools`). Set
   this for a single-market app so every signup uses one profile and skips
   classification. Leave it `auto` (or unset) to classify per company.
3. **Auto-classify** — a cheap `extract.json` (`effort: min`) picks the best-fit
   profile from the registry.

Then `extract.json` uses that profile's schema and `agent.research` uses its
prompt. The chosen `profileKey` and `extra` fields are stored on the enrichment
and drive the onboarding form.

**Add a category:** create `profiles/<key>.ts`, export an `EnrichmentProfile`,
register it in `registry.ts`. The classifier, extractor, and form pick it up
with no other changes.

Verified live: `vercel.com` → `devtools` (SDKs, languages, OSS), `notion.so`
→ `saas` (target market, integrations, free trial).

## The fuller version (later)

Turso already gives you append-only history, a confirmed-profile table, and a
cross-user cache. Natural next steps from here:

- **Tabstack `automate`** on a schedule to refresh each company and append a new
  `enrichment_runs` row — the history table is built for exactly this.
- **Diff view** on onboarding: compare the newest run against the user's saved
  `user_profiles` row to highlight what changed since they last confirmed.
- **Cache warming / analytics**: query `enrichment_runs` for profile mix,
  failure rate, and time-to-ready; pre-warm `company_cache` for known domains.
