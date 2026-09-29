import { apps } from "@/lib/server/admin-data";
import { requireAdmin } from "@/lib/server/admin-guard";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Apps in accounts; ?q= searches name, owner and prompt; ?user= shows one member's apps. */
export async function GET(req: Request) {
  try {
    requireAdmin(req, true);
    const url = new URL(req.url);
    const search = (url.searchParams.get("q") ?? "").slice(0, 200);
    const user = url.searchParams.get("user");
    const offset = Math.max(0, Math.min(1_000_000, Number(url.searchParams.get("offset")) || 0));
    return Response.json(await apps(search, user && /^[A-Za-z0-9_-]{8,40}$/.test(user) ? user : null, offset));
  } catch (e) {
    return accountError(e);
  }
}
