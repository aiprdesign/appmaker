import { requireAdmin } from "@/lib/server/admin-guard";
import { paymentStats, paymentsConfig, prices, setPrices } from "@/lib/server/credits";
import { assertSameOrigin } from "@/lib/server/auth";
import { readBody } from "@/lib/server/respond";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";

/** Payment setup checklist and totals, for the admin Settings tab. Never returns keys. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const cfg = paymentsConfig();
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    const base = host ? `${proto}://${host}` : new URL(req.url).origin;
    return Response.json({
      ...cfg,
      prices: await prices(),
      webhookUrl: `${base}/api/stripe/webhook`,
      stats: cfg.database ? await paymentStats() : null,
    });
  } catch (e) {
    return accountError(e);
  }
}

/** Saves what things cost and the free allowances. */
export async function POST(req: Request) {
  try {
    requireAdmin(req, true);
    assertSameOrigin(req);
    const body = await readBody(req);
    return Response.json({ prices: await setPrices(body.prices) });
  } catch (e) {
    return accountError(e);
  }
}
