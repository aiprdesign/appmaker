import { requireAdmin } from "@/lib/server/admin-guard";
import { paymentStats, paymentsConfig } from "@/lib/server/credits";
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
      webhookUrl: `${base}/api/stripe/webhook`,
      stats: cfg.database ? await paymentStats() : null,
    });
  } catch (e) {
    return accountError(e);
  }
}
