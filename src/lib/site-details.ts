import type { SiteContact } from "./types";

/**
 * Checks for the photos and contact details found on a website. They're
 * applied when the site is read and again before the AI sees them, since the
 * browser sends the imported site back with each request.
 */

export const MAX_SITE_IMAGES = 16;

/** An https link with no characters that could break out of code or markup. */
export function safeHttpsUrl(v: unknown, max = 500): string | null {
  if (typeof v !== "string" || v.length > max || !/^https:\/\/[^\s"'`<>\\{}|^]+$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

export function cleanPhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/^tel:/i, "").replace(/%20/g, " ").trim();
  const digits = t.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(t) && digits.length >= 6 && digits.length <= 15 ? t : null;
}

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t) && t.length <= 120 ? t : null;
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/[\u0000-\u001f<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, max) : null;
}

const uniq = <T>(xs: (T | null | undefined)[], max: number): T[] => [...new Set(xs.filter((x): x is T => x != null))].slice(0, max);

/** Keeps only valid values, e.g. from a site object the browser sent back. */
export function sanitizeContact(c: Partial<SiteContact> | undefined | null): SiteContact | undefined {
  if (!c || typeof c !== "object") return undefined;
  const contact: SiteContact = {
    phones: uniq((Array.isArray(c.phones) ? c.phones : []).map(cleanPhone), 3),
    emails: uniq((Array.isArray(c.emails) ? c.emails : []).map(cleanEmail), 3),
    hours: uniq(
      (Array.isArray(c.hours) ? c.hours : []).map((h) => cleanText(h, 80)),
      14,
    ),
    social: uniq(
      (Array.isArray(c.social) ? c.social : []).map((s) => safeHttpsUrl(s)),
      6,
    ),
  };
  const address = cleanText(c.address, 200);
  const whatsapp = safeHttpsUrl(c.whatsapp);
  const booking = safeHttpsUrl(c.booking);
  const maps = safeHttpsUrl(c.maps);
  if (address) contact.address = address;
  if (whatsapp) contact.whatsapp = whatsapp;
  if (booking) contact.booking = booking;
  if (maps) contact.maps = maps;
  const empty =
    !contact.phones.length && !contact.emails.length && !contact.hours.length && !contact.social.length && !address && !whatsapp && !booking && !maps;
  return empty ? undefined : contact;
}

export function sanitizeImages(v: unknown): string[] {
  return uniq(
    (Array.isArray(v) ? v : []).map((u) => safeHttpsUrl(u)),
    MAX_SITE_IMAGES,
  );
}
