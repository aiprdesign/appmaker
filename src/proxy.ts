import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/server/admin";
import { ACCESS_COOKIE, ipAllowed, openWhileLocked, siteLocked, trustedIp, validAccessToken } from "@/lib/server/site-access";

/**
 * The site lock: with SITE_PIN set, visitors enter the PIN before using the
 * site. Allowlisted addresses (SITE_ALLOWED_IPS) and a signed-in admin skip it.
 */
export function proxy(request: NextRequest) {
  if (!siteLocked()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (openWhileLocked(pathname) || validAccessToken(request.cookies.get(ACCESS_COOKIE)?.value) || ipAllowed(trustedIp(request)) || isAdmin(request)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This site is locked. Enter the PIN to continue." }, { status: 401 });
  }
  const url = new URL("/access", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own files and files with an extension (images, the preview runtime, robots.txt…).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
