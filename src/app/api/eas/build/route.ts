import { feature } from "@/lib/server/features";
import { InputError, parseAscAppId, parseAscKey, parseIcon, parseLink, parseProject, parseSigning, parseTarget } from "@/lib/eas/input";
import { buildLimit, easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { startBuild } from "@/lib/eas/server";
import { charge, CreditsError, creditsResponse, refund, requirePaidPlan } from "@/lib/server/credits";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Starts a build on Expo's servers; iOS builds can go straight to App Store Connect. */
export async function POST(req: Request) {
  try {
    if (!(await feature("cloudBuilds"))) return Response.json({ error: "Cloud builds are turned off on this site. Download the project to build it yourself." }, { status: 403 });
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
    // Store builds are part of the paid plan (when payments are on).
    await requirePaidPlan(req, "storeBuilds");
    const limited = buildLimit(req, "build", hosted);
    if (limited) return limited;
    // Builds on the site's Expo account cost credits when payments are on.
    const paid = hosted ? await charge(req, "build", { reason: `Cloud build (${target})` }) : { userId: null, charged: false };
    try {
      const result = await startBuild({ token, project, icon, link, target, submit, ascKey, signing: parseSigning(body.signing) });
      return Response.json(result);
    } catch (e) {
      if (paid.charged && paid.userId) await refund(paid.userId, "build", "Refund: the build didn't start").catch(() => {});
      throw e;
    }
  } catch (e) {
    if (e instanceof CreditsError) return creditsResponse(e);
    return easErrorResponse(e);
  }
}
