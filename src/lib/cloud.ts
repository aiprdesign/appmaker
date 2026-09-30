"use client";

import { useSyncExternalStore } from "react";
import { clearLocalProjects, getProject, listProjects, onProjectChange, removeLocal, storeLocal } from "./storage";
import type { Project } from "./types";

/**
 * Cloud sync for signed-in users. The browser keeps the working copy (so the
 * builder stays instant and works offline); every change is saved to the
 * account shortly after, and on load the account and browser are merged:
 * the newest copy of each project wins, and deletions carry over.
 */

export type SyncStatus = "idle" | "syncing" | "saving" | "saved" | "offline" | "error";

export interface CloudState {
  /** null until the server has answered; false when the site has no database. */
  enabled: boolean | null;
  user: { email: string } | null;
  /** "Sign in with Google" is set up on this site. */
  google?: boolean;
  /** Passkeys and new sign-ups, as switched in /admin. */
  passkeys?: boolean;
  signups?: boolean;
  status: SyncStatus;
  error?: string;
}

const DIRTY_KEY = "appmaker.sync.dirty.v1";
const DELETED_KEY = "appmaker.sync.deleted.v1";
export const PROJECTS_CHANGED = "appmaker:projects-changed";

let state: CloudState = { enabled: null, user: null, status: "idle" };
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function set(next: Partial<CloudState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    // Storage full: the next full sync still compares timestamps.
  }
}
const mark = (key: string, id: string, on: boolean) => {
  const s = readSet(key);
  if (on) s.add(id);
  else s.delete(id);
  writeSet(key, s);
};

function announce() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED));
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, { ...init, headers: { "content-type": "application/json", ...init.headers }, credentials: "same-origin" });
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (state.user) void flush();
  }, 15_000);
}

/** Saves one project to the account. */
async function push(id: string): Promise<void> {
  const project = getProject(id);
  if (!project || !state.user) return;
  set({ status: "saving" });
  try {
    const res = await api(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ project }) });
    if (res.status === 401) return signedOutElsewhere();
    if (res.status === 409) {
      // Another device saved a newer copy: take it.
      const newer = await api(`/api/projects/${id}`);
      if (newer.ok) {
        storeLocal((await newer.json()).project as Project);
        announce();
      }
    } else if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      set({ status: "error", error: body.error || `Couldn't save to your account (HTTP ${res.status}).` });
      if (res.status >= 500 || res.status === 429) scheduleRetry();
      return;
    }
    mark(DIRTY_KEY, id, false);
    set({ status: "saved", error: undefined });
  } catch {
    set({ status: "offline" });
    scheduleRetry();
  }
}

async function pushDelete(id: string): Promise<void> {
  try {
    const res = await api(`/api/projects/${id}`, { method: "DELETE" });
    if (res.status === 401) return signedOutElsewhere();
    if (res.ok) mark(DELETED_KEY, id, false);
    else scheduleRetry();
  } catch {
    set({ status: "offline" });
    scheduleRetry();
  }
}

/** Sends every change not yet saved to the account. */
async function flush(): Promise<void> {
  for (const [id, t] of timers) {
    clearTimeout(t);
    timers.delete(id);
  }
  for (const id of readSet(DELETED_KEY)) await pushDelete(id);
  for (const id of readSet(DIRTY_KEY)) await push(id);
}

/** Merges the account and this browser. */
export async function syncNow(): Promise<void> {
  if (!state.user) return;
  set({ status: "syncing" });
  try {
    for (const id of readSet(DELETED_KEY)) await pushDelete(id);
    const res = await api("/api/projects");
    if (res.status === 401) return signedOutElsewhere();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = (await res.json()).projects as { id: string; updatedAt: number; deletedAt?: number }[];
    const local = new Map(listProjects().map((p) => [p.id, p]));
    let changed = false;
    for (const meta of remote) {
      const mine = local.get(meta.id);
      if (meta.deletedAt) {
        if (mine && mine.updatedAt <= meta.deletedAt) {
          removeLocal(meta.id);
          changed = true;
        }
        continue;
      }
      if (!mine || meta.updatedAt > mine.updatedAt) {
        const full = await api(`/api/projects/${meta.id}`);
        if (full.ok) {
          storeLocal((await full.json()).project as Project);
          changed = true;
        }
      }
    }
    const byId = new Map(remote.map((m) => [m.id, m]));
    for (const p of listProjects()) {
      const meta = byId.get(p.id);
      if (!meta || (!meta.deletedAt && p.updatedAt > meta.updatedAt) || (meta.deletedAt && p.updatedAt > meta.deletedAt)) {
        mark(DIRTY_KEY, p.id, true);
      }
    }
    if (changed) announce();
    await flush();
    set({ status: state.status === "error" ? "error" : "saved" });
  } catch {
    set({ status: "offline" });
    scheduleRetry();
  }
}

function signedOutElsewhere() {
  set({ user: null, status: "idle" });
}

/** Called once per page load. */
export function startCloud(): void {
  if (started) return;
  started = true;
  onProjectChange((change) => {
    if (!state.user) return;
    if (change.type === "delete") {
      mark(DIRTY_KEY, change.id, false);
      mark(DELETED_KEY, change.id, true);
      void pushDelete(change.id);
      return;
    }
    const id = change.project.id;
    mark(DIRTY_KEY, id, true);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void push(id);
      }, 1500),
    );
  });
  // Try to save before the tab closes.
  window.addEventListener("pagehide", () => {
    if (!state.user) return;
    for (const id of timers.keys()) {
      const project = getProject(id);
      if (project) void fetch(`/api/projects/${id}`, { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) }).catch(() => {});
    }
  });
  window.addEventListener("online", () => state.user && void flush());
  void api("/api/auth/me")
    .then((r) => r.json())
    .then((me: { enabled: boolean; google?: boolean; passkeys?: boolean; signups?: boolean; user: { email: string } | null }) => {
      set({ enabled: me.enabled, google: !!me.google, passkeys: me.passkeys !== false, signups: me.signups !== false, user: me.user });
      if (me.user) void syncNow();
    })
    .catch(() => set({ enabled: false }));
}

export async function signIn(mode: "login" | "signup", email: string, password: string): Promise<void> {
  const res = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong. Try again.");
  await signedIn(body.user);
}

/** After any kind of sign-in: remember the user and merge this browser's apps into the account. */
export async function signedIn(user: { email: string }): Promise<void> {
  set({ user, enabled: true });
  // Apps made before signing in are added to the account.
  await syncNow();
}

/** Deletes the account (confirmed by typing its email) and clears this browser's copy of its apps. */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  const res = await fetch("/api/auth/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: confirmEmail }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't delete the account. Try again.");
  clearLocalProjects();
  writeSet(DIRTY_KEY, new Set());
  writeSet(DELETED_KEY, new Set());
  set({ user: null, status: "idle", error: undefined });
  announce();
}

export async function signOut(options: { force?: boolean } = {}): Promise<void> {
  await flush();
  if (!options.force && (readSet(DIRTY_KEY).size || readSet(DELETED_KEY).size)) {
    throw new Error("Some changes aren't saved to your account yet (you may be offline). Try again in a moment so nothing is lost.");
  }
  await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  // The apps are safe in the account; don't leave them on a shared computer.
  clearLocalProjects();
  writeSet(DIRTY_KEY, new Set());
  writeSet(DELETED_KEY, new Set());
  set({ user: null, status: "idle", error: undefined });
  announce();
}
