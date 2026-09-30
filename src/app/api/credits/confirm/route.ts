import { assertSameOrigin } from "@/lib/server/auth";
import { balance, confirmCheckout, CreditsError } from "@/lib/server/credits";
import { accountError, readBody, requireUser } from "@/lib/server/respond";

/** After Checkout: adds the credits right away if Stripe says it's paid (the webhook does the same, once). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const body = await readBody(req);
    const added = await confirmCheckout(user.id, String(body.sessionId ?? ""));
    return Response.json({ added, balance: await balance(user.id) });
  } catch (e) {
    if (e instanceof CreditsError) return Response.json({ error: e.message }, { status: e.status });
    return accountError(e);
  }
}
