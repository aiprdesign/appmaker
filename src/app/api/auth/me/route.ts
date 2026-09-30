import { assertSameOrigin, AuthError, clearedCookie, currentUser } from "@/lib/server/auth";
import { deleteMember } from "@/lib/server/admin-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { databaseConfigured } from "@/lib/server/db";
import { getFeatures } from "@/lib/server/features";
import { googleEnabled } from "@/lib/server/google";
import { accountError, readBody, requireUser } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether accounts are on, and who is signed in. */
export async function GET(req: Request) {
  if (!databaseConfigured()) return Response.json({ enabled: false, user: null });
  try {
    const user = await currentUser(req);
    const features = await getFeatures();
    return Response.json({
      enabled: true,
      google: await googleEnabled(),
      passkeys: features.passkeys,
      signups: features.signups,
      user: user ? { email: user.email } : null,
    });
  } catch (e) {
    const res = accountError(e);
    const body = await res.json();
    return Response.json({ enabled: true, google: false, passkeys: false, signups: false, user: null, error: body.error }, { status: 200 });
  }
}

/**
 * Deletes the signed-in account and everything in it: apps, credits, hosted
 * store pages, live updates and bookings. The person confirms by typing
 * their email address.
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`delete-account:${clientIp(req)}`, 5, 60 * 60 * 1000).ok) throw new AuthError("Too many attempts. Try again later.", 429);
    const body = await readBody(req);
    if (String(body.confirm ?? "").trim().toLowerCase() !== user.email.toLowerCase()) throw new AuthError("Type your email address exactly to confirm.", 400);
    await deleteMember(user.id);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
  } catch (e) {
    return accountError(e);
  }
}
