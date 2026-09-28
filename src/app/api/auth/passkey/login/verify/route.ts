import { requireFeature } from "@/lib/server/features";
import { assertSameOrigin, AuthError, createSession, sessionCookie } from "@/lib/server/auth";
import { clearedChallengeCookie, verifyAuthentication } from "@/lib/server/passkeys";
import { accountError, readBody, requireDatabase } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

/** Checks the device's answer and signs in. */
export async function POST(req: Request) {
  try {
    requireDatabase();
    assertSameOrigin(req);
    await requireFeature("passkeys");
    if (!rateLimit(`passkey-login:${clientIp(req)}`, 30, 15 * 60 * 1000).ok) {
      return Response.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
    }
    const body = await readBody(req);
    if (!body.response || typeof body.response !== "object") throw new AuthError("response is required", 400);
    const user = await verifyAuthentication(req, body.response as AuthenticationResponseJSON);
    const { token, maxAge } = await createSession(user.id);
    const headers = new Headers();
    headers.append("set-cookie", sessionCookie(req, token, maxAge));
    headers.append("set-cookie", clearedChallengeCookie());
    return Response.json({ user: { email: user.email } }, { headers });
  } catch (e) {
    return accountError(e);
  }
}
