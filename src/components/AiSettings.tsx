"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Cpu, ExternalLink, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { PROVIDERS, getProvider, modelLabel, type ProviderId, type ServerAiConfig } from "@/lib/ai/providers";
import { saveAiSettings, useAiSettings, type AiSettings } from "@/lib/ai/settings";

let configPromise: Promise<ServerAiConfig> | null = null;
function loadServerConfig(): Promise<ServerAiConfig> {
  configPromise ??= fetch("/api/ai/config")
    .then((r) => r.json())
    .catch(() => ({ defaultProvider: "anthropic", defaultModel: "claude-opus-5", serverKeys: [], customEndpointsAllowed: false }));
  return configPromise;
}

function useServerConfig(): ServerAiConfig | null {
  const [config, setConfig] = useState<ServerAiConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadServerConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}

/** The provider and model that will actually be used. */
export function useEffectiveModel(): { provider: ProviderId; model: string } | null {
  const settings = useAiSettings();
  const config = useServerConfig();
  if (settings.provider) {
    const model = settings.model || getProvider(settings.provider)?.models[0]?.id || "";
    return { provider: settings.provider, model };
  }
  return config ? { provider: config.defaultProvider, model: config.defaultModel } : null;
}

/** Compact button showing the current model; opens the settings dialog. */
export function ModelButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const current = useEffectiveModel();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-foreground ${className}`}
        aria-label="AI model settings"
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{current ? modelLabel(current.provider, current.model) : "AI model"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && <AiSettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/60 disabled:opacity-50";

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const saved = useAiSettings();
  const config = useServerConfig();
  const [draft, setDraft] = useState<AiSettings>(() => ({ ...saved, keys: { ...saved.keys } }));
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const providerId: ProviderId = draft.provider ?? config?.defaultProvider ?? "anthropic";
  const provider = getProvider(providerId)!;
  const model = draft.model ?? (providerId === config?.defaultProvider && !draft.provider ? config.defaultModel : provider.models[0]?.id) ?? "";
  const hasServerKey = !!config?.serverKeys.includes(providerId);
  const userKey = draft.keys[providerId] ?? "";
  const customBlocked = providerId === "custom" && config && !config.customEndpointsAllowed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = (id: ProviderId) => {
    setTest(null);
    setDraft((d) => ({ ...d, provider: id, model: getProvider(id)!.models[0]?.id ?? "" }));
  };

  const loadModels = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          apiKey: userKey || undefined,
          ...(providerId === "custom" ? { baseURL: draft.baseURL, apiFormat: draft.apiFormat ?? "openai" } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't reach the provider.");
      setModels((m) => ({ ...m, [providerId]: body.models }));
      setTest({ ok: true, message: `Connected — ${body.models.length} models available.` });
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    saveAiSettings({ ...draft, provider: providerId, model });
    onClose();
  };

  const reset = () => {
    saveAiSettings({ keys: draft.keys });
    onClose();
  };

  const status = (id: ProviderId) => {
    if (draft.keys[id]) return { label: "Your key", tone: "text-emerald-300 bg-emerald-500/10" };
    if (config?.serverKeys.includes(id)) return { label: "Ready", tone: "text-violet-200 bg-violet-500/15" };
    if (id === "custom" && !config?.customEndpointsAllowed) return { label: "Disabled", tone: "text-muted bg-white/5" };
    if (id === "custom") return draft.baseURL ? { label: "Set up", tone: "text-emerald-300 bg-emerald-500/10" } : { label: "Needs URL", tone: "text-muted bg-white/5" };
    return { label: "Needs key", tone: "text-muted bg-white/5" };
  };

  const suggestions = provider.models;
  const loaded = (models[providerId] ?? []).filter((id) => !suggestions.some((s) => s.id === id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI model settings"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line bg-background text-left shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-semibold">AI model</h2>
            <p className="text-xs text-muted">Choose which AI builds your apps. Bring your own API key or use the site&apos;s.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-56 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
            {PROVIDERS.map((p) => {
              const s = status(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => choose(p.id)}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    p.id === providerId ? "bg-surface-2 text-foreground" : "text-muted hover:bg-white/5"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.tone}`}>{s.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div>
              <h3 className="font-medium">{provider.name}</h3>
              <p className="mt-0.5 text-sm text-muted">{provider.blurb}</p>
            </div>

            {customBlocked ? (
              <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
                Custom endpoints are turned off on this site by the site owner.
              </p>
            ) : (
              <>
                {providerId === "custom" && (
                  <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium">Base URL</span>
                      <input
                        className={`${input} font-mono`}
                        value={draft.baseURL ?? ""}
                        placeholder="https://api.example.com/v1"
                        aria-label="Base URL"
                        spellCheck={false}
                        onChange={(e) => {
                          setTest(null);
                          setDraft((d) => ({ ...d, provider: "custom", baseURL: e.target.value.trim() }));
                        }}
                      />
                      <span className="mt-1 block text-[11px] text-muted">From the service&apos;s API docs — usually ends in /v1.</span>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium">API format</span>
                      <select
                        className={input}
                        aria-label="API format"
                        value={draft.apiFormat ?? "openai"}
                        onChange={(e) => {
                          setTest(null);
                          setDraft((d) => ({ ...d, provider: "custom", apiFormat: e.target.value as "openai" | "anthropic" }));
                        }}
                      >
                        <option value="openai">OpenAI-compatible</option>
                        <option value="anthropic">Anthropic-compatible</option>
                      </select>
                      <span className="mt-1 block text-[11px] text-muted">Most services use OpenAI-compatible.</span>
                    </label>
                  </div>
                )}

                <div>
                  <span className="mb-1.5 flex items-center justify-between text-xs font-medium">
                    <span>API key</span>
                    {provider.keyUrl && (
                      <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-1 px-1 text-violet-300 hover:underline">
                        Get a key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        className={`${input} pl-9 pr-9 font-mono`}
                        type={showKey ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        value={userKey}
                        placeholder={hasServerKey ? "Optional — this site already has a key" : provider.keyPlaceholder}
                        onChange={(e) => {
                          setTest(null);
                          setDraft((d) => ({ ...d, keys: { ...d.keys, [providerId]: e.target.value.trim() } }));
                        }}
                        aria-label={`${provider.name} API key`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
                        aria-label={showKey ? "Hide key" : "Show key"}
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={loadModels}
                      disabled={testing || (providerId === "custom" ? !draft.baseURL : !userKey && !hasServerKey)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20 disabled:opacity-40"
                    >
                      {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test &amp; load models
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {hasServerKey
                      ? "Leave empty to use this site's key. Adding your own bills your account instead."
                      : "Saved only in this browser. It's sent to our server just to call the provider, and never stored."}
                  </p>
                  {test && (
                    <p className={`mt-2 flex items-center gap-1.5 text-xs ${test.ok ? "text-emerald-300" : "text-rose-400"}`}>
                      {test.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {test.message}
                    </p>
                  )}
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium">Model</span>
                  {suggestions.length > 0 && (
                    <div className="mb-2 grid gap-1.5">
                      {suggestions.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, provider: providerId, model: m.id }))}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                            model === m.id ? "border-violet-500/60 bg-violet-500/10" : "border-line hover:border-white/20"
                          }`}
                        >
                          <span>
                            {m.label} <span className="font-mono text-[11px] text-muted">{m.id}</span>
                          </span>
                          {m.note && <span className="text-[11px] text-muted">{m.note}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    className={`${input} font-mono`}
                    list="appmaker-model-options"
                    value={model}
                    placeholder="Type or pick any model ID"
                    onChange={(e) => setDraft((d) => ({ ...d, provider: providerId, model: e.target.value.trim() }))}
                    aria-label="Model ID"
                  />
                  <datalist id="appmaker-model-options">
                    {[...suggestions.map((m) => m.id), ...loaded].map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {loaded.length
                      ? `${loaded.length} more models loaded from ${provider.name} — start typing to search.`
                      : "Model lists change often: use “Test & load models” to see everything your key can use."}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button onClick={reset} className="min-h-8 rounded-md px-2 text-xs text-muted hover:bg-white/5 hover:text-foreground">
            Use site default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-white/20">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!model || !!customBlocked}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
