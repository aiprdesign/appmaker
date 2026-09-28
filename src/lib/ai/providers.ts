/**
 * AI providers Appmaker can generate apps with. Shared by the server (which
 * calls them) and the settings UI (which lists them).
 *
 * Suggested models are a starting point only — model catalogs change often,
 * so the settings dialog can also load the live list from the provider with
 * the user's key, and any model ID can be typed in by hand.
 */
export type ProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "groq"
  | "deepseek"
  | "xai"
  | "mistral"
  | "together"
  | "fireworks"
  | "perplexity"
  | "cerebras"
  | "replicate"
  | "huggingface"
  | "cohere"
  | "qwen"
  | "moonshot"
  | "nvidia"
  | "sambanova"
  | "deepinfra"
  | "custom";

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Environment variable the server reads the operator's key from. */
  envKey: string;
  /** Where users create an API key. */
  keyUrl: string;
  keyPlaceholder: string;
  /** OpenAI-compatible endpoint; unset for Anthropic (native SDK). */
  baseURL?: string;
  /** Output token cap to request; omitted to use the model's own maximum. */
  maxTokens?: number;
  models: ModelOption[];
  blurb: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    envKey: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    blurb: "Best overall for building complete, polished apps.",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", note: "Recommended" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Newest Opus" },
      { id: "claude-fable-5-1", label: "Claude Fable 5.1", note: "Most capable, slower, pricier" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Faster, cheaper" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest, cheapest" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    blurb: "GPT models from OpenAI.",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.4", label: "GPT-5.4" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    blurb: "Gemini models from Google AI Studio.",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Faster, cheaper" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-…",
    baseURL: "https://openrouter.ai/api/v1",
    blurb: "One key for hundreds of models — Llama, Qwen, DeepSeek, Claude, GPT and more.",
    models: [{ id: "openrouter/auto", label: "Auto (best available)", note: "Use “Test & load models” to pick any model" }],
  },
  {
    id: "groq",
    name: "Groq",
    envKey: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_…",
    baseURL: "https://api.groq.com/openai/v1",
    blurb: "Open models with very fast generation.",
    models: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" }],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-…",
    baseURL: "https://api.deepseek.com",
    maxTokens: 8192,
    blurb: "Low-cost models from DeepSeek.",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "xai",
    name: "xAI Grok",
    envKey: "XAI_API_KEY",
    keyUrl: "https://console.x.ai",
    keyPlaceholder: "xai-…",
    baseURL: "https://api.x.ai/v1",
    blurb: "Grok models from xAI.",
    models: [{ id: "grok-4", label: "Grok 4" }],
  },
  {
    id: "mistral",
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "…",
    baseURL: "https://api.mistral.ai/v1",
    blurb: "Models from Mistral AI.",
    models: [{ id: "mistral-large-latest", label: "Mistral Large" }],
  },
  {
    id: "together",
    name: "Together AI",
    envKey: "TOGETHER_API_KEY",
    keyUrl: "https://api.together.ai/settings/api-keys",
    keyPlaceholder: "…",
    baseURL: "https://api.together.xyz/v1",
    blurb: "Hosted open models — Llama, Qwen, DeepSeek and more.",
    models: [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Turbo" }],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    envKey: "FIREWORKS_API_KEY",
    keyUrl: "https://fireworks.ai/account/api-keys",
    keyPlaceholder: "fw_…",
    baseURL: "https://api.fireworks.ai/inference/v1",
    blurb: "Fast hosted open models.",
    models: [{ id: "accounts/fireworks/models/llama-v3p3-70b-instruct", label: "Llama 3.3 70B" }],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    envKey: "PERPLEXITY_API_KEY",
    keyUrl: "https://www.perplexity.ai/settings/api",
    keyPlaceholder: "pplx-…",
    baseURL: "https://api.perplexity.ai",
    blurb: "Sonar models from Perplexity.",
    models: [{ id: "sonar-pro", label: "Sonar Pro" }],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    keyUrl: "https://cloud.cerebras.ai",
    keyPlaceholder: "csk-…",
    baseURL: "https://api.cerebras.ai/v1",
    blurb: "Open models at extremely high speed.",
    models: [{ id: "llama-3.3-70b", label: "Llama 3.3 70B" }],
  },
  {
    id: "replicate",
    name: "Replicate",
    envKey: "REPLICATE_API_TOKEN",
    keyUrl: "https://replicate.com/account/api-tokens",
    keyPlaceholder: "r8_…",
    baseURL: "https://api.replicate.com/v1",
    blurb: "Run thousands of community and open models with one token. Model IDs look like owner/name.",
    models: [
      { id: "meta/meta-llama-3-70b-instruct", label: "Llama 3 70B Instruct" },
      { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1" },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    envKey: "HF_TOKEN",
    keyUrl: "https://huggingface.co/settings/tokens",
    keyPlaceholder: "hf_…",
    baseURL: "https://router.huggingface.co/v1",
    blurb: "Thousands of open models through Hugging Face Inference Providers.",
    models: [{ id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct" }],
  },
  {
    id: "cohere",
    name: "Cohere",
    envKey: "COHERE_API_KEY",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    keyPlaceholder: "…",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    blurb: "Command models from Cohere.",
    models: [{ id: "command-a-03-2025", label: "Command A" }],
  },
  {
    id: "qwen",
    name: "Alibaba Qwen",
    envKey: "DASHSCOPE_API_KEY",
    keyUrl: "https://bailian.console.alibabacloud.com/?apiKey=1",
    keyPlaceholder: "sk-…",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    blurb: "Qwen models from Alibaba Cloud Model Studio (international).",
    models: [
      { id: "qwen-max", label: "Qwen Max" },
      { id: "qwen-plus", label: "Qwen Plus", note: "Faster, cheaper" },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot Kimi",
    envKey: "MOONSHOT_API_KEY",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    keyPlaceholder: "sk-…",
    baseURL: "https://api.moonshot.ai/v1",
    blurb: "Kimi models from Moonshot AI. Use “Test & load models” to pick one.",
    models: [],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    envKey: "NVIDIA_API_KEY",
    keyUrl: "https://build.nvidia.com",
    keyPlaceholder: "nvapi-…",
    baseURL: "https://integrate.api.nvidia.com/v1",
    blurb: "Open models hosted by NVIDIA.",
    models: [{ id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct" }],
  },
  {
    id: "sambanova",
    name: "SambaNova",
    envKey: "SAMBANOVA_API_KEY",
    keyUrl: "https://cloud.sambanova.ai/apis",
    keyPlaceholder: "…",
    baseURL: "https://api.sambanova.ai/v1",
    blurb: "Very fast open models on SambaNova Cloud.",
    models: [{ id: "Meta-Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct" }],
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    envKey: "DEEPINFRA_API_KEY",
    keyUrl: "https://deepinfra.com/dash/api_keys",
    keyPlaceholder: "…",
    baseURL: "https://api.deepinfra.com/v1/openai",
    blurb: "Low-cost hosting for popular open models.",
    models: [{ id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct" }],
  },
  {
    id: "custom",
    name: "Any other AI (custom)",
    envKey: "CUSTOM_AI_API_KEY",
    keyUrl: "",
    keyPlaceholder: "API key (if the service needs one)",
    blurb:
      "Connect any AI service with an OpenAI- or Anthropic-compatible API — e.g. Azure OpenAI, AWS Bedrock gateways, LiteLLM, Hugging Face, Qwen, Kimi, a company proxy, or your own server.",
    models: [],
  },
];

export const DEFAULT_PROVIDER: ProviderId = "anthropic";
export const DEFAULT_MODEL = "claude-opus-5";

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Model IDs are sent to third-party APIs; keep them to a safe character set. */
export function isValidModelId(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/.test(model);
}

export function modelLabel(provider: string, model: string): string {
  return getProvider(provider)?.models.find((m) => m.id === model)?.label ?? model;
}

/** The user's choice of provider/model, plus any keys they supplied. */
export interface AiChoice {
  provider: ProviderId;
  model: string;
  /** The user's own API key for this provider (bring-your-own-key). */
  apiKey?: string;
  /** Base URL for the custom provider. */
  baseURL?: string;
  /** Which API the custom provider speaks. */
  apiFormat?: ApiFormat;
}

export type ApiFormat = "openai" | "anthropic";

/** What the server tells the UI about its configuration. */
export interface ServerAiConfig {
  defaultProvider: ProviderId;
  defaultModel: string;
  /** Providers the site owner has configured a server-side key for. */
  serverKeys: ProviderId[];
  customEndpointsAllowed: boolean;
}

/** Endpoints users can pick in "Any other AI" instead of typing a URL. */
export interface KnownEndpoint {
  label: string;
  baseURL: string;
  apiFormat: ApiFormat;
  /** Placeholder the user must replace, e.g. an Azure resource name. */
  needsEdit?: boolean;
  /** Only reachable on a self-hosted install (private address). */
  local?: boolean;
}

const ENDPOINT_LIST: KnownEndpoint[] = [
  ...PROVIDERS.filter((p) => p.baseURL && p.id !== "replicate" && p.id !== "custom").map((p) => ({
    label: p.name,
    baseURL: p.baseURL!.replace(/\/$/, ""),
    apiFormat: "openai" as const,
  })),
  { label: "OpenAI", baseURL: "https://api.openai.com/v1", apiFormat: "openai" },
  { label: "Anthropic Claude", baseURL: "https://api.anthropic.com", apiFormat: "anthropic" },
  { label: "Azure OpenAI (replace YOUR-RESOURCE)", baseURL: "https://YOUR-RESOURCE.openai.azure.com/openai/v1", apiFormat: "openai", needsEdit: true },
  { label: "Ollama (self-hosted)", baseURL: "http://localhost:11434/v1", apiFormat: "openai", local: true },
  { label: "LM Studio (self-hosted)", baseURL: "http://localhost:1234/v1", apiFormat: "openai", local: true },
  { label: "vLLM (self-hosted)", baseURL: "http://localhost:8000/v1", apiFormat: "openai", local: true },
  { label: "LiteLLM proxy (self-hosted)", baseURL: "http://localhost:4000/v1", apiFormat: "openai", local: true },
];

export const KNOWN_ENDPOINTS: KnownEndpoint[] = ENDPOINT_LIST.sort(
  (a, b) => Number(!!a.local) - Number(!!b.local) || a.label.localeCompare(b.label),
);

/** Picks the API format for a pasted URL: known endpoints first, then hints in the address. */
export function detectApiFormat(url: string): ApiFormat {
  const known = KNOWN_ENDPOINTS.find((e) => normalizeBaseURL(url, e.apiFormat) === e.baseURL);
  if (known) return known.apiFormat;
  return /anthropic|claude/i.test(url) ? "anthropic" : "openai";
}

/**
 * Recognises a provider from the shape of its API key, so users can paste a
 * key and have everything else filled in. Keys that several providers share
 * (a bare "sk-…") are ambiguous and return null.
 */
const KEY_PREFIXES: [RegExp, ProviderId][] = [
  [/^sk-ant-/, "anthropic"],
  [/^sk-or-/, "openrouter"],
  [/^sk-proj-|^sk-svcacct-|^sk-admin-/, "openai"],
  [/^r8_/, "replicate"],
  [/^hf_/, "huggingface"],
  [/^AIza/, "gemini"],
  [/^gsk_/, "groq"],
  [/^xai-/, "xai"],
  [/^pplx-/, "perplexity"],
  [/^nvapi-/, "nvidia"],
  [/^fw_/, "fireworks"],
  [/^csk-/, "cerebras"],
];

export function detectProviderFromKey(key: string): ProviderId | null {
  const k = key.trim();
  if (k.length < 12) return null;
  return KEY_PREFIXES.find(([re]) => re.test(k))?.[1] ?? null;
}

/**
 * Tidies a base URL for the chosen API format. OpenAI-style clients expect the
 * versioned root (…/v1); the Anthropic client adds /v1 itself, so a trailing
 * /v1 would double up. Pure string work — safe to run in the browser too.
 */
export function normalizeBaseURL(raw: string, apiFormat: ApiFormat = "openai"): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return url;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  // Known services keep their documented address exactly (some, like
  // Perplexity, don't use /v1).
  if (ENDPOINT_LIST.some((e) => e.baseURL === url && e.apiFormat === apiFormat)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return raw.trim();
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (apiFormat === "anthropic") {
    if (/\/v1$/.test(path)) url = url.replace(/\/v1$/, "");
  } else if (path === "") {
    url = `${url}/v1`;
  }
  return url;
}
