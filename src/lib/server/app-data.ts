import { randomBytes, timingSafeEqual } from "node:crypto";
import { COLLECTION_NAME, DataInputError, MAX_RECORD_BYTES, doneStatuses, isDone, cleanRecord, parseRules, type Access, type DataRules } from "../app-data";
import { currentUser } from "./auth";
import { query } from "./db";
import { alertOwner, isExpoToken, sendExpo, shortRef } from "./app-alerts";
import { isPaid, paymentsConfig } from "./credits";
import { bump } from "./data-versions";

/** Appmaker app data on the server: one store per app, records by collection (see src/lib/app-data.ts). */

export interface DataStore {
  id: string;
  userId: string;
  projectId: string;
  ownerKey: string;
  name: string;
  rules: DataRules;
  /** Hash of the staff PIN that opens staff mode in the app ("" until the business sets one). */
  staffPin: string;
}
export interface DataItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  status?: string;
  [field: string]: unknown;
}

export class DataForbidden extends Error {}

/** Most records one app keeps, and most returned at once. */
export const MAX_RECORDS = 20_000;
/** Most items one phone keeps in a collection (one phone can't fill an app's storage). */
export const MAX_PER_DEVICE = { inbox: 200, shared: 200, private: 2_000 } as const;
export const PAGE = 500;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const STORE_ID = /^[A-Za-z0-9_-]{8,20}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{6,40}$/;

type StoreRow = { id: string; user_id: string; project_id: string; owner_key: string; name: string; rules: DataRules; staff_pin: string };
type RecordRow = { id: string; collection: string; device: string; data: Record<string, unknown>; status: string; push_token: string; created_at: Date; updated_at: Date };

const toStore = (r: StoreRow): DataStore => ({ id: r.id, userId: r.user_id, projectId: r.project_id, ownerKey: r.owner_key, name: r.name, rules: r.rules, staffPin: r.staff_pin ?? "" });

function toItem(r: RecordRow, device: string | null, access: Access): DataItem {
  return {
    ...r.data,
    id: r.id,
    createdAt: r.created_at.getTime(),
    updatedAt: r.updated_at.getTime(),
    mine: !!device && r.device === device,
    ...(access === "inbox" ? { status: r.status, ref: shortRef(r.id) } : {}),
  };
}

export async function getStore(id: string): Promise<DataStore | null> {
  if (!STORE_ID.test(id)) return null;
  const rows = await query<StoreRow>("select * from app_data_stores where id = $1", [id]);
  return rows[0] ? toStore(rows[0]) : null;
}

export async function storeFor(userId: string, projectId: string): Promise<DataStore | null> {
  const rows = await query<StoreRow>("select * from app_data_stores where user_id = $1 and project_id = $2", [userId, projectId]);
  return rows[0] ? toStore(rows[0]) : null;
}

/** How many records each collection holds, and per status (so the builder can warn before something with data is removed). */
export async function dataCounts(store: DataStore): Promise<Record<string, { total: number; statuses: Record<string, number> }>> {
  const rows = await query<{ collection: string; status: string | null; n: number }>(
    "select collection, status, count(*)::int as n from app_data_records where store_id = $1 group by collection, status",
    [store.id],
  );
  const out: Record<string, { total: number; statuses: Record<string, number> }> = {};
  for (const r of rows) {
    const c = (out[r.collection] ??= { total: 0, statuses: {} });
    c.total += r.n;
    if (r.status) c.statuses[r.status] = r.n;
  }
  return out;
}

/** How many app databases the user has. */
export async function storeCount(userId: string): Promise<number> {
  const rows = await query<{ n: number }>("select count(*)::int as n from app_data_stores where user_id = $1", [userId]);
  return rows[0]?.n ?? 0;
}

/** Creates the app's store, or saves new rules; public collections that are still empty get their starting items. */
export async function saveStore(userId: string, projectId: string, name: string, rules: DataRules): Promise<DataStore> {
  const rows = await query<StoreRow>(
    `insert into app_data_stores (id, user_id, project_id, owner_key, name, rules) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, project_id) do update set name = excluded.name, rules = excluded.rules
     returning *`,
    [randomBytes(9).toString("base64url"), userId, projectId, randomBytes(24).toString("base64url"), name.slice(0, 80), JSON.stringify(rules)],
  );
  const store = toStore(rows[0]);
  for (const [collection, rule] of Object.entries(rules)) {
    if (rule.access !== "public" || !rule.seed?.length) continue;
    const has = await query("select 1 from app_data_records where store_id = $1 and collection = $2 limit 1", [store.id, collection]);
    if (has.length) continue;
    // Oldest first, so the first seed item is listed first (newest first).
    const now = Date.now();
    for (const [i, data] of rule.seed.entries()) {
      await query("insert into app_data_records (id, store_id, collection, data, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)", [
        randomBytes(9).toString("base64url"),
        store.id,
        collection,
        JSON.stringify(data),
        new Date(now - i * 1000),
      ]);
    }
  }
  bump(store.id, "*");
  for (const c of Object.keys(rules)) bump(store.id, c);
  return store;
}

export async function deleteStore(userId: string, projectId: string): Promise<boolean> {
  const rows = await query<{ id: string }>("delete from app_data_stores where user_id = $1 and project_id = $2 returning id", [userId, projectId]);
  for (const r of rows) bump(r.id, "*");
  return rows.length > 0;
}

export async function setStaffPin(id: string, hash: string): Promise<void> {
  await query("update app_data_stores set staff_pin = $2 where id = $1", [id, hash]);
  bump(id, "*");
}

export async function resetDataOwnerKey(id: string): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await query("update app_data_stores set owner_key = $2 where id = $1", [id, key]);
  bump(id, "*");
  return key;
}

/** The account that made the app, or anyone with the owner link. */
export async function canManageData(req: Request, store: DataStore): Promise<boolean> {
  const key = req.headers.get("x-owner-key") ?? "";
  if (key) {
    const a = Buffer.from(key);
    const b = Buffer.from(store.ownerKey);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const user = await currentUser(req);
  return user?.id === store.userId;
}

function rule(store: DataStore, collection: string) {
  // Own, well-formed names only ("constructor" or "__proto__" must never reach the object's prototype).
  const r = COLLECTION_NAME.test(collection) && Object.hasOwn(store.rules, collection) ? store.rules[collection] : null;
  if (!r) throw new DataInputError(`This app has no "${String(collection).slice(0, 40)}" data.`);
  return r;
}

export function checkDevice(v: string | null): string {
  if (!v || !DEVICE.test(v)) throw new DataInputError("Missing device id.");
  return v;
}

// ---------- keeping as little as possible ----------

/** Finished orders and requests are deleted after this; any order or request after a year. */
export const KEEP_DONE_DAYS = 90;
export const KEEP_ANY_DAYS = 365;
const lastPurge = new Map<string, number>();

/** Deletes what the business no longer needs (at most every 10 minutes per app). */
export async function purge(store: DataStore, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastPurge.get(store.id) ?? 0) < 10 * 60 * 1000) return;
  lastPurge.set(store.id, now);
  // Data of collections the app no longer has (kept 90 days in case they come back, then deleted).
  await query("delete from app_data_records where store_id = $1 and not (collection = any($2::text[])) and updated_at < now() - make_interval(days => $3)", [
    store.id,
    Object.keys(store.rules),
    KEEP_DONE_DAYS,
  ]);
  for (const [collection, r] of Object.entries(store.rules)) {
    if (r.access !== "inbox") continue;
    const done = doneStatuses(r.statuses);
    const gone = await query(
      `delete from app_data_records where store_id = $1 and collection = $2 and (
         (status = any($3::text[]) and updated_at < now() - make_interval(days => $4))
         or created_at < now() - make_interval(days => $5)) returning id`,
      [store.id, collection, done, KEEP_DONE_DAYS, KEEP_ANY_DAYS],
    );
    if (gone.length) bump(store.id, collection);
  }
}

/**
 * "Delete my data": everything this phone added that isn't an order still in
 * progress (those are kept until finished, so the business can complete them).
 */
export async function forgetDevice(store: DataStore, device: string): Promise<number> {
  let removed = 0;
  for (const [collection, r] of Object.entries(store.rules)) {
    if (r.access === "public") continue;
    if (r.access === "inbox") {
      const waiting = r.statuses?.[0] ?? "new";
      const done = doneStatuses(r.statuses);
      // Waiting ones are cancelled and removed; in-progress ones stay until finished, without the notification token.
      const rows = await query("delete from app_data_records where store_id = $1 and collection = $2 and device = $3 and (status = $4 or status = any($5::text[])) returning id", [store.id, collection, device, waiting, done]);
      removed += rows.length;
      await query("update app_data_records set push_token = '' where store_id = $1 and collection = $2 and device = $3", [store.id, collection, device]);
    } else {
      const rows = await query("delete from app_data_records where store_id = $1 and collection = $2 and device = $3 returning id", [store.id, collection, device]);
      removed += rows.length;
    }
  }
  for (const c of Object.keys(store.rules)) bump(store.id, c);
  return removed;
}

// ---------- the app's side ----------

/** What one device may see of a collection. */
export async function listItems(store: DataStore, collection: string, device: string): Promise<DataItem[]> {
  const { access } = rule(store, collection);
  const own = access === "inbox" || access === "private";
  const rows = await query<RecordRow>(
    `select * from app_data_records where store_id = $1 and collection = $2 ${own ? "and device = $4" : ""} order by created_at desc limit $3`,
    own ? [store.id, collection, PAGE, device] : [store.id, collection, PAGE],
  );
  return rows.map((r) => toItem(r, device, access));
}

/** A short line about an item, for alerts: its first fields ("Ana · 2 Margherita"). */
export function summary(store: DataStore, collection: string, data: Record<string, unknown>): string {
  const fields = store.rules[collection]?.fields ?? Object.keys(data);
  const parts = fields.map((f) => data[f]).filter((v) => typeof v === "string" || typeof v === "number").map(String);
  return parts.slice(0, 3).join(" · ").slice(0, 140);
}

const singular = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ies$/, "y").replace(/s$/, "").toLowerCase();

/** New items customers can add to one app each month (orders, posts, saved items); APPMAKER_DATA_MONTHLY_LIMIT changes it. */
export function monthlyLimit(): number {
  const n = Number(process.env.APPMAKER_DATA_MONTHLY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10_000;
}

const paidCache = new Map<string, { paid: boolean; at: number }>();
/** Whether the app's maker is on the paid plan (always true without payments); cached for 10 minutes. */
async function ownerPaid(store: DataStore): Promise<boolean> {
  if (!paymentsConfig().enabled) return true;
  const hit = paidCache.get(store.userId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.paid;
  const paid = await isPaid(store.userId).catch(() => true);
  paidCache.set(store.userId, { paid, at: Date.now() });
  return paid;
}

export async function addItem(store: DataStore, collection: string, device: string, fields: unknown, pushToken?: string | null): Promise<DataItem> {
  const { access, statuses } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can add to this.");
  const data = cleanRecord(fields);
  await purge(store);
  const [{ n, mine }] = await query<{ n: string; mine: string }>(
    "select count(*) as n, count(*) filter (where collection = $2 and device = $3) as mine from app_data_records where store_id = $1",
    [store.id, collection, device],
  );
  if (Number(n) >= MAX_RECORDS) throw new DataInputError("This app's storage is full. Please contact the business.");
  if (!(await ownerPaid(store))) throw new DataForbidden("This app can't take new orders right now. Please contact the business.");
  const [{ month }] = await query<{ month: string }>(
    "select count(*) as month from app_data_records where store_id = $1 and device <> '' and created_at >= date_trunc('month', now())",
    [store.id],
  );
  if (Number(month) >= monthlyLimit()) throw new DataInputError("This app has reached its limit for this month. Please contact the business directly.");
  if (Number(mine) >= MAX_PER_DEVICE[access]) throw new DataInputError("You've sent a lot from this phone. Please contact the business, or delete some first.");
  const rows = await query<RecordRow>(
    "insert into app_data_records (id, store_id, collection, device, data, status, push_token) values ($1, $2, $3, $4, $5, $6, $7) returning *",
    [randomBytes(9).toString("base64url"), store.id, collection, device, JSON.stringify(data), access === "inbox" ? (statuses?.[0] ?? "new") : "", isExpoToken(pushToken) ? pushToken : ""],
  );
  const item = toItem(rows[0], device, access);
  bump(store.id, collection);
  // The business hears about every new order, request or sign-up straight away.
  if (access === "inbox") {
    void alertOwner(store.id, `New ${singular(collection)} #${item.ref}`, summary(store, collection, data) || `${store.name || "Your app"}: open the owner page to see it.`, `/owner/data/${store.id}`).catch(() => undefined);
  }
  return item;
}

/** Once the business has moved an order or request on, the customer can no longer change or delete it. */
const STARTED = "The business has already started on this. Please contact them to change it.";

export async function updateItem(store: DataStore, collection: string, device: string, id: string, fields: unknown): Promise<DataItem> {
  const { access, statuses } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can change this.");
  if (!RECORD_ID.test(id)) throw new DataInputError("Unknown item.");
  const data = cleanRecord(fields);
  const rows = await query<RecordRow>(
    `update app_data_records set data = data || $5::jsonb, updated_at = now()
     where store_id = $1 and collection = $2 and id = $3 and device = $4 and octet_length((data || $5::jsonb)::text) <= ${MAX_RECORD_BYTES * 2}
       ${access === "inbox" ? "and status = $6" : ""} returning *`,
    access === "inbox" ? [store.id, collection, id, device, JSON.stringify(data), statuses?.[0] ?? "new"] : [store.id, collection, id, device, JSON.stringify(data)],
  );
  if (!rows[0]) {
    if (!(await own(store, collection, id, device))) throw new DataForbidden("You can only change your own items.");
    const [{ big }] = await query<{ big: boolean }>("select octet_length((data || $2::jsonb)::text) > $3 as big from app_data_records where id = $1", [id, JSON.stringify(data), MAX_RECORD_BYTES * 2]);
    throw big ? new DataInputError("That's too much to save in one item.") : new DataForbidden(STARTED);
  }
  bump(store.id, collection);
  return toItem(rows[0], device, access);
}

async function own(store: DataStore, collection: string, id: string, device: string) {
  return (await query("select 1 from app_data_records where store_id = $1 and collection = $2 and id = $3 and device = $4", [store.id, collection, id, device])).length > 0;
}

/** Inbox items: the customer cancels while it's still waiting (the business sees it as cancelled, and hears about it). */
export async function cancelItem(store: DataStore, collection: string, device: string, id: string): Promise<DataItem> {
  const { access, statuses } = rule(store, collection);
  if (access !== "inbox") throw new DataInputError("Only orders and requests can be cancelled.");
  const cancelled = statuses?.find((s) => /^cancel/i.test(s)) ?? "cancelled";
  const rows = await query<RecordRow>(
    "update app_data_records set status = $6, updated_at = now() where store_id = $1 and collection = $2 and id = $3 and device = $4 and status = $5 returning *",
    [store.id, collection, id, device, statuses?.[0] ?? "new", cancelled],
  );
  if (!rows[0]) throw new DataForbidden((await own(store, collection, id, device)) ? STARTED : "You can only cancel your own.");
  const item = toItem(rows[0], device, access);
  bump(store.id, collection);
  void alertOwner(store.id, `Cancelled: ${singular(collection)} #${item.ref}`, summary(store, collection, rows[0].data), `/owner/data/${store.id}`).catch(() => undefined);
  return item;
}

/** Remembers where to tell the customer about status changes (sent after the order, so it never waits on the question). */
export async function setPushToken(store: DataStore, collection: string, device: string, id: string, token: unknown): Promise<void> {
  if (!isExpoToken(token)) throw new DataInputError("Invalid notification token.");
  await query("update app_data_records set push_token = $5 where store_id = $1 and collection = $2 and id = $3 and device = $4", [store.id, collection, id, device, token]);
}

export async function removeItem(store: DataStore, collection: string, device: string, id: string): Promise<void> {
  const { access, statuses } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can delete this.");
  // Orders and requests are cancelled, not deleted (the business keeps a record); only while still waiting.
  if (access === "inbox") {
    await cancelItem(store, collection, device, id);
    return;
  }
  void statuses;
  const rows = await query("delete from app_data_records where store_id = $1 and collection = $2 and id = $3 and device = $4 returning id", [store.id, collection, id, device]);
  if (!rows.length) throw new DataForbidden("You can only delete your own items.");
  bump(store.id, collection);
}

// ---------- the owner's side ----------

export interface OwnerCollection {
  name: string;
  access: Access;
  fields: string[];
  statuses?: string[];
  count: number;
  /** Not for private collections: those are each person's own. */
  items: DataItem[];
}

export async function ownerData(store: DataStore): Promise<{ name: string; hasStaffPin: boolean; usage: { month: number; limit: number }; collections: OwnerCollection[] }> {
  await purge(store);
  const collections: OwnerCollection[] = [];
  // Two queries for the whole page, whatever the number of collections: the counts, and the newest items of each.
  const names = Object.keys(store.rules);
  const shown = Object.entries(store.rules).filter(([, r]) => r.access !== "private").map(([n]) => n);
  const [counts, all] = await Promise.all([
    query<{ collection: string; n: string }>("select collection, count(*) as n from app_data_records where store_id = $1 and collection = any($2::text[]) group by collection", [store.id, names]),
    shown.length
      ? query<RecordRow>(
          `select * from (select *, row_number() over (partition by collection order by created_at desc) as rn
             from app_data_records where store_id = $1 and collection = any($2::text[])) t where rn <= $3 order by created_at desc`,
          [store.id, shown, PAGE],
        )
      : Promise.resolve([] as RecordRow[]),
  ]);
  for (const [name, r] of Object.entries(store.rules)) {
    const n = counts.find((c) => c.collection === name)?.n ?? "0";
    const rows = r.access === "private" ? [] : all.filter((row) => row.collection === name);
    // Fields: the rules' fields, then any others the app saved.
    const seen = new Set(r.fields);
    for (const row of rows) for (const k of Object.keys(row.data)) seen.add(k);
    // Statuses: the rules', plus any an item still has (e.g. from before the rules changed), so it can always be shown.
    const statuses = r.statuses ? [...new Set([...r.statuses, ...rows.map((row) => row.status).filter(Boolean)])] : undefined;
    collections.push({ name, access: r.access, fields: [...seen].slice(0, 20), ...(statuses ? { statuses } : {}), count: Number(n), items: rows.map((row) => toItem(row, null, r.access)) });
  }
  const [{ month }] = await query<{ month: string }>(
    "select count(*) as month from app_data_records where store_id = $1 and device <> '' and created_at >= date_trunc('month', now())",
    [store.id],
  );
  return { name: store.name, hasStaffPin: !!store.staffPin, usage: { month: Number(month), limit: monthlyLimit() }, collections };
}

/** The business adds, edits, deletes or sets the status of items (any collection but private). */
export async function ownerAction(store: DataStore, body: Record<string, unknown>): Promise<void> {
  const collection = String(body.collection ?? "");
  const r = rule(store, collection);
  if (r.access === "private") throw new DataForbidden("Private data belongs to each person.");
  const id = String(body.id ?? "");
  switch (body.action) {
    case "add":
      await query("insert into app_data_records (id, store_id, collection, data, status) values ($1, $2, $3, $4, $5)", [
        randomBytes(9).toString("base64url"),
        store.id,
        collection,
        JSON.stringify(cleanRecord(body.data)),
        r.access === "inbox" ? (r.statuses?.[0] ?? "new") : "",
      ]);
      bump(store.id, collection);
      return;
    case "update":
      await query("update app_data_records set data = $4::jsonb, updated_at = now() where store_id = $1 and collection = $2 and id = $3", [store.id, collection, id, JSON.stringify(cleanRecord(body.data))]);
      bump(store.id, collection);
      return;
    case "status": {
      const status = String(body.status ?? "");
      if (!r.statuses?.includes(status)) throw new DataInputError("Pick one of the statuses.");
      const rows = await query<RecordRow>("update app_data_records set status = $4, updated_at = now() where store_id = $1 and collection = $2 and id = $3 returning *", [store.id, collection, id, status]);
      // The customer hears when their order or request moves on (if they allowed notifications).
      const row = rows[0];
      bump(store.id, collection);
      if (row?.push_token) {
        const name = singular(collection);
        void sendExpo([row.push_token], `${store.name || "Update"}`, `Your ${name} #${shortRef(row.id)} is now ${status}.`, { appmaker: "status", collection, id }).catch(() => undefined);
        // Finished: no more updates to send, so the phone's notification token isn't kept.
        if (isDone(status, r.statuses)) await query("update app_data_records set push_token = '' where id = $1", [row.id]);
      }
      return;
    }
    case "delete":
      await query("delete from app_data_records where store_id = $1 and collection = $2 and id = $3", [store.id, collection, id]);
      bump(store.id, collection);
      return;
    default:
      throw new DataInputError("Unknown action.");
  }
}

export { parseRules };
