import { parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { easAvailable, ensureExpoDeps, whoami } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Whether this server can run cloud builds. */
export async function GET() {
  return Response.json({ available: easAvailable() });
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
