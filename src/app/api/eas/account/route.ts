import { parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { easAvailable, ensureExpoDeps, hostedToken, whoami } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { feature } from "@/lib/server/features";

export const runtime = "nodejs";

/**
 * Whether this server can run cloud builds, and whether it runs them on its
 * own Expo account. With ?check=1 (the status page), also confirms with Expo
 * that the site's token works.
 */
export async function GET(req: Request) {
  if (!(await feature("cloudBuilds"))) return Response.json({ available: false, hosted: false, off: true });
  const available = easAvailable();
  const token = hostedToken();
  const hosted = available && !!token;
  // Warm up the Expo packages builds need, so the first build starts sooner.
  if (hosted) ensureExpoDeps().catch(() => {});
  if (!token || new URL(req.url).searchParams.get("check") !== "1") return Response.json({ available, hosted });
  if (!rateLimit(`eas-check:${clientIp(req)}`, 20, 60 * 60 * 1000).ok) {
    return Response.json({ available, hosted, error: "Too many checks. Try again later." });
  }
  try {
    const who = await whoami(token);
    return Response.json({ available, hosted, account: process.env.APPMAKER_EXPO_ACCOUNT?.trim() || who.account });
  } catch (e) {
    return Response.json({ available, hosted, error: e instanceof Error ? e.message : "Expo didn't accept the site's token." });
  }
}

/** Checks an Expo access token and returns who it belongs to. */
export async function POST(req: Request) {
  if (!rateLimit(`eas-account:${clientIp(req)}`, 30, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  try {
    const token = parseToken((await readJson(req)).token);
    const account = await whoami(token);
    // Warm up the Expo packages builds need, so the first build starts sooner.
    if (easAvailable()) ensureExpoDeps().catch(() => {});
    return Response.json({ ...account, available: easAvailable() });
  } catch (e) {
    return easErrorResponse(e);
  }
}
