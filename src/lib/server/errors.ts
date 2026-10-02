import { randomBytes } from "node:crypto";

/** Database and network failures, as Node and the Postgres client report them. */
function isDatabaseDown(e: unknown): boolean {
  const codes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P03", "53300", "08001", "08006"]);
  let err = e as { code?: string; cause?: unknown; name?: string; message?: string } | undefined;
  for (let i = 0; err && i < 4; i++) {
    if (err.code && codes.has(err.code)) return true;
    if (/connection terminated|timeout exceeded when trying to connect|too many clients/i.test(err.message ?? "")) return true;
    err = err.cause as typeof err;
  }
  return false;
}

/**
 * An unexpected failure before the AI started: logged in full for the site
 * owner (with a reference), explained in plain words to the person.
 */
export function unexpectedErrorResponse(e: unknown, action: string): Response {
  const ref = randomBytes(4).toString("hex");
  console.error(`[appmaker] ${action} failed (ref ${ref}):`, e);
  const error = isDatabaseDown(e)
    ? `Appmaker couldn't reach its database, so it couldn't ${action}. Please try again in a minute. (Reference ${ref})`
    : `Appmaker hit an unexpected problem and couldn't ${action}. Please try again; if it keeps happening, tell the site owner the reference ${ref}.`;
  return Response.json({ error, ref }, { status: 500 });
}
