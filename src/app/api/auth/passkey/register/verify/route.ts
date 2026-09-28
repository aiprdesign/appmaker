import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { clearedChallengeCookie, verifyRegistration } from "@/lib/server/passkeys";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

/** Saves the new passkey after checking the device's answer. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const body = await readBody(req);
    if (!body.response || typeof body.response !== "object") throw new AuthError("response is required", 400);
    const passkey = await verifyRegistration(req, user, body.response as RegistrationResponseJSON);
    return Response.json({ passkey }, { headers: { "set-cookie": clearedChallengeCookie() } });
  } catch (e) {
    return accountError(e);
  }
}
