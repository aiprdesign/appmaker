import { AndroidPushError, androidPackage, parseServiceAccount } from "@/lib/android-push";
import { feature } from "@/lib/server/features";
import { buildLimit, easErrorResponse, readJson, resolveToken } from "@/lib/eas/respond";
import { setAndroidPushKey } from "@/lib/eas/push";

export const runtime = "nodejs";

/** Gives Expo the app's Firebase key for Android notifications (passed straight through, never stored). */
export async function POST(req: Request) {
  try {
    if (!(await feature("cloudBuilds"))) return Response.json({ error: "Cloud builds are turned off on this site." }, { status: 403 });
    const body = await readJson(req);
    const { token, hosted } = resolveToken(body.token);
    const limited = buildLimit(req, "push-key", hosted);
    if (limited) return limited;
    const projectId = typeof body.projectId === "string" && /^[0-9a-f-]{36}$/i.test(body.projectId) ? body.projectId : null;
    const bundleId = typeof body.bundleId === "string" && /^[A-Za-z][A-Za-z0-9_.-]{2,150}$/.test(body.bundleId) ? body.bundleId : null;
    if (!projectId || !bundleId) return Response.json({ error: "Build the app once with Expo first, then set up Android notifications." }, { status: 400 });
    let key;
    try {
      key = parseServiceAccount(typeof body.serviceAccount === "string" ? body.serviceAccount : "", typeof body.firebaseProject === "string" ? body.firebaseProject : undefined);
    } catch (e) {
      return Response.json({ error: e instanceof AndroidPushError ? e.message : "Invalid key." }, { status: 400 });
    }
    await setAndroidPushKey(token, projectId, androidPackage(bundleId), key);
    return Response.json({ ok: true });
  } catch (e) {
    return easErrorResponse(e);
  }
}
