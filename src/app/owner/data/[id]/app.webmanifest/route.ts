/** Lets the owner page be added to a phone's Home Screen as its own app, opening full screen (needed for alerts on iPhone). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const base = `/owner/data/${id}`;
  const manifest = {
    name: "Orders – owner",
    short_name: "Orders",
    description: "New orders and requests from your app, with alerts.",
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#0b0b12",
    theme_color: "#0b0b12",
    icons: [192, 512].flatMap((size) => [
      { src: `${base}/app-icon?size=${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" },
      { src: `${base}/app-icon?size=${size}&maskable=1`, sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" },
    ]),
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
