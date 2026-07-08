import { createClient, type Client } from "@libsql/client";
import {
  companyDomain,
  emptyFacts,
  type Branding,
  type CompanyFacts,
  type CompanyProfile,
  type Enrichment,
  type Source,
} from "./enrichment";

// Turso / libSQL is the store of record for enrichment. Clerk metadata has a
// small size cap and re-reading a user hits the Clerk API, so the full
// enrichment payload (facts + summary + sources) and the user's saved profile
// live here instead. Three tables:
//
//   enrichment_runs  append-only history, one row per run. Latest row for a
//                    user is that user's "current" enrichment.
//   user_profiles    the profile a user confirmed on onboarding (one per user).
//   company_cache    cross-user cache keyed by domain, so two signups from the
//                    same company don't both pay for a Tabstack extract+research.

// How long a cached company enrichment stays fresh (seconds). Same domain
// signing up again within this window reuses the prior run.
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// A "running" enrichment claim older than this is treated as abandoned (e.g. a
// serverless instance killed mid-run) and may be re-claimed by a redelivery.
const CLAIM_STALE_SECONDS = 5 * 60;

// Cold-start: create the client once and ensure the schema exists. Cached on
// globalThis so Next's dev HMR doesn't open a new connection per reload.
const globalForDb = globalThis as unknown as { __enrichDb?: Promise<Client> };

function getDb(): Promise<Client> {
  if (!globalForDb.__enrichDb) {
    // If init() rejects (e.g. Turso briefly unreachable at cold start), drop the
    // cached rejected promise so the next call retries instead of failing every
    // request for the instance's lifetime.
    globalForDb.__enrichDb = init().catch((err) => {
      globalForDb.__enrichDb = undefined;
      throw err;
    });
  }
  return globalForDb.__enrichDb;
}

async function init(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Point it at your Turso database " +
        "(libsql://…) or a local file (file:local.db).",
    );
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS enrichment_runs (
         id             INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id        TEXT NOT NULL,
         domain         TEXT NOT NULL,
         company_url    TEXT NOT NULL,
         profile_key    TEXT NOT NULL,
         status         TEXT NOT NULL,
         facts          TEXT NOT NULL,
         extra          TEXT NOT NULL,
         branding       TEXT,
         summary        TEXT NOT NULL,
         sources        TEXT NOT NULL,
         summary_pending INTEGER NOT NULL DEFAULT 0,
         error          TEXT,
         enriched_at    TEXT,
         created_at     INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
      `CREATE INDEX IF NOT EXISTS idx_runs_user
         ON enrichment_runs (user_id, id DESC)`,
      `CREATE TABLE IF NOT EXISTS user_profiles (
         user_id     TEXT PRIMARY KEY,
         profile_key TEXT NOT NULL,
         facts       TEXT NOT NULL,
         extra       TEXT NOT NULL,
         summary     TEXT NOT NULL,
         updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
      `CREATE TABLE IF NOT EXISTS company_cache (
         domain      TEXT PRIMARY KEY,
         profile_key TEXT NOT NULL,
         facts       TEXT NOT NULL,
         extra       TEXT NOT NULL,
         branding    TEXT,
         summary     TEXT NOT NULL,
         sources     TEXT NOT NULL,
         fetched_at  INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
      // Per-user enrichment claim, so overlapping Svix deliveries don't both run
      // the (costly) enrichment. state: running | done | failed.
      `CREATE TABLE IF NOT EXISTS enrichment_locks (
         user_id    TEXT PRIMARY KEY,
         state      TEXT NOT NULL,
         updated_at INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
    ],
    "write",
  );

  // Idempotent migrations so an existing local.db (created before branding /
  // two-phase enrichment) picks up the new columns without a manual reset.
  await ensureColumn(client, "enrichment_runs", "branding", "TEXT");
  await ensureColumn(
    client,
    "enrichment_runs",
    "summary_pending",
    "INTEGER NOT NULL DEFAULT 0",
  );
  await ensureColumn(client, "company_cache", "branding", "TEXT");

  return client;
}

// Add a column only if it's missing (SQLite has no ADD COLUMN IF NOT EXISTS).
async function ensureColumn(
  client: Client,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

// --- (de)serialization -----------------------------------------------------

const json = (v: unknown): string => JSON.stringify(v);
function parse<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

// --- enrichment runs (history + current snapshot) --------------------------

// Append one run for a user. This is the write that replaced the Clerk
// publicMetadata.enrichment write — history accumulates instead of overwriting.
export async function recordEnrichment(
  userId: string,
  e: Enrichment,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO enrichment_runs
            (user_id, domain, company_url, profile_key, status,
             facts, extra, branding, summary, sources, summary_pending,
             error, enriched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      companyDomain(e.companyUrl),
      e.companyUrl,
      e.profileKey,
      e.status,
      json(e.facts),
      json(e.extra),
      e.branding ? json(e.branding) : null,
      e.summary,
      json(e.sources),
      e.summaryPending ? 1 : 0,
      e.error ?? null,
      e.enrichedAt ?? null,
    ],
  });
}

// The user's most recent run — replaces reading publicMetadata.enrichment.
export async function latestEnrichment(
  userId: string,
): Promise<Enrichment | null> {
  const db = await getDb();
  const { rows } = await db.execute({
    sql: `SELECT * FROM enrichment_runs
          WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    args: [userId],
  });
  return rows[0] ? rowToEnrichment(rows[0]) : null;
}

function rowToEnrichment(row: Record<string, unknown>): Enrichment {
  return {
    status: row.status as Enrichment["status"],
    companyUrl: (row.company_url as string) ?? "",
    profileKey: (row.profile_key as string) ?? "",
    facts: parse<CompanyFacts>(row.facts, emptyFacts()),
    extra: parse<Record<string, unknown>>(row.extra, {}),
    branding: parse<Branding | undefined>(row.branding, undefined),
    summary: (row.summary as string) ?? "",
    sources: parse<Source[]>(row.sources, []),
    summaryPending: Number(row.summary_pending) === 1,
    enrichedAt: (row.enriched_at as string) ?? undefined,
    error: (row.error as string) ?? undefined,
  };
}

// --- cross-user company cache ----------------------------------------------

// A prior COMPLETE, ready enrichment for this cache key, within the TTL, or null.
// The caller supplies the key: a domain for company profiles, or the full URL
// for person profiles (so github.com/alice and github.com/bob don't collide).
// When `profileKey` is given (explicit override / app config), the cached row
// must match it. Only complete results are ever cached, so the returned
// enrichment is always final (summaryPending: false).
export async function getCachedCompany(
  cacheKey: string,
  profileKey?: string,
): Promise<Enrichment | null> {
  const db = await getDb();
  const { rows } = await db.execute({
    sql: `SELECT * FROM company_cache
          WHERE domain = ? AND fetched_at > unixepoch() - ?`,
    args: [cacheKey, CACHE_TTL_SECONDS],
  });
  const row = rows[0];
  if (!row) return null;
  if (profileKey && row.profile_key !== profileKey) return null;
  // Reuse rowToEnrichment so the row->object parsing lives in one place.
  return {
    ...rowToEnrichment(row),
    status: "ready",
    summaryPending: false,
    enrichedAt: undefined,
  };
}

// Upsert a fresh, complete enrichment into the cache under the given key.
export async function cacheCompany(
  cacheKey: string,
  e: Enrichment,
): Promise<void> {
  if (e.status !== "ready") return;
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO company_cache
            (domain, profile_key, facts, extra, branding, summary, sources, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(domain) DO UPDATE SET
            profile_key = excluded.profile_key,
            facts       = excluded.facts,
            extra       = excluded.extra,
            branding    = excluded.branding,
            summary     = excluded.summary,
            sources     = excluded.sources,
            fetched_at  = excluded.fetched_at`,
    args: [
      cacheKey,
      e.profileKey,
      json(e.facts),
      json(e.extra),
      e.branding ? json(e.branding) : null,
      e.summary,
      json(e.sources),
    ],
  });
}

// --- enrichment claim (idempotency + concurrency) --------------------------

// Atomically claim the right to enrich this user. Returns true if we won the
// claim. A single conditional upsert avoids the check-then-write race: two
// overlapping Svix deliveries can't both win, and a stale/failed prior claim is
// re-claimable so a dropped run (or a genuine failure) can still retry. A
// completed ('done') claim is never re-claimed, so retries are idempotent.
export async function claimEnrichment(userId: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.execute({
    sql: `INSERT INTO enrichment_locks (user_id, state, updated_at)
          VALUES (?, 'running', unixepoch())
          ON CONFLICT(user_id) DO UPDATE SET
            state = 'running', updated_at = unixepoch()
          WHERE enrichment_locks.state = 'failed'
             OR (enrichment_locks.state = 'running'
                 AND unixepoch() - enrichment_locks.updated_at > ?)
          RETURNING user_id`,
    args: [userId, CLAIM_STALE_SECONDS],
  });
  return rows.length > 0;
}

// Mark a claim finished. `ok=false` leaves it re-claimable for a retry.
export async function finishEnrichment(
  userId: string,
  ok: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE enrichment_locks SET state = ?, updated_at = unixepoch()
          WHERE user_id = ?`,
    args: [ok ? "done" : "failed", userId],
  });
}

// --- user profile (confirmed onboarding data) ------------------------------

export async function getUserProfile(
  userId: string,
): Promise<CompanyProfile | null> {
  const db = await getDb();
  const { rows } = await db.execute({
    sql: `SELECT * FROM user_profiles WHERE user_id = ?`,
    args: [userId],
  });
  const row = rows[0];
  if (!row) return null;
  return {
    profileKey: row.profile_key as string,
    facts: parse<CompanyFacts>(row.facts, emptyFacts()),
    extra: parse<Record<string, unknown>>(row.extra, {}),
    summary: (row.summary as string) ?? "",
  };
}

export async function saveUserProfile(
  userId: string,
  p: CompanyProfile,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO user_profiles
            (user_id, profile_key, facts, extra, summary, updated_at)
          VALUES (?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(user_id) DO UPDATE SET
            profile_key = excluded.profile_key,
            facts       = excluded.facts,
            extra       = excluded.extra,
            summary     = excluded.summary,
            updated_at  = excluded.updated_at`,
    args: [userId, p.profileKey, json(p.facts), json(p.extra), p.summary],
  });
}
