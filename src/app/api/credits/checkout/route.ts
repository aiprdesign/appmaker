import { assertSameOrigin } from "@/lib/server/auth";
import { createCheckout, CreditsError } from "@/lib/server/credits";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import { rateLimit } from "@/lib/rate-limit";

/** Starts Stripe Checkout for a credit pack. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`checkout:${user.id}`, 20, 60 * 60 * 1000).ok) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const body = await readBody(req);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
    return Response.json({ url: await createCheckout(user, String(body.pack ?? ""), origin) });
  } catch (e) {
    if (e instanceof CreditsError) return Response.json({ error: e.message }, { status: e.status });
    return accountError(e);
  }
}
