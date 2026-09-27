import { serverConfig } from "@/lib/ai/server";

export const dynamic = "force-dynamic";

/** Tells the settings UI which providers the site owner has keys for. */
export function GET() {
  return Response.json(serverConfig());
}
