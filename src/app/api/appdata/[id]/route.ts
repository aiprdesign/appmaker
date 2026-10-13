import { DataInputError } from "@/lib/app-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DataForbidden, addItem, checkDevice, getStore, listItems, removeItem, updateItem } from "@/lib/server/app-data";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };

// Called by the apps (and the builder's preview, which runs in a sandbox).
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE",
  "access-control-allow-headers": "content-type, x-device",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });

async function load(ctx: Ctx) {
  if (!databaseConfigured() || !(await feature("appData"))) return null;
  return getStore((await ctx.params).id);
}

function failed(e: unknown) {
  if (e instanceof DataInputError) return json({ error: e.message }, 400);
  if (e instanceof DataForbidden) return json({ error: e.message }, 403);
  return json({ error: "The app's data is unavailable right now. Try again soon." }, 503);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** A collection's items, as this device may see them. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    if (!rateLimit(`data-read:${clientIp(req)}`, 240, 60 * 1000).ok) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const store = await load(ctx);
    if (!store) return json({ error: "This app's data isn't available." }, 404);
    const url = new URL(req.url);
    return json({ items: await listItems(store, url.searchParams.get("collection") ?? "", checkDevice(req.headers.get("x-device"))) });
  } catch (e) {
    return failed(e);
  }
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new DataInputError("Invalid request.");
  return b as Record<string, unknown>;
}

/** Adds an item (inbox, shared and private collections). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const store = await load(ctx);
    if (!store) return json({ error: "This app's data isn't available." }, 404);
    const b = await body(req);
    const collection = String(b.collection ?? "");
    // Private data is the person's own; what reaches the business or other customers is limited harder.
    const limit = store.rules[collection]?.access === "private" ? 600 : 30;
    if (!rateLimit(`data-add:${store.id}:${clientIp(req)}`, limit, 60 * 60 * 1000).ok) return json({ error: "Too many sent from this device. Please try again later." }, 429);
    return json({ item: await addItem(store, collection, checkDevice(req.headers.get("x-device")), b.data) });
  } catch (e) {
    return failed(e);
  }
}

/** Changes one of this device's own items. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const store = await load(ctx);
    if (!store) return json({ error: "This app's data isn't available." }, 404);
    if (!rateLimit(`data-edit:${store.id}:${clientIp(req)}`, 300, 60 * 60 * 1000).ok) return json({ error: "Too many changes. Please try again later." }, 429);
    const b = await body(req);
    return json({ item: await updateItem(store, String(b.collection ?? ""), checkDevice(req.headers.get("x-device")), String(b.id ?? ""), b.data) });
  } catch (e) {
    return failed(e);
  }
}

/** Deletes one of this device's own items. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const store = await load(ctx);
    if (!store) return json({ error: "This app's data isn't available." }, 404);
    if (!rateLimit(`data-edit:${store.id}:${clientIp(req)}`, 300, 60 * 60 * 1000).ok) return json({ error: "Too many changes. Please try again later." }, 429);
    const url = new URL(req.url);
    await removeItem(store, url.searchParams.get("collection") ?? "", checkDevice(req.headers.get("x-device")), url.searchParams.get("id") ?? "");
    return json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}
