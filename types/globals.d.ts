// Augment Clerk's metadata types so publicMetadata / unsafeMetadata are typed
// everywhere (currentUser(), webhook events, updateUserMetadata, etc.).
//
// Enrichment and the confirmed profile live in Turso (see src/lib/db.ts), not
// Clerk metadata — only a small routing flag remains here.
declare global {
  interface UserPublicMetadata {
    onboardingComplete?: boolean;
  }
  interface UserUnsafeMetadata {
    companyUrl?: string;
    /** Optional explicit enrichment profile key; otherwise auto-classified. */
    enrichmentProfile?: string;
  }
}

export {};
