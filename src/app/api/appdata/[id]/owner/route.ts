import { DataInputError } from "@/lib/app-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DataForbidden, MAX_STAFF, addStaff, dataRole, getStore, ownerAction, ownerData, removeStaff, resetDataOwnerKey, setOwnerPin, setStaffPin, staffRows } from "@/lib/server/app-data";
import { OWNER_PIN, STAFF_PIN, addOwnerAlert, hashPin, pinMatches, isExpoToken, parseWebSubscription, removeOwnerAlert, vapidKeys } from "@/lib/server/app-alerts";
import { currentUser } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { liveTicket } from "@/lib/server/data-versions";

type Ctx = { params: Promise<{ id: string }> };

// The owner page (same site) and staff mode in the app (any origin, with the owner key).
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, x-owner-key" };

async function owned(req: Request, ctx: Ctx) {
  if (!databaseConfigured()) return { error: Response.json({ error: "The database isn't set up." }, { status: 503, headers: CORS }) };
  if (!rateLimit(`data-owner:${clientIp(req)}`, 120, 60 * 1000).ok) return { error: Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: CORS }) };
  const store = await getStore((await ctx.params).id);
  const role = store ? await dataRole(req, store) : null;
  if (!store || !role) return { error: Response.json({ error: "This owner link isn't valid (it may have been replaced)." }, { status: 404, headers: CORS }) };
  return { store, role };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Everything in the app's data, for its business (and the key the owner page needs for alerts). */
export async function GET(req: Request, ctx: Ctx) {
  const { store, role, error } = await owned(req, ctx);
  if (!store) return error;
  const vapidKey = (await vapidKeys().catch(() => null))?.publicKey ?? null;
  return Response.json({ ...(await ownerData(store, role)), vapidKey }, { headers: { ...CORS, "cache-control": "no-store" } });
}

/** The business adds, edits, deletes or sets the status of items; the app's maker can replace the owner link. */
export async function POST(req: Request, ctx: Ctx) {
  const { store, role, error } = await owned(req, ctx);
  if (!store) return error;
  const ownerOnly = () => Response.json({ error: "Only the owner can do that." }, { status: 403, headers: CORS });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Alerts: an owner page (web push) or a staff phone (Expo push) asks to hear about new orders.
    if (body.action === "alerts-web" || body.action === "alerts-expo" || body.action === "alerts-off") {
      if (body.action === "alerts-off") await removeOwnerAlert(store.id, String(body.token ?? ""));
      else if (body.action === "alerts-web") {
        const sub = parseWebSubscription(body.subscription);
        if (!sub) return Response.json({ error: "This browser's alert details aren't valid." }, { status: 400, headers: CORS });
        await addOwnerAlert(store.id, { web: sub });
      } else {
        if (!isExpoToken(body.token)) return Response.json({ error: "This phone's alert details aren't valid." }, { status: 400, headers: CORS });
        await addOwnerAlert(store.id, { expo: body.token });
      }
      return Response.json({ ok: true }, { headers: CORS });
    }
    // A ticket for this page's live connection (it hears about changes the moment they happen).
    if (body.action === "live-ticket") return Response.json({ ticket: liveTicket(store.id) }, { headers: CORS });
    // A PIN already in use (owner's or someone else's) would open the wrong role.
    const taken = async (pin: string) => (!!store.ownerPin && pinMatches(pin, store.ownerPin)) || (await staffRows(store.id)).some((r) => pinMatches(pin, r.pin_hash));
    if (body.action === "set-owner-pin") {
      if (role !== "owner") return ownerOnly();
      const pin = String(body.pin ?? "");
      if (pin && !OWNER_PIN.test(pin)) return Response.json({ error: "Use 8 digits for the owner PIN." }, { status: 400, headers: CORS });
      if (pin && (await staffRows(store.id)).some((r) => pinMatches(pin, r.pin_hash))) return Response.json({ error: "A staff member already uses that PIN. Pick another." }, { status: 400, headers: CORS });
      await setOwnerPin(store.id, pin ? hashPin(pin) : "");
      return Response.json(await ownerData({ ...store, ownerPin: pin ? "set" : "" }), { headers: CORS });
    }
    if (body.action === "staff-add") {
      if (role !== "owner") return ownerOnly();
      const name = String(body.name ?? "").trim().slice(0, 30);
      const pin = String(body.pin ?? "");
      if (!name) return Response.json({ error: "Add their name." }, { status: 400, headers: CORS });
      if (!STAFF_PIN.test(pin)) return Response.json({ error: "Use 6 to 8 digits for the staff PIN." }, { status: 400, headers: CORS });
      if ((await staffRows(store.id)).length >= MAX_STAFF) return Response.json({ error: `Up to ${MAX_STAFF} staff. Remove someone first.` }, { status: 400, headers: CORS });
      if (await taken(pin)) return Response.json({ error: "That PIN is already used. Pick another." }, { status: 400, headers: CORS });
      await addStaff(store.id, name, hashPin(pin));
      return Response.json(await ownerData(store), { headers: CORS });
    }
    if (body.action === "staff-remove") {
      if (role !== "owner") return ownerOnly();
      await removeStaff(store.id, String(body.id ?? ""));
      return Response.json(await ownerData(store), { headers: CORS });
    }
    if (body.action === "set-pin") {
      if (role !== "owner") return ownerOnly();
      const pin = String(body.pin ?? "");
      if (pin && !STAFF_PIN.test(pin)) return Response.json({ error: "Use 6 to 8 digits for the staff PIN." }, { status: 400, headers: CORS });
      await setStaffPin(store.id, pin ? hashPin(pin) : "");
      return Response.json(await ownerData({ ...store, staffPin: pin ? "set" : "" }), { headers: CORS });
    }
    if (body.action === "reset-link") {
      if (role !== "owner") return ownerOnly();
      if ((await currentUser(req))?.id !== store.userId) return Response.json({ error: "Only the app's maker can replace the link." }, { status: 403 });
      return Response.json({ ownerKey: await resetDataOwnerKey(store.id) });
    }
    await ownerAction(store, body, role);
    return Response.json(await ownerData(store, role), { headers: CORS });
  } catch (e) {
    if (e instanceof DataInputError) return Response.json({ error: e.message }, { status: 400, headers: CORS });
    if (e instanceof DataForbidden) return Response.json({ error: e.message }, { status: 403, headers: CORS });
    return Response.json({ error: "Couldn't save that. Try again." }, { status: 503, headers: CORS });
  }
}
