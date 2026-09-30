import { creditSession, paymentsConfig, verifyWebhook } from "@/lib/server/credits";

/**
 * Stripe webhook: add this URL in Stripe → Developers → Webhooks with the
 * event checkout.session.completed, and set its signing secret as
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  if (!paymentsConfig().enabled) return Response.json({ error: "Payments aren't set up." }, { status: 404 });
  const body = await req.text();
  if (!verifyWebhook(body, req.headers.get("stripe-signature"))) return Response.json({ error: "Invalid signature." }, { status: 400 });
  let event: { type?: string; data?: { object?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      await creditSession(event.data?.object as Parameters<typeof creditSession>[0]);
    } catch {
      // Stripe retries on errors, and crediting is idempotent.
      return Response.json({ error: "Couldn't record the payment." }, { status: 500 });
    }
  }
  return Response.json({ received: true });
}
