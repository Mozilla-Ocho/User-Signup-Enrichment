"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import type { CompanyProfile } from "@/lib/enrichment";
import { saveUserProfile } from "@/lib/db";

// Persist the user's confirmed/corrected profile. The full profile lives in
// Turso (user_profiles); Clerk keeps only a tiny `onboardingComplete` flag for
// routing/gating.
export async function saveProfile(profile: CompanyProfile) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  await saveUserProfile(userId, profile);

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { onboardingComplete: true },
  });
}
