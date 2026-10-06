import { adminConfigured, adminCookie, checkAdminPassword } from "@/lib/server/admin";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { accountError, readBody } from "@/lib/server/respond";
import { trustedIp } from "@/lib/server/site-access";
import { attemptState, clearFailures, lockedMessage, recordFailure, triesLeftMessage } from "@/lib/server/attempts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!adminConfigured()) throw new AuthError("The admin area is off. Set ADMIN_PASSWORD on the server to turn it on.", 404);
    // 3 wrong passwords lock this visitor out for 15 minutes.
    const key = `admin-login:${trustedIp(req) || "local"}`;
    const before = attemptState(key);
    if (before.locked) return Response.json({ error: lockedMessage(before), locked: true }, { status: 429 });
    const body = await readBody(req);
    if (!checkAdminPassword(body.password)) {
      const after = recordFailure(key);
      return Response.json(
        {
          error: triesLeftMessage("That's not the admin password.", after),
          left: after.left,
          locked: after.locked,
        },
        { status: after.locked ? 429 : 401 },
      );
    }
    clearFailures(key);
    return Response.json({ ok: true }, { headers: { "set-cookie": adminCookie(req) } });
  } catch (e) {
    return accountError(e);
  }
}
