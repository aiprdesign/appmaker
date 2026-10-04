import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Agent, fetch as undiciFetch } from "undici";
import { isPrivateHost, makeSafeLookup } from "../net-guard";
import { ProviderHttpError, listReplicateModels, streamReplicate } from "./replicate";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  getProvider,
  isValidModelId,
  normalizeBaseURL,
  type AiChoice,
  type ApiFormat,
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

/** Users may connect any public AI endpoint unless the site owner turns it off. */
const customAllowed = () => process.env.APPMAKER_DISABLE_CUSTOM_ENDPOINTS !== "1";
/**
 * Private/local endpoints (Ollama on localhost, a server on your LAN) are only
 * for self-hosted installs: on a public server they would let visitors make
 * the server call internal systems.
 */
const privateEndpointsAllowed = () =>
  process.env.APPMAKER_ALLOW_PRIVATE_ENDPOINTS === "1" || process.env.APPMAKER_ALLOW_CUSTOM_ENDPOINTS === "1";

/** Connections to user-supplied endpoints go through a DNS-checked agent. */
let guardedAgent: Agent | undefined;
function guardedFetchOptions() {
  guardedAgent ??= new Agent({ connect: { lookup: makeSafeLookup(privateEndpointsAllowed) as never } });
  // Redirects are refused: the endpoint was vetted, where it redirects to was not.
  return { fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: guardedAgent, redirect: "error" } as never };
}

function serverKey(provider: ProviderId): string | undefined {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || undefined;
  if (provider === "custom") return process.env.CUSTOM_AI_BASE_URL ? process.env.CUSTOM_AI_API_KEY || "none" : undefined;
  return process.env[getProvider(provider)!.envKey] || undefined;
}

/** Checks a user-supplied endpoint URL before any request is made to it. */
function checkEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AiConfigError("Enter a valid base URL, e.g. https://api.example.com/v1");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AiConfigError("The base URL must start with https://");
  if (url.username || url.password) throw new AiConfigError("Put the API key in the key field, not in the URL.");
  if (!privateEndpointsAllowed()) {
    if (isPrivateHost(url)) throw new AiConfigError("That address is on a private network. Private endpoints only work on self-hosted installs.");
    if (url.protocol !== "https:") throw new AiConfigError("Use an https:// address so your API key is sent securely.");
  }
  return url.toString().replace(/\/$/, "");
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
  /** API the endpoint speaks (custom provider only; presets are fixed). */
  apiFormat?: ApiFormat;
  /** Connections must go through the private-network guard. */
  guarded?: boolean;
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

  const userKey = choice?.apiKey?.trim();
  if (provider === "custom") {
    const apiFormat: ApiFormat = choice?.apiFormat === "anthropic" ? "anthropic" : "openai";
    const userURL = choice?.baseURL?.trim();
    const ownerURL = process.env.CUSTOM_AI_BASE_URL?.trim();
    if (userURL) {
      if (!customAllowed()) throw new AiConfigError("Custom AI endpoints are disabled on this server.");
      const baseURL = checkEndpoint(normalizeBaseURL(userURL, apiFormat));
      // Never send the site owner's custom key to an address a user typed in.
      const sameAsOwner = !!ownerURL && baseURL === normalizeBaseURL(ownerURL, apiFormat);
      const key = userKey || (sameAsOwner ? serverKey("custom") : undefined) || "none";
      return { provider, model, apiKey: key, baseURL, usingServerKey: !userKey && sameAsOwner, apiFormat, guarded: true };
    }
    if (ownerURL) {
      return { provider, model, apiKey: userKey || serverKey("custom")!, baseURL: normalizeBaseURL(ownerURL, apiFormat), usingServerKey: !userKey, apiFormat };
    }
    throw new AiConfigError("Enter the base URL of the AI service in AI settings.");
  }

  const baseURL = info.baseURL;
  const key = userKey || (process.env.APPMAKER_DEMO === "1" ? undefined : serverKey(provider));
  if (!key) {
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
  /** Quick check mode: a small output budget and low effort. */
  quick?: boolean;
  /** Screenshots (data URLs, JPEG or PNG) shown to the model with the last user message. */
  images?: string[];
  /** Called while the model reasons before writing (its thinking isn't shown, only that it's busy). */
  onThinking?: () => void;
  /** Output budget for a quick request (default 2048), e.g. for reviews that write a list. */
  maxTokens?: number;
}

/** Whether a provider can be sent screenshots. */
export function canSeeImages(ai: ResolvedAi): boolean {
  return ai.provider !== "replicate";
}

function splitDataUrl(url: string): { mediaType: "image/jpeg" | "image/png"; data: string } {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(url);
  if (!m) throw new AiConfigError("Screenshots must be JPEG or PNG images.");
  return { mediaType: m[1] as "image/jpeg" | "image/png", data: m[2] };
}

/** Streams the model's text through `write`. Returns why generation stopped. */
function speaksAnthropic(ai: ResolvedAi): boolean {
  return ai.provider === "anthropic" || (ai.provider === "custom" && ai.apiFormat === "anthropic");
}

function anthropicClient(ai: ResolvedAi): Anthropic {
  return new Anthropic({
    apiKey: ai.apiKey,
    ...(ai.provider === "custom" ? { baseURL: ai.baseURL } : {}),
    ...(ai.guarded ? guardedFetchOptions() : {}),
  });
}

function openaiClient(ai: ResolvedAi): OpenAI {
  // Shared providers (OpenRouter, Groq…) often rate limit briefly; the SDK
  // waits (honouring Retry-After) and retries 429s and 5xx before giving up.
  return new OpenAI({ apiKey: ai.apiKey, baseURL: ai.baseURL, maxRetries: ai.guarded ? 2 : 4, ...(ai.guarded ? guardedFetchOptions() : {}) });
}

export async function streamGeneration({ ai, system, messages, signal, write, quick, images, onThinking, maxTokens }: GenerateArgs): Promise<"done" | "refusal" | "length"> {
  const shots = images?.length ? images.map(splitDataUrl) : null;
  const last = messages.length - 1;
  if (shots && !canSeeImages(ai)) throw new AiConfigError("This model can't look at screenshots. Choose another model in AI settings.");
  if (speaksAnthropic(ai)) {
    const client = anthropicClient(ai);
    const modern = isModernClaude(ai.model);
    const stream = client.beta.messages.stream(
      {
        model: ai.model,
        max_tokens: quick ? (maxTokens ?? 2048) : modern ? 64000 : 32000,
        ...(modern ? { thinking: { type: "adaptive" as const }, output_config: { effort: quick ? ("low" as const) : ("high" as const) } } : {}),
        ...(ai.provider === "anthropic" && supportsFallbacks(ai.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: shots
          ? messages.map((m, i) =>
              i === last
                ? {
                    role: m.role,
                    content: [
                      ...shots.map((s) => ({ type: "image" as const, source: { type: "base64" as const, media_type: s.mediaType, data: s.data } })),
                      { type: "text" as const, text: m.content },
                    ],
                  }
                : m,
            )
          : messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") write(event.delta.text);
      else if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") onThinking?.();
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") return "refusal";
    if (final.stop_reason === "max_tokens") return "length";
    return "done";
  }

  if (ai.provider === "replicate") {
    return streamReplicate({ apiKey: ai.apiKey, baseURL: ai.baseURL!, model: ai.model, system, messages, signal, write, ...(quick ? { maxTokens: 256 } : {}) });
  }

  const info = getProvider(ai.provider)!;
  const client = openaiClient(ai);
  const stream = await client.chat.completions.create(
    {
      model: ai.model,
      stream: true,
      ...(info.maxTokens ? { max_tokens: info.maxTokens } : {}),
      messages: [
        { role: "system", content: system },
        ...messages.map((m, i) =>
          shots && i === last && m.role === "user"
            ? {
                role: "user" as const,
                content: [
                  ...images!.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                  { type: "text" as const, text: m.content },
                ],
              }
            : m,
        ),
      ],
    },
    { signal },
  );
  let finish: string | null | undefined;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const text = choice?.delta?.content;
    if (text) write(text);
    // Reasoning models (DeepSeek, OpenRouter, Groq…) stream their thinking separately.
    else if (choice?.delta && ((choice.delta as { reasoning_content?: string }).reasoning_content || (choice.delta as { reasoning?: string }).reasoning)) onThinking?.();
    if (choice?.finish_reason) finish = choice.finish_reason;
  }
  if (finish === "length") return "length";
  if (finish === "content_filter") return "refusal";
  return "done";
}

/** Lists the models a key can use, for the settings dialog. */
export async function listModels(ai: ResolvedAi): Promise<string[]> {
  if (speaksAnthropic(ai)) {
    const client = anthropicClient(ai);
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  }
  if (ai.provider === "replicate") return listReplicateModels(ai.apiKey, ai.baseURL!);
  const client = openaiClient(ai);
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id.replace(/^models\//, ""));
  // Hide models that can't write code (speech, images, embeddings…).
  return ids
    .filter((id) => !/(embed|whisper|tts|dall-e|image|audio|moderation|transcri|realtime|search|guard|vision-preview)/i.test(id))
    .sort();
}

export function aiErrorMessage(err: unknown, providerName = "the AI provider"): string {
  if (err instanceof AiConfigError) return err.message;
  const cause = (err as { cause?: { code?: string; cause?: { code?: string } } })?.cause;
  if (cause?.code === "EBLOCKED" || cause?.cause?.code === "EBLOCKED") {
    return "That address points to a private network. Private endpoints only work on self-hosted installs.";
  }
  const status =
    err instanceof Anthropic.APIError || err instanceof OpenAI.APIError || err instanceof ProviderHttpError ? err.status : undefined;
  if (status === 401 || status === 403) return `${providerName} rejected the API key. Check it in AI settings.`;
  if (status === 404) return `${providerName} doesn't recognise that model. Pick another in AI settings.`;
  const detail = (err as Error)?.message?.replace(/^\d{3}\s*/, "").slice(0, 300);
  if (status === 429) {
    return `${providerName} is rate limiting requests (it still refused after several automatic retries). Wait a minute and press Try again, or check your credit and limits on ${providerName}.${detail ? ` ${providerName} said: ${detail}` : ""}`;
  }
  if (status === 402) return `${providerName} says the account is out of credit. Add credit on ${providerName}, then press Try again.${detail ? ` (${detail})` : ""}`;
  if (status === 400) return `${providerName} rejected the request: ${(err as Error).message}`;
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError || err instanceof ProviderHttpError) {
    return `${providerName} error (${status ?? "network"}): ${err.message}`;
  }
  // No answer at all from the provider: a network problem, or the provider is down.
  const message = err instanceof Error ? err.message : "";
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError || /fetch failed|terminated|socket hang up|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(message)) {
    return `Couldn't reach ${providerName}: it may be down or slow right now. Wait a minute and press Try again, or pick another model in AI settings.`;
  }
  return message ? `${providerName} failed: ${message}` : `${providerName} failed without saying why. Press Try again, or pick another model in AI settings.`;
}

/**
 * Sends a tiny request to check that a provider, key and model really work
 * end to end (not just that the key can list models).
 */
export async function testModel(ai: ResolvedAi): Promise<{ reply: string; ms: number }> {
  const started = Date.now();
  let reply = "";
  const outcome = await streamGeneration({
    ai,
    system: "You are a connection test. Reply with exactly the word: OK",
    messages: [{ role: "user", content: "Connection test — reply with OK." }],
    signal: AbortSignal.timeout(90_000),
    write: (t) => (reply += t),
    quick: true,
  });
  if (outcome === "refusal") throw new AiConfigError("The model declined the test request.");
  if (!reply.trim() && outcome === "length") throw new AiConfigError("The model ran out of output tokens before replying — try another model.");
  if (!reply.trim()) throw new AiConfigError("The model answered with an empty reply. It may not support chat — try another model.");
  return { reply: reply.trim().slice(0, 200), ms: Date.now() - started };
}
