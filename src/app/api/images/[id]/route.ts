import { databaseConfigured, query } from "@/lib/server/db";
import { IMAGE_ID } from "@/lib/images";

/** A photo an owner added to their app: public (apps show it), never changing, cached for a year. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!IMAGE_ID.test(id) || !databaseConfigured()) return new Response("Not found", { status: 404 });
  const etag = `"${id}"`;
  const headers = {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  try {
    const rows = await query<{ type: string; bytes: Buffer }>("select type, bytes from app_images where id = $1", [id]);
    if (!rows[0]) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(rows[0].bytes), { headers: { ...headers, "Content-Type": rows[0].type } });
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
