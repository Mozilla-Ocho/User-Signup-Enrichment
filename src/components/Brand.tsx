import Link from "next/link";

// Flat spark mark — sibling to Tabstack's bar mark, but our own shape.
// Solid ink tile with an accent spark (single accent, no gradients).
export function SparkMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[10px] bg-ink text-accent ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-1/2 w-1/2"
        aria-hidden="true"
      >
        <path
          d="M12 2.5c.4 3.6 1.9 5.1 5.5 5.5-3.6.4-5.1 1.9-5.5 5.5-.4-3.6-1.9-5.1-5.5-5.5 3.6-.4 5.1-1.9 5.5-5.5Z"
          fill="currentColor"
        />
        <path
          d="M18.5 13.5c.2 1.8.9 2.5 2.7 2.7-1.8.2-2.5.9-2.7 2.7-.2-1.8-.9-2.5-2.7-2.7 1.8-.2 2.5-.9 2.7-2.7Z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <SparkMark className="h-8 w-8 transition-transform group-hover:scale-105" />
      <span className="display text-xl tracking-tight text-ink">
        signup<span className="text-accent-strong">/</span>enrichment
      </span>
    </Link>
  );
}
