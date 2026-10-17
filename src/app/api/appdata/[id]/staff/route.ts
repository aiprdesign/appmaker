import { clientIp, rateLimit } from "@/lib/rate-limit";
import { addStaff, getStore, setStaffPin, staffRows } from "@/lib/server/app-data";
import { unsealText } from "@/lib/server/data-crypto";
import { STAFF_PIN, pinMatches } from "@/lib/server/app-alerts";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Staff mode in the app. The owner PIN gives this phone the owner key (everything); a staff member's PIN
 * gives it their staff key (orders only), which stops working when the owner removes them.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!databaseConfigured() || !(await feature("appData"))) return json({ error: "Staff mode isn't available." }, 404);
    const store = await getStore((await ctx.params).id);
    if (!store) return json({ error: "Staff mode isn't available." }, 404);
    // Few tries: a PIN is short.
    // Few tries per phone, and few for the whole app (guessing from many addresses doesn't help).
    if (!rateLimit(`staff-pin:${store.id}:${clientIp(req)}`, 5, 15 * 60 * 1000).ok || !rateLimit(`staff-pin:${store.id}`, 30, 60 * 60 * 1000).ok)
      return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
    const staff = await staffRows(store.id);
    if (!store.staffPin && !store.ownerPin && !staff.length) return json({ error: "Set a staff PIN on the owner page first." }, 403);
    const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
    const pin = String(body.pin ?? "");
    if (!STAFF_PIN.test(pin)) return json({ error: "That PIN isn't right." }, 403);
    if (store.ownerPin && pinMatches(pin, store.ownerPin)) return json({ ownerKey: store.ownerKey, role: "owner" });
    const who = staff.find((r) => pinMatches(pin, r.pin_hash));
    if (who) return json({ ownerKey: unsealText(who.key), role: "staff", name: who.name });
    // The older single staff PIN: becomes a staff member called "Staff" (orders only).
    if (store.staffPin && pinMatches(pin, store.staffPin)) {
      const { key } = await addStaff(store.id, "Staff", store.staffPin);
      await setStaffPin(store.id, "");
      return json({ ownerKey: key, role: "staff", name: "Staff" });
    }
    return json({ error: "That PIN isn't right." }, 403);
  } catch {
    return json({ error: "Staff mode is unavailable right now." }, 503);
  }
}
