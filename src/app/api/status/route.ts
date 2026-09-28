import { envReport } from "@/lib/env-check";
import { databaseHealth } from "@/lib/server/db";
import { googleConfigured, redirectUri } from "@/lib/server/google";
import { feature } from "@/lib/server/features";
import { isAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Which settings the server can see (names only), whether the database answers, and Google sign-in setup. */
export async function GET(req: Request) {
  if (!(await feature("publicStatus")) && !isAdmin(req)) return Response.json({ private: true, error: "The status page is private." }, { status: 403 });
  return Response.json({
    ...envReport(),
    database: await databaseHealth(),
    google: { configured: googleConfigured(), redirectUri: redirectUri(req) },
  });
}
