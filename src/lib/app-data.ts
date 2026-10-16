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

/** "Ana Maria Silva" → "Ana": customers are only ever asked for their first name. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 30) ?? "";

/** Orders and requests keep a customer's first name only, whatever the app's form sent. */
export function firstNameOnly(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const k of ["name", "customerName", "fullName", "customer"]) if (typeof out[k] === "string") out[k] = firstName(out[k] as string);
  for (const k of ["lastName", "surname", "familyName"]) delete out[k];
  return out;
}
export const DEFAULT_STATUSES = ["new", "accepted", "ready", "done", "cancelled"];

/** Statuses that mean an order or request is finished (or the last one in the list). */
export const DONE_STATUS = /^(done|complete|completed|collected|delivered|closed|picked ?up|served|finished|archived|cancel+ed|declined|rejected)$/i;
const STOPPED = /^(cancel|declin|reject)/i;
/** The statuses that end an order or request: done-like words, cancelled ones, and the last real step. */
export function doneStatuses(statuses: string[] | undefined): string[] {
  const steps = (statuses ?? []).filter((x) => !STOPPED.test(x));
  return (statuses ?? []).filter((x) => DONE_STATUS.test(x) || STOPPED.test(x) || x === steps[steps.length - 1]);
}
export const isDone = (status: string | undefined, statuses: string[] | undefined) => !!status && (DONE_STATUS.test(status) || STOPPED.test(status) || doneStatuses(statuses).includes(status));

/** What customers read for a status ("preparing" → "Being prepared"). */
export const STATUS_WORDS: Record<string, string> = {
  new: "Received",
  pending: "Received",
  received: "Received",
  accepted: "Accepted",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  "in progress": "In progress",
  quoted: "Quote sent",
  booked: "Booked",
  ready: "Ready",
  "on the way": "On the way",
  done: "Completed",
  completed: "Completed",
  collected: "Collected",
  delivered: "Delivered",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  declined: "Declined",
};

/** "pickupTime" → "Pickup time", "in_progress" → "In progress". */
export const fieldLabel = (f: string) =>
  f
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

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
    const fields = (Array.isArray(r.fields) ? r.fields : [])
      .filter((f): f is string => typeof f === "string" && FIELD_NAME.test(f) && !FORBIDDEN_FIELD.test(f) && !FORBIDDEN_LOOSE.test(f))
      .slice(0, 20);
    const rule: CollectionRule = { access, fields };
    if (access === "inbox") {
      const st = (Array.isArray(r.statuses) ? r.statuses : []).filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 24).slice(0, 8);
      rule.statuses = st.length ? st : DEFAULT_STATUSES;
      // Customers can always cancel while waiting, so there's always a status for it.
      if (!rule.statuses.some((x) => /^cancel/i.test(x))) rule.statuses = [...rule.statuses, "cancelled"];
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

/** Fields the app must never collect: payment cards, passwords and ID numbers belong with a payment provider or nowhere. */
export const FORBIDDEN_FIELD = /^(password|passcode|pin|cvv|cvc|card(number|no)?|credit ?card|iban|ssn|social ?security|passport|national ?id|tax ?id|drivers? ?licen[cs]e)$/i;
const FORBIDDEN_LOOSE = /password|cvv|cvc|creditcard|cardnumber|ssn|passport/i;

/** A payment card number (13–19 digits passing the Luhn check), even with spaces or dashes. */
export function looksLikeCard(v: string): boolean {
  for (const m of v.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

/** A record's fields: plain JSON values only, within the size limit, and nothing that must not be stored. */
export function cleanRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new DataInputError("A record must be an object of fields.");
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!FIELD_NAME.test(k) || ["id", "createdAt", "updatedAt", "mine", "status"].includes(k)) continue;
    if (val === null || ["string", "number", "boolean"].includes(typeof val)) out[k] = typeof val === "string" ? val.slice(0, 4000) : val;
    else if (Array.isArray(val) || typeof val === "object") out[k] = JSON.parse(JSON.stringify(val));
  }
  if (JSON.stringify(out).length > MAX_RECORD_BYTES) throw new DataInputError("That's too much to save in one item.");
  for (const [k, val] of Object.entries(out)) {
    if (FORBIDDEN_FIELD.test(k) || FORBIDDEN_LOOSE.test(k)) throw new DataInputError("For your safety, the app can't store passwords, card details or ID numbers.");
    if (typeof val === "string" && looksLikeCard(val)) throw new DataInputError("For your safety, please don't send card numbers. Pay the business directly.");
  }
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
  const statuses = Object.fromEntries(Object.entries(rules).filter(([, r]) => r.statuses).map(([k, r]) => [k, r.statuses]));
  const fields = Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, r.fields]));
  return `// Appmaker app data: the app's built-in database. Written by Appmaker — don't change this file.
// Screens import useCollection from this file, then:
//   const { items, loading, error, add, update, remove, refresh } = useCollection('orders');
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const API = ${JSON.stringify(apiUrl)};
const ACCESS = ${JSON.stringify(access)};
const SEED = ${JSON.stringify(seeds)};
const STATUSES = ${JSON.stringify(statuses)};
const FIELDS = ${JSON.stringify(fields)};
const WORDS = ${JSON.stringify(STATUS_WORDS)};
const DONE = ${DONE_STATUS.toString()};
const listeners = {};

let devicePromise = null;
function device() {
  if (!devicePromise) {
    devicePromise = AsyncStorage.getItem('appdata:device').then(async (id) => {
      if (id) return id;
      let next = '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      // This id is the only key to the customer's own orders: use the phone's secure random numbers where it has them.
      const bytes = new Uint8Array(32);
      if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
      else for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
      for (let i = 0; i < 32; i++) next += chars[bytes[i] % chars.length];
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
    const token = (await Notifications.getExpoPushTokenAsync()).data || '';
    pushOn = !!token;
    return token;
  } catch (e) {
    return '';
  }
}

// Updates arrive as notifications: when one comes in for this app's data, refresh that data at once
// (so the app doesn't need to keep asking the server).
let pushOn = false;
try {
  const onPush = (n) => {
    const data = n && n.request && n.request.content && n.request.content.data;
    if (!data || !data.appmaker) return;
    Object.keys(ACCESS).filter((c) => !data.collection || c === data.collection).forEach(changed);
  };
  Notifications.addNotificationReceivedListener(onPush);
  Notifications.addNotificationResponseReceivedListener((r) => onPush(r && r.notification));
  Notifications.getPermissionsAsync().then((p) => { pushOn = !!(p && p.granted); }).catch(() => {});
} catch (e) {}

async function call(method, params, body, extra, path) {
  const query = Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  // A slow or dropped connection gives up after 15 seconds instead of waiting forever.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  let res;
  try {
    res = await fetch(API + (path || '') + (query ? '?' + query : ''), {
      method,
      headers: { 'content-type': 'application/json', 'x-device': await device(), ...(extra || {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 304) return { notModified: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the server. Check your connection and try again.");
  const etag = res.headers && res.headers.get ? res.headers.get('etag') : null;
  if (etag) data.etag = etag;
  return data;
}

function changed(collection) {
  if (memo[collection]) memo[collection].at = 0;
  (listeners[collection] || []).forEach((fn) => fn());
}

function check(collection) {
  if (!ACCESS[collection]) throw new Error('Unknown collection "' + collection + '": add it to src/data-rules.json.');
}

/** All the items this person can see, newest first. */
// Light on the server: screens showing the same collection share one request, a
// copy fresher than 5 seconds is reused, and unchanged data costs a tiny "not modified" reply.
const memo = {};

// "Has anything changed?" in one tiny request for all of the app's data (answered from the
// server's memory). Screens fetch a collection only when its version moved.
const known = {};
let versionsCall = null;
let versionsAt = 0;
let versionsLast = null;
async function versionsNow() {
  if (versionsCall) return versionsCall;
  if (versionsLast && Date.now() - versionsAt < 3000) return versionsLast;
  versionsCall = (async () => {
    try {
      const data = await call('GET', {}, null, null, '/versions');
      versionsLast = data.versions || null;
      versionsAt = Date.now();
      return versionsLast;
    } catch (e) {
      return null;
    } finally {
      versionsCall = null;
    }
  })();
  return versionsCall;
}

/** Whether a collection changed since this phone last fetched it (true when it can't tell). */
async function hasChanged(collection) {
  const v = await versionsNow();
  if (!v || v[collection] == null) return true;
  if (known[collection] === v[collection]) return false;
  known[collection] = v[collection];
  return true;
}

export async function list(collection, fresh) {
  check(collection);
  if (!API) return readLocal(collection);
  const m = memo[collection] || (memo[collection] = {});
  if (m.pending) return m.pending;
  if (!fresh && m.items && Date.now() - m.at < 5000) return m.items;
  m.pending = (async () => {
    try {
      const data = await call('GET', { collection }, null, m.etag ? { 'if-none-match': m.etag } : null);
      m.changed = !data.notModified;
      if (!data.notModified) {
        m.items = data.items || [];
        m.etag = data.etag || null;
        // The last good copy, for when the phone is offline (see useCollection).
        AsyncStorage.setItem('appdata:cache:' + collection, JSON.stringify(m.items.slice(0, 200))).catch(() => {});
      }
      m.at = Date.now();
      return m.items || [];
    } finally {
      m.pending = null;
    }
  })();
  return m.pending;
}

const firstStatus = (collection) => (STATUSES[collection] || ['new'])[0];
const STARTED = 'The business has already started on this. Please contact them to change it.';

/** Adds an item; returns it (with id, createdAt and, for orders and requests, status and a short #ref). */
export async function add(collection, fields) {
  check(collection);
  if (!API) {
    const now = Date.now();
    const id = newId();
    const item = { ...fields, id, createdAt: now, updatedAt: now, mine: true, ...(ACCESS[collection] === 'inbox' ? { status: firstStatus(collection), ref: id.slice(-4).toUpperCase() } : {}) };
    await writeLocal(collection, [item, ...(await readLocal(collection))]);
    changed(collection);
    return item;
  }
  const data = await call('POST', {}, { collection, data: fields });
  changed(collection);
  // Sent: now ask (once) whether they want to hear when it moves on. The order never waits on this.
  if (ACCESS[collection] === 'inbox' && data.item) {
    pushToken().then((token) => token && call('PATCH', {}, { collection, id: data.item.id, pushToken: token })).catch(() => {});
  }
  return data.item;
}

/** Changes some fields of an item this person added (orders and requests only while still waiting). */
export async function update(collection, id, fields) {
  check(collection);
  if (!API) {
    const items = await readLocal(collection);
    const item = items.find((x) => x.id === id);
    if (item && ACCESS[collection] === 'inbox' && item.status !== firstStatus(collection)) throw new Error(STARTED);
    const next = items.map((x) => (x.id === id ? { ...x, ...fields, updatedAt: Date.now() } : x));
    await writeLocal(collection, next);
    changed(collection);
    return next.find((x) => x.id === id);
  }
  const data = await call('PATCH', {}, { collection, id, data: fields });
  changed(collection);
  return data.item;
}

/** Cancels an order or request while the business hasn't started on it yet. */
export async function cancel(collection, id) {
  check(collection);
  const cancelled = (STATUSES[collection] || []).find((s) => /^cancel/i.test(s)) || 'cancelled';
  if (!API) {
    const items = await readLocal(collection);
    const item = items.find((x) => x.id === id);
    if (item && item.status !== firstStatus(collection)) throw new Error(STARTED);
    await writeLocal(collection, items.map((x) => (x.id === id ? { ...x, status: cancelled, updatedAt: Date.now() } : x)));
    changed(collection);
    return;
  }
  await call('PATCH', {}, { collection, id, cancel: true });
  changed(collection);
}

/** Deletes an item this person added. Orders and requests are cancelled instead (the business keeps a record). */
export async function remove(collection, id) {
  check(collection);
  if (ACCESS[collection] === 'inbox') return cancel(collection, id);
  if (!API) {
    await writeLocal(collection, (await readLocal(collection)).filter((x) => x.id !== id));
    changed(collection);
    return;
  }
  await call('DELETE', { collection, id });
  changed(collection);
}

/**
 * "Delete my data": removes what this person added (orders still in progress
 * stay with the business until they're finished) and gives the phone a new
 * random id, so nothing links back to it.
 */
export async function forgetMe() {
  if (API) await call('DELETE', { all: 1 });
  for (const collection of Object.keys(ACCESS)) {
    if (ACCESS[collection] !== 'public') await AsyncStorage.multiRemove(['appdata:' + collection, 'appdata:cache:' + collection]);
  }
  await AsyncStorage.removeItem('appdata:device');
  devicePromise = null;
  Object.keys(listeners).forEach(changed);
}

/**
 * How far an order or request has got, for customers:
 * { label: 'Being prepared', step: 1, steps: ['Received', 'Being prepared', 'Ready', 'Collected'], done, cancelled, canCancel }.
 */
export function statusInfo(collection, status) {
  const word = (s) => WORDS[String(s).toLowerCase()] || String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const all = (STATUSES[collection] || ['new']).filter((s) => !/^(cancel|declin|reject)/i.test(s));
  const cancelled = /^(cancel|declin|reject)/i.test(String(status || ''));
  return {
    label: word(status || all[0]),
    step: Math.max(0, all.indexOf(status)),
    steps: all.map(word),
    done: cancelled || DONE.test(String(status || '')) || status === all[all.length - 1],
    cancelled,
    canCancel: status === firstStatus(collection),
  };
}

/**
 * A collection as React state: the items, and add, update and remove that keep
 * every screen using it up to date. Refreshes every 30 seconds while shown.
 */
/**
 * Staff mode's preview, before the app database is on: the orders and requests sent from this
 * phone, which can be moved on here to see what customers see. Off once the database is on.
 */
export const preview = {
  on: !API,
  collections: Object.keys(ACCESS).map((name) => ({ name, access: ACCESS[name], fields: FIELDS[name] || [], statuses: STATUSES[name] || [] })),
  list: (collection) => readLocal(collection),
  setStatus: async (collection, id, status) => {
    if (API) throw new Error('Only in the preview.');
    await writeLocal(collection, (await readLocal(collection)).map((x) => (x.id === id ? { ...x, status, updatedAt: Date.now() } : x)));
    changed(collection);
  },
};

export function useCollection(collection) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await list(collection, true);
      if (alive.current) {
        setItems(next);
        setError(null);
      }
    } catch (e) {
      // Offline: show the last copy this phone saw (or the business's starting items), with the error.
      if (API) {
        try {
          const cached = JSON.parse((await AsyncStorage.getItem('appdata:cache:' + collection)) || 'null');
          const fallback = cached || (ACCESS[collection] === 'public' ? await readLocal(collection) : null);
          if (fallback && alive.current) setItems((now) => (now.length ? now : fallback));
        } catch (err) {}
      }
      if (alive.current) setError(e.message || String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [collection]);
  // Checking for changes only when needed:
  // - never in the background; once when the app comes back, and whenever a notification about this data arrives;
  // - while this person has an order or request in progress: from every 30 seconds (every 2 minutes when
  //   notifications are on, since they bring the news), slowing down each time nothing changed, up to 10 minutes;
  // - otherwise (a menu, reviews): every 5 minutes, slowing to 30 minutes when nothing changes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    alive.current = true;
    if (API) hasChanged(collection).catch(() => {});
    refresh();
    let timer = null;
    let quiet = 0;
    const waiting = () => ACCESS[collection] === 'inbox' && itemsRef.current.some((x) => x.mine && !statusInfo(collection, x.status).done);
    const delay = () => {
      const [base, max] = waiting() ? [pushOn ? 120000 : 30000, 600000] : [300000, 1800000];
      return Math.min(base * Math.pow(2, quiet), max);
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!API || AppState.currentState === 'background') return;
      timer = setTimeout(async () => {
        // A tiny version check first; the collection itself only when it changed.
        if (await hasChanged(collection)) {
          await refresh();
          const m = memo[collection];
          quiet = m && m.changed ? 0 : quiet + 1;
        } else {
          quiet += 1;
        }
        schedule();
      }, delay());
    };
    // A change here (an order sent, a notification, pull to refresh) refreshes now and starts checking briskly again.
    const onChange = () => {
      quiet = 0;
      refresh();
      schedule();
    };
    (listeners[collection] = listeners[collection] || []).push(onChange);
    schedule();
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        if (await hasChanged(collection)) refresh();
        schedule();
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    return () => {
      alive.current = false;
      listeners[collection] = (listeners[collection] || []).filter((fn) => fn !== onChange);
      if (timer) clearTimeout(timer);
      if (sub && sub.remove) sub.remove();
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
    cancel: (id) => cancel(collection, id),
    statusInfo: (status) => statusInfo(collection, status),
  };
}
`;
}

/** What the AI is told about app data. */
export const DATA_PROMPT = `## App data (Appmaker's built-in database: no Supabase, Firebase or server to set up)
Privacy first: collect only what the business needs to do the job, and nothing else.
- Ask only for fields the order or request can't work without: a first name (label it "First name"; never ask for a last name, surname or full name) and a phone number (or email) to reach them, plus the details of what they want. Where the business needs to tell customers apart, show the first name with the last 4 digits of the phone ("Ana ·0199"), not more. No date of birth, gender, full address (unless it's a delivery), or "how did you hear about us" unless the request is about that.
- Never collect passwords, payment card numbers, bank details, ID or passport numbers, or health details: Appmaker refuses them. Payment happens in person or through the business's own payment link. Open a payment link with \`WebBrowser.openBrowserAsync(url)\` from 'expo-web-browser' (a sheet over the app with Done to come back), never by building a card form.
- Next to every form that sends data, one short line says what happens to it, e.g. "We use your first name and phone only for this order." The app's privacy policy (made by Appmaker) lists the fields from src/data-rules.json, so keep its fields to what the form really asks.
- Settings or More has a "Delete my data" row: confirm with Alert.alert, then \`await forgetMe()\` (from src/appdata.js) and say "Your data was deleted. Orders still being prepared stay with {business} until they're finished."
- Finished orders and requests are deleted automatically after 90 days; say nothing that contradicts this.

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
3. Inbox screens (orders, requests):
   - After sending, show a clear confirmation with the number: "Order #\${item.ref} sent — {business} will get back to you", and a "My orders" (or "My requests") screen with the person's own items, newest first.
   - Show each one's progress with \`statusInfo(item.status)\` from useCollection: \`{ label, step, steps, done, cancelled, canCancel }\`. Draw the steps as a small progress line (Received → Being prepared → Ready), with label in words; never show raw status words like "preparing". Cancelled ones are muted.
   - Offer "Cancel order" only while \`canCancel\` is true (with a confirmation), using \`cancel(id)\`; afterwards, say to call the business to change it. Customers can't delete orders or requests.
   - Never say an order or booking is confirmed until its status says so.
   The customer is asked once, when they first send something, whether they want notifications: they then get one when the business changes its status. Don't ask for that yourself.
4. ${STAFF_PROMPT}
5. Until the owner turns on the app database in the Publish tab, the data stays on the phone (so the preview works now). Mention in the summary that they can turn it on there so orders and reviews reach them, and that they manage everything from their owner page (with alerts for new orders) or in the app's Staff mode with a staff PIN.`;
