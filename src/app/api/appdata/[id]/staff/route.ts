import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/server/app-data";
import { STAFF_PIN, pinMatches } from "@/lib/server/app-alerts";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Staff mode in the app: the staff PIN the business set gives this phone the owner key. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!databaseConfigured() || !(await feature("appData"))) return json({ error: "Staff mode isn't available." }, 404);
    const store = await getStore((await ctx.params).id);
    if (!store) return json({ error: "Staff mode isn't available." }, 404);
    // Few tries: a PIN is short.
    if (!rateLimit(`staff-pin:${store.id}:${clientIp(req)}`, 5, 15 * 60 * 1000).ok) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
    if (!store.staffPin) return json({ error: "Set a staff PIN on the owner page first." }, 403);
    const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
    const pin = String(body.pin ?? "");
    if (!STAFF_PIN.test(pin) || !pinMatches(pin, store.staffPin)) return json({ error: "That PIN isn't right." }, 403);
    return json({ ownerKey: store.ownerKey });
  } catch {
    return json({ error: "Staff mode is unavailable right now." }, 503);
  }
}
