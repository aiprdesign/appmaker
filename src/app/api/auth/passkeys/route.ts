import { listPasskeys } from "@/lib/server/passkeys";
import { accountError, requireUser } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json({ passkeys: await listPasskeys(user.id) });
  } catch (e) {
    return accountError(e);
  }
}
