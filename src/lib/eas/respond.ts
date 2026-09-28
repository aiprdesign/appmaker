import { EasError } from "./server";
import { InputError } from "./input";

/** Shared error handling for the cloud-build routes. */
export function easErrorResponse(e: unknown): Response {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof EasError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[eas]", e instanceof Error ? e.message : "unknown error");
  return Response.json({ error: "Something went wrong talking to Expo. Try again." }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new InputError("Invalid JSON body");
  return body as Record<string, unknown>;
}
