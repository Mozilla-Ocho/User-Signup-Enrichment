import { createHash } from "node:crypto";

// Gravatar keys everything off a hash of the lowercased, trimmed email.
// Current spec uses SHA-256 (MD5 still works for legacy). Server-only — imported
// by the webhook and the Tabstack enrichment lib, never by client code.
function gravatarHash(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

// Avatar image URL. `d=404` so a missing avatar 404s (the onboarding <img>
// hides itself on error) instead of returning a generic silhouette.
export function gravatarAvatarUrl(email: string, size = 200): string | null {
  const hash = gravatarHash(email);
  return hash ? `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404` : null;
}

// Public Gravatar profile page — bio, location, job title, verified accounts
// (GitHub, X, LinkedIn). Fed to agent.research as an extra source for people.
export function gravatarProfileUrl(email: string): string | null {
  const hash = gravatarHash(email);
  return hash ? `https://www.gravatar.com/${hash}` : null;
}
