import { AuthError, createSession, sessionCookie } from "@/lib/server/auth";
import { clearedOAuthCookie, finishGoogleSignIn, googleConfigured, siteOrigin, userForGoogle } from "@/lib/server/google";
import { databaseConfigured } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google sends the browser back here; sign in and go to My apps. */
export async function GET(req: Request) {
  const origin = siteOrigin(req);
  const back = (path: string, extra: string[] = []) => {
    const headers = new Headers({ location: `${origin}${path}`, "cache-control": "no-store" });
    headers.append("set-cookie", clearedOAuthCookie());
    for (const c of extra) headers.append("set-cookie", c);
    return new Response(null, { status: 303, headers });
  };
  if (!databaseConfigured() || !googleConfigured()) return back("/login?error=google-off");
  try {
    const google = await finishGoogleSignIn(req);
    const user = await userForGoogle(google.sub, google.email);
    const { token, maxAge } = await createSession(user.id);
    return back("/projects", [sessionCookie(req, token, maxAge)]);
  } catch (e) {
    const message = e instanceof AuthError ? e.message : "Google sign-in failed. Try again.";
    if (!(e instanceof AuthError)) console.error("[google]", e instanceof Error ? e.message : "unknown error");
    return back(`/login?error=${encodeURIComponent(message)}`);
  }
}
