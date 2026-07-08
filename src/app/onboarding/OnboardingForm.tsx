"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveProfile } from "../actions";
import {
  BASE_FACT_KEYS,
  getProfile,
  normalizeFacts,
  type CompanyProfile,
  type Enrichment,
  type SchemaProperty,
} from "@/lib/enrichment";
import { Field, FormError, Select, SubmitButton, TextArea } from "@/components/form";

interface Props {
  initialEnrichment: Enrichment | null;
  savedProfile: CompanyProfile | null;
  email: string;
}

interface FormState {
  companyName: string;
  tagline: string;
  industry: string;
  products: string; // newline-separated in the input
  hqLocation: string;
  employeeRange: string;
  foundedYear: string;
  summary: string;
}

const BLANK: FormState = {
  companyName: "",
  tagline: "",
  industry: "",
  products: "",
  hqLocation: "",
  employeeRange: "",
  foundedYear: "",
  summary: "",
};

// Poll cadence + cap: every 2s, up to ~5min (150 × 2s). Facts appear in the
// first few seconds (phase 1); polling then continues only to fold in the
// background summary (phase 2). The cap is non-blocking — the form is already
// usable — and still frees a user stuck behind a misconfigured webhook.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;

const BOOL_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

// --- extra-field (profile-specific) schema helpers ---
const asTypes = (p: SchemaProperty): string[] =>
  Array.isArray(p.type) ? p.type : [p.type];
const isArrayField = (p: SchemaProperty) => !!p.items || asTypes(p).includes("array");
const isBoolField = (p: SchemaProperty) => asTypes(p).includes("boolean");
const isNumberField = (p: SchemaProperty) => asTypes(p).includes("number");

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

// Split/join list values on newlines (not commas — values can contain commas).
const splitList = (v: string): string[] =>
  v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

// Raw stored value -> editable string form value.
function toFormValue(prop: SchemaProperty, v: unknown): string {
  if (isBoolField(prop)) return v === true ? "true" : v === false ? "false" : "";
  if (isArrayField(prop)) return Array.isArray(v) ? v.join("\n") : "";
  return v == null ? "" : String(v);
}

// Editable form value -> value to persist (or undefined to omit / leave unknown).
function toStoredValue(prop: SchemaProperty, v: string): unknown {
  if (isBoolField(prop)) return v === "true" ? true : v === "false" ? false : undefined;
  if (isArrayField(prop)) {
    const arr = splitList(v);
    return arr.length ? arr : undefined;
  }
  const s = v.trim();
  if (!s) return undefined;
  if (isNumberField(prop)) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return s;
}

export default function OnboardingForm({
  initialEnrichment,
  savedProfile,
  email,
}: Props) {
  const [enrichment, setEnrichment] = useState(initialEnrichment);
  const [form, setForm] = useState<FormState>(BLANK);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const initializedRef = useRef(false);
  // Set once the user edits the summary, so a late background summary (phase 2)
  // never clobbers what they typed.
  const summaryTouchedRef = useRef(false);

  // Which profile shaped this enrichment; drives the extra fields shown.
  const profileKey = savedProfile?.profileKey ?? enrichment?.profileKey;
  const profile = useMemo(() => getProfile(profileKey), [profileKey]);
  const extraFacts = useMemo(() => profile.extraFacts ?? {}, [profile]);
  const branding = enrichment?.branding;

  // Data is "ready" (show the form) once the user has a saved profile,
  // enrichment finished its fast facts pass (ready or failed), or we gave up.
  const ready =
    savedProfile !== null ||
    enrichment?.status === "ready" ||
    enrichment?.status === "failed" ||
    gaveUp;

  // Facts are shown but the background summary (phase 2) is still cooking.
  const awaitingSummary =
    !savedProfile &&
    !gaveUp &&
    enrichment?.status === "ready" &&
    enrichment?.summaryPending === true;

  // Poll the status endpoint while enrichment is still running: before facts
  // arrive (pending) and afterwards while the summary is still pending.
  useEffect(() => {
    if (ready && !awaitingSummary) return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_POLLS) {
        clearInterval(id);
        if (!cancelled) setGaveUp(true);
        return;
      }
      try {
        const res = await fetch("/api/enrichment/status", { cache: "no-store" });
        if (!res.ok) return;
        const data: { enrichment: Enrichment | null } = await res.json();
        if (cancelled || !data.enrichment) return;
        setEnrichment(data.enrichment);
        // Fold in the background summary (phase 2) once it lands, unless the
        // user has already started editing it.
        const incoming = data.enrichment.summary;
        if (incoming && !summaryTouchedRef.current) {
          setForm((f) => (f.summary === incoming ? f : { ...f, summary: incoming }));
        }
      } catch {
        // transient; keep polling
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready, awaitingSummary]);

  // Count up while the background summary is still being researched, so the
  // waiting state shows visible progress instead of feeling stuck.
  const [researchElapsed, setResearchElapsed] = useState(0);
  useEffect(() => {
    if (!awaitingSummary) return;
    const id = setInterval(() => setResearchElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [awaitingSummary]);

  // Prefill the form once, as soon as data is ready.
  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;
    const facts = savedProfile?.facts ?? enrichment?.facts;
    const summary = savedProfile?.summary ?? enrichment?.summary ?? "";
    setForm({
      companyName: facts?.companyName ?? "",
      tagline: facts?.tagline ?? "",
      industry: facts?.industry ?? "",
      products: (facts?.products ?? []).join("\n"),
      hqLocation: facts?.hqLocation ?? "",
      employeeRange: facts?.employeeRange ?? "",
      foundedYear: facts?.foundedYear ? String(facts.foundedYear) : "",
      summary,
    });

    const rawExtra = savedProfile?.extra ?? enrichment?.extra ?? {};
    const nextExtra: Record<string, string> = {};
    for (const [key, prop] of Object.entries(extraFacts)) {
      nextExtra[key] = toFormValue(prop, rawExtra[key]);
    }
    setExtra(nextExtra);
  }, [ready, savedProfile, enrichment, extraFacts]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const storedExtra: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(extraFacts)) {
        const val = toStoredValue(prop, extra[key] ?? "");
        if (val !== undefined) storedExtra[key] = val;
      }

      const profileData: CompanyProfile = {
        profileKey: profile.key,
        // Reuse the canonical normalizer so form-saved facts are normalized the
        // same way as Tabstack-extracted facts (no divergent trim/parse rules).
        facts: normalizeFacts({
          companyName: form.companyName,
          tagline: form.tagline,
          industry: form.industry,
          products: splitList(form.products),
          hqLocation: form.hqLocation,
          employeeRange: form.employeeRange,
          foundedYear: parseInt(form.foundedYear, 10),
        }),
        extra: storedExtra,
        summary: form.summary.trim(),
      };
      await saveProfile(profileData);
      setSaved(true);
    } catch (err) {
      console.error("saveProfile failed:", err);
      setSaveError(
        "We couldn't save your profile. Please try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <EnrichingCard />;
  if (saved)
    return (
      <SavedCard
        onEdit={() => setSaved(false)}
        continueHref={
          process.env.NEXT_PUBLIC_POST_ONBOARDING_URL || "/"
        }
      />
    );

  const set = (k: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setEx = (k: string) => (v: string) =>
    setExtra((e) => ({ ...e, [k]: v }));
  // Editing the summary pins it — a late background summary won't overwrite it.
  const setSummary = (v: string) => {
    summaryTouchedRef.current = true;
    setForm((f) => ({ ...f, summary: v }));
  };

  const extraEntries = Object.entries(extraFacts);

  // Which company base fields this profile uses (a person profile uses none).
  const baseKeys = new Set<string>(profile.baseFields ?? BASE_FACT_KEYS);
  const showBase = (k: string) => baseKeys.has(k);
  const showGrid = ["industry", "hqLocation", "employeeRange", "foundedYear"].some(
    showBase,
  );

  // Only nudge to manual entry when we truly have nothing prefilled: a hard
  // failure, or a timeout that hit before facts arrived. A summary-only
  // (phase-2) timeout leaves status "ready" with facts filled in — don't nag.
  const showFailureNote =
    !savedProfile &&
    (enrichment?.status === "failed" ||
      (gaveUp && enrichment?.status !== "ready"));

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        Your profile details are ready. Review and correct them below.
      </p>
      {branding && (branding.logoUrl || branding.siteName) && (
        <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-muted/50 p-3">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="flex min-w-0 flex-col">
            {branding.siteName && (
              <span className="truncate font-medium text-ink">
                {branding.siteName}
              </span>
            )}
            {branding.description && (
              <span className="truncate text-xs text-ink-70">
                {branding.description}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="chip chip-soft">
          <span aria-hidden>✦</span> {profile.label}
        </span>
        <span className="text-xs text-muted">
          enrichment profile{profileKey ? "" : " (default)"}
        </span>
      </div>

      {showFailureNote && (
        <FormError>
          {gaveUp && enrichment?.status !== "failed"
            ? "Enrichment is taking longer than expected. Fill it in manually below — we'll keep what you enter."
            : `We couldn't auto-fill from your URL${
                enrichment?.error ? ` (${enrichment.error})` : ""
              }. Fill it in manually below.`}
        </FormError>
      )}

      <Field label="Email" value={email} onChange={() => {}} disabled />
      {showBase("companyName") && (
        <Field
          label="Company name"
          value={form.companyName}
          onChange={set("companyName")}
        />
      )}
      {showBase("tagline") && (
        <Field label="Tagline" value={form.tagline} onChange={set("tagline")} />
      )}
      {showGrid && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {showBase("industry") && (
            <Field
              label="Industry"
              value={form.industry}
              onChange={set("industry")}
            />
          )}
          {showBase("hqLocation") && (
            <Field
              label="HQ location"
              value={form.hqLocation}
              onChange={set("hqLocation")}
            />
          )}
          {showBase("employeeRange") && (
            <Field
              label="Employees"
              value={form.employeeRange}
              onChange={set("employeeRange")}
              placeholder="e.g. 11-50"
            />
          )}
          {showBase("foundedYear") && (
            <Field
              label="Founded"
              value={form.foundedYear}
              onChange={set("foundedYear")}
              type="number"
              placeholder="e.g. 2019"
            />
          )}
        </div>
      )}
      {showBase("products") && (
        <TextArea
          label="Products / services"
          value={form.products}
          onChange={set("products")}
          rows={3}
          hint="One per line"
        />
      )}

      {extraEntries.length > 0 && (
        <fieldset className="flex flex-col gap-5 rounded-xl border border-hairline bg-surface-muted/50 p-4">
          <legend className="flex items-center gap-1 px-1 eyebrow eyebrow-accent">
            {profile.label} details
          </legend>
          {extraEntries.map(([key, prop]) => {
            const label = humanize(key);
            if (isBoolField(prop)) {
              return (
                <Select
                  key={key}
                  label={label}
                  hint={prop.description}
                  value={extra[key] ?? ""}
                  onChange={setEx(key)}
                  options={BOOL_OPTIONS}
                />
              );
            }
            if (isArrayField(prop)) {
              return (
                <TextArea
                  key={key}
                  label={label}
                  hint={prop.description}
                  value={extra[key] ?? ""}
                  onChange={setEx(key)}
                  rows={3}
                  placeholder="One per line"
                />
              );
            }
            return (
              <Field
                key={key}
                label={label}
                hint={prop.description}
                value={extra[key] ?? ""}
                onChange={setEx(key)}
              />
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        {awaitingSummary && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-xs text-ink-70"
          >
            <span aria-hidden className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span>
              Researching a cited summary… {researchElapsed}s. It&apos;ll drop in
              here — you can edit or save now.
            </span>
          </div>
        )}
        <TextArea
          label="Summary"
          value={form.summary}
          onChange={setSummary}
          rows={5}
        />
      </div>

      {enrichment?.sources && enrichment.sources.length > 0 && (
        <Sources sources={enrichment.sources} />
      )}

      {saveError && <FormError>{saveError}</FormError>}

      <SubmitButton disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </SubmitButton>
    </form>
  );
}

function EnrichingCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-6 py-8 text-center"
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-accent/40"
        />
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-lg text-accent"
        >
          ✦
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow eyebrow-accent">Enriching</span>
        <p className="display text-xl text-ink">Researching your profile…</p>
        <p className="text-sm text-ink-70">
          Classifying, extracting facts, and writing a summary from your URL.
        </p>
      </div>
      <div aria-hidden className="flex w-full max-w-sm flex-col gap-3">
        {[100, 72, 88].map((w, i) => (
          <div
            key={i}
            className="shimmer h-9 rounded-lg bg-surface-muted"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function SavedCard({
  onEdit,
  continueHref,
}: {
  onEdit: () => void;
  continueHref: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 py-10 text-center animate-fade-up"
    >
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-ink"
      >
        ✓
      </div>
      <span className="eyebrow eyebrow-accent">Done</span>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="display text-2xl text-ink outline-none"
      >
        Profile saved
      </h2>
      <p className="max-w-xs text-sm text-ink-70">
        Your profile is stored on your Clerk account. You&apos;re all set.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <a href={continueHref} className="btn btn-primary px-6 py-3 text-sm">
          Continue
        </a>
        <button
          type="button"
          onClick={onEdit}
          className="btn btn-secondary px-6 py-3 text-sm"
        >
          Edit profile
        </button>
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-muted px-4 py-3">
      <span className="eyebrow">Sources</span>
      <ul className="flex flex-col gap-1">
        {sources.map((s, i) => (
          <li key={i}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent-strong underline-offset-2 hover:underline"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
