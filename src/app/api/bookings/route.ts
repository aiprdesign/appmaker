import { AuthError, assertSameOrigin } from "@/lib/server/auth";
import { BookingInputError, parseSettings } from "@/lib/booking";
import { deleteSetup, saveSetup, setupFor, type BookingSetup } from "@/lib/server/bookings";
import { checkProjectId } from "@/lib/server/cloud-projects";
import { requireFeature } from "@/lib/server/features";
import { accountError, publicOrigin, readBody, requireUser } from "@/lib/server/respond";
import { rateLimit } from "@/lib/rate-limit";

/** What the builder needs: the app's booking address and the business's owner link. */
function describe(req: Request, s: BookingSetup) {
  const origin = publicOrigin(req);
  return { id: s.id, settings: s.settings, apiUrl: `${origin}/api/book/${s.id}`, ownerUrl: `${origin}/owner/${s.id}#k=${s.ownerKey}` };
}

/** The app's booking setup, if bookings are on. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    const setup = await setupFor(user.id, projectId);
    return Response.json({ setup: setup ? describe(req, setup) : null });
  } catch (e) {
    return accountError(e);
  }
}

/** Turns on bookings for one of the user's apps, or saves new opening hours. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    await requireFeature("bookings");
    if (!rateLimit(`bookings-setup:${user.id}`, 60, 60 * 60 * 1000).ok) return Response.json({ error: "Too many changes. Try again later." }, { status: 429 });
    const body = await readBody(req);
    const projectId = checkProjectId(String(body.projectId ?? ""));
    let settings;
    try {
      settings = parseSettings(body.settings);
    } catch (e) {
      throw new AuthError(e instanceof BookingInputError ? e.message : "Check the booking settings.", 400);
    }
    const setup = await saveSetup(user.id, projectId, typeof body.name === "string" ? body.name.trim() : "", settings);
    return Response.json({ setup: describe(req, setup) });
  } catch (e) {
    return accountError(e);
  }
}

/** Turns bookings off and deletes them. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    await deleteSetup(user.id, projectId);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
