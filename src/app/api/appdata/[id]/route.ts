import { DataInputError } from "@/lib/app-data";
import { createHash } from "node:crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DataForbidden, addItem, cancelItem, checkDevice, forgetDevice, getStore, listItems, removeItem, setPushToken, updateItem } from "@/lib/server/app-data";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };

// Called by the apps (and the builder's preview, which runs in a sandbox).
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE",
  "access-control-allow-headers": "content-type, x-device, x-push-token, if-none-match",
  "access-control-expose-headers": "etag",
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
    const collection = url.searchParams.get("collection") ?? "";
    // Public data (a menu, offers) is the same for everyone: no device needed, and caches may keep it briefly.
    const isPublic = store.rules[collection]?.access === "public" && Object.hasOwn(store.rules, collection);
    const device = isPublic && !req.headers.get("x-device") ? "public-reader-000" : checkDevice(req.headers.get("x-device"));
    const body = JSON.stringify({ items: await listItems(store, collection, device) });
    // Unchanged since the app's last look: a tiny "not modified" reply instead of the whole list.
    const etag = `"${createHash("sha1").update(body).digest("base64url").slice(0, 22)}"`;
    const cache = isPublic ? "public, max-age=15, stale-while-revalidate=60" : "private, no-cache";
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...CORS, etag, "cache-control": cache } });
    return new Response(body, { status: 200, headers: { ...CORS, "content-type": "application/json", etag, "cache-control": cache } });
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
    return json({ item: await addItem(store, collection, checkDevice(req.headers.get("x-device")), b.data, req.headers.get("x-push-token")) });
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
    const [collection, device, id] = [String(b.collection ?? ""), checkDevice(req.headers.get("x-device")), String(b.id ?? "")];
    if (b.pushToken !== undefined) {
      await setPushToken(store, collection, device, id, b.pushToken);
      return json({ ok: true });
    }
    if (b.cancel === true) return json({ item: await cancelItem(store, collection, device, id) });
    return json({ item: await updateItem(store, collection, device, id, b.data) });
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
    // "Delete my data" in the app.
    if (url.searchParams.get("all") === "1") return json({ ok: true, removed: await forgetDevice(store, checkDevice(req.headers.get("x-device"))) });
    await removeItem(store, url.searchParams.get("collection") ?? "", checkDevice(req.headers.get("x-device")), url.searchParams.get("id") ?? "");
    return json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}
