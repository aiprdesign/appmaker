import { randomBytes, timingSafeEqual } from "node:crypto";
import { DataInputError, cleanRecord, parseRules, type Access, type DataRules } from "../app-data";
import { currentUser } from "./auth";
import { query } from "./db";

/** Appmaker app data on the server: one store per app, records by collection (see src/lib/app-data.ts). */

export interface DataStore {
  id: string;
  userId: string;
  projectId: string;
  ownerKey: string;
  name: string;
  rules: DataRules;
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
export const PAGE = 500;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const STORE_ID = /^[A-Za-z0-9_-]{8,20}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{6,40}$/;

type StoreRow = { id: string; user_id: string; project_id: string; owner_key: string; name: string; rules: DataRules };
type RecordRow = { id: string; collection: string; device: string; data: Record<string, unknown>; status: string; created_at: Date; updated_at: Date };

const toStore = (r: StoreRow): DataStore => ({ id: r.id, userId: r.user_id, projectId: r.project_id, ownerKey: r.owner_key, name: r.name, rules: r.rules });

function toItem(r: RecordRow, device: string | null, access: Access): DataItem {
  return {
    ...r.data,
    id: r.id,
    createdAt: r.created_at.getTime(),
    updatedAt: r.updated_at.getTime(),
    mine: !!device && r.device === device,
    ...(access === "inbox" ? { status: r.status } : {}),
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
  return store;
}

export async function deleteStore(userId: string, projectId: string): Promise<boolean> {
  const rows = await query<{ id: string }>("delete from app_data_stores where user_id = $1 and project_id = $2 returning id", [userId, projectId]);
  return rows.length > 0;
}

export async function resetDataOwnerKey(id: string): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await query("update app_data_stores set owner_key = $2 where id = $1", [id, key]);
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
  const r = store.rules[collection];
  if (!r) throw new DataInputError(`This app has no "${collection}" data.`);
  return r;
}

export function checkDevice(v: string | null): string {
  if (!v || !DEVICE.test(v)) throw new DataInputError("Missing device id.");
  return v;
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

export async function addItem(store: DataStore, collection: string, device: string, fields: unknown): Promise<DataItem> {
  const { access, statuses } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can add to this.");
  const data = cleanRecord(fields);
  const [{ n }] = await query<{ n: string }>("select count(*) as n from app_data_records where store_id = $1", [store.id]);
  if (Number(n) >= MAX_RECORDS) throw new DataInputError("This app's storage is full. Please contact the business.");
  const rows = await query<RecordRow>(
    "insert into app_data_records (id, store_id, collection, device, data, status) values ($1, $2, $3, $4, $5, $6) returning *",
    [randomBytes(9).toString("base64url"), store.id, collection, device, JSON.stringify(data), access === "inbox" ? (statuses?.[0] ?? "new") : ""],
  );
  return toItem(rows[0], device, access);
}

export async function updateItem(store: DataStore, collection: string, device: string, id: string, fields: unknown): Promise<DataItem> {
  const { access } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can change this.");
  if (!RECORD_ID.test(id)) throw new DataInputError("Unknown item.");
  const data = cleanRecord(fields);
  const rows = await query<RecordRow>(
    `update app_data_records set data = data || $5::jsonb, updated_at = now()
     where store_id = $1 and collection = $2 and id = $3 and device = $4 returning *`,
    [store.id, collection, id, device, JSON.stringify(data)],
  );
  if (!rows[0]) throw new DataForbidden("You can only change your own items.");
  return toItem(rows[0], device, access);
}

export async function removeItem(store: DataStore, collection: string, device: string, id: string): Promise<void> {
  const { access } = rule(store, collection);
  if (access === "public") throw new DataForbidden("Only the business can delete this.");
  const rows = await query("delete from app_data_records where store_id = $1 and collection = $2 and id = $3 and device = $4 returning id", [store.id, collection, id, device]);
  if (!rows.length) throw new DataForbidden("You can only delete your own items.");
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

export async function ownerData(store: DataStore): Promise<{ name: string; collections: OwnerCollection[] }> {
  const collections: OwnerCollection[] = [];
  for (const [name, r] of Object.entries(store.rules)) {
    const [{ n }] = await query<{ n: string }>("select count(*) as n from app_data_records where store_id = $1 and collection = $2", [store.id, name]);
    const rows = r.access === "private" ? [] : await query<RecordRow>("select * from app_data_records where store_id = $1 and collection = $2 order by created_at desc limit $3", [store.id, name, PAGE]);
    // Fields: the rules' fields, then any others the app saved.
    const seen = new Set(r.fields);
    for (const row of rows) for (const k of Object.keys(row.data)) seen.add(k);
    collections.push({ name, access: r.access, fields: [...seen].slice(0, 20), ...(r.statuses ? { statuses: r.statuses } : {}), count: Number(n), items: rows.map((row) => toItem(row, null, r.access)) });
  }
  return { name: store.name, collections };
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
      return;
    case "update":
      await query("update app_data_records set data = $4::jsonb, updated_at = now() where store_id = $1 and collection = $2 and id = $3", [store.id, collection, id, JSON.stringify(cleanRecord(body.data))]);
      return;
    case "status": {
      const status = String(body.status ?? "");
      if (!r.statuses?.includes(status)) throw new DataInputError("Pick one of the statuses.");
      await query("update app_data_records set status = $4, updated_at = now() where store_id = $1 and collection = $2 and id = $3", [store.id, collection, id, status]);
      return;
    }
    case "delete":
      await query("delete from app_data_records where store_id = $1 and collection = $2 and id = $3", [store.id, collection, id]);
      return;
    default:
      throw new DataInputError("Unknown action.");
  }
}

export { parseRules };
