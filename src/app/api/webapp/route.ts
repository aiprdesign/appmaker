import { assertSameOrigin, AuthError, currentUser } from "@/lib/server/auth";
import { databaseConfigured } from "@/lib/server/db";
import { checkProjectId } from "@/lib/server/cloud-projects";
import { accountError, readBody, requireUser } from "@/lib/server/respond";
import { deleteWebApp, saveWebApp, webAppCount, webAppFor } from "@/lib/server/web-apps";
import { ICON_DATA_URL } from "@/lib/icon";
import { rateLimit } from "@/lib/rate-limit";
import { APP_MAX_BYTES, APP_MAX_FILES, isAllowedPath } from "@/lib/validate";

/** Each web app is hosted for anyone to open; a cap keeps one account from publishing thousands. */
const MAX_WEB_APPS = 50;
const ICON_MAX = 400_000;

function linkFor(req: Request, id: string): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${host ? `${proto}://${host}` : new URL(req.url).origin}/a/${id}`;
}

/** Publishes (or updates) the app on the web: a link customers open and add to their Home Screen. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    if (!rateLimit(`webapp:${user.id}`, 60, 60 * 60 * 1000).ok) return Response.json({ error: "Too many updates. Try again later." }, { status: 429 });
    const body = await readBody(req);
    const projectId = checkProjectId(String(body.projectId ?? ""));
    const raw = body.files && typeof body.files === "object" && !Array.isArray(body.files) ? (body.files as Record<string, unknown>) : {};
    const entries = Object.entries(raw).filter(([path, code]) => typeof code === "string" && isAllowedPath(path)) as [string, string][];
    if (!entries.some(([p]) => p === "App.js")) throw new AuthError("The app needs its App.js to publish.", 400);
    if (entries.length > APP_MAX_FILES || entries.reduce((n, [, c]) => n + c.length, 0) > APP_MAX_BYTES) throw new AuthError("The app is too large to publish.", 400);
    const icon = typeof body.icon === "string" && body.icon.length <= ICON_MAX && ICON_DATA_URL.test(body.icon) ? body.icon : null;
    const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#ffffff";
    const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 40) || "App";
    if (!(await webAppFor(user.id, projectId)) && (await webAppCount(user.id)) >= MAX_WEB_APPS) {
      throw new AuthError(`You can have up to ${MAX_WEB_APPS} web apps. Take one down in an app you no longer use.`, 409);
    }
    const id = await saveWebApp(user.id, projectId, { name, color, icon, files: Object.fromEntries(entries) });
    return Response.json({ id, url: linkFor(req, id) });
  } catch (e) {
    return accountError(e);
  }
}

/** Takes the web app down: its link stops working (installed copies show that it's gone). */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    assertSameOrigin(req);
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    await deleteWebApp(user.id, projectId);
    return Response.json({ ok: true });
  } catch (e) {
    return accountError(e);
  }
}

/** The app's web link, if it's published. */
export async function GET(req: Request) {
  try {
    // Not signed in (or no database): nothing published yet, and no error in the builder.
    if (!databaseConfigured()) return Response.json({ url: null });
    const user = await currentUser(req);
    if (!user) return Response.json({ url: null });
    const projectId = checkProjectId(new URL(req.url).searchParams.get("projectId") ?? "");
    const id = await webAppFor(user.id, projectId);
    return Response.json({ url: id ? linkFor(req, id) : null });
  } catch (e) {
    return accountError(e);
  }
}
