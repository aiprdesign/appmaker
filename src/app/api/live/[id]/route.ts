import { after } from "next/server";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { deleteFeed, getFeed, isStale, refreshFeed } from "@/lib/server/live";
import { accountError, requireUser } from "@/lib/server/respond";
import { databaseConfigured } from "@/lib/server/db";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

// Public content, read by the apps (and the builder's preview, which runs in a sandbox).
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" };

/**
 * An app's live content. Served from the saved copy straight away; if it's
 * more than a day old, the website is re-read after the response is sent.
 */
export async function GET(_req: Request, ctx: Ctx) {
  if (!databaseConfigured()) return Response.json({ error: "Not found" }, { status: 404, headers: CORS });
  try {
    const feed = await getFeed((await ctx.params).id);
    if (!feed) return Response.json({ error: "Not found" }, { status: 404, headers: CORS });
    if (isStale(feed)) {
      const refresh = () => refreshFeed(feed.id, feed.url).then(() => undefined);
      try {
        after(refresh);
      } catch {
        // Outside a request scope (tests): run it in the background instead.
        void refresh().catch(() => undefined);
      }
    }
    if (!feed.content) return Response.json({ error: "Not ready yet" }, { status: 404, headers: CORS });
    return Response.json(feed.content, {
      headers: { ...CORS, "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ error: "Unavailable" }, { status: 503, headers: CORS });
  }
}

/** Owner only: read the website again now. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const feed = await getFeed((await ctx.params).id);
    if (!feed || feed.userId !== user.id) throw new AuthError("Not found.", 404);
    if (!rateLimit(`live-refresh:${feed.id}`, 6, 60 * 60 * 1000).ok)
      return Response.json({ error: "Refreshed recently. Try again in a few minutes." }, { status: 429 });
    const fresh = await refreshFeed(feed.id, feed.url);
    if (!fresh) return Response.json({ error: "Already refreshing. Try again in a moment." }, { status: 409 });
    return Response.json(fresh);
  } catch (e) {
    return accountError(e);
  }
}

/** Owner only: turn live updates off. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const ok = await deleteFeed(user.id, (await ctx.params).id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found." }, { status: 404 });
  } catch (e) {
    return accountError(e);
  }
}
