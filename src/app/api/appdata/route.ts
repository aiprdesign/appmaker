import { DataInputError, parseRules } from "@/lib/app-data";
import { requirePaidPlan } from "@/lib/server/credits";
import { AuthError, assertSameOrigin } from "@/lib/server/auth";
import { dataCounts, deleteStore, saveStore, storeCount, storeFor, type DataStore } from "@/lib/server/app-data";
import { checkProjectId } from "@/lib/server/cloud-projects";
import { requireFeature } from "@/lib/server/features";
import { accountError, publicOrigin, readBody, requireUser } from "@/lib/server/respond";
import { rateLimit } from "@/lib/rate-limit";

/** What the builder needs: the app's data address and the business's owner link. */
function describe(req: Request, s: DataStore) {
  const origin = publicOrigin(req);
  return { id: s.id, apiUrl: `${origin}/api/appdata/${s.id}`, ownerUrl: `${origin}/owner/data/${s.id}#k=${s.ownerKey}` };
}

/** The app's database, if it's on. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    const store = await storeFor(user.id, projectId);
    return Response.json({ store: store ? { ...describe(req, store), rules: store.rules, counts: await dataCounts(store) } : null });
  } catch (e) {
    return accountError(e);
  }
}

/** Turns on the app's database, or saves new rules from the app. */
/** Each app database holds customers' data; a cap keeps one account from creating thousands. */
const MAX_STORES = 50;

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    await requireFeature("appData");
    // Hosting customers' data costs money as apps grow: it's part of the paid plan (when payments are set up).
    await requirePaidPlan(req, "appData");
    if (!rateLimit(`appdata-setup:${user.id}`, 120, 60 * 60 * 1000).ok) return Response.json({ error: "Too many changes. Try again later." }, { status: 429 });
    const body = await readBody(req);
    const projectId = checkProjectId(String(body.projectId ?? ""));
    let rules;
    try {
      rules = parseRules(body.rules);
    } catch (e) {
      throw new AuthError(e instanceof DataInputError ? e.message : "Check the app's data rules.", 400);
    }
    if (!(await storeFor(user.id, projectId)) && (await storeCount(user.id)) >= MAX_STORES) {
      throw new AuthError(`You can have up to ${MAX_STORES} app databases. Turn one off in an app you no longer use.`, 409);
    }
    const store = await saveStore(user.id, projectId, typeof body.name === "string" ? body.name.trim() : "", rules);
    return Response.json({ store: describe(req, store) });
  } catch (e) {
    return accountError(e);
  }
}

/** Turns the database off and deletes its data. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    await deleteStore(user.id, projectId);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}
