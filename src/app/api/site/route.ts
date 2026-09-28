import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SiteError, importSite } from "@/lib/site";
import { feature } from "@/lib/server/features";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Website imports allowed per client IP per hour. */
const HOURLY_LIMIT = Number(process.env.APPMAKER_IMPORT_RATE_LIMIT) || 30;

export async function POST(req: Request) {
  if (!(await feature("websiteImport"))) return Response.json({ error: "Building from a website is turned off on this site." }, { status: 403 });
  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim() || url.length > 2_000) {
    return Response.json({ error: "Enter a website address." }, { status: 400 });
  }

  const limit = rateLimit(`site:${clientIp(req)}`, HOURLY_LIMIT, 60 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many website imports. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    return Response.json({ site: await importSite(url) });
  } catch (e) {
    if (e instanceof SiteError) return Response.json({ error: e.message }, { status: 422 });
    console.error("site import failed", e);
    return Response.json({ error: "Couldn't read that website." }, { status: 500 });
  }
}
