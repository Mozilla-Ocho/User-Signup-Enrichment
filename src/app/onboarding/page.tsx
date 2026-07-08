import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Wordmark } from "@/components/Brand";
import { getUserProfile, latestEnrichment } from "@/lib/db";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // Enrichment + confirmed profile live in Turso, not Clerk metadata.
  const [enrichment, profile] = await Promise.all([
    latestEnrichment(user.id),
    getUserProfile(user.id),
  ]);
  const companyUrl =
    user.unsafeMetadata?.companyUrl ?? enrichment?.companyUrl ?? "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <UserButton />
      </header>

      <div className="flex flex-col gap-3 animate-fade-up">
        <span className="eyebrow eyebrow-accent">Onboarding</span>
        <h1 className="display text-4xl text-ink">
          Confirm your <span className="marker">profile</span>
        </h1>
        <p className="text-sm text-ink-70">
          {companyUrl ? (
            <>
              We researched{" "}
              <span className="font-medium text-ink">{companyUrl}</span> for you.
              Fix anything that&apos;s wrong.
            </>
          ) : (
            "Fill in your details below."
          )}
        </p>
      </div>

      <div className="card animate-fade-up p-6 sm:p-8">
        <OnboardingForm
          initialEnrichment={enrichment}
          savedProfile={profile}
          email={user.primaryEmailAddress?.emailAddress ?? ""}
        />
      </div>
    </main>
  );
}
