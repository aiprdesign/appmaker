import { requireFeature } from "@/lib/server/features";
import { assertSameOrigin } from "@/lib/server/auth";
import { authenticationOptions } from "@/lib/server/passkeys";
import { accountError, requireDatabase } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Starts a passkey sign-in. */
export async function POST(req: Request) {
  try {
    requireDatabase();
    assertSameOrigin(req);
    await requireFeature("passkeys");
    if (!rateLimit(`passkey-options:${clientIp(req)}`, 60, 15 * 60 * 1000).ok) {
      return Response.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
    }
    const { options, cookie } = await authenticationOptions(req);
    return Response.json({ options }, { headers: { "set-cookie": cookie } });
  } catch (e) {
    return accountError(e);
  }
}
