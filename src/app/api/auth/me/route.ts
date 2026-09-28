import { currentUser } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { googleConfigured } from "@/lib/server/google";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether accounts are on, and who is signed in. */
export async function GET(req: Request) {
  if (!databaseConfigured()) return Response.json({ enabled: false, user: null });
  try {
    const user = await currentUser(req);
    return Response.json({ enabled: true, google: googleConfigured(), user: user ? { email: user.email } : null });
  } catch (e) {
    const res = accountError(e);
    const body = await res.json();
    return Response.json({ enabled: true, google: googleConfigured(), user: null, error: body.error }, { status: 200 });
  }
}
