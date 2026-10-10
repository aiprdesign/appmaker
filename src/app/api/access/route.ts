import { assertSameOrigin } from "@/lib/server/auth";
import { accountError, readBody } from "@/lib/server/respond";
import { attemptState, clearFailures, lockedMessage, recordFailure, triesLeftMessage } from "@/lib/server/attempts";
import { accessCookie, checkPin, lockKind, safeNext, siteLocked, trustedIp } from "@/lib/server/site-access";

/** Unlocks the site for this device when the PIN is right. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readBody(req);
    const next = safeNext(body.next);
    if (!siteLocked()) return Response.json({ ok: true, next });
    const key = `site-pin:${trustedIp(req) || "local"}`;
    const before = attemptState(key);
    if (before.locked) return Response.json({ error: lockedMessage(before), locked: true }, { status: 429 });
    if (!checkPin(body.pin)) {
      const after = recordFailure(key);
      return Response.json(
        {
          error: triesLeftMessage(lockKind() === "password" ? "That's not the password." : "That's not the PIN.", after),
          left: after.left,
          locked: after.locked,
        },
        { status: after.locked ? 429 : 401 },
      );
    }
    clearFailures(key);
    return Response.json({ ok: true, next }, { headers: { "set-cookie": accessCookie(req) } });
  } catch (e) {
    return accountError(e);
  }
}
