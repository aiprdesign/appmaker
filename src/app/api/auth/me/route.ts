import { currentUser } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { getFeatures } from "@/lib/server/features";
import { googleEnabled } from "@/lib/server/google";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether accounts are on, and who is signed in. */
export async function GET(req: Request) {
  if (!databaseConfigured()) return Response.json({ enabled: false, user: null });
  try {
    const user = await currentUser(req);
    const features = await getFeatures();
    return Response.json({
      enabled: true,
      google: await googleEnabled(),
      passkeys: features.passkeys,
      signups: features.signups,
      user: user ? { email: user.email } : null,
    });
  } catch (e) {
    const res = accountError(e);
    const body = await res.json();
    return Response.json({ enabled: true, google: false, passkeys: false, signups: false, user: null, error: body.error }, { status: 200 });
  }
}
