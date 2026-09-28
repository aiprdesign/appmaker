import { adminConfigured, adminCookie, checkAdminPassword } from "@/lib/server/admin";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { accountError, readBody } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!adminConfigured()) throw new AuthError("The admin area is off. Set ADMIN_PASSWORD on the server to turn it on.", 404);
    if (!rateLimit(`admin-login:${clientIp(req)}`, 5, 15 * 60 * 1000).ok) {
      return Response.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
    }
    const body = await readBody(req);
    if (!checkAdminPassword(body.password)) throw new AuthError("That's not the admin password.", 401);
    return Response.json({ ok: true }, { headers: { "set-cookie": adminCookie(req) } });
  } catch (e) {
    return accountError(e);
  }
}
