import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db";

/**
 * Email + password accounts. Passwords are hashed with scrypt; sessions are
 * random tokens kept in an httpOnly cookie, stored only as a SHA-256 hash so a
 * leaked database can't be used to sign in.
 */

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const SESSION_COOKIE = "appmaker_session";
const SESSION_DAYS = 30;
const N = 16384;

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  email: string;
}

export function normalizeEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AuthError("Enter a valid email address.");
  return email;
}

export function checkPassword(v: unknown): string {
  const password = typeof v === "string" ? v : "";
  if (password.length < 8) throw new AuthError("Use a password of at least 8 characters.");
  if (password.length > 200) throw new AuthError("That password is too long.");
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = () => randomBytes(12).toString("base64url");

// A real hash to compare against when the email doesn't exist, so sign-in
// takes the same time either way and doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

export async function createUser(email: string, password: string): Promise<User> {
  const id = newId();
  const hash = await hashPassword(password);
  const rows = await query<{ id: string }>("insert into app_users (id, email, password_hash) values ($1, $2, $3) on conflict (email) do nothing returning id", [id, email, hash]);
  if (!rows.length) throw new AuthError("An account with this email already exists. Sign in instead.", 409);
  return { id, email };
}

export async function authenticate(email: string, password: string): Promise<User> {
  const rows = await query<{ id: string; password_hash: string }>("select id, password_hash from app_users where email = $1", [email]);
  dummyHash ??= hashPassword("appmaker-timing-equaliser");
  const ok = await verifyPassword(password, rows[0]?.password_hash ?? (await dummyHash));
  if (!rows.length || !ok) throw new AuthError("Email or password is wrong.", 401);
  return { id: rows[0].id, email };
}

export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 24 * 3600;
  await query("insert into app_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' seconds')::interval)", [sha256(token), userId, String(maxAge)]);
  // Housekeeping: drop this user's expired sessions.
  await query("delete from app_sessions where user_id = $1 and expires_at < now()", [userId]);
  return { token, maxAge };
}

export async function deleteSession(token: string): Promise<void> {
  await query("delete from app_sessions where token_hash = $1", [sha256(token)]);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function sessionToken(req: Request): string | undefined {
  const token = readCookie(req, SESSION_COOKIE);
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : undefined;
}

/** The signed-in user, or null. */
export async function currentUser(req: Request): Promise<User | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const rows = await query<User>(
    "select u.id, u.email from app_sessions s join app_users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()",
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export function sessionCookie(req: Request, token: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Blocks cross-site form posts: state-changing requests must come from this
 * site (same Origin) and send JSON, which plain HTML forms can't.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new AuthError("Cross-site request refused.", 403);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new AuthError("Send JSON.", 415);
}
