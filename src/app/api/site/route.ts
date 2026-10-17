import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkImages, logoLoads, SiteError, importSite } from "@/lib/site";
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
    const redesign = body.kind === "website";
    const assets: Record<string, string> = {};
    const pictures = () => (site.images?.length ?? 0) + (site.localImages?.length ?? 0);
    // A redesign shows only pictures that really load: http-only ones are saved with the
    // project (https pages can't show them), broken ones dropped.
    const check = async (urls: string[]) => {
      const { ok, local } = await checkImages(urls, 12 - (site.localImages?.length ?? 0), (site.localImages?.length ?? 0) + 1);
      for (const l of local) assets[l.path] = l.dataUrl;
      site.localImages = [...(site.localImages ?? []), ...local.map(({ path, from, width, height }) => ({ path, from, width, height }))];
      return ok;
    };
    // A logo that doesn't load would show as a broken picture in every design.
    const [, logoOk] = await Promise.all([redesign && site.images?.length ? check(site.images).then((ok) => (site.images = ok)) : null, redesign && site.logo ? logoLoads(site.logo) : true]);
    if (!logoOk) delete site.logo;
    // Still few pictures: render the page in a browser to find the ones JavaScript shows,
    // and for a redesign, cut parts of a screenshot.
    if (pictures() < 4 && (await screenshotsAvailable())) {
      const shown = await renderSite(site.url, { shots: redesign });
      const seen = new Set([...(site.images ?? []), site.logo, ...(site.clientLogos ?? []).map((l) => l.src)]);
      const fresh = shown.images.filter((u) => !seen.has(u));
      site.images = [...(site.images ?? []), ...(redesign && fresh.length ? await check(fresh) : fresh)].slice(0, MAX_SITE_IMAGES);
      // Screenshot parts only matter when the real pictures are still too few to design with.
      if (redesign && shown.shots.length && pictures() < 3) {
        site.screenshots = shown.shots.map(({ path, label, width, height }) => ({ path, label, width, height }));
        for (const s of shown.shots) assets[s.path] = s.dataUrl;
      }
    }
    if (!site.localImages?.length) delete site.localImages;
    return Response.json(Object.keys(assets).length ? { site, assets } : { site });
  } catch (e) {
    if (e instanceof SiteError) return Response.json({ error: e.message }, { status: 422 });
    console.error("site import failed", e);
    return Response.json({ error: "Couldn't read that website." }, { status: 500 });
  }
}
