import { deleteMember, signOutMember } from "@/lib/server/admin-data";
import { requireAdmin } from "@/lib/server/admin-guard";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { accountError, readBody } from "@/lib/server/respond";
import { addCredits, balance, setPaid } from "@/lib/server/credits";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function memberId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new AuthError("Invalid member id.", 400);
  return id;
}

/**
 * { action: "sign-out" } signs the member out everywhere;
 * { action: "credits", amount } gives (or with a negative amount, removes) credits;
 * { action: "plan", paid } gives or takes away the paid plan.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    requireAdmin(req, true);
    assertSameOrigin(req);
    const body = await readBody(req);
    const id = await memberId(ctx);
    if (body.action === "credits") {
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new AuthError("Enter a whole number of credits.", 400);
      await addCredits(id, amount, amount > 0 ? `Given by the site owner` : `Removed by the site owner`, null);
      return Response.json({ ok: true, balance: await balance(id) });
    }
    if (body.action === "plan") {
      if (typeof body.paid !== "boolean") throw new AuthError("Say whether the member has the paid plan.", 400);
      await setPaid(id, body.paid);
      return Response.json({ ok: true, paid: body.paid });
    }
    if (body.action !== "sign-out") throw new AuthError("Unknown action.", 400);
    await signOutMember(id);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}

/** Deletes the member and everything saved in their account. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    requireAdmin(req, true);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) throw new AuthError("Cross-site request refused.", 403);
    if (!(await deleteMember(await memberId(ctx)))) throw new AuthError("That member no longer exists.", 404);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
