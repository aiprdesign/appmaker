import { assertSameOrigin, checkPassword, createSession, createUser, normalizeEmail, sessionCookie } from "@/lib/server/auth";
import { accountError, readBody, requireDatabase } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    requireDatabase();
    assertSameOrigin(req);
    if (!rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60 * 1000).ok) {
      return Response.json({ error: "Too many new accounts from here. Try again later." }, { status: 429 });
    }
    const body = await readBody(req);
    const user = await createUser(normalizeEmail(body.email), checkPassword(body.password));
    const { token, maxAge } = await createSession(user.id);
    return Response.json({ user: { email: user.email } }, { headers: { "set-cookie": sessionCookie(req, token, maxAge) } });
  } catch (e) {
    return accountError(e);
  }
}
