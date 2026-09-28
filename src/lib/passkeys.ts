"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { signedIn } from "./cloud";

/** Passkeys in the browser: sign in with Face ID, a fingerprint or the device passcode. */

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (HTTP ${res.status}).`);
  return data as T;
}

/** Turns browser errors into friendly words. Returns null when the person just cancelled. */
function friendly(e: unknown): string | null {
  const name = e instanceof WebAuthnError ? e.cause && (e.cause as Error).name : (e as Error)?.name;
  if (name === "NotAllowedError" || name === "AbortError") return null;
  if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "This device already has a passkey for your account 👍";
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

export class PasskeyCancelled extends Error {}

export async function signInWithPasskey(): Promise<void> {
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/passkey/login/options");
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (e) {
    const message = friendly(e);
    throw message ? new Error(message) : new PasskeyCancelled();
  }
  const { user } = await post<{ user: { email: string } }>("/api/auth/passkey/login/verify", { response });
  await signedIn(user);
}

export async function addPasskey(): Promise<{ id: string; name: string }> {
  const { options } = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/auth/passkey/register/options");
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (e) {
    const message = friendly(e);
    throw message ? new Error(message) : new PasskeyCancelled();
  }
  const { passkey } = await post<{ passkey: { id: string; name: string } }>("/api/auth/passkey/register/verify", { response });
  return passkey;
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const res = await fetch("/api/auth/passkeys", { credentials: "same-origin" });
  if (!res.ok) return [];
  return (await res.json()).passkeys;
}

export async function removePasskey(id: string): Promise<void> {
  const res = await fetch(`/api/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error("Couldn't remove that passkey. Try again.");
}

export function deviceEmoji(name: string): string {
  if (/iPhone|Android/.test(name)) return "📱";
  if (/iPad/.test(name)) return "📲";
  if (/Mac|Linux|Chromebook/.test(name)) return "💻";
  if (/Windows/.test(name)) return "🖥️";
  return "🔑";
}
