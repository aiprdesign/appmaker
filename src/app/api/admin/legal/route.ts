import { requireAdmin } from "@/lib/server/admin-guard";
import { assertSameOrigin } from "@/lib/server/auth";
import { accountError, readBody, requireDatabase } from "@/lib/server/respond";
import { getLegal, setLegal } from "@/lib/server/site-legal";

export const runtime = "nodejs";

/** The details shown on /terms and /privacy. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return Response.json({ legal: await getLegal() });
  } catch (e) {
    return accountError(e);
  }
}

export async function POST(req: Request) {
  try {
    requireAdmin(req, true);
    assertSameOrigin(req);
    requireDatabase();
    const body = await readBody(req);
    return Response.json({ legal: await setLegal(body.legal) });
  } catch (e) {
    return accountError(e);
  }
}
