import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { onClose, query } from "./db";

/**
 * "Has anything changed?" answered from memory, so checking costs the database
 * nothing. Every write to an app's data bumps that collection's version; apps
 * ask for the versions (one tiny request for all their data) and fetch only
 * what changed. Open owner pages are told at once (server-sent events).
 *
 * With several server instances, each bump is also sent with PostgreSQL
 * NOTIFY, and every instance LISTENs, so they all know. Versions start fresh
 * when an instance starts (apps then simply fetch once).
 */

const CHANNEL = "appmaker_data";
const EPOCH = Date.now().toString(36);
const versions = new Map<string, number>();
const events = new EventEmitter();
events.setMaxListeners(0);

const key = (store: string, collection: string) => `${store}|${collection}`;

/** A collection's version ("" for the whole store). */
export function version(store: string, collection: string): string {
  return `${EPOCH}.${versions.get(key(store, collection)) ?? 0}`;
}

function bumpLocal(store: string, collection: string) {
  versions.set(key(store, collection), (versions.get(key(store, collection)) ?? 0) + 1);
  if (collection === "*") storeCache.delete(store);
  events.emit(store, collection);
}

/** Something changed: this instance knows now, the others through NOTIFY. Collection "*" means the app itself (its rules, PIN, link). */
export function bump(store: string, collection: string): void {
  bumpLocal(store, collection);
  void query("select pg_notify($1, $2)", [CHANNEL, `${process.pid}:${EPOCH}|${store}|${collection}`]).catch(() => undefined);
}

/** Listens for changes to one app's data (for live owner pages); returns the way to stop. */
export function subscribe(store: string, fn: (collection: string) => void): () => void {
  void startListening();
  events.on(store, fn);
  return () => events.off(store, fn);
}

// ---------- hearing other instances (LISTEN) ----------

let listener: Client | null = null;
let starting: Promise<void> | null = null;

export function startListening(): Promise<void> {
  if (listener || starting || !process.env.DATABASE_URL) return starting ?? Promise.resolve();
  starting = (async () => {
    try {
      const url = process.env.DATABASE_URL!.trim();
      const ssl = /sslmode=(require|verify)/.test(url) || process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined;
      const client = new Client({ connectionString: url, ssl });
      await client.connect();
      await client.query(`listen ${CHANNEL}`);
      client.on("notification", (msg) => {
        const [from, store, collection] = (msg.payload ?? "").split("|");
        if (from === `${process.pid}:${EPOCH}` || !store || !collection) return; // our own bump
        bumpLocal(store, collection);
      });
      // A dropped connection: listen again shortly (until then, apps fall back to their normal checks).
      client.on("error", () => {
        listener = null;
        setTimeout(() => void startListening(), 5_000).unref?.();
      });
      listener = client;
    } catch {
      setTimeout(() => void startListening(), 30_000).unref?.();
    } finally {
      starting = null;
    }
  })();
  return starting;
}

onClose(async () => {
  const l = listener;
  listener = null;
  await l?.end().catch(() => undefined);
});

// ---------- the store's rules, kept in memory for the version check ----------

export interface CachedStore {
  id: string;
  collections: string[];
}
const storeCache = new Map<string, { store: CachedStore | null; at: number }>();

/** An app's collections, from memory when recent (so the version check doesn't touch the database). */
export async function cachedStore(id: string, load: (id: string) => Promise<{ id: string; rules: Record<string, unknown> } | null>): Promise<CachedStore | null> {
  const hit = storeCache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.store;
  const s = await load(id);
  const store = s ? { id: s.id, collections: Object.keys(s.rules) } : null;
  if (storeCache.size > 5_000) storeCache.clear();
  storeCache.set(id, { store, at: Date.now() });
  return store;
}

/** Tests only. */
export function resetVersions() {
  versions.clear();
  storeCache.clear();
}

// ---------- live owner pages (server-sent events) ----------

const tickets = new Map<string, { store: string; until: number }>();
const live = new Map<string, number>();
export const MAX_LIVE_PER_APP = 10;
export const MAX_LIVE = 1_000;

/** A ticket for one owner page's live connection (EventSource can't send the owner key as a header). */
export function liveTicket(store: string): string {
  const now = Date.now();
  for (const [t, v] of tickets) if (v.until < now) tickets.delete(t);
  const ticket = randomBytes(24).toString("base64url");
  tickets.set(ticket, { store, until: now + 12 * 60 * 60 * 1000 });
  return ticket;
}

export function ticketStore(ticket: string): string | null {
  const t = tickets.get(ticket);
  return t && t.until > Date.now() ? t.store : null;
}

/** Counts open live connections; false when the app or the server has enough. */
export function openLive(store: string): boolean {
  const total = [...live.values()].reduce((a, b) => a + b, 0);
  if (total >= MAX_LIVE || (live.get(store) ?? 0) >= MAX_LIVE_PER_APP) return false;
  live.set(store, (live.get(store) ?? 0) + 1);
  return true;
}

export function closeLive(store: string): void {
  const n = (live.get(store) ?? 1) - 1;
  if (n <= 0) live.delete(store);
  else live.set(store, n);
}
