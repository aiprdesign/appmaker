import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The owner's admin area, protected by ADMIN_PASSWORD (an environment
 * variable, changed on the host). Admin sessions are signed with a key
 * derived from that password, so changing it signs every admin out.
 */

export const ADMIN_COOKIE = "appmaker_admin";
const HOURS = 12;

export function adminConfigured(): boolean {
  return (process.env.ADMIN_PASSWORD ?? "").length > 0;
}

const key = () => createHash("sha256").update(`appmaker-admin:${process.env.ADMIN_PASSWORD ?? ""}`).digest();
const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkAdminPassword(password: unknown): boolean {
  if (!adminConfigured() || typeof password !== "string") return false;
  return timingSafeEqual(sha(password), sha(process.env.ADMIN_PASSWORD!));
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function adminCookie(req: Request): string {
  const exp = Date.now() + HOURS * 3600_000;
  const token = `${exp}.${sign(String(exp))}`;
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${HOURS * 3600}${secure ? "; Secure" : ""}`;
}

export const clearedAdminCookie = () => `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export function isAdmin(req: Request): boolean {
  if (!adminConfigured()) return false;
  const token = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === ADMIN_COOKIE)?.[1];
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
