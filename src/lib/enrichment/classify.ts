import type Tabstack from "@tabstack/sdk";
import { autoClassifyProfiles, DEFAULT_PROFILE_KEY } from "./registry";

// Auto-select an enrichment profile for a URL with a cheap extract pass.
// Falls back to the default profile on any failure or unknown category.
export async function classifyProfile(
  client: Tabstack,
  url: string,
): Promise<string> {
  const candidates = autoClassifyProfiles();
  const keys = candidates.map((p) => p.key);
  const hints = candidates
    .map((p) => `"${p.key}" = ${p.classifierHint}`)
    .join("; ");

  try {
    const result = (await client.extract.json({
      url,
      effort: "min",
      json_schema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: keys,
            description: `The best-fit company category. Options: ${hints}. If unsure, use "${DEFAULT_PROFILE_KEY}".`,
          },
        },
        required: ["category"],
      },
    })) as { category?: string };

    const category = result.category;
    return category && keys.includes(category)
      ? category
      : DEFAULT_PROFILE_KEY;
  } catch (err) {
    console.error("profile classification failed, using default:", err);
    return DEFAULT_PROFILE_KEY;
  }
}
