import { getProvider, type AiChoice } from "@/lib/ai/providers";
import { aiErrorMessage, AiConfigError, resolveAi, testModel } from "@/lib/ai/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Runs a tiny real request against the chosen provider and model. */
export async function POST(req: Request) {
  let choice: Partial<AiChoice>;
  try {
    choice = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!choice || typeof choice !== "object" || !getProvider(String(choice.provider))) {
    return Response.json({ error: "Unknown AI provider." }, { status: 400 });
  }
  for (const k of ["model", "apiKey", "baseURL"] as const) {
    if (choice[k] != null && (typeof choice[k] !== "string" || choice[k]!.length > 500)) {
      return Response.json({ error: `${k} is invalid` }, { status: 400 });
    }
  }
  if (choice.apiFormat != null && choice.apiFormat !== "openai" && choice.apiFormat !== "anthropic") {
    return Response.json({ error: "apiFormat is invalid" }, { status: 400 });
  }
  if (!choice.model?.trim()) return Response.json({ error: "Choose a model to test." }, { status: 400 });

  const limit = rateLimit(`test:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!limit.ok) return Response.json({ error: "Too many tests. Try again later." }, { status: 429 });

  const provider = getProvider(String(choice.provider))!;
  try {
    const ai = resolveAi(choice);
    if (!ai) return Response.json({ error: `Add a ${provider.name} API key first.` }, { status: 400 });
    const { reply, ms } = await testModel(ai);
    return Response.json({ ok: true, model: ai.model, reply, ms });
  } catch (e) {
    const status = e instanceof AiConfigError ? 400 : 502;
    return Response.json({ error: aiErrorMessage(e, provider.name, { serverKey: !choice.apiKey?.trim() && !choice.baseURL?.trim() }) }, { status });
  }
}
