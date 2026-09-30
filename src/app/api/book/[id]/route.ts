import { BookingInputError } from "@/lib/booking";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { BookingConflict, createBooking, freeTimes, getSetup } from "@/lib/server/bookings";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };

// Called by the apps (and the builder's preview, which runs in a sandbox).
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...CORS, ...extra } });

async function load(ctx: Ctx) {
  if (!databaseConfigured() || !(await feature("bookings"))) return null;
  return getSetup((await ctx.params).id);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Free times for the coming days. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    if (!rateLimit(`book-read:${clientIp(req)}`, 120, 60 * 1000).ok) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const setup = await load(ctx);
    if (!setup) return json({ error: "Bookings aren't open." }, 404);
    return json(await freeTimes(setup), 200, { "cache-control": "no-store" });
  } catch {
    return json({ error: "Bookings are unavailable right now." }, 503);
  }
}

/** Books a free time straight away. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const setup = await load(ctx);
    if (!setup) return json({ error: "Bookings aren't open." }, 404);
    if (!rateLimit(`book:${setup.id}:${clientIp(req)}`, 8, 60 * 60 * 1000).ok) return json({ error: "Too many bookings from this device. Please call us instead." }, 429);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
    return json(await createBooking(setup, body as Record<string, unknown>));
  } catch (e) {
    if (e instanceof BookingInputError) return json({ error: e.message }, 400);
    if (e instanceof BookingConflict) return json({ error: e.message }, 409);
    return json({ error: "Bookings are unavailable right now." }, 503);
  }
}
