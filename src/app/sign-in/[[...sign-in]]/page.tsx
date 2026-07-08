import { SignIn } from "@clerk/nextjs";
import { Wordmark } from "@/components/Brand";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <Wordmark />
      <div className="animate-fade-up">
        <SignIn
          signUpUrl="/sign-up"
          forceRedirectUrl="/onboarding"
          appearance={{
            variables: {
              colorPrimary: "#6d28d9",
              borderRadius: "0.75rem",
            },
          }}
        />
      </div>
    </main>
  );
}
