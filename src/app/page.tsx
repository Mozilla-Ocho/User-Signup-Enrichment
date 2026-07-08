import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { SparkMark, Wordmark } from "@/components/Brand";

const FLOW = [
  {
    slug: "/signup",
    desc: "An email and a company URL. No 20-field form.",
    meta: "step 01",
  },
  {
    slug: "/webhook",
    desc: "Clerk emits user.created the moment you join.",
    meta: "step 02",
  },
  {
    slug: "/enrich",
    desc: "Tabstack extracts structured facts and researches a cited summary.",
    meta: "step 03",
  },
  {
    slug: "/prefill",
    desc: "Onboarding loads already filled in — you fix what's wrong.",
    meta: "step 04",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-4">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-ink-80 transition-colors hover:text-ink sm:inline"
            >
              Sign in
            </Link>
            <Link href="/sign-up" className="btn btn-ink px-4 text-sm">
              Get started
            </Link>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-14 py-20">
        <div className="flex max-w-3xl flex-col gap-6 animate-fade-up">
          <span className="eyebrow eyebrow-accent">Clerk × Tabstack template</span>

          <h1 className="display text-6xl text-ink sm:text-[5.5rem]">
            Onboarding that arrives{" "}
            <span className="marker">already filled in</span>.
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-ink-70">
            Sign up with an email and a company URL. We research it in the
            background and hand you an onboarding form that&apos;s prefilled
            instead of blank — correct anything wrong and you&apos;re done.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Show when="signed-out">
              <Link
                href="/sign-up"
                className="btn btn-primary px-7 py-3.5 text-base"
              >
                Get started free
              </Link>
              <Link
                href="/sign-in"
                className="btn btn-secondary px-6 py-3.5 text-base"
              >
                Sign in
              </Link>
            </Show>
            <Show when="signed-in">
              <Link
                href="/onboarding"
                className="btn btn-primary px-7 py-3.5 text-base"
              >
                Go to onboarding
                <span aria-hidden>→</span>
              </Link>
            </Show>
          </div>
        </div>

        <div className="flex flex-col animate-fade-up" style={{ animationDelay: "120ms" }}>
          <span className="eyebrow mb-4">How it works</span>
          <ul className="border-t border-hairline">
            {FLOW.map((row) => (
              <li
                key={row.slug}
                className="group flex items-baseline gap-5 border-b border-hairline py-5 transition-colors hover:bg-surface-muted"
              >
                <span className="slug w-32 shrink-0 text-2xl text-ink">
                  <span className="text-accent-strong">{row.slug[0]}</span>
                  {row.slug.slice(1)}
                </span>
                <span className="flex-1 text-ink-70">{row.desc}</span>
                <span className="eyebrow hidden sm:block">{row.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="flex items-center gap-2 border-t border-hairline py-6 text-xs text-muted">
        <SparkMark className="h-5 w-5" />
        <span>
          A Tabstack template. Clerk auth, Turso store, automate for a fuller stack.
        </span>
      </footer>
    </main>
  );
}
