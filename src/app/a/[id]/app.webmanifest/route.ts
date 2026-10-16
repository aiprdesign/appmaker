import { getWebApp } from "@/lib/server/web-apps";
import { databaseConfigured } from "@/lib/server/db";

/** Makes the web app installable: its name, icon, and full-screen start. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const app = databaseConfigured() ? await getWebApp(id).catch(() => null) : null;
  if (!app) return new Response("Not found", { status: 404 });
  const base = `/a/${id}`;
  const manifest = {
    name: app.name,
    short_name: app.name.slice(0, 12),
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: app.color || "#ffffff",
    icons: app.icon ? [{ src: `${base}/icon`, sizes: "512x512", type: "image/png", purpose: "any" }] : [],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
