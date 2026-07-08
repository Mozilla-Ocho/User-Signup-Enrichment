import type { EnrichmentProfile } from "../types";

// B2B/B2C SaaS: subscription software with tiers, integrations, and a defined
// target market. Enrichment leans into ICP, packaging, and market position.
export const saas: EnrichmentProfile = {
  key: "saas",
  label: "SaaS",
  classifierHint:
    "Subscription software products (B2B or B2C) with pricing tiers and a defined target market, not primarily aimed at developers",
  extraFacts: {
    targetMarket: {
      type: ["string", "null"],
      description: "Primary customer segment: SMB, Mid-market, or Enterprise",
    },
    pricingTiers: {
      type: "array",
      items: { type: "string" },
      description: "Named pricing plan tiers, e.g. Free, Pro, Business, Enterprise",
    },
    hasFreeTrial: {
      type: ["boolean", "null"],
      description: "Whether a free trial or free plan is offered",
    },
    keyIntegrations: {
      type: "array",
      items: { type: "string" },
      description: "Notable third-party integrations the product advertises",
    },
    primaryUseCase: {
      type: ["string", "null"],
      description: "The main job-to-be-done the product is hired for",
    },
  },
  researchQuery: ({ url, companyName }) =>
    `Write a concise 2-3 sentence summary of the SaaS company ${
      companyName ?? "at " + url
    } (${url}). Focus on: its ideal customer profile and target market, its pricing and packaging approach, the core use case it solves, and how it is positioned against competitors.`,
};
