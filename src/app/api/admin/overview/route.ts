import { overview } from "@/lib/server/admin-data";
import { requireAdmin } from "@/lib/server/admin-guard";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requireAdmin(req, true);
    return Response.json(await overview());
  } catch (e) {
    return accountError(e);
  }
}
