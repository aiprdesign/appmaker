import { clientIp, rateLimit } from "@/lib/rate-limit";
import { saveSnack, SnackError } from "@/lib/server/snack";
import { APP_MAX_BYTES, isAllowedPath } from "@/lib/validate";

export const runtime = "nodejs";

/** Saves a big app to Expo Snack so its emulators can open it by link. */
export async function POST(req: Request) {
  if (!rateLimit(`snack:${clientIp(req)}`, 30, 60 * 60 * 1000).ok) {
    return Response.json({ error: "Too many emulator sessions. Try again later." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { name?: unknown; description?: unknown; files?: unknown; dependencies?: unknown } | null;
  const files = body?.files && typeof body.files === "object" ? (body.files as Record<string, unknown>) : null;
  if (!files) return Response.json({ error: "No app to open." }, { status: 400 });
  const clean: Record<string, string> = {};
  let size = 0;
  for (const [path, code] of Object.entries(files)) {
    if (typeof code !== "string" || !isAllowedPath(path)) continue;
    clean[path] = code;
    size += code.length;
  }
  if (!Object.keys(clean).length || size > APP_MAX_BYTES) return Response.json({ error: "This app can't be opened in Snack." }, { status: 400 });
  const dependencies = Array.isArray(body?.dependencies) ? body.dependencies.filter((d): d is string => typeof d === "string" && /^[@a-z0-9/._-]{1,80}$/.test(d)).slice(0, 40) : [];
  try {
    const { id, sdkVersion } = await saveSnack({
      name: String(body?.name ?? "My app").slice(0, 80),
      description: String(body?.description ?? "Made with Appmaker").slice(0, 200),
      files: clean,
      dependencies,
    });
    return Response.json({ id, sdkVersion });
  } catch (e) {
    const message = e instanceof SnackError ? e.message : "Couldn't reach Expo Snack.";
    return Response.json({ error: `${message} Your phone (Expo Go) runs the full app instead.` }, { status: 502 });
  }
}
