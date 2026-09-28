import { clientIp, rateLimit } from "../rate-limit";
import { EasError } from "./errors";
import { InputError, parseToken } from "./input";
import { hostedToken } from "./server";

/** Shared error handling for the cloud-build routes. */
export function easErrorResponse(e: unknown): Response {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof EasError) return Response.json({ ...e.data, error: e.message, code: e.code }, { status: e.status });
  console.error("[eas]", e instanceof Error ? e.message : "unknown error");
  return Response.json({ error: "Something went wrong talking to Expo. Try again." }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new InputError("Invalid JSON body");
  return body as Record<string, unknown>;
}

/** The user's own Expo token if they connected one, else the site's (hosted builds). */
export function resolveToken(v: unknown): { token: string; hosted: boolean } {
  if (typeof v === "string" && v.trim()) return { token: parseToken(v), hosted: false };
  const hosted = hostedToken();
  if (hosted) return { token: hosted, hosted: true };
  throw new InputError("Connect your Expo account first.");
}

/**
 * Hosted builds cost the site owner, so they get a per-person daily limit
 * (APPMAKER_HOSTED_BUILD_LIMIT, default 10). Builds on a user's own Expo
 * account only have the abuse limit.
 */
export function buildLimit(req: Request, kind: string, hosted: boolean): Response | null {
  const ip = clientIp(req);
  const ok = hosted
    ? rateLimit(`eas-hosted-${kind}:${ip}`, Number(process.env.APPMAKER_HOSTED_BUILD_LIMIT) || 10, 24 * 60 * 60 * 1000).ok
    : rateLimit(`eas-${kind}:${ip}`, 20, 60 * 60 * 1000).ok;
  if (ok) return null;
  const error = hosted
    ? "You've reached today's build limit. Try again tomorrow, or connect your own Expo account for more."
    : "Too many builds. Try again later.";
  return Response.json({ error }, { status: 429 });
}
