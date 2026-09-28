import { googleConfigured, startGoogleSignIn } from "@/lib/server/google";
import { databaseConfigured } from "@/lib/server/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the browser to Google's sign-in page. */
export function GET(req: Request) {
  if (!databaseConfigured() || !googleConfigured()) return Response.redirect(new URL("/login?error=google-off", req.url), 303);
  if (!rateLimit(`google-start:${clientIp(req)}`, 30, 15 * 60 * 1000).ok) {
    return Response.redirect(new URL("/login?error=too-many", req.url), 303);
  }
  const { location, cookie } = startGoogleSignIn(req);
  return new Response(null, { status: 303, headers: { location, "set-cookie": cookie, "cache-control": "no-store" } });
}
