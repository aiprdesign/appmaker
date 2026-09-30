import { AuthError, assertSameOrigin, currentUser } from "@/lib/server/auth";
import { BookingInputError, parseSettings } from "@/lib/booking";
import { addBlock, cancelBooking, canManage, getSetup, ownerView, removeBlock, resetOwnerKey, updateSettings } from "@/lib/server/bookings";
import { accountError, publicOrigin, readBody, requireDatabase } from "@/lib/server/respond";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

/** The owner page's data: for the account that made the app, or anyone with the owner link. */
async function owned(req: Request, ctx: Ctx) {
  requireDatabase();
  if (!rateLimit(`owner:${clientIp(req)}`, 120, 60 * 1000).ok) throw new AuthError("Too many requests. Try again in a minute.", 429);
  const setup = await getSetup((await ctx.params).id);
  if (!setup || !(await canManage(req, setup))) throw new AuthError("This owner link isn't valid any more. Ask for a new one.", 404);
  return setup;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const setup = await owned(req, ctx);
    const user = await currentUser(req);
    const origin = publicOrigin(req);
    return Response.json({
      ...(await ownerView(setup)),
      calendarUrl: `${origin}/api/owner/${setup.id}/calendar?k=${setup.ownerKey}`,
      ...(user?.id === setup.userId ? { ownerUrl: `${origin}/owner/${setup.id}#k=${setup.ownerKey}` } : {}),
    });
  } catch (e) {
    return accountError(e);
  }
}

/** Cancel a booking, block or free up time, change opening hours, or make a new owner link. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const setup = await owned(req, ctx);
    const body = await readBody(req);
    try {
      switch (body.action) {
        case "cancel":
          if (!(await cancelBooking(setup.id, String(body.id ?? "")))) throw new AuthError("That booking was already cancelled.", 404);
          break;
        case "block":
          await addBlock(setup, body);
          break;
        case "unblock":
          await removeBlock(setup.id, String(body.id ?? ""));
          break;
        case "settings":
          await updateSettings(setup.id, parseSettings(body.settings));
          break;
        case "reset-link": {
          const user = await currentUser(req);
          if (user?.id !== setup.userId) throw new AuthError("Only the account that made the app can make a new owner link.", 403);
          const key = await resetOwnerKey(setup.id);
          return Response.json({ ownerUrl: `${publicOrigin(req)}/owner/${setup.id}#k=${key}` });
        }
        default:
          throw new AuthError("Unknown action.", 400);
      }
    } catch (e) {
      if (e instanceof BookingInputError) throw new AuthError(e.message, 400);
      throw e;
    }
    return Response.json(await ownerView((await getSetup(setup.id))!));
  } catch (e) {
    return accountError(e);
  }
}
