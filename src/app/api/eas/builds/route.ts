import { parseBuildIds } from "@/lib/eas/input";
import { easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { getBuilds } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Current status of cloud builds (and their App Store uploads). */
export async function POST(req: Request) {
  if (!rateLimit(`eas-status:${clientIp(req)}`, 600, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many status checks. Try again later." }, { status: 429 });
  }
  try {
    const body = await readJson(req);
    const { token } = resolveToken(body.token);
    const builds = await getBuilds(token, parseBuildIds(body.ids));
    return Response.json({ builds });
  } catch (e) {
    return easErrorResponse(e);
  }
}
