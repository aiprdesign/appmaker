import { envReport } from "@/lib/env-check";

export const dynamic = "force-dynamic";

/** Which settings the server can see, by name only, for the status page. */
export function GET() {
  return Response.json(envReport());
}
