import { getWebApp } from "@/lib/server/web-apps";
import { databaseConfigured } from "@/lib/server/db";

/** The web app's Home Screen icon (the same icon as the store app). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const app = databaseConfigured() ? await getWebApp(id).catch(() => null) : null;
  const m = app?.icon ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(app.icon) : null;
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
