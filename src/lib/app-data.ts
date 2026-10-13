import type { FileMap } from "./types";
import { STAFF_PROMPT } from "./staff";

/**
 * Appmaker app data: a built-in database for the apps Appmaker makes, so a
 * business never has to set up Supabase, Firebase or a server.
 *
 * The AI describes the app's data in src/data-rules.json; Appmaker adds
 * src/appdata.js, which the app uses through useCollection(). Until the owner
 * turns the cloud on, everything is kept on the phone (so the preview works at
 * once); afterwards it's stored by Appmaker and shared as the rules say:
 *  - public:  the business edits it on its owner page, everyone sees it (menu, offers, news)
 *  - inbox:   customers send it, only the business sees it, each customer sees their own (orders, requests, sign-ups)
 *  - shared:  everyone adds and sees it, people edit only their own, the business can remove any (reviews, a community board)
 *  - private: each person's own data, on every device they use the app on with the same phone (notes, favourites)
 */

export const DATA_FILE = "src/appdata.js";
export const RULES_FILE = "src/data-rules.json";
export const ACCESS = ["public", "inbox", "shared", "private"] as const;
export type Access = (typeof ACCESS)[number];

export interface CollectionRule {
  access: Access;
  /** Field names, in order (the owner page shows and edits these). */
  fields: string[];
  /** Statuses the business can set on inbox items (the first is the starting one). */
  statuses?: string[];
  /** Starting items for a public collection, used until the business adds its own. */
  seed?: Record<string, unknown>[];
}
export type DataRules = Record<string, CollectionRule>;

export class DataInputError extends Error {}

export const COLLECTION_NAME = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const MAX_COLLECTIONS = 12;
export const MAX_RECORD_BYTES = 8_000;
export const DEFAULT_STATUSES = ["new", "accepted", "ready", "done", "cancelled"];

/** Reads the rules the AI wrote (or the builder sent), keeping only what's valid. */
export function parseRules(v: unknown): DataRules {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new DataInputError("The data rules must be an object of collections.");
  const out: DataRules = {};
  for (const [name, raw] of Object.entries(v as Record<string, unknown>).slice(0, MAX_COLLECTIONS)) {
    if (!COLLECTION_NAME.test(name)) throw new DataInputError(`"${name}" isn't a valid collection name (letters and numbers, starting with a lowercase letter).`);
    const r = (typeof raw === "string" ? { access: raw } : raw) as Record<string, unknown> | null;
    if (!r || typeof r !== "object") throw new DataInputError(`The rule for "${name}" must be an object.`);
    const access = r.access as Access;
    if (!ACCESS.includes(access)) throw new DataInputError(`"${name}" needs an access of ${ACCESS.join(", ")}.`);
    const fields = (Array.isArray(r.fields) ? r.fields : []).filter((f): f is string => typeof f === "string" && FIELD_NAME.test(f)).slice(0, 20);
    const rule: CollectionRule = { access, fields };
    if (access === "inbox") {
      const st = (Array.isArray(r.statuses) ? r.statuses : []).filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 24).slice(0, 8);
      rule.statuses = st.length ? st : DEFAULT_STATUSES;
    }
    if (access === "public" && Array.isArray(r.seed)) {
      rule.seed = r.seed
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
        .map((x) => cleanRecord(x))
        .slice(0, 100);
    }
    out[name] = rule;
  }
  return out;
}

/** A record's fields: plain JSON values only, within the size limit. */
export function cleanRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new DataInputError("A record must be an object of fields.");
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!FIELD_NAME.test(k) || ["id", "createdAt", "updatedAt", "mine", "status"].includes(k)) continue;
    if (val === null || ["string", "number", "boolean"].includes(typeof val)) out[k] = typeof val === "string" ? val.slice(0, 4000) : val;
    else if (Array.isArray(val) || typeof val === "object") out[k] = JSON.parse(JSON.stringify(val));
  }
  if (JSON.stringify(out).length > MAX_RECORD_BYTES) throw new DataInputError("That's too much to save in one item.");
  return out;
}

/** Whether the app's code uses the data module. */
export const usesData = (files: FileMap) =>
  Object.entries(files).some(([p, code]) => p !== DATA_FILE && /from\s+['"][./]*(src\/)?appdata['"]/.test(code));

/** The rules in the app's files, or null when it has none (or they're broken). */
export function appRules(files: FileMap): DataRules | null {
  const text = files[RULES_FILE];
  if (!text) return null;
  try {
    return parseRules(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * src/appdata.js: the app's side. apiUrl is null until the cloud is on, and
 * the data then stays on the phone (AsyncStorage) with the same API.
 */
export function dataModule(apiUrl: string | null, rules: DataRules): string {
  const access = Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, r.access]));
  const seeds = Object.fromEntries(Object.entries(rules).filter(([, r]) => r.seed?.length).map(([k, r]) => [k, r.seed]));
  return `// Appmaker app data: the app's built-in database. Written by Appmaker — don't change this file.
// Screens import useCollection from this file, then:
//   const { items, loading, error, add, update, remove, refresh } = useCollection('orders');
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const API = ${JSON.stringify(apiUrl)};
const ACCESS = ${JSON.stringify(access)};
const SEED = ${JSON.stringify(seeds)};
const listeners = {};

let devicePromise = null;
function device() {
  if (!devicePromise) {
    devicePromise = AsyncStorage.getItem('appdata:device').then(async (id) => {
      if (id) return id;
      let next = '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 32; i++) next += chars[Math.floor(Math.random() * chars.length)];
      await AsyncStorage.setItem('appdata:device', next);
      return next;
    });
  }
  return devicePromise;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function readLocal(collection) {
  try {
    const raw = await AsyncStorage.getItem('appdata:' + collection);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const now = Date.now();
  return (SEED[collection] || []).map((d, i) => ({ id: 'seed' + i, ...d, createdAt: now - i, updatedAt: now - i, mine: false }));
}

async function writeLocal(collection, items) {
  await AsyncStorage.setItem('appdata:' + collection, JSON.stringify(items));
}

// So the customer hears when their order or request moves on: asked once, when they first send one.
async function pushToken() {
  try {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted && !(await AsyncStorage.getItem('appdata:asked'))) {
      await AsyncStorage.setItem('appdata:asked', '1');
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return '';
    return (await Notifications.getExpoPushTokenAsync()).data || '';
  } catch (e) {
    return '';
  }
}

async function call(method, params, body, extra) {
  const query = Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  const res = await fetch(API + (query ? '?' + query : ''), {
    method,
    headers: { 'content-type': 'application/json', 'x-device': await device(), ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the server. Check your connection and try again.");
  return data;
}

function changed(collection) {
  (listeners[collection] || []).forEach((fn) => fn());
}

function check(collection) {
  if (!ACCESS[collection]) throw new Error('Unknown collection "' + collection + '": add it to src/data-rules.json.');
}

/** All the items this person can see, newest first. */
export async function list(collection) {
  check(collection);
  if (!API) return readLocal(collection);
  const data = await call('GET', { collection });
  const items = data.items || [];
  if (!items.length && ACCESS[collection] === 'public' && SEED[collection]) return readLocal(collection);
  return items;
}

/** Adds an item; returns it (with id, createdAt and, for inbox items, status). */
export async function add(collection, fields) {
  check(collection);
  if (!API) {
    const now = Date.now();
    const id = newId();
    const item = { ...fields, id, createdAt: now, updatedAt: now, mine: true, ...(ACCESS[collection] === 'inbox' ? { status: 'new', ref: id.slice(-4).toUpperCase() } : {}) };
    await writeLocal(collection, [item, ...(await readLocal(collection))]);
    changed(collection);
    return item;
  }
  const token = ACCESS[collection] === 'inbox' ? await pushToken() : '';
  const data = await call('POST', {}, { collection, data: fields }, token ? { 'x-push-token': token } : null);
  changed(collection);
  return data.item;
}

/** Changes some fields of an item this person added. */
export async function update(collection, id, fields) {
  check(collection);
  if (!API) {
    const items = (await readLocal(collection)).map((x) => (x.id === id ? { ...x, ...fields, updatedAt: Date.now() } : x));
    await writeLocal(collection, items);
    changed(collection);
    return items.find((x) => x.id === id);
  }
  const data = await call('PATCH', {}, { collection, id, data: fields });
  changed(collection);
  return data.item;
}

/** Deletes an item this person added. */
export async function remove(collection, id) {
  check(collection);
  if (!API) {
    await writeLocal(collection, (await readLocal(collection)).filter((x) => x.id !== id));
    changed(collection);
    return;
  }
  await call('DELETE', { collection, id });
  changed(collection);
}

/**
 * A collection as React state: the items, and add, update and remove that keep
 * every screen using it up to date. Refreshes every 30 seconds while shown.
 */
export function useCollection(collection) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await list(collection);
      if (alive.current) {
        setItems(next);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e.message || String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [collection]);
  useEffect(() => {
    alive.current = true;
    refresh();
    (listeners[collection] = listeners[collection] || []).push(refresh);
    const timer = API ? setInterval(refresh, 30000) : null;
    return () => {
      alive.current = false;
      listeners[collection] = (listeners[collection] || []).filter((fn) => fn !== refresh);
      if (timer) clearInterval(timer);
    };
  }, [collection, refresh]);
  return {
    items,
    loading,
    error,
    refresh,
    cloud: !!API,
    add: (fields) => add(collection, fields),
    update: (id, fields) => update(collection, id, fields),
    remove: (id) => remove(collection, id),
  };
}
`;
}

/** What the AI is told about app data. */
export const DATA_PROMPT = `## App data (Appmaker's built-in database: no Supabase, Firebase or server to set up)
When the app needs data that's shared with the business or between customers (orders, requests, sign-ups, reviews, a menu or offers the business updates, a community board), use Appmaker app data. Data only one person needs can stay in AsyncStorage as usual.
1. Describe the data in src/data-rules.json: each collection's name (camelCase, e.g. "orders"), its access and its fields, for example:
   {"menu": {"access": "public", "fields": ["name", "description", "price", "category"], "seed": [{"name": "Margherita", "description": "Tomato, mozzarella, basil", "price": "12", "category": "Pizza"}]},
    "orders": {"access": "inbox", "fields": ["name", "phone", "items", "pickupTime", "note"], "statuses": ["new", "preparing", "ready", "collected"]},
    "reviews": {"access": "shared", "fields": ["name", "rating", "text"]}}
   Access: "public" = the business edits it on its owner page and everyone sees it (give "seed" items from the real content so it's never empty); "inbox" = customers send it, only the business sees all of them, and each customer sees their own with the status the business sets; "shared" = everyone adds and sees it, people change only their own; "private" = each person's own data.
2. src/appdata.js is written by Appmaker from those rules: never write, change or delete it. Use it from any screen:
   \`import { useCollection } from '../appdata';\` (relative path) then \`const { items, loading, error, add, update, remove, refresh } = useCollection('orders');\`
   - items are newest first: \`{ id, ...fields, createdAt, mine }\`, plus \`status\` on inbox items. \`mine\` is true for items this person added.
   - \`await add({ ...fields })\` returns the new item; \`update(id, fields)\` and \`remove(id)\` work on the person's own items. All three can throw: catch and show the message with a Retry.
   - Show \`loading\` (a skeleton) and \`error\` (with Retry), and an empty state.
3. Inbox screens: after sending, say "Sent — {business} will get back to you" and show the person's own items with their status (e.g. "Order #… · preparing"). Never say an order or booking is confirmed until its status says so.
   The customer is asked once, when they first send something, whether they want notifications: they then get one when the business changes its status. Don't ask for that yourself.
4. ${STAFF_PROMPT}
5. Until the owner turns on the app database in the Publish tab, the data stays on the phone (so the preview works now). Mention in the summary that they can turn it on there so orders and reviews reach them, and that they manage everything from their owner page (with alerts for new orders) or in the app's Staff mode with a staff PIN.`;
