import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/server/app-data";
import { cachedStore, startListening, version } from "@/lib/server/data-versions";
import { databaseConfigured } from "@/lib/server/db";
import { feature } from "@/lib/server/features";

type Ctx = { params: Promise<{ id: string }> };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "access-control-allow-headers": "content-type" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * "Has anything changed?": the version of each of the app's collections, from
 * memory (no database work once the app's rules are cached). The app compares
 * them with what it has and fetches only the collections that changed.
 */
export async function GET(req: Request, ctx: Ctx) {
  if (!rateLimit(`data-versions:${clientIp(req)}`, 300, 60 * 1000).ok) return Response.json({ error: "Too many requests." }, { status: 429, headers: CORS });
  if (!databaseConfigured() || !(await feature("appData"))) return Response.json({ error: "This app's data isn't available." }, { status: 404, headers: CORS });
  void startListening();
  const id = (await ctx.params).id;
  const store = await cachedStore(id, getStore).catch(() => null);
  if (!store) return Response.json({ error: "This app's data isn't available." }, { status: 404, headers: CORS });
  const versions = Object.fromEntries(store.collections.map((c) => [c, version(store.id, c)]));
  return Response.json({ versions }, { headers: { ...CORS, "cache-control": "no-store" } });
}
