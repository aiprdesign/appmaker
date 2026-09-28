import { assertSameOrigin, clearedCookie, deleteSession, sessionToken } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const token = sessionToken(req);
    if (token && databaseConfigured()) await deleteSession(token);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
  } catch (e) {
    return accountError(e);
  }
}
