import { AuthError, currentUser, type User } from "./auth";
import { databaseConfigured } from "./db";
import { CreditsError } from "./credits";

/** Shared handling for the account and cloud-project routes. */
export function accountError(e: unknown): Response {
  if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof CreditsError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[accounts]", e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://•••") : "unknown error");
  return Response.json({ error: "Couldn't reach the database. Try again in a moment." }, { status: 503 });
}

export function requireDatabase(): void {
  if (!databaseConfigured()) throw new AuthError("Accounts aren't enabled on this site.", 404);
}

export async function requireUser(req: Request): Promise<User> {
  requireDatabase();
  const user = await currentUser(req);
  if (!user) throw new AuthError("Sign in to use your account.", 401);
  return user;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new AuthError("Invalid JSON body", 400);
  return body as Record<string, unknown>;
}

/** This site's public address, as the browser (or a phone app) reaches it. */
export function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
