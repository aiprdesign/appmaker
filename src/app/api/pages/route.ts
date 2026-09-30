import { assertSameOrigin, AuthError } from "@/lib/server/auth";
import { checkProjectId } from "@/lib/server/cloud-projects";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import { savePages } from "@/lib/server/store-pages";
import { PageInputError, parsePageContent } from "@/lib/store-pages";
import { rateLimit } from "@/lib/rate-limit";

/** Creates or updates an app's hosted support page and privacy policy. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`store-pages:${user.id}`, 60, 60 * 60 * 1000).ok) {
      return Response.json({ error: "Too many updates. Try again later." }, { status: 429 });
    }
    const body = await readBody(req);
    const projectId = checkProjectId(String(body.projectId ?? ""));
    let content;
    try {
      content = parsePageContent(body.content);
    } catch (e) {
      if (e instanceof PageInputError) throw new AuthError(e.message, 400);
      throw e;
    }
    const id = await savePages(user.id, projectId, content);
    const origin = new URL(req.url).origin;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(origin).protocol.replace(":", "");
    const base = host ? `${proto}://${host}` : origin;
    return Response.json({ id, supportUrl: `${base}/legal/${id}/support`, privacyUrl: `${base}/legal/${id}/privacy` });
  } catch (e) {
    return accountError(e);
  }
}
