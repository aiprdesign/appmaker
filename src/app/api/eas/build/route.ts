import { InputError, parseAscAppId, parseAscKey, parseIcon, parseLink, parseProject, parseSigning, parseTarget } from "@/lib/eas/input";
import { buildLimit, easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { startBuild } from "@/lib/eas/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Starts a build on Expo's servers; iOS builds can go straight to App Store Connect. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { token, hosted } = resolveToken(body.token);
    const link = parseLink(body.link);
    if (!link) throw new InputError("Link the app to Expo first.");
    const target = parseTarget(body.target);
    const ascKey = parseAscKey(body.ascKey);
    const ascAppId = parseAscAppId(body.ascAppId);
    // On the site's Expo account there is no one to sign in to Apple, so
    // Appmaker signs iOS builds itself with the user's Team API key.
    if (hosted && target === "ios" && !ascKey?.issuerId) {
      throw new InputError("Add your App Store Connect API key (a Team key with an Issuer ID) in Apple setup first.");
    }
    let submit: { ascAppId: string; ascKey: NonNullable<typeof ascKey> } | undefined;
    if (body.submit === true) {
      if (target !== "ios") throw new InputError("Automatic upload is only available for App Store builds.");
      if (!ascAppId || !ascKey) throw new InputError("Add the App Store Connect Apple ID and API key to upload automatically.");
      submit = { ascAppId, ascKey };
    }
    const project = parseProject(body.project);
    const icon = parseIcon(body.icon);
    const limited = buildLimit(req, "build", hosted);
    if (limited) return limited;
    const result = await startBuild({ token, project, icon, link, target, submit, ascKey, signing: parseSigning(body.signing) });
    return Response.json(result);
  } catch (e) {
    return easErrorResponse(e);
  }
}
