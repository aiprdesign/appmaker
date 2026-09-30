import { serverConfig } from "@/lib/ai/server";
import { isQualityEvent } from "@/lib/quality";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { databaseConfigured } from "@/lib/server/db";
import { recordQuality } from "@/lib/server/quality";

/** Anonymous counts from the builder: what happened to an AI build. No prompts, code or personal data. */
export async function POST(req: Request) {
  if (!databaseConfigured()) return new Response(null, { status: 204 });
  if (!rateLimit(`quality:${clientIp(req)}`, 200, 60 * 60 * 1000).ok) return new Response(null, { status: 204 });
  const body = await req.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.filter(isQualityEvent) : [];
  const given = typeof body?.model === "string" && /^[\w.:/-]{1,80}$/.test(body.model) ? body.model : "";
  const cfg = serverConfig();
  const model = given || `${cfg.defaultProvider}/${cfg.defaultModel}`;
  await recordQuality(events, model).catch(() => undefined);
  return new Response(null, { status: 204 });
}
