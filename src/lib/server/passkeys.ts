import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuthError, type User } from "./auth";
import { query } from "./db";
import { siteOrigin } from "./google";

/**
 * Passkeys (WebAuthn): sign in with Face ID, a fingerprint or the device
 * passcode. The device keeps the private key; Appmaker stores only the public
 * key, so nothing in the database can be used to sign in. Each ceremony uses
 * a one-time challenge, kept server-side and tied to the browser by an
 * httpOnly cookie.
 */

export const CHALLENGE_COOKIE = "appmaker_webauthn";
const MAX_PASSKEYS = 20;

function rp(req: Request): { origin: string; rpID: string } {
  const origin = siteOrigin(req);
  return { origin, rpID: new URL(origin).hostname };
}

async function saveChallenge(req: Request, challenge: string, userId: string | null): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  await query("delete from app_challenges where expires_at < now()");
  await query("insert into app_challenges (id, challenge, user_id, expires_at) values ($1, $2, $3, now() + interval '5 minutes')", [id, challenge, userId]);
  const secure = siteOrigin(req).startsWith("https:");
  return `${CHALLENGE_COOKIE}=${id}; Path=/api/auth/passkey; HttpOnly; SameSite=Strict; Max-Age=300${secure ? "; Secure" : ""}`;
}

/** Reads and uses up the challenge for this browser. */
async function takeChallenge(req: Request, userId: string | null): Promise<string> {
  const id = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === CHALLENGE_COOKIE)?.[1];
  if (!id) throw new AuthError("That passkey request expired. Try again.", 400);
  const rows = await query<{ challenge: string; user_id: string | null }>(
    "delete from app_challenges where id = $1 and expires_at > now() returning challenge, user_id",
    [id],
  );
  if (!rows[0] || rows[0].user_id !== userId) throw new AuthError("That passkey request expired. Try again.", 400);
  return rows[0].challenge;
}

export const clearedChallengeCookie = () => `${CHALLENGE_COOKIE}=; Path=/api/auth/passkey; HttpOnly; SameSite=Strict; Max-Age=0`;

/** A friendly name for the passkey from the browser's user agent. */
export function deviceName(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent)) return "Android phone";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows PC";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Linux/.test(userAgent)) return "Linux computer";
  return "Passkey";
}

export async function registrationOptions(req: Request, user: User) {
  const existing = await query<{ id: string; transports: string }>("select id, transports from app_passkeys where user_id = $1", [user.id]);
  if (existing.length >= MAX_PASSKEYS) throw new AuthError(`You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.`, 409);
  const { rpID } = rp(req);
  const options = await generateRegistrationOptions({
    rpName: "Appmaker",
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: (p.transports ? p.transports.split(",") : []) as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  return { options, cookie: await saveChallenge(req, options.challenge, user.id) };
}

export async function verifyRegistration(req: Request, user: User, response: RegistrationResponseJSON): Promise<{ id: string; name: string }> {
  const expectedChallenge = await takeChallenge(req, user.id);
  const { origin, rpID } = rp(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch (e) {
    throw new AuthError(`That passkey couldn't be checked: ${e instanceof Error ? e.message : "unknown error"}`, 400);
  }
  if (!verification.verified) throw new AuthError("That passkey couldn't be checked. Try again.", 400);
  const { credential } = verification.registrationInfo;
  const name = deviceName(req.headers.get("user-agent") ?? "");
  const rows = await query<{ id: string }>(
    "insert into app_passkeys (id, user_id, public_key, counter, transports, name) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing returning id",
    [credential.id, user.id, Buffer.from(credential.publicKey).toString("base64"), credential.counter, (credential.transports ?? []).join(","), name],
  );
  if (!rows[0]) throw new AuthError("This passkey is already added.", 409);
  return { id: credential.id, name };
}

export async function authenticationOptions(req: Request) {
  const { rpID } = rp(req);
  // No allow-list: the device offers the passkeys it has for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  return { options, cookie: await saveChallenge(req, options.challenge, null) };
}

export async function verifyAuthentication(req: Request, response: AuthenticationResponseJSON): Promise<User> {
  const expectedChallenge = await takeChallenge(req, null);
  const rows = await query<{ id: string; user_id: string; public_key: string; counter: string; transports: string; email: string }>(
    "select p.id, p.user_id, p.public_key, p.counter, p.transports, u.email from app_passkeys p join app_users u on u.id = p.user_id where p.id = $1",
    [String(response?.id ?? "")],
  );
  const passkey = rows[0];
  if (!passkey) throw new AuthError("This passkey isn't linked to an account here. Sign in another way, then add it again.", 401);
  const { origin, rpID } = rp(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, "base64")),
        counter: Number(passkey.counter),
        transports: (passkey.transports ? passkey.transports.split(",") : []) as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    throw new AuthError("That passkey didn't match. Try again or sign in another way.", 401);
  }
  if (!verification.verified) throw new AuthError("That passkey didn't match. Try again or sign in another way.", 401);
  await query("update app_passkeys set counter = $1, last_used_at = now() where id = $2", [verification.authenticationInfo.newCounter, passkey.id]);
  return { id: passkey.user_id, email: passkey.email };
}

export async function listPasskeys(userId: string) {
  const rows = await query<{ id: string; name: string; created_at: Date; last_used_at: Date | null }>(
    "select id, name, created_at, last_used_at from app_passkeys where user_id = $1 order by created_at",
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at.getTime(), lastUsedAt: r.last_used_at?.getTime() ?? null }));
}

export async function removePasskey(userId: string, id: string): Promise<void> {
  await query("delete from app_passkeys where user_id = $1 and id = $2", [userId, id]);
}
