import { listProjects } from "@/lib/server/cloud-projects";
import { accountError, requireUser } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's projects (names and timestamps, including deletions). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json({ projects: await listProjects(user.id) });
  } catch (e) {
    return accountError(e);
  }
}
