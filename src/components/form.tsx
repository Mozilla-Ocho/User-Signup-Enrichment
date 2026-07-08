"use client";

import { useId } from "react";

// Shared form primitives used by both the sign-up and onboarding forms.

function describedBy(hintId?: string, errId?: string) {
  return [hintId, errId].filter(Boolean).join(" ") || undefined;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  hint,
  required,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
  required?: boolean;
  error?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy(hintId, errId)}
        aria-invalid={error ? true : undefined}
        className="field px-3.5 py-2.5 disabled:opacity-60"
      />
      {error && (
        <FieldError id={errId}>{error}</FieldError>
      )}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={hintId}
        className="field px-3.5 py-2.5"
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hintId}
        className="field px-3.5 py-2.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SubmitButton({
  children,
  disabled,
  full,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`btn btn-primary px-6 py-3 text-sm disabled:opacity-50 ${
        full ? "w-full" : "self-start"
      }`}
    >
      {children}
    </button>
  );
}

// Form-level error — announced assertively to assistive tech.
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-sm text-ink-80"
    >
      <span aria-hidden className="mt-px font-semibold text-danger">
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

// Field-level error, linked to its input via id.
function FieldError({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {children}
    </p>
  );
}
