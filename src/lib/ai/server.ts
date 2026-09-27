import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  getProvider,
  isValidModelId,
  type AiChoice,
  type ProviderId,
  type ServerAiConfig,
} from "./providers";

/**
 * Server-side AI access. Requests can use the site owner's keys (from the
 * environment) or a key the user supplied in the request (bring-your-own-key).
 * User keys are only ever forwarded to the chosen provider — never stored or
 * logged.
 */

export class AiConfigError extends Error {}

const customAllowed = () => process.env.APPMAKER_ALLOW_CUSTOM_ENDPOINTS === "1";

function serverKey(provider: ProviderId): string | undefined {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || undefined;
  if (provider === "custom") return customAllowed() && process.env.CUSTOM_AI_BASE_URL ? process.env.CUSTOM_AI_API_KEY || "none" : undefined;
  return process.env[getProvider(provider)!.envKey] || undefined;
}

export function serverConfig(): ServerAiConfig {
  const forceDemo = process.env.APPMAKER_DEMO === "1";
  const serverKeys = forceDemo ? [] : PROVIDERS.filter((p) => serverKey(p.id)).map((p) => p.id);
  const envProvider = getProvider(process.env.APPMAKER_PROVIDER ?? "")?.id;
  const defaultProvider = envProvider ?? (serverKeys.includes(DEFAULT_PROVIDER) ? DEFAULT_PROVIDER : (serverKeys[0] ?? DEFAULT_PROVIDER));
  const defaultModel =
    process.env.APPMAKER_MODEL || (defaultProvider === DEFAULT_PROVIDER ? DEFAULT_MODEL : (getProvider(defaultProvider)!.models[0]?.id ?? ""));
  return { defaultProvider, defaultModel, serverKeys, customEndpointsAllowed: customAllowed() };
}

export interface ResolvedAi {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseURL?: string;
  usingServerKey: boolean;
}

/**
 * Picks the provider, model and key for a request.
 * Returns null when no key is available anywhere (demo mode).
 */
export function resolveAi(choice: Partial<AiChoice> | undefined): ResolvedAi | null {
  const config = serverConfig();
  const provider = choice?.provider ?? config.defaultProvider;
  const info = getProvider(provider);
  if (!info) throw new AiConfigError("Unknown AI provider.");
  const model = choice?.model?.trim() || (provider === config.defaultProvider ? config.defaultModel : info.models[0]?.id) || "";
  if (!isValidModelId(model)) throw new AiConfigError("Choose a valid model in AI settings.");

  let baseURL = info.baseURL;
  if (provider === "custom") {
    if (!customAllowed()) throw new AiConfigError("Custom AI endpoints are disabled on this server.");
    baseURL = choice?.baseURL?.trim() || process.env.CUSTOM_AI_BASE_URL;
    if (!baseURL || !/^https?:\/\//.test(baseURL)) throw new AiConfigError("Enter the base URL of your OpenAI-compatible server.");
  }

  const userKey = choice?.apiKey?.trim();
  const key = userKey || (process.env.APPMAKER_DEMO === "1" ? undefined : serverKey(provider));
  if (!key) {
    if (provider === "custom" && baseURL) return { provider, model, apiKey: "none", baseURL, usingServerKey: false };
    if (config.serverKeys.length === 0) return null;
    throw new AiConfigError(`Add your ${info.name} API key in AI settings, or switch to a provider this site has set up.`);
  }
  return { provider, model, apiKey: key, baseURL, usingServerKey: !userKey };
}

/** Modern Claude models take adaptive thinking and an effort level. */
function isModernClaude(model: string): boolean {
  return /^claude-(opus-5|opus-4-[678]|fable|mythos|sonnet-5|sonnet-4-6)/.test(model);
}

/** Server-side refusal fallbacks are available on these Claude models. */
function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5$|fable-5-1$)/.test(model);
}

export interface GenerateArgs {
  ai: ResolvedAi;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  write: (text: string) => void;
}

/** Streams the model's text through `write`. Returns why generation stopped. */
export async function streamGeneration({ ai, system, messages, signal, write }: GenerateArgs): Promise<"done" | "refusal" | "length"> {
  if (ai.provider === "anthropic") {
    const client = new Anthropic({ apiKey: ai.apiKey });
    const modern = isModernClaude(ai.model);
    const stream = client.beta.messages.stream(
      {
        model: ai.model,
        max_tokens: modern ? 64000 : 32000,
        ...(modern ? { thinking: { type: "adaptive" as const }, output_config: { effort: "high" as const } } : {}),
        ...(supportsFallbacks(ai.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") write(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") return "refusal";
    if (final.stop_reason === "max_tokens") return "length";
    return "done";
  }

  const info = getProvider(ai.provider)!;
  const client = new OpenAI({ apiKey: ai.apiKey, baseURL: ai.baseURL });
  const stream = await client.chat.completions.create(
    {
      model: ai.model,
      stream: true,
      ...(info.maxTokens ? { max_tokens: info.maxTokens } : {}),
      messages: [{ role: "system", content: system }, ...messages],
    },
    { signal },
  );
  let finish: string | null | undefined;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const text = choice?.delta?.content;
    if (text) write(text);
    if (choice?.finish_reason) finish = choice.finish_reason;
  }
  if (finish === "length") return "length";
  if (finish === "content_filter") return "refusal";
  return "done";
}

/** Lists the models a key can use, for the settings dialog. */
export async function listModels(ai: ResolvedAi): Promise<string[]> {
  if (ai.provider === "anthropic") {
    const client = new Anthropic({ apiKey: ai.apiKey });
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  }
  const client = new OpenAI({ apiKey: ai.apiKey, baseURL: ai.baseURL });
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id.replace(/^models\//, ""));
  // Hide models that can't write code (speech, images, embeddings…).
  return ids
    .filter((id) => !/(embed|whisper|tts|dall-e|image|audio|moderation|transcri|realtime|search|guard|vision-preview)/i.test(id))
    .sort();
}

export function aiErrorMessage(err: unknown, providerName = "the AI provider"): string {
  if (err instanceof AiConfigError) return err.message;
  const status = err instanceof Anthropic.APIError || err instanceof OpenAI.APIError ? err.status : undefined;
  if (status === 401 || status === 403) return `${providerName} rejected the API key. Check it in AI settings.`;
  if (status === 404) return `${providerName} doesn't recognise that model. Pick another in AI settings.`;
  if (status === 429) return `${providerName} is rate limiting or your credit ran out — wait a moment or check your account.`;
  if (status === 400) return `${providerName} rejected the request: ${(err as Error).message}`;
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    return `${providerName} error (${status ?? "network"}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
