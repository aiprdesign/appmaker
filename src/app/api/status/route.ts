import { envReport } from "@/lib/env-check";
import { databaseHealth } from "@/lib/server/db";
import { googleConfigured, redirectUri } from "@/lib/server/google";

export const dynamic = "force-dynamic";

/** Which settings the server can see (names only), whether the database answers, and Google sign-in setup. */
export async function GET(req: Request) {
  return Response.json({
    ...envReport(),
    database: await databaseHealth(),
    google: { configured: googleConfigured(), redirectUri: redirectUri(req) },
  });
}
