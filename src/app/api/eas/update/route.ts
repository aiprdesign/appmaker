import { feature } from "@/lib/server/features";
import { InputError, parseIcon, parseLink, parseProject } from "@/lib/eas/input";
import { buildLimit, easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { publishUpdate } from "@/lib/eas/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Publishes the app for Expo Go (EAS Update) so it can be opened on a phone from a QR code. */
export async function POST(req: Request) {
  try {
    if (!(await feature("cloudBuilds"))) return Response.json({ error: "Phone previews are turned off on this site." }, { status: 403 });
    const body = await readJson(req);
    const { token, hosted } = resolveToken(body.token);
    const link = parseLink(body.link);
    if (!link) throw new InputError("Link the app to Expo first.");
    const project = parseProject(body.project);
    const icon = parseIcon(body.icon);
    const limited = buildLimit(req, "update", hosted);
    if (limited) return limited;
    return Response.json({ preview: await publishUpdate({ token, project, icon, link }) });
  } catch (e) {
    return easErrorResponse(e);
  }
}
