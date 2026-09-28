import { parseIcon, parseProject, parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { linkProject } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Creates the app's project on the user's Expo account (once per app). */
export async function POST(req: Request) {
  if (!rateLimit(`eas-link:${clientIp(req)}`, 20, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  try {
    const body = await readJson(req);
    const token = parseToken(body.token);
    const link = await linkProject(token, parseProject(body.project), parseIcon(body.icon));
    return Response.json({ link });
  } catch (e) {
    return easErrorResponse(e);
  }
}
