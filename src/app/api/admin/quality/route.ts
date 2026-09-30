import { requireAdmin } from "@/lib/server/admin-guard";
import { qualityReport } from "@/lib/server/quality";
import { accountError, requireDatabase } from "@/lib/server/respond";

export const runtime = "nodejs";

/** What happened to AI builds over the last 30 days, for the admin Quality tab. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    requireDatabase();
    return Response.json(await qualityReport(30));
  } catch (e) {
    return accountError(e);
  }
}
