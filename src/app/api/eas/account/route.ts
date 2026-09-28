import { parseToken } from "@/lib/eas/input";
import { easErrorResponse, readJson } from "@/lib/eas/respond";
import { easAvailable, ensureExpoDeps, hostedToken, whoami } from "@/lib/eas/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Whether this server can run cloud builds, and whether it runs them on its own Expo account. */
export async function GET() {
  const available = easAvailable();
  const hosted = available && !!hostedToken();
  // Warm up the Expo packages builds need, so the first build starts sooner.
  if (hosted) ensureExpoDeps().catch(() => {});
  return Response.json({ available, hosted });
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
