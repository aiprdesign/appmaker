import { randomBytes } from "node:crypto";
import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { accountError, readBody, requireUser, publicOrigin } from "@/lib/server/respond";
import { ImageInputError, MAX_IMAGES_PER_USER, parseImageData } from "@/lib/images";
import { rateLimit } from "@/lib/rate-limit";

/** Adds a photo for the signed-in owner's apps (menu items, services); returns its public link. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`images:${user.id}`, 120, 60 * 60 * 1000).ok) return Response.json({ error: "Too many photos at once. Try again later." }, { status: 429 });
    let image;
    try {
      image = parseImageData((await readBody(req)).data);
    } catch (e) {
      if (e instanceof ImageInputError) throw new AuthError(e.message, 400);
      throw e;
    }
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from app_images where user_id = $1", [user.id]);
    if (n >= MAX_IMAGES_PER_USER) throw new AuthError(`You have ${MAX_IMAGES_PER_USER} photos already. Remove some apps' photos first.`, 400);
    const id = randomBytes(18).toString("base64url");
    await query("insert into app_images (id, user_id, type, bytes, size) values ($1, $2, $3, $4, $5)", [id, user.id, image.type, image.bytes, image.bytes.length]);
    return Response.json({ id, url: `${publicOrigin(req)}/api/images/${id}` });
  } catch (e) {
    return accountError(e);
  }
}
