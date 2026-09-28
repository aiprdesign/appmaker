import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { checkProjectId, deleteProject, getProject, saveProject } from "@/lib/server/cloud-projects";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const project = await getProject(user.id, checkProjectId((await ctx.params).id));
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ project });
  } catch (e) {
    return accountError(e);
  }
}

/** Saves the browser's copy; a newer copy already in the account wins (409). */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`project-save:${user.id}`, 1200, 60 * 60 * 1000).ok) {
      return Response.json({ error: "Saving too often. Try again shortly." }, { status: 429 });
    }
    const id = checkProjectId((await ctx.params).id);
    const body = await readBody(req);
    const project = body.project as Record<string, unknown> | undefined;
    if (!project || typeof project !== "object" || project.id !== id) throw new AuthError("project is invalid", 400);
    const result = await saveProject(user.id, id, project);
    return Response.json(result, { status: result.saved ? 200 : 409 });
  } catch (e) {
    return accountError(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) throw new AuthError("Cross-site request refused.", 403);
    if (!rateLimit(`project-delete:${clientIp(req)}`, 300, 60 * 60 * 1000).ok) return Response.json({ error: "Too many deletions." }, { status: 429 });
    await deleteProject(user.id, checkProjectId((await ctx.params).id));
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
