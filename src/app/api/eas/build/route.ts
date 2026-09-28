import { InputError, parseAscAppId, parseAscKey, parseIcon, parseLink, parseProject, parseTarget, parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { startBuild } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Starts a build on Expo's servers; iOS builds can go straight to App Store Connect. */
export async function POST(req: Request) {
  if (!rateLimit(`eas-build:${clientIp(req)}`, 20, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many builds. Try again later." }, { status: 429 });
  }
  try {
    const body = await readJson(req);
    const token = parseToken(body.token);
    const link = parseLink(body.link);
    if (!link) throw new InputError("Link the app to Expo first.");
    const target = parseTarget(body.target);
    const ascKey = parseAscKey(body.ascKey);
    const ascAppId = parseAscAppId(body.ascAppId);
    let submit: { ascAppId: string; ascKey: NonNullable<typeof ascKey> } | undefined;
    if (body.submit === true) {
      if (target !== "ios") throw new InputError("Automatic upload is only available for App Store builds.");
      if (!ascAppId || !ascKey) throw new InputError("Add the App Store Connect Apple ID and API key to upload automatically.");
      submit = { ascAppId, ascKey };
    }
    const builds = await startBuild({
      token,
      project: parseProject(body.project),
      icon: parseIcon(body.icon),
      link,
      target,
      submit,
      ascKey,
    });
    return Response.json({ builds });
  } catch (e) {
    return easErrorResponse(e);
  }
}
