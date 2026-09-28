import { AuthError } from "@/lib/server/auth";
import { removePasskey } from "@/lib/server/passkeys";
import { accountError, requireUser } from "@/lib/server/respond";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) throw new AuthError("Cross-site request refused.", 403);
    const { id } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(id)) throw new AuthError("Invalid passkey id.", 400);
    await removePasskey(user.id, id);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
