import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError, type User } from "./auth";
import { query } from "./db";

/**
 * "Sign in with Google" (OpenID Connect, authorization code flow with PKCE).
 * On when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. The ID token
 * comes straight from Google's token endpoint over TLS, which OpenID Connect
 * accepts in place of checking its signature; its audience, issuer, expiry
 * and verified email are still checked.
 */

export const OAUTH_COOKIE = "appmaker_oauth";

const authUrl = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET?.trim();
}

/** The site's public address; behind a proxy (Railway) the forwarded headers carry it. */
export function siteOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const redirectUri = (req: Request) => `${siteOrigin(req)}/api/auth/google/callback`;

const b64url = (b: Buffer) => b.toString("base64url");

/** Where to send the browser, plus the short-lived cookie that ties the callback to this browser. */
export function startGoogleSignIn(req: Request): { location: string; cookie: string } {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const secure = siteOrigin(req).startsWith("https:");
  const cookie = `${OAUTH_COOKIE}=${state}.${verifier}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`;
  return { location: `${authUrl()}?${params}`, cookie };
}

export const clearedOAuthCookie = () => `${OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`;

function readOAuthCookie(req: Request): { state: string; verifier: string } | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === OAUTH_COOKIE && v) {
      const [state, verifier] = v.split(".");
      if (state && verifier) return { state, verifier };
    }
  }
  return null;
}

interface IdClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
}

/** Checks the callback, exchanges the code with Google, and returns the Google account. */
export async function finishGoogleSignIn(req: Request): Promise<{ sub: string; email: string }> {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) throw new AuthError("Google sign-in was cancelled.", 400);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const saved = readOAuthCookie(req);
  if (!code || !saved || saved.state.length !== state.length || !timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) {
    throw new AuthError("That sign-in link expired or came from somewhere else. Try again.", 400);
  }
  let res: Response;
  try {
    res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri(req),
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new AuthError("Couldn't reach Google. Try again.", 502);
  }
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    const reason = body.error === "redirect_uri_mismatch" ? " The site's address isn't in the Google app's authorized redirect URIs." : "";
    throw new AuthError(`Google didn't complete the sign-in (${body.error ?? res.status}).${reason}`, 502);
  }
  let claims: IdClaims;
  try {
    claims = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString());
  } catch {
    throw new AuthError("Google returned an unreadable answer.", 502);
  }
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID!.trim()) throw new AuthError("Google's answer was meant for another app.", 400);
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new AuthError("That answer didn't come from Google.", 400);
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new AuthError("Google's answer has expired. Try again.", 400);
  if (!claims.sub || !claims.email || !verified) throw new AuthError("Your Google account's email address isn't verified.", 400);
  return { sub: claims.sub, email: claims.email.toLowerCase() };
}

/**
 * The Appmaker account for a Google account: the one already linked, else the
 * account with the same (Google-verified) email, else a new one.
 */
export async function userForGoogle(sub: string, email: string): Promise<User> {
  const linked = await query<User>("select id, email from app_users where google_sub = $1", [sub]);
  if (linked[0]) return linked[0];
  const byEmail = await query<User>("update app_users set google_sub = $1 where email = $2 and google_sub is null returning id, email", [sub, email]);
  if (byEmail[0]) return byEmail[0];
  const id = randomBytes(12).toString("base64url");
  // Google-only accounts have no password; password sign-in can't match an empty hash.
  const created = await query<User>(
    "insert into app_users (id, email, password_hash, google_sub) values ($1, $2, '', $3) on conflict (email) do nothing returning id, email",
    [id, email, sub],
  );
  if (!created[0]) throw new AuthError("This email is linked to a different Google account.", 409);
  return created[0];
}
