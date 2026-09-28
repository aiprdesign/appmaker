import { parseIcon, parseProject } from "@/lib/eas/input";
import { buildLimit, easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { linkProject } from "@/lib/eas/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Creates the app's project on Expo (once per app): on the user's account, or the site's. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { token, hosted } = resolveToken(body.token);
    const project = parseProject(body.project);
    const icon = parseIcon(body.icon);
    const limited = buildLimit(req, "link", hosted);
    if (limited) return limited;
    const link = await linkProject(token, project, icon);
    return Response.json({ link });
  } catch (e) {
    return easErrorResponse(e);
  }
}
