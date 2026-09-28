import { getFeatures } from "@/lib/server/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which optional features are on, for the browser to show or hide them. */
export async function GET() {
  return Response.json(await getFeatures());
}
