import { clearedAdminCookie } from "@/lib/server/admin";

export const runtime = "nodejs";

export function POST() {
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedAdminCookie() } });
}
