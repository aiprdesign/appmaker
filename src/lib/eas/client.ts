"use client";

import { useSyncExternalStore } from "react";
import { renderIcon } from "../export";
import type { AppleSigning, BuildTarget, CloudBuild, ExpoLink, PhonePreview, Project } from "../types";

/**
 * The user's Expo connection, kept in this browser only. The access token and
 * App Store Connect key are sent with each build request; the server passes
 * them to Expo and never stores them.
 */
export interface ExpoSettings {
  token?: string;
  /** Who the token belongs to, shown as "Connected as …". */
  accountName?: string;
  /** App Store Connect API key, for uploads to TestFlight / the App Store. */
  ascKey?: { keyId: string; issuerId: string; p8: string; fileName?: string };
  /**
   * The Apple Distribution certificate Appmaker created with that key. Apple
   * allows only a few per team, so it is reused for every app and build.
   */
  appleSigning?: AppleSigning;
}

const KEY = "appmaker.expo.v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: ExpoSettings = {};

function read(): ExpoSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage unavailable; keep what this page view has.
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as ExpoSettings) : {};
    } catch {
      cached = {};
    }
  }
  return cached;
}

export function saveExpoSettings(next: ExpoSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
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

const EMPTY: ExpoSettings = {};
export function useExpoSettings(): ExpoSettings {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export class EasRequestError extends Error {
  constructor(
    message: string,
    public code?: string,
    /** A certificate the server made before the request failed; keep it. */
    public signing?: AppleSigning,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new EasRequestError("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // No message from Appmaker: the host's proxy gave up waiting (a long first publish or build after a deploy).
    const timedOut = !data.error && [502, 503, 504].includes(res.status);
    const message = timedOut
      ? "The server took too long to answer (the first one after an update can be slow while it sets up). Wait a minute, then try again: it's usually quick the second time."
      : data.error || `Request failed (HTTP ${res.status})`;
    throw new EasRequestError(message, data.code, data.signing);
  }
  return data as T;
}

async function iconBase64(project: Project): Promise<string> {
  const blob = await renderIcon(project.listing, 1024, project.icon);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const projectBody = (p: Project) => ({ files: p.files, listing: p.listing });

export interface EasServerInfo {
  available: boolean;
  /** Switched off by the site owner in /admin. */
  off?: boolean;
  /** Builds run on the site's Expo account: users don't need one. */
  hosted: boolean;
}

export async function checkAvailable(): Promise<EasServerInfo> {
  try {
    const res = await fetch("/api/eas/account");
    const data = await res.json();
    return { available: !!data.available, hosted: !!data.hosted, off: !!data.off };
  } catch {
    return { available: false, hosted: false };
  }
}

export function connectExpo(token: string) {
  return post<{ name: string; account: string; available: boolean }>("/api/eas/account", { token });
}

/** Without a token, the server uses its own Expo account (hosted builds). */
export async function linkToExpo(token: string | undefined, project: Project): Promise<ExpoLink> {
  const { link } = await post<{ link: ExpoLink }>("/api/eas/link", { token, project: projectBody(project), icon: await iconBase64(project) });
  return { ...link, hosted: !token };
}

export async function startCloudBuild(opts: {
  token?: string;
  project: Project;
  link: ExpoLink;
  target: BuildTarget;
  submit: boolean;
  ascAppId?: string;
  ascKey?: ExpoSettings["ascKey"];
  signing?: AppleSigning;
}): Promise<{ builds: CloudBuild[]; signing?: AppleSigning }> {
  return post<{ builds: CloudBuild[]; signing?: AppleSigning }>("/api/eas/build", {
    token: opts.token,
    signing: opts.signing,
    project: projectBody(opts.project),
    icon: await iconBase64(opts.project),
    link: opts.link,
    target: opts.target,
    submit: opts.submit,
    ascAppId: opts.ascAppId,
    ascKey: opts.ascKey?.p8 ? { keyId: opts.ascKey.keyId, issuerId: opts.ascKey.issuerId, p8: opts.ascKey.p8 } : undefined,
  });
}

/** A short fingerprint of what the phone preview shows, to tell when it's out of date. */
export function previewSource(project: Project): string {
  const text = JSON.stringify([project.files, project.listing.name, project.listing.primaryColor, project.listing.iconEmoji]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return `${(h >>> 0).toString(36)}-${text.length}`;
}

/** Publishes the app for Expo Go (EAS Update); the result's url goes in the QR code. */
export async function publishForPhone(token: string | undefined, project: Project, link: ExpoLink): Promise<PhonePreview> {
  const { preview } = await post<{ preview: PhonePreview }>("/api/eas/update", {
    token,
    project: projectBody(project),
    icon: await iconBase64(project),
    link,
  });
  return { ...preview, source: previewSource(project) };
}

export async function fetchBuilds(token: string | undefined, ids: string[]): Promise<CloudBuild[]> {
  const { builds } = await post<{ builds: CloudBuild[] }>("/api/eas/builds", { token, ids });
  return builds;
}

export const ACTIVE_STATUSES = ["NEW", "IN_QUEUE", "IN_PROGRESS", "PENDING_CANCEL"];
export const ACTIVE_SUBMISSION = ["AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS"];

export function isActive(b: CloudBuild): boolean {
  return ACTIVE_STATUSES.includes(b.status) || (!!b.submission && ACTIVE_SUBMISSION.includes(b.submission.status));
}

export function buildPageUrl(link: ExpoLink, id: string): string {
  return `https://expo.dev/accounts/${encodeURIComponent(link.owner)}/projects/${encodeURIComponent(link.slug)}/builds/${encodeURIComponent(id)}`;
}
