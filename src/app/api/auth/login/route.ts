import { assertSameOrigin, authenticate, createSession, normalizeEmail, sessionCookie } from "@/lib/server/auth";
import { accountError, readBody, requireDatabase } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    requireDatabase();
    assertSameOrigin(req);
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    // Slow down password guessing, per address and per account.
    const fifteenMinutes = 15 * 60 * 1000;
    if (!rateLimit(`login-ip:${clientIp(req)}`, 20, fifteenMinutes).ok || !rateLimit(`login-email:${email}`, 10, fifteenMinutes).ok) {
      return Response.json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const user = await authenticate(email, typeof body.password === "string" ? body.password : "");
    const { token, maxAge } = await createSession(user.id);
    return Response.json({ user: { email: user.email } }, { headers: { "set-cookie": sessionCookie(req, token, maxAge) } });
  } catch (e) {
    return accountError(e);
  }
}
