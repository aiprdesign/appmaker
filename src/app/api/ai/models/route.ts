import { getProvider, type AiChoice } from "@/lib/ai/providers";
import { aiErrorMessage, AiConfigError, listModels, resolveAi } from "@/lib/ai/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Lists the models available to a provider key — also used to test a key. */
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
  for (const k of ["apiKey", "baseURL"] as const) {
    if (choice[k] != null && (typeof choice[k] !== "string" || choice[k]!.length > 500)) {
      return Response.json({ error: `${k} is invalid` }, { status: 400 });
    }
  }
  if (choice.apiFormat != null && choice.apiFormat !== "openai" && choice.apiFormat !== "anthropic") {
    return Response.json({ error: "apiFormat is invalid" }, { status: 400 });
  }
  const limit = rateLimit(`models:${clientIp(req)}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const provider = getProvider(String(choice.provider))!;
  try {
    // Any valid ID works here; only the key and endpoint matter for listing.
    const ai = resolveAi({ ...choice, model: provider.models[0]?.id ?? "list-models" });
    if (!ai) return Response.json({ error: `Add a ${provider.name} API key first.` }, { status: 400 });
    return Response.json({ models: await listModels(ai) });
  } catch (e) {
    const status = e instanceof AiConfigError ? 400 : 502;
    return Response.json({ error: aiErrorMessage(e, provider.name, { serverKey: !choice.apiKey?.trim() && !choice.baseURL?.trim() }) }, { status });
  }
}
