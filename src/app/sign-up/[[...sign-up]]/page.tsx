"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { SparkMark, Wordmark } from "@/components/Brand";
import { Field, FormError, SubmitButton } from "@/components/form";
import { deriveCompanyUrl } from "@/lib/email";

const LOADING_MSG = "Still loading — please try again in a moment.";
const GENERIC_ERR = "Something went wrong. Please try again.";

// Custom passwordless sign-up: email + company URL only.
// The company URL is stashed in unsafeMetadata so the user.created webhook
// can read it and kick off enrichment. Email is verified with a 6-digit code.
export default function SignUpPage() {
  const { signUp, fetchStatus } = useSignUp();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  // When true, the user chose to override the URL derived from their email.
  const [overrideUrl, setOverrideUrl] = useState(false);
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const busy = submitting || fetchStatus === "fetching";

  // Company email → derive the URL from its domain; free/personal email → ask.
  const derivedUrl = deriveCompanyUrl(email);
  const showUrlField = !derivedUrl || overrideUrl;
  const effectiveUrl = (
    derivedUrl && !overrideUrl ? derivedUrl : companyUrl
  ).trim();

  // Move focus to the code input when the verify step appears.
  useEffect(() => {
    if (pendingVerification) codeRef.current?.focus();
  }, [pendingVerification]);

  // Resend cooldown countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function handleResend() {
    if (!signUp || resendIn > 0) return;
    setError(null);
    setNotice(null);
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setError(sent.error.message);
      setNotice("A new code is on its way.");
      setResendIn(30);
    } catch (err) {
      console.error("resend code failed:", err);
      setError(err instanceof Error ? err.message : GENERIC_ERR);
    }
  }

  function handleChangeEmail() {
    setPendingVerification(false);
    setCode("");
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signUp) return setError(LOADING_MSG);
    if (!effectiveUrl) return setError("Add your company URL.");
    setSubmitting(true);
    try {
      // Company URL rides along as unsafeMetadata; Clerk copies it to the
      // created user, and the user.created webhook reads it to enrich.
      const created = await signUp.create({
        emailAddress: email,
        unsafeMetadata: { companyUrl: effectiveUrl },
      });
      if (created.error) return setError(created.error.message);

      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setError(sent.error.message);

      setPendingVerification(true);
    } catch (err) {
      console.error("sign-up create failed:", err);
      setError(err instanceof Error ? err.message : GENERIC_ERR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signUp) return setError(LOADING_MSG);
    setSubmitting(true);
    try {
      const verified = await signUp.verifications.verifyEmailCode({ code });
      if (verified.error) return setError(verified.error.message);

      if (signUp.status === "complete") {
        // Turn the completed sign-up into an active session.
        const done = await signUp.finalize();
        if (done.error) return setError(done.error.message);
        router.push("/onboarding");
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err) {
      console.error("sign-up verify failed:", err);
      setError(err instanceof Error ? err.message : GENERIC_ERR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex justify-center">
        <Wordmark />
      </div>

      <div className="card animate-fade-up flex flex-col gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <SparkMark className="h-11 w-11" />
          <span className="eyebrow eyebrow-accent">Get started</span>
          <div className="flex flex-col gap-1.5">
            <h1 className="display text-3xl text-ink">
              {pendingVerification ? "Check your email" : "Create your account"}
            </h1>
            <p className="text-sm text-ink-70">
              {pendingVerification
                ? `We sent a 6-digit code to ${email}.`
                : "Use your work email and we'll find your company automatically."}
            </p>
          </div>
        </div>

        {!pendingVerification ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@acme.com"
              required
            />
            {showUrlField ? (
              <div className="flex flex-col gap-1.5">
                <Field
                  label="Company URL"
                  type="text"
                  value={companyUrl}
                  onChange={setCompanyUrl}
                  placeholder="acme.com"
                  hint="We'll research this to prefill your profile."
                />
                {overrideUrl && derivedUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setOverrideUrl(false);
                      setCompanyUrl("");
                    }}
                    className="self-start text-xs text-muted hover:text-ink"
                  >
                    Use {derivedUrl} from my email instead
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Company</span>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-muted px-3.5 py-2.5">
                  <span className="text-ink-80">
                    Using <span className="font-medium text-ink">{derivedUrl}</span>{" "}
                    from your email
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOverrideUrl(true);
                      setCompanyUrl(derivedUrl ?? "");
                    }}
                    className="shrink-0 text-sm font-medium text-accent-strong hover:underline"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}
            {/* Clerk bot-protection widget renders here when enabled. */}
            <div id="clerk-captcha" />
            {error && <FormError>{error}</FormError>}
            <SubmitButton disabled={busy} full>
              {submitting ? "Sending code…" : "Continue"}
            </SubmitButton>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <Field
              label="Verification code"
              type="text"
              value={code}
              onChange={setCode}
              placeholder="123456"
              required
              inputRef={codeRef}
            />
            {notice && (
              <p role="status" className="text-sm text-muted">
                {notice}
              </p>
            )}
            {error && <FormError>{error}</FormError>}
            <SubmitButton disabled={busy} full>
              {submitting ? "Verifying…" : "Verify & continue"}
            </SubmitButton>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendIn > 0}
                className="font-medium text-accent-strong hover:underline disabled:text-muted disabled:no-underline"
              >
                {resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={handleChangeEmail}
                className="text-muted hover:text-ink"
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-accent-strong hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
