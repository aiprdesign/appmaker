import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { checkProjectId } from "@/lib/server/cloud-projects";
import { createFeed } from "@/lib/server/live";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import { requireFeature } from "@/lib/server/features";
import { normalizeUrl, SiteError } from "@/lib/site";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

function feedUrl(req: Request, id: string): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${host ? `${proto}://${host}` : new URL(req.url).origin}/api/live/${id}`;
}

/** Turns on live updates from a website for one of the user's apps. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    await requireFeature("websiteImport");
    if (!rateLimit(`live-create:${user.id}`, 30, 60 * 60 * 1000).ok) return Response.json({ error: "Too many changes. Try again later." }, { status: 429 });
    const body = await readBody(req);
    const projectId = checkProjectId(String(body.projectId ?? ""));
    let url: string;
    try {
      url = normalizeUrl(String(body.url ?? "")).toString();
    } catch (e) {
      throw new AuthError(e instanceof SiteError ? e.message : "Enter a valid website address.", 400);
    }
    const feed = await createFeed(user.id, projectId, url);
    return Response.json({ ...feed, feedUrl: feedUrl(req, feed.id) });
  } catch (e) {
    return accountError(e);
  }
}
