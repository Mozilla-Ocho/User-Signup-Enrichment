import type { EnrichmentProfile } from "../types";

// Person profile. For a devtool/SaaS whose signups ARE individual developers:
// the URL is the developer's GitHub, personal site, or portfolio, and we enrich
// the person (not a company) with facts useful for qualifying a developer lead.
export const developer: EnrichmentProfile = {
  key: "developer",
  label: "Developer",
  classifierHint:
    "An individual software developer's profile — a GitHub profile, personal site, blog, or portfolio — rather than a company",
  // Explicit-only: a person profile must never be auto-selected for a company URL.
  autoClassify: false,
  // Describes a person: cache per-URL (not per-domain) and allow a Gravatar
  // photo to back-fill the branding logo.
  person: true,
  // This profile is about a person, so none of the company base facts apply.
  baseFields: [],
  extraFacts: {
    fullName: {
      type: ["string", "null"],
      description: "The developer's full name",
    },
    headline: {
      type: ["string", "null"],
      description: "Short professional headline or bio, e.g. 'Senior Backend Engineer'",
    },
    currentCompany: {
      type: ["string", "null"],
      description: "Where the developer currently works, if stated",
    },
    location: {
      type: ["string", "null"],
      description: "The developer's location as 'City, Country'",
    },
    seniority: {
      type: ["string", "null"],
      description: "Seniority level: Junior, Mid, Senior, Staff, or Lead",
    },
    yearsExperience: {
      type: ["number", "null"],
      description: "Approximate years of professional software experience",
    },
    primaryLanguages: {
      type: "array",
      items: { type: "string" },
      description: "Primary programming languages the developer works in",
    },
    frameworks: {
      type: "array",
      items: { type: "string" },
      description: "Frameworks, tools, and technologies the developer uses",
    },
    focusAreas: {
      type: "array",
      items: { type: "string" },
      description:
        "Technical focus areas or domains, e.g. distributed systems, ML, frontend, DevOps",
    },
    notableProjects: {
      type: "array",
      items: { type: "string" },
      description: "Notable repositories, open-source projects, or products they've built",
    },
    githubUrl: {
      type: ["string", "null"],
      description: "URL of the developer's GitHub profile",
    },
    socialLinks: {
      type: "array",
      items: { type: "string" },
      description: "Other public profiles: X/Twitter, LinkedIn, personal blog, etc.",
    },
  },
  researchQuery: ({ url, companyName, gravatarUrl }) =>
    `Research the individual software developer at ${url}${
      companyName ? ` (${companyName})` : ""
    }. In 2-3 sentences, summarize their technical background and seniority, their primary languages and stack, any notable open-source work or projects, and why they would be a strong user or lead for a developer-focused product. Prefer information from their GitHub, personal site, and public profiles.${
      gravatarUrl
        ? ` Also check their Gravatar profile at ${gravatarUrl} for their photo, bio, location, job title, and verified accounts (GitHub, X/Twitter, LinkedIn), and fold anything useful into the summary.`
        : ""
    }`,
};
