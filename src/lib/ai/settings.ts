"use client";

import { useSyncExternalStore } from "react";
import type { AiChoice, ApiFormat, ProviderId } from "./providers";

/**
 * The user's AI settings, kept in this browser only. API keys the user adds
 * here are sent with each request to our server, which forwards them to the
 * provider and never stores them.
 */
export interface AiSettings {
  /** Unset means "use the site's default". */
  provider?: ProviderId;
  model?: string;
  keys: Partial<Record<ProviderId, string>>;
  /** Custom provider: endpoint and the API it speaks. */
  baseURL?: string;
  apiFormat?: ApiFormat;
  /** Model IDs the user added to a provider's list, by provider. */
  customModels?: Partial<Record<ProviderId, string[]>>;
  /** Named custom endpoints the user saved ("My Azure", "Work gateway"…). */
  connections?: CustomConnection[];
  /** Which saved connection the custom provider is using. */
  connectionId?: string;
}

export interface CustomConnection {
  id: string;
  name: string;
  baseURL: string;
  apiFormat: ApiFormat;
  apiKey?: string;
  model?: string;
}

const KEY = "appmaker.ai.v1";
const EMPTY: AiSettings = { keys: {} };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: AiSettings = EMPTY;

function read(): AiSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage unavailable (private mode); fall back to defaults.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : EMPTY;
      cached = { ...EMPTY, ...parsed, keys: { ...(parsed.keys ?? {}) }, customModels: { ...(parsed.customModels ?? {}) }, connections: [...(parsed.connections ?? [])] };
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

export function saveAiSettings(next: AiSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore; the settings apply for this page view only.
    cachedRaw = undefined;
    cached = next;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function getAiSettings(): AiSettings {
  return read();
}

/** What to send to the server for a generation request. */
export function aiChoiceFor(settings: AiSettings): Partial<AiChoice> | undefined {
  if (!settings.provider) return undefined;
  return {
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.keys[settings.provider] || undefined,
    baseURL: settings.provider === "custom" ? settings.baseURL : undefined,
    apiFormat: settings.provider === "custom" ? settings.apiFormat : undefined,
  };
}
