import { AiConfigError, resolveAi, streamGeneration } from "@/lib/ai/server";
import { CLAIM_SAFE_RULES } from "@/lib/claims";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { charge, CreditsError, creditsResponse, refund } from "@/lib/server/credits";

export const maxDuration = 60;

const SYSTEM = `You write App Store and Google Play screenshot captions. For each screen you get the app's listing and the text visible on that screen. Write:
- "title": 2–6 words, a benefit people care about, in sentence case, no ending period (e.g. "Build habits that stick", "All your bookings in one place").
- "subtitle": one short line (at most 8 words) that says what this screen lets you do.
Each screen gets a different message; the first one sums up the app. Describe only what the app really does on that screen; never invent features, prices, ratings or awards.
Reply with only a JSON array of {"title","subtitle"} objects, one per screen, in order.`;

/** Headlines for store screenshots, written by the AI (costs a change's credits when payments are on). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const screens: string[] = Array.isArray(body?.screens) ? body.screens.slice(0, 10).map((s: unknown) => String(s ?? "").slice(0, 400)) : [];
  const listing = body?.listing && typeof body.listing === "object" ? body.listing : null;
  if (!screens.length || !listing) return Response.json({ error: "Capture at least one screen first." }, { status: 400 });

  let ai;
  try {
    ai = resolveAi(body.ai);
  } catch (e) {
    if (e instanceof AiConfigError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if (!ai) return Response.json({ error: "Writing headlines needs an AI key. Edit them by hand, or add a key in AI settings." }, { status: 400 });
  if (!rateLimit(`captions:${clientIp(req)}`, 20, 60 * 60 * 1000).ok) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });

  let paid: { userId: string | null; charged: boolean } = { userId: null, charged: false };
  if (ai.usingServerKey) {
    try {
      paid = await charge(req, "edit", { reason: "Screenshot headlines" });
    } catch (e) {
      if (e instanceof CreditsError) return creditsResponse(e);
      throw e;
    }
  }

  const safe = body.wording !== "standard";
  const user = [
    `App: ${String(listing.name ?? "").slice(0, 60)} — ${String(listing.subtitle ?? "").slice(0, 60)}`,
    `Description: ${String(listing.description ?? "").slice(0, 1200)}`,
    ...screens.map((s, i) => `Screen ${i + 1}: ${s || "(no text)"}`),
  ].join("\n\n");
  let text = "";
  try {
    await streamGeneration({
      ai,
      system: safe ? `${SYSTEM}\n\n${CLAIM_SAFE_RULES}` : SYSTEM,
      messages: [{ role: "user", content: user }],
      signal: req.signal,
      write: (t) => {
        text += t;
      },
      quick: true,
    });
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const list = (JSON.parse(json) as { title?: unknown; subtitle?: unknown }[]).slice(0, screens.length);
    const captions = list.map((c) => ({ title: String(c.title ?? "").slice(0, 60), subtitle: String(c.subtitle ?? "").slice(0, 80) }));
    if (!captions.length) throw new Error("empty");
    return Response.json({ captions });
  } catch {
    if (paid.charged && paid.userId) await refund(paid.userId, "edit", "Refund: screenshot headlines failed").catch(() => {});
    return Response.json({ error: "Couldn't write headlines this time. Try again, or edit them by hand." }, { status: 502 });
  }
}
