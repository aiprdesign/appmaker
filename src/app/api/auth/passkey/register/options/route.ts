import { requireFeature } from "@/lib/server/features";
import { assertSameOrigin } from "@/lib/server/auth";
import { registrationOptions } from "@/lib/server/passkeys";
import { accountError, requireUser } from "@/lib/server/respond";

export const runtime = "nodejs";

/** Starts adding a passkey to the signed-in account. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    await requireFeature("passkeys");
    const { options, cookie } = await registrationOptions(req, user);
    return Response.json({ options }, { headers: { "set-cookie": cookie } });
  } catch (e) {
    return accountError(e);
  }
}
