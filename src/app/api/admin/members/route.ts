import { members } from "@/lib/server/admin-data";
import { requireAdmin } from "@/lib/server/admin-guard";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin(req, true);
    const url = new URL(req.url);
    const search = (url.searchParams.get("q") ?? "").slice(0, 200);
    const offset = Math.max(0, Math.min(1_000_000, Number(url.searchParams.get("offset")) || 0));
    return Response.json(await members(search, offset));
  } catch (e) {
    return accountError(e);
  }
}
