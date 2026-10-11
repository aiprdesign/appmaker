import { checkExpo } from "@/lib/eas/check";
import { parseLink, parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { feature } from "@/lib/server/features";

export const runtime = "nodejs";

/** The build check: can this app reach Expo and build without errors? */
export async function POST(req: Request) {
  if (!rateLimit(`eas-check-app:${clientIp(req)}`, 30, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many checks. Try again later." }, { status: 429 });
  }
  try {
    const body = await readJson(req);
    const token = typeof body.token === "string" && body.token.trim() ? parseToken(body.token) : undefined;
    return Response.json(await checkExpo({ token, link: parseLink(body.link), cloudBuilds: await feature("cloudBuilds") }));
  } catch (e) {
    return easErrorResponse(e);
  }
}
