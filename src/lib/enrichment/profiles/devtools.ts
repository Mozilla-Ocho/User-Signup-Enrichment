import type { EnrichmentProfile } from "../types";

// Developer-tools companies: APIs, SDKs, infra, libraries, platforms whose
// primary users are software developers. Enrichment leans into DX and OSS.
export const devtools: EnrichmentProfile = {
  key: "devtools",
  label: "Developer Tools",
  classifierHint:
    "APIs, SDKs, CLIs, infrastructure, databases, libraries, or platforms whose primary users are software developers",
  extraFacts: {
    programmingLanguages: {
      type: "array",
      items: { type: "string" },
      description: "Programming languages with official SDKs or first-class support",
    },
    sdks: {
      type: "array",
      items: { type: "string" },
      description: "Official SDKs or client libraries offered",
    },
    apiType: {
      type: ["string", "null"],
      description: "Primary API style: REST, GraphQL, gRPC, WebSocket, etc.",
    },
    hasOpenSource: {
      type: ["boolean", "null"],
      description: "Whether the company maintains notable open-source projects",
    },
    pricingModel: {
      type: ["string", "null"],
      description: "Pricing model, e.g. usage-based, per-seat, free tier, open-core",
    },
  },
  researchQuery: ({ url, companyName }) =>
    `Write a concise 2-3 sentence developer-focused summary of ${
      companyName ?? "the company"
    } at ${url}. Focus on: the developer problem it solves, its DX and integration story (SDKs, APIs, documentation quality), open-source presence and community traction, and how it compares to alternatives in its category.`,
};
