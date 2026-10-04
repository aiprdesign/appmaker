import { AiConfigError, canSeeImages, resolveAi, streamGeneration } from "@/lib/ai/server";
import { parseReview, type ReviewAgent } from "@/lib/review";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { APP_MAX_BYTES, APP_MAX_FILES, isAllowedPath } from "@/lib/validate";

export const maxDuration = 120;

const FORMAT = `Reply with only JSON: {"summary": "one short sentence on how the app does", "issues": [{"severity": "high" | "medium" | "low", "where": "screen or part", "problem": "what's wrong, in plain words", "fix": "exactly what to change"}]}
- At most 6 issues, the most important first. "high": people get stuck, lose data or can't tell what happened. "medium": clearly worse than a top-chart app. "low": a nice-to-have.
- Only real problems you can point to in this app, each with a concrete fix the developer can make in this code. Don't invent features the app doesn't need, and don't repeat the same point.
- If the app is good, reply with "issues": [].`;

const SYSTEM: Record<ReviewAgent, string> = {
  ux: `You are a senior UX designer reviewing a React Native (Expo) app's code before it ships to the App Store and Google Play. Judge how it works for a first-time user, not how the code is written. Check:
- Flows: can people do the app's main jobs from start to finish? Is anything a dead end, missing a way back, or hidden?
- Forms: clear labels, sensible defaults, the right keyboard, validation messages next to the field, nothing lost when they make a mistake.
- Feedback: every action shows that it worked (the item appears, a confirmation, a toast); destructive actions ask first or can be undone.
- States: empty states that explain what to do next, loading states, errors explained in words with a way to retry.
- Navigation and structure: obvious tabs or screens, the most-used action easy to reach, consistent names for the same thing.
- Words: plain, specific labels and buttons that say what happens ("Save habit", not "Submit").
${FORMAT}`,
  ui: `You are a senior UI designer reviewing a React Native (Expo) app before it ships to the App Store and Google Play. When a screenshot is attached, it's the screen currently shown; judge what you see first, then use the code to name the exact styles to change. Check:
- Alignment and spacing: a consistent 8-point rhythm, everything on the same left edge, even padding inside cards, no cramped or huge gaps.
- Hierarchy: one clear title per screen, the main action stands out, secondary text is calmer.
- Consistency: the same corner radius, shadows, button styles, icon sizes and theme colors everywhere.
- Visual richness: screens aren't walls of plain text; big Lucide icons or images where they help.
- Readability: text big enough, nothing cut off or overlapping, enough contrast in light and dark mode, tap targets at least 44pt.
${FORMAT}`,
};

/** Runs the UX or UI review agent on the app (free, rate limited). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const agent: ReviewAgent | null = body?.agent === "ux" || body?.agent === "ui" ? body.agent : null;
  if (!agent) return Response.json({ error: "agent must be ux or ui" }, { status: 400 });
  const files = body?.files && typeof body.files === "object" && !Array.isArray(body.files) ? (body.files as Record<string, unknown>) : null;
  if (!files) return Response.json({ error: "files are required" }, { status: 400 });
  const entries = Object.entries(files).filter(([path, code]) => typeof code === "string" && isAllowedPath(path)) as [string, string][];
  if (!entries.length || entries.length > APP_MAX_FILES || entries.reduce((n, [, c]) => n + c.length, 0) > APP_MAX_BYTES) {
    return Response.json({ error: "The app is too large to review in one go." }, { status: 400 });
  }
  const image =
    typeof body.image === "string" && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(body.image) && body.image.length <= 4_000_000 ? body.image : null;

  let ai;
  try {
    ai = resolveAi(body.ai);
  } catch (e) {
    if (e instanceof AiConfigError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if (!ai) return Response.json({ review: null });
  if (!rateLimit(`review:${clientIp(req)}`, 60, 60 * 60 * 1000).ok) return Response.json({ error: "Too many reviews. Try again later." }, { status: 429 });

  const name = typeof body.listing?.name === "string" ? body.listing.name.slice(0, 60) : "";
  const user = [
    name ? `The app: ${name}${typeof body.listing?.subtitle === "string" ? ` — ${body.listing.subtitle.slice(0, 80)}` : ""}` : "",
    ...entries.map(([path, code]) => `<file path="${path}">\n${code}\n</file>`),
  ]
    .filter(Boolean)
    .join("\n\n");

  let text = "";
  try {
    await streamGeneration({
      ai,
      system: SYSTEM[agent],
      messages: [{ role: "user", content: user }],
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(100_000)]),
      write: (t) => {
        text += t;
      },
      quick: true,
      maxTokens: 8000,
      ...(agent === "ui" && image && canSeeImages(ai) ? { images: [image] } : {}),
    });
  } catch {
    return Response.json({ error: `The ${agent.toUpperCase()} review couldn't run this time.` }, { status: 502 });
  }
  const review = parseReview(agent, text);
  if (!review) return Response.json({ error: `The ${agent.toUpperCase()} review didn't come back in a usable form.` }, { status: 502 });
  return Response.json({ review });
}
