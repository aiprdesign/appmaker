import { calendarFeed, canManage, getSetup } from "@/lib/server/bookings";
import { databaseConfigured } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

/** Bookings as a calendar the owner subscribes to on their phone (the link carries the owner key). */
export async function GET(req: Request, ctx: Ctx) {
  if (!databaseConfigured()) return new Response("Not found", { status: 404 });
  try {
    const setup = await getSetup((await ctx.params).id);
    if (!setup || !new URL(req.url).searchParams.get("k") || !(await canManage(req, setup))) return new Response("Not found", { status: 404 });
    return new Response(await calendarFeed(setup), {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, no-store",
        "content-disposition": 'inline; filename="bookings.ics"',
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
