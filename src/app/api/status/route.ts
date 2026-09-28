import { envReport } from "@/lib/env-check";
import { databaseHealth } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Which settings the server can see (names only), and whether the database answers. */
export async function GET() {
  return Response.json({ ...envReport(), database: await databaseHealth() });
}
