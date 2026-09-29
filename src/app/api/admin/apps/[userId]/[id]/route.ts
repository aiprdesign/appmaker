import { appDetail, deleteApp } from "@/lib/server/admin-data";
import { requireAdmin } from "@/lib/server/admin-guard";
import { AuthError } from "@/lib/server/auth";
import { accountError } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string; id: string }> };

async function ids(ctx: Ctx) {
  const { userId, id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(userId) || !/^[a-z0-9]{6,32}$/.test(id)) throw new AuthError("Invalid app.", 400);
  return { userId, id };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    requireAdmin(req, true);
    const { userId, id } = await ids(ctx);
    const detail = await appDetail(userId, id);
    if (!detail) return Response.json({ error: "That app no longer exists." }, { status: 404 });
    return Response.json(detail);
  } catch (e) {
    return accountError(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    requireAdmin(req, true);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) throw new AuthError("Cross-site request refused.", 403);
    const { userId, id } = await ids(ctx);
    if (!(await deleteApp(userId, id))) return Response.json({ error: "That app no longer exists." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
