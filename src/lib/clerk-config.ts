// Stripe Projects provisions Clerk credentials as CLERK_ENVIRONMENTS, a JSON
// blob of { development, production } keys — not the flat
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY that @clerk/nextjs
// reads. Bridge one to the other before Clerk's SDK is touched. Manual setups
// that already set the flat vars directly are left untouched.

type ClerkEnvironmentPayload = {
  development?: {
    publishable_key?: string;
    secret_key?: string;
  };
  production?: {
    publishable_key?: string;
    secret_key?: string;
  };
};

function parseClerkEnvironments(): ClerkEnvironmentPayload | null {
  const raw = process.env.CLERK_ENVIRONMENTS;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClerkEnvironmentPayload;
  } catch {
    return null;
  }
}

const parsedEnvironments = parseClerkEnvironments();
const derivedEnvironment =
  parsedEnvironments?.development ?? parsedEnvironments?.production ?? null;

if (
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  derivedEnvironment?.publishable_key
) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
    derivedEnvironment.publishable_key;
}

if (!process.env.CLERK_SECRET_KEY && derivedEnvironment?.secret_key) {
  process.env.CLERK_SECRET_KEY = derivedEnvironment.secret_key;
}
