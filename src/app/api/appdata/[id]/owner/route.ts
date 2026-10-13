import { DataInputError } from "@/lib/app-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DataForbidden, canManageData, getStore, ownerAction, ownerData, resetDataOwnerKey } from "@/lib/server/app-data";
import { currentUser } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

async function owned(req: Request, ctx: Ctx) {
  if (!databaseConfigured()) return { error: Response.json({ error: "The database isn't set up." }, { status: 503 }) };
  if (!rateLimit(`data-owner:${clientIp(req)}`, 120, 60 * 1000).ok) return { error: Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429 }) };
  const store = await getStore((await ctx.params).id);
  if (!store || !(await canManageData(req, store))) return { error: Response.json({ error: "This owner link isn't valid (it may have been replaced)." }, { status: 404 }) };
  return { store };
}

/** Everything in the app's data, for its business. */
export async function GET(req: Request, ctx: Ctx) {
  const { store, error } = await owned(req, ctx);
  if (!store) return error;
  return Response.json(await ownerData(store), { headers: { "cache-control": "no-store" } });
}

/** The business adds, edits, deletes or sets the status of items; the app's maker can replace the owner link. */
export async function POST(req: Request, ctx: Ctx) {
  const { store, error } = await owned(req, ctx);
  if (!store) return error;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "reset-link") {
      if ((await currentUser(req))?.id !== store.userId) return Response.json({ error: "Only the app's maker can replace the link." }, { status: 403 });
      return Response.json({ ownerKey: await resetDataOwnerKey(store.id) });
    }
    await ownerAction(store, body);
    return Response.json(await ownerData(store));
  } catch (e) {
    if (e instanceof DataInputError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof DataForbidden) return Response.json({ error: e.message }, { status: 403 });
    return Response.json({ error: "Couldn't save that. Try again." }, { status: 503 });
  }
}
