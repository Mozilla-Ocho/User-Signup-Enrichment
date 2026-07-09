// Must run before @clerk/nextjs/server: it caches process.env.CLERK_SECRET_KEY
// into a module-level constant on first import, so this side effect has to
// land first or the cached key is empty.
import "@/lib/clerk-config";
import { auth } from "@clerk/nextjs/server";
import { latestEnrichment } from "@/lib/db";

// Polled by the onboarding form while enrichment is still pending. Reads the
// latest run from Turso — `auth()` only decodes the session (no Clerk API
// fetch), so repeated polling doesn't hammer Clerk's rate limits.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const enrichment = await latestEnrichment(userId);
    return Response.json({ enrichment });
  } catch (err) {
    console.error("status lookup failed:", err);
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
}
