import { adminConfigured, isAdmin } from "@/lib/server/admin";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { getFeatures, setFeature } from "@/lib/server/features";
import { googleConfigured } from "@/lib/server/google";
import { accountError, readBody } from "@/lib/server/respond";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(req: Request) {
  if (!adminConfigured()) throw new AuthError("The admin area is off. Set ADMIN_PASSWORD on the server to turn it on.", 404);
  if (!isAdmin(req)) throw new AuthError("Enter the admin password.", 401);
}

/** The switches, plus what else they depend on. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return Response.json({ features: await getFeatures(), database: databaseConfigured(), googleKeys: googleConfigured() });
  } catch (e) {
    return accountError(e);
  }
}

export async function PUT(req: Request) {
  try {
    requireAdmin(req);
    assertSameOrigin(req);
    if (!databaseConfigured()) throw new AuthError("Switches are saved in the database. Add DATABASE_URL first.", 409);
    const body = await readBody(req);
    if (!FEATURE_KEYS.includes(body.key as FeatureKey) || typeof body.on !== "boolean") throw new AuthError("Unknown switch.", 400);
    return Response.json({ features: await setFeature(body.key as FeatureKey, body.on) });
  } catch (e) {
    return accountError(e);
  }
}
