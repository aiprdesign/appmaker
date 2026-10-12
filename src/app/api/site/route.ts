import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SiteError, importSite } from "@/lib/site";
import { MAX_SITE_IMAGES } from "@/lib/site-details";
import { renderSite, screenshotsAvailable } from "@/lib/site-shots";
import { feature } from "@/lib/server/features";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Website imports allowed per client IP per hour. */
const HOURLY_LIMIT = Number(process.env.APPMAKER_IMPORT_RATE_LIMIT) || 30;

export async function POST(req: Request) {
  if (!(await feature("websiteImport"))) return Response.json({ error: "Building from a website is turned off on this site." }, { status: 403 });
  let url: unknown;
  let body: { url?: unknown; kind?: unknown };
  try {
    body = await req.json();
    url = body.url;
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
    const site = await importSite(url);
    // Few pictures found: render the page in a browser (when this server has one) to find
    // the ones JavaScript shows, and for a redesign, cut parts of a screenshot to use.
    const redesign = body.kind === "website";
    const few = (site.images?.length ?? 0) < 4;
    if (few && (await screenshotsAvailable())) {
      const shown = await renderSite(site.url, { shots: redesign });
      const seen = new Set([...(site.images ?? []), site.logo, ...(site.clientLogos ?? []).map((l) => l.src)]);
      site.images = [...(site.images ?? []), ...shown.images.filter((u) => !seen.has(u))].slice(0, MAX_SITE_IMAGES);
      // Screenshot parts only when the real pictures are still too few to design with.
      if (redesign && (site.images?.length ?? 0) < 3 && shown.shots.length) {
        site.screenshots = shown.shots.map(({ path, label, width, height }) => ({ path, label, width, height }));
        return Response.json({ site, assets: Object.fromEntries(shown.shots.map((s) => [s.path, s.dataUrl])) });
      }
    }
    return Response.json({ site });
  } catch (e) {
    if (e instanceof SiteError) return Response.json({ error: e.message }, { status: 422 });
    console.error("site import failed", e);
    return Response.json({ error: "Couldn't read that website." }, { status: 500 });
  }
}
