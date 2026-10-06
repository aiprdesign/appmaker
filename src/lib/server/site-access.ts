import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The site lock: when SITE_PIN is set (a variable on the host, such as
 * Railway), every page needs the PIN once per device. Access cookies are
 * signed with a key derived from the PIN, so changing it signs everyone out.
 */

export const ACCESS_COOKIE = "appmaker_access";
const DAYS = 30;

const pin = () => (process.env.SITE_PIN ?? "").trim();
export const siteLocked = (): boolean => pin().length > 0;

const key = () => createHash("sha256").update(`appmaker-access:${pin()}`).digest();
const sha = (s: string) => createHash("sha256").update(s).digest();
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function checkPin(given: unknown): boolean {
  if (!siteLocked() || typeof given !== "string") return false;
  return timingSafeEqual(sha(given.trim()), sha(pin()));
}

export function accessCookie(req: Request): string {
  const exp = Date.now() + DAYS * 86_400_000;
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${ACCESS_COOKIE}=${exp}.${sign(String(exp))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86_400}${secure ? "; Secure" : ""}`;
}

export function validAccessToken(token: string | undefined): boolean {
  if (!siteLocked()) return true;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The visitor's address as the host's edge proxy saw it. X-Real-IP is set by
 * the proxy (Railway does); failing that, the last X-Forwarded-For entry is
 * the one the nearest proxy added. The first entry is whatever the browser
 * sent, so it's never trusted for the allowlist.
 */
export function trustedIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - 1] ?? "";
}

const ipv4 = (ip: string): number | null => {
  const m = ip.replace(/^::ffff:/i, "").match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0 : null;
};

/** One allowlist entry: an exact address (IPv4 or IPv6) or an IPv4 range like 203.0.113.0/24. */
export function ipMatches(ip: string, entry: string): boolean {
  const [base, bits] = entry.split("/");
  if (bits === undefined) return ip.replace(/^::ffff:/i, "").toLowerCase() === base.toLowerCase();
  const a = ipv4(ip);
  const b = ipv4(base);
  const n = Number(bits);
  if (a === null || b === null || !Number.isInteger(n) || n < 0 || n > 32) return false;
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  return (a & mask) === (b & mask);
}

/** SITE_ALLOWED_IPS: comma-separated addresses that skip the PIN, such as the owner's office or home. */
export function ipAllowed(ip: string): boolean {
  if (!ip) return false;
  return (process.env.SITE_ALLOWED_IPS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((entry) => ipMatches(ip, entry));
}

/**
 * Paths that stay open while the site is locked: the PIN screen, the admin
 * area (it has its own password), and everything published apps, app store
 * reviewers and payment webhooks rely on.
 */
const OPEN = [
  /^\/access(\/|$)/,
  /^\/api\/access(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/api\/admin(\/|$)/,
  /^\/(privacy|terms|accessibility)(\/|$)/,
  /^\/legal\//,
  /^\/owner\//,
  /^\/api\/(book|owner|live|stripe|status)(\/|$)/,
];

export const openWhileLocked = (pathname: string): boolean => OPEN.some((r) => r.test(pathname));

/** Where to go after the PIN: only a path on this site. */
export function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !s.startsWith("/access") ? s : "/";
}
