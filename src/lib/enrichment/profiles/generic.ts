import type { EnrichmentProfile } from "../types";

// Fallback profile. General business enrichment, no category-specific extras.
export const generic: EnrichmentProfile = {
  key: "generic",
  label: "General",
  classifierHint:
    "Any company that doesn't clearly fit a more specific category",
  researchQuery: ({ url, companyName }) =>
    `Write a concise 2-3 sentence business summary of the company at ${url}${
      companyName ? ` (${companyName})` : ""
    }: what they do, who they serve, and what makes them notable.`,
};
