import { AiConfigError, resolveAi, streamGeneration } from "@/lib/ai/server";
import { parseAiBrief } from "@/lib/brief";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const SYSTEM = `You help people describe the mobile app they want, before an AI builds it. Read their idea and decide what you'd need to know to build a first version they'll love.

Reply with only JSON: {"understood": "...", "questions": [{"q": "...", "options": ["...", "..."], "multi": false}]}
- "understood": one short, friendly sentence saying what you think they want ("A booking app for your hair salon, so clients can pick a stylist and a time").
- "questions": at most 3, only about things that change what gets built and that the idea leaves open: who uses it, the key features, how something should work. Skip anything you can sensibly decide yourself. Don't ask about colors or style (asked separately), the name, platforms or prices of the app.
- Each question is short and plain, with 2–5 tap-to-answer "options" of a few words each, most likely first. Use "multi": true when several can apply (features), false for one choice.
- If the idea is already clear and detailed, reply with "questions": [].
Write in the same language as the idea.`;

/**
 * Before the first build: the AI reads the idea and writes a few questions
 * for it (or none when it's clear). Free, but rate limited; when there's no
 * AI or it fails, the page falls back to its own questions.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });

  let ai;
  try {
    ai = resolveAi(body.ai);
  } catch (e) {
    if (e instanceof AiConfigError) return Response.json({ brief: null });
    throw e;
  }
  // Demo mode: no AI to ask, so the page uses its own questions.
  if (!ai) return Response.json({ brief: null });
  if (!rateLimit(`brief:${clientIp(req)}`, 30, 60 * 60 * 1000).ok) return Response.json({ brief: null });

  let text = "";
  try {
    await streamGeneration({
      ai,
      system: SYSTEM,
      messages: [{ role: "user", content: `The idea: ${prompt}` }],
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(25_000)]),
      write: (t) => {
        text += t;
      },
      quick: true,
    });
  } catch {
    return Response.json({ brief: null });
  }
  return Response.json({ brief: parseAiBrief(text) });
}
