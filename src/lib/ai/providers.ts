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
