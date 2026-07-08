// Detect whether a signup email belongs to a company (so we can derive the
// company URL from it) or a free/personal provider (so we must ask for a URL).

const FREE_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "fastmail.com",
  "hey.com",
  "duck.com",
  "tutanota.com",
  "tuta.io",
  "hushmail.com",
]);

// Extract a lowercased domain from an email address, or null if malformed.
export function emailDomain(email: string): string | null {
  const match = email
    .trim()
    .toLowerCase()
    .match(/^[^@\s]+@([^@\s]+\.[^@\s]+)$/);
  return match ? match[1] : null;
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain);
}

// Company URL derived from a work email, or null for free/personal/invalid.
// Returns a bare domain (e.g. "acme.com"); normalizeUrl adds the scheme.
export function deriveCompanyUrl(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain || isFreeEmailDomain(domain)) return null;
  return domain;
}
