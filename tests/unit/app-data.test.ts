import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { DELETE as turnOff, GET as getStoreRoute, POST as storeRoute } from "@/app/api/appdata/route";
import { DELETE as appDelete, GET as appGet, PATCH as appPatch, POST as appPost } from "@/app/api/appdata/[id]/route";
import { GET as ownerGet, POST as ownerPost } from "@/app/api/appdata/[id]/owner/route";
import { DATA_FILE, RULES_FILE, appRules, cleanRecord, dataModule, parseRules, usesData } from "@/lib/app-data";
import { checkCodeSafety } from "@/lib/code-safety";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { closeDatabase, query } from "@/lib/server/db";
import { clearFeatureCache, setFeature } from "@/lib/server/features";
import { validateApp } from "@/lib/validate";
import { appFacts, privacySections } from "@/lib/store-pages";
import { POST as staffRoute } from "@/app/api/appdata/[id]/staff/route";
import { STAFF_FILE, staffModule } from "@/lib/staff";
import { THEME_FILE, defaultDesign, themeModule } from "@/lib/design";
import { hashPin, isExpoToken, pinMatches } from "@/lib/server/app-alerts";
import { GET as versionsRoute } from "@/app/api/appdata/[id]/versions/route";
import { GET as liveRoute } from "@/app/api/appdata/[id]/live/route";
import { cachedStore, startListening, version } from "@/lib/server/data-versions";
import { vi } from "vitest";

const RULES = {
  menu: { access: "public", fields: ["name", "price"], seed: [{ name: "Margherita", price: "12" }, { name: "Marinara", price: "10" }] },
  orders: { access: "inbox", fields: ["name", "phone", "items"], statuses: ["new", "preparing", "ready"] },
  reviews: { access: "shared", fields: ["name", "rating", "text"] },
  notes: "private",
};

describe("app data rules and module", () => {
  it("reads the rules the AI writes, keeping only what's valid", () => {
    const rules = parseRules(RULES);
    expect(rules.notes).toEqual({ access: "private", fields: [] });
    expect(rules.orders.statuses).toEqual(["new", "preparing", "ready", "cancelled"]);
    expect(parseRules({ requests: { access: "inbox", fields: ["name", "bad field"] } }).requests).toEqual({ access: "inbox", fields: ["name"], statuses: ["new", "accepted", "ready", "done", "cancelled"] });
    expect(rules.menu.seed).toHaveLength(2);
    expect(() => parseRules({ Orders: "inbox" })).toThrow(/valid collection name/);
    expect(() => parseRules({ orders: "secret" })).toThrow(/access of public, inbox, shared, private/);
    expect(cleanRecord({ name: "Ana", id: "x", status: "ready", mine: true, items: ["pizza"] })).toEqual({ name: "Ana", items: ["pizza"] });
    expect(() => cleanRecord({ text: "x".repeat(5000), more: "y".repeat(5000) })).toThrow(/too much/);
  });

  it("gives apps a module that passes Appmaker's own checks, on the phone or in the cloud", () => {
    const rules = parseRules(RULES);
    for (const api of [null, "https://appmaker.example/api/appdata/abc12345"]) {
      const files = {
        "App.js": "import React from 'react';\nimport { Text } from 'react-native';\nimport { useCollection } from './src/appdata';\nimport StaffScreen from './src/staff';\nexport default function App() { const { items } = useCollection('menu'); return items.length ? <Text>{items.length}</Text> : <StaffScreen onClose={() => {}} />; }\n",
        [RULES_FILE]: JSON.stringify(RULES),
        [DATA_FILE]: dataModule(api, rules),
        [STAFF_FILE]: staffModule(api),
        [THEME_FILE]: themeModule(defaultDesign({ name: "Luigi's", primaryColor: "#B91C1C" } as never)),
      };
      expect(validateApp(files)).toEqual([]);
      expect(checkCodeSafety(files)).toEqual([]);
      expect(usesData(files)).toBe(true);
      expect(appRules(files)).toEqual(rules);
    }
    expect(dataModule(null, rules)).toContain("const API = null;");
    expect(SYSTEM_PROMPT).toContain("App data (Appmaker's built-in database");
    expect(SYSTEM_PROMPT).toContain("useCollection('orders')");
    expect(SYSTEM_PROMPT).toContain("import StaffScreen from '../staff'");
    expect(staffModule(null)).toContain("Try it now with orders from this phone");
  });

  it("collects as little as possible and refuses what must never be stored", () => {
    expect(parseRules({ orders: { access: "inbox", fields: ["name", "password", "cardNumber", "cvv", "phone"] } }).orders.fields).toEqual(["name", "phone"]);
    expect(() => cleanRecord({ note: "my card is 4242 4242 4242 4242" })).toThrow(/card numbers/);
    expect(() => cleanRecord({ password: "hunter2" })).toThrow(/passwords/);
    expect(cleanRecord({ phone: "+1 718 555 0142", items: "2 Margherita" })).toEqual({ phone: "+1 718 555 0142", items: "2 Margherita" });

    // The privacy policy names the exact fields, who sees them, how long they're kept and how to delete them.
    const files = { [RULES_FILE]: JSON.stringify(RULES), "src/appdata.js": "const API = \"https://x.example/api/appdata/abc12345\";" };
    const facts = appFacts(files);
    expect(facts.dataFields).toEqual({ sent: ["name", "phone", "items"], shared: ["name", "rating", "text"], personal: true });
    const text = privacySections({ appName: "Luigi's", developer: "Luigi's Trattoria", email: "ciao@luigis.example", description: "", updated: "2026-10-13", facts })
      .flatMap((x) => x.paragraphs)
      .join("\n");
    expect(text).toContain("it sends name, phone and items to Luigi's Trattoria. Only Luigi's Trattoria sees these");
    expect(text).toContain("it shows your name, rating and text");
    expect(text).toContain("deleted automatically 90 days after they're completed");
    expect(text).toContain("choose Delete my data");
    expect(text).toContain("ciao@luigis.example to see, correct or delete");
  });

  it("explains broken rules to the AI, and always lets customers cancel", () => {
    expect(validateApp({ "App.js": "export default function App() { return null; }", [RULES_FILE]: JSON.stringify({ Orders: "inbox" }) }).map((i) => i.message)).toContain(
      'app data rules: "Orders" isn\'t a valid collection name (letters and numbers, starting with a lowercase letter).',
    );
    expect(parseRules({ orders: { access: "inbox", statuses: ["new", "ready"] } }).orders.statuses).toEqual(["new", "ready", "cancelled"]);
  });

  it("keeps staff PINs hashed and only accepts real Expo push tokens", () => {
    const h = hashPin("246810");
    expect(h).not.toContain("246810");
    expect(pinMatches("246810", h)).toBe(true);
    expect(pinMatches("246811", h)).toBe(false);
    expect(isExpoToken("ExponentPushToken[abcDEF123456789]")).toBe(true);
    expect(isExpoToken("https://evil.example")).toBe(false);
  });
});

/** Runs src/appdata.js with a fake AsyncStorage (and fetch), as an app would. */
function runModule(api: string | null, fetcher?: typeof fetch) {
  const store = new Map<string, string>();
  const storage = { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => void store.set(k, v), removeItem: async (k: string) => void store.delete(k), multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)) };
  const code = dataModule(api, parseRules(RULES))
    .replace(/^import .*$/gm, "")
    .replace(/^export (async )?function (\w+)/gm, (_m, a: string | undefined, name: string) => `${a ?? ""}function ${name}`)
    .replace(/^export const (\w+)/gm, "const $1");
  const names = [...dataModule(api, parseRules(RULES)).matchAll(/^export (?:(?:async )?function|const) (\w+)/gm)].map((m) => m[1]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exports: Record<string, any> = {};
  new Function("exports", "AsyncStorage", "fetch", "useState", "useEffect", "useRef", "useCallback", `${code}\n${names.map((n) => `exports.${n} = ${n};`).join("\n")}`)(exports, storage, fetcher, null, null, null, null);
  return exports;
}

describe("the app's data module", () => {
  it("is light on the server: one request for screens at once, and tiny replies when nothing changed", async () => {
    const calls: RequestInit[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      const etag = (init.headers as Record<string, string>)["if-none-match"];
      if (etag === '"v1"') return new Response(null, { status: 304 });
      return new Response(JSON.stringify({ items: [{ id: "m1", name: "Margherita" }] }), { status: 200, headers: { etag: '"v1"' } });
    }) as unknown as typeof fetch;
    const m = runModule("https://appmaker.example/api/appdata/abc12345", fetcher);
    const [a, b] = await Promise.all([m.list("menu"), m.list("menu")]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1); // shared
    await m.list("menu");
    expect(calls).toHaveLength(1); // fresh copy reused
    expect(await m.list("menu", true)).toEqual([{ id: "m1", name: "Margherita" }]); // 304: same items
    expect((calls[1].headers as Record<string, string>)["if-none-match"]).toBe('"v1"');
  });

  it("works on the phone before the database is on: seeds, add, update and remove", async () => {
    const m = runModule(null);
    expect(((await m.list("menu")) as { name: string }[]).map((x) => x.name)).toEqual(["Margherita", "Marinara"]);
    const order = (await m.add("orders", { name: "Ana" })) as { id: string; status: string; mine: boolean };
    expect(order).toMatchObject({ name: "Ana", status: "new", mine: true });
    await m.update("orders", order.id, { name: "Ana B" });
    expect(await m.list("orders")).toEqual([expect.objectContaining({ name: "Ana B" })]);
    await m.remove("orders", order.id); // orders are cancelled (the business keeps a record), not deleted
    expect(await m.list("orders")).toEqual([expect.objectContaining({ name: "Ana B", status: "cancelled" })]);
    await expect(m.list("secrets")).rejects.toThrow(/Unknown collection/);
  });

  it("lets staff mode's preview move this phone's orders on, before the database is on", async () => {
    const m = runModule(null);
    expect(m.preview.on).toBe(true);
    expect(m.preview.collections.find((c: { name: string }) => c.name === "orders")).toMatchObject({ access: "inbox", statuses: expect.arrayContaining(["new"]) });
    const order = (await m.add("orders", { name: "Ana" })) as { id: string };
    await m.preview.setStatus("orders", order.id, "ready");
    expect(await m.list("orders")).toEqual([expect.objectContaining({ id: order.id, status: "ready" })]);
    expect(runModule("https://appmaker.example/api/appdata/abc12345").preview.on).toBe(false);
  });

  it("lets customers cancel only while waiting, and words statuses for them", async () => {
    const m = runModule(null);
    const order = (await m.add("orders", { name: "Ana" })) as { id: string; status: string };
    expect(order.status).toBe("new");
    expect((m.statusInfo as unknown as (c: string, s: string) => unknown)("orders", "preparing")).toEqual({
      label: "Being prepared",
      step: 1,
      steps: ["Received", "Being prepared", "Ready"],
      done: false,
      cancelled: false,
      canCancel: false,
    });
    await m.remove("orders", order.id); // orders are cancelled, not deleted
    expect(await m.list("orders")).toEqual([expect.objectContaining({ id: order.id, status: "cancelled" })]);
    await expect(m.update("orders", order.id, { name: "B" })).rejects.toThrow(/already started/);
    await m.forgetMe();
    expect(await m.list("orders")).toEqual([]);
    expect(((await m.list("menu")) as unknown[]).length).toBe(2); // the business's menu stays
  });

  it("talks to the database once it's on, with this phone's random id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(init.method === "GET" ? { items: [] } : { item: { id: "x1", name: "Ana" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = runModule("https://appmaker.example/api/appdata/abc12345", fetcher);
    // The server seeds the menu once; if the business empties it on purpose, it stays empty.
    expect(((await m.list("menu")) as unknown[]).length).toBe(0);
    await m.add("orders", { name: "Ana" });
    expect(calls[0].url).toBe("https://appmaker.example/api/appdata/abc12345?collection=menu");
    expect(calls[1].init).toMatchObject({ method: "POST", body: JSON.stringify({ collection: "orders", data: { name: "Ana" } }) });
    const device = (calls[1].init.headers as Record<string, string>)["x-device"];
    expect(device).toMatch(/^[A-Za-z0-9]{32}$/);
    expect((calls[0].init.headers as Record<string, string>)["x-device"]).toBe(device);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3000";
let ip = 1;
const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": `10.78.0.${ip}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ANA = "deviceAnaAnaAnaAnaAnaAnaAna1234";
const BO = "deviceBoBoBoBoBoBoBoBoBoBo12345";

describe.skipIf(!DB)("app data (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await setFeature("appData", true);
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });
  beforeEach(async () => {
    ip += 1;
    clearFeatureCache();
    await query("delete from app_users where email like '%@appdata.example.com'");
  });
  async function account(name: string) {
    const res = await signup(req("/api/auth/signup", "POST", { email: `${name}@appdata.example.com`, password: "correct horse" }));
    return res.headers.get("set-cookie")!.split(";")[0];
  }

  it("tells the builder how much each kind of data holds, and keeps orders when the steps change", async () => {
    await setFeature("appData", true);
    const cookie = await account("counts");
    const { store } = await (await storeRoute(req("/api/appdata", "POST", { projectId: "proj555abc", name: "Luigi's", rules: RULES }, { cookie }))).json();
    const app = (body: unknown, device = ANA) => req(`/api/appdata/${store.id}`, "POST", body, { "x-device": device });
    await appPost(app({ collection: "orders", data: { name: "Ana", items: "Margherita" } }), ctx(store.id));
    await appPost(app({ collection: "orders", data: { name: "Bo", items: "Marinara" } }, BO), ctx(store.id));
    const got = await (await getStoreRoute(req("/api/appdata?projectId=proj555abc", "GET", undefined, { cookie }))).json();
    expect(got.store.counts.orders).toEqual({ total: 2, statuses: { new: 2 } });
    expect(got.store.counts.menu.total).toBe(2); // the starting items
    expect(got.store.rules.orders.statuses).toContain("new");

    // A step added in "Your data": the orders already sent are all still there.
    const steps = { ...RULES, orders: { ...RULES.orders, statuses: ["new", "preparing", "out for delivery", "ready"] } };
    expect((await storeRoute(req("/api/appdata", "POST", { projectId: "proj555abc", name: "Luigi's", rules: steps }, { cookie }))).status).toBe(200);
    const after = await (await getStoreRoute(req("/api/appdata?projectId=proj555abc", "GET", undefined, { cookie }))).json();
    expect(after.store.counts.orders.total).toBe(2);
    expect(after.store.rules.orders.statuses).toEqual(["new", "preparing", "out for delivery", "ready", "cancelled"]);
  });

  it("keeps orders private to the business, shows the menu to everyone and lets people manage their own reviews", async () => {
    await setFeature("appData", true);
    const cookie = await account("pizza");
    const res = await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", name: "Luigi's", rules: RULES }, { cookie }));
    expect(res.status).toBe(200);
    const { store } = await res.json();
    expect(store.apiUrl).toBe(`${ORIGIN}/api/appdata/${store.id}`);
    expect(store.ownerUrl).toMatch(new RegExp(`/owner/data/${store.id}#k=`));
    expect((await (await getStoreRoute(req("/api/appdata?projectId=proj789abc", "GET", undefined, { cookie }))).json()).store.id).toBe(store.id);
    const app = (method: string, body?: unknown, device = ANA, query = "") => req(`/api/appdata/${store.id}${query}`, method, body, { "x-device": device });

    // The menu starts with the seed items, in order; customers can't change it.
    const menu = await (await appGet(app("GET", undefined, ANA, "?collection=menu"), ctx(store.id))).json();
    expect(menu.items.map((i: { name: string }) => i.name)).toEqual(["Margherita", "Marinara"]);
    expect((await appPost(app("POST", { collection: "menu", data: { name: "Free pizza" } }), ctx(store.id))).status).toBe(403);

    // Orders: each customer sees only their own, with the status the business sets.
    const order = (await (await appPost(app("POST", { collection: "orders", data: { name: "Ana", phone: "555", items: "Margherita" } }), ctx(store.id))).json()).item;
    expect(order).toMatchObject({ name: "Ana", status: "new", mine: true });
    await appPost(app("POST", { collection: "orders", data: { name: "Bo", items: "Marinara" } }, BO), ctx(store.id));
    const anasOrders = (await (await appGet(app("GET", undefined, ANA, "?collection=orders"), ctx(store.id))).json()).items;
    expect(anasOrders.map((o: { name: string }) => o.name)).toEqual(["Ana"]);
    expect((await appGet(req(`/api/appdata/${store.id}?collection=orders`, "GET"), ctx(store.id))).status).toBe(400);

    // Customers can't change or delete an order once the business has started on it.
    const second = (await (await appPost(app("POST", { collection: "orders", data: { name: "Ana", items: "Marinara" } }), ctx(store.id))).json()).item;
    expect((await (await appPatch(app("PATCH", { collection: "orders", id: second.id, cancel: true }), ctx(store.id))).json()).item.status).toBe("cancelled");
    expect((await appPatch(app("PATCH", { collection: "orders", id: second.id, data: { items: "More" } }), ctx(store.id))).status).toBe(403);
    expect((await (await appDelete(app("DELETE", undefined, ANA, `?collection=orders&id=${second.id}`), ctx(store.id))).json()).error).toMatch(/already started/);

    // Reviews: everyone sees them; only the writer can change or delete theirs.
    const review = (await (await appPost(app("POST", { collection: "reviews", data: { name: "Bo", rating: 5, text: "Great" } }, BO), ctx(store.id))).json()).item;
    const seen = (await (await appGet(app("GET", undefined, ANA, "?collection=reviews"), ctx(store.id))).json()).items;
    expect(seen).toEqual([expect.objectContaining({ text: "Great", mine: false })]);
    expect((await appPatch(app("PATCH", { collection: "reviews", id: review.id, data: { text: "Bad" } }), ctx(store.id))).status).toBe(403);
    expect((await (await appPatch(app("PATCH", { collection: "reviews", id: review.id, data: { text: "Superb" } }, BO), ctx(store.id))).json()).item.text).toBe("Superb");
    expect((await appDelete(app("DELETE", undefined, ANA, `?collection=reviews&id=${review.id}`), ctx(store.id))).status).toBe(403);

    // The business: sees every order, sets statuses, edits the menu; private notes are only counted.
    await appPost(app("POST", { collection: "notes", data: { text: "mine only" } }), ctx(store.id));
    const key = store.ownerUrl.split("#k=")[1];
    const owner = (method: string, body?: unknown) => req(`/api/appdata/${store.id}/owner`, method, body, { "x-owner-key": key });
    const view = await (await ownerGet(owner("GET"), ctx(store.id))).json();
    const orders = view.collections.find((c: { name: string }) => c.name === "orders");
    expect(orders.items.map((o: { name: string; status: string }) => `${o.name} ${o.status}`)).toEqual(["Ana cancelled", "Bo new", "Ana new"]);
    expect(view.collections.find((c: { name: string }) => c.name === "notes")).toMatchObject({ count: 1, items: [] });
    await ownerPost(owner("POST", { action: "status", collection: "orders", id: order.id, status: "ready" }), ctx(store.id));
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=orders"), ctx(store.id))).json()).items.find((o: { id: string }) => o.id === order.id).status).toBe("ready");
    expect((await ownerPost(owner("POST", { action: "status", collection: "orders", id: order.id, status: "teleported" }), ctx(store.id))).status).toBe(400);
    await ownerPost(owner("POST", { action: "add", collection: "menu", data: { name: "Diavola", price: "14" } }), ctx(store.id));
    expect((await (await appGet(app("GET", undefined, BO, "?collection=menu"), ctx(store.id))).json()).items[0].name).toBe("Diavola");
    expect((await ownerGet(req(`/api/appdata/${store.id}/owner`, "GET", undefined, { "x-owner-key": "wrong" }), ctx(store.id))).status).toBe(404);

    // "Delete my data": Bo's review and waiting order go; the business's menu stays.
    const forgot = await (await appDelete(app("DELETE", undefined, BO, "?all=1"), ctx(store.id))).json();
    expect(forgot.removed).toBe(2);
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=reviews"), ctx(store.id))).json()).items).toEqual([]);
    // Finished orders older than 90 days are deleted automatically.
    await query("update app_data_records set updated_at = now() - interval '91 days' where id = $1", [order.id]);
    const { purge, getStore } = await import("@/lib/server/app-data");
    await purge((await getStore(store.id))!, true);
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=orders"), ctx(store.id))).json()).items.map((o: { id: string }) => o.id)).not.toContain(order.id);

    // Public data needs no device and can be cached; unchanged data gets a tiny 304.
    const first = await appGet(req(`/api/appdata/${store.id}?collection=menu`, "GET"), ctx(store.id));
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toMatch(/^public/);
    const again = await appGet(req(`/api/appdata/${store.id}?collection=menu`, "GET", undefined, { "if-none-match": first.headers.get("etag")! }), ctx(store.id));
    expect(again.status).toBe(304);

    // Names that are really object properties aren't collections.
    for (const name of ["constructor", "__proto__", "toString"]) {
      expect((await appPost(app("POST", { collection: name, data: { x: 1 } }), ctx(store.id))).status).toBe(400);
    }
    // An item can't grow without limit through repeated edits.
    const big = (await (await appPost(app("POST", { collection: "reviews", data: { text: "a" } }, BO), ctx(store.id))).json()).item;
    for (let i = 0; i < 3; i++) await appPatch(app("PATCH", { collection: "reviews", id: big.id, data: { [`t${i}`]: "x".repeat(3900) } }, BO), ctx(store.id));
    const tooBig = await appPatch(app("PATCH", { collection: "reviews", id: big.id, data: { t9: "x".repeat(3900), t8: "y".repeat(3900) } }, BO), ctx(store.id));
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).error).toMatch(/too much/);

    // Saving the rules again keeps the data (seeds aren't added twice); turning off deletes it.
    await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", name: "Luigi's", rules: RULES }, { cookie }));
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=menu"), ctx(store.id))).json()).items).toHaveLength(3);
    expect((await turnOff(req("/api/appdata?projectId=proj789abc", "DELETE", undefined, { cookie }))).status).toBe(200);
    expect((await appGet(app("GET", undefined, ANA, "?collection=menu"), ctx(store.id))).status).toBe(404);
  });

  it("alerts the business about new orders and the customer about status changes; staff sign in with a PIN", async () => {
    await setFeature("appData", true);
    const cookie = await account("alerts");
    const { store } = await (await storeRoute(req("/api/appdata", "POST", { projectId: "proj790abc", name: "Luigi's", rules: RULES }, { cookie }))).json();
    const key = store.ownerUrl.split("#k=")[1];
    const owner = (body: unknown) => req(`/api/appdata/${store.id}/owner`, "POST", body, { "x-owner-key": key });

    // Staff mode stays shut until the business sets a PIN; then the right PIN gives the owner key.
    const staff = (pin: string) => staffRoute(req(`/api/appdata/${store.id}/staff`, "POST", { pin }), ctx(store.id));
    expect((await staff("123456")).status).toBe(403);
    expect((await ownerPost(owner({ action: "set-pin", pin: "12" }), ctx(store.id))).status).toBe(400);
    expect((await (await ownerPost(owner({ action: "set-pin", pin: "246810" }), ctx(store.id))).json()).hasStaffPin).toBe(true);
    expect((await staff("111111")).status).toBe(403);
    expect((await (await staff("246810")).json()).ownerKey).toBe(key);
    const view = await (await ownerGet(req(`/api/appdata/${store.id}/owner`, "GET", undefined, { "x-owner-key": key }), ctx(store.id))).json();
    expect(view.vapidKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);

    // A staff phone asks for alerts; a new order sends one there, and a status change reaches the customer.
    expect((await ownerPost(owner({ action: "alerts-expo", token: "not-a-token" }), ctx(store.id))).status).toBe(400);
    expect((await ownerPost(owner({ action: "alerts-expo", token: "ExponentPushToken[staffPhone123456]" }), ctx(store.id))).status).toBe(200);
    const sent: { to: string; title: string; body: string }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://exp.host/")) {
        sent.push(...JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: [{ status: "ok" }] }));
      }
      return real(url, init);
    }) as typeof fetch;
    try {
      const res = await appPost(
        req(`/api/appdata/${store.id}`, "POST", { collection: "orders", data: { name: "Ana", phone: "555", items: "2 Margherita" } }, { "x-device": ANA, "x-push-token": "ExponentPushToken[customerAna12345]" }),
        ctx(store.id),
      );
      const { item } = await res.json();
      expect(item.ref).toMatch(/^[0-9A-F]{4}$/);
      await vi.waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ to: "ExponentPushToken[staffPhone123456]", title: `New order #${item.ref}`, body: "Ana · 555 · 2 Margherita" })));
      await ownerPost(owner({ action: "status", collection: "orders", id: item.id, status: "ready" }), ctx(store.id));
      await vi.waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ to: "ExponentPushToken[customerAna12345]", body: `Your order #${item.ref} is now ready.` })));
    } finally {
      globalThis.fetch = real;
    }
  });

  it("stops new items at the monthly limit, and shows the business its usage", async () => {
    await setFeature("appData", true);
    const cookie = await account("limit");
    const { store } = await (await storeRoute(req("/api/appdata", "POST", { projectId: "proj791abc", rules: RULES }, { cookie }))).json();
    process.env.APPMAKER_DATA_MONTHLY_LIMIT = "2";
    try {
      const send = (device: string) => appPost(req(`/api/appdata/${store.id}`, "POST", { collection: "reviews", data: { text: "hi" } }, { "x-device": device }), ctx(store.id));
      expect((await send(ANA)).status).toBe(200);
      expect((await send(BO)).status).toBe(200);
      const third = await send(ANA);
      expect(third.status).toBe(400);
      expect((await third.json()).error).toMatch(/limit for this month/);
      const key = store.ownerUrl.split("#k=")[1];
      const view = await (await ownerGet(req(`/api/appdata/${store.id}/owner`, "GET", undefined, { "x-owner-key": key }), ctx(store.id))).json();
      expect(view.usage).toEqual({ month: 2, limit: 2 });
    } finally {
      delete process.env.APPMAKER_DATA_MONTHLY_LIMIT;
    }
  });

  it("answers 'anything changed?' from memory, tells live owner pages at once, and hears other servers", async () => {
    await setFeature("appData", true);
    const cookie = await account("versions");
    const { store } = await (await storeRoute(req("/api/appdata", "POST", { projectId: "proj793abc", rules: RULES }, { cookie }))).json();
    const versions = async () => (await (await versionsRoute(req(`/api/appdata/${store.id}/versions`, "GET"), ctx(store.id))).json()).versions;
    const before = await versions();
    expect(Object.keys(before).sort()).toEqual(["menu", "notes", "orders", "reviews"]);

    // The app's rules are kept in memory: checking again doesn't load them.
    let loads = 0;
    await cachedStore(store.id, async () => (loads++, null));
    expect(loads).toBe(0);

    // A live owner page hears about a new order as it happens.
    const key = store.ownerUrl.split("#k=")[1];
    const { ticket } = await (await ownerPost(req(`/api/appdata/${store.id}/owner`, "POST", { action: "live-ticket" }, { "x-owner-key": key }), ctx(store.id))).json();
    expect((await liveRoute(req(`/api/appdata/${store.id}/live?t=wrong`, "GET"), ctx(store.id))).status).toBe(403);
    const abort = new AbortController();
    const liveRes = await liveRoute(new Request(`${ORIGIN}/api/appdata/${store.id}/live?t=${ticket}`, { signal: abort.signal }), ctx(store.id));
    expect(liveRes.headers.get("content-type")).toBe("text/event-stream");
    const reader = liveRes.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    expect(text).toContain(": connected");
    await appPost(req(`/api/appdata/${store.id}`, "POST", { collection: "orders", data: { name: "Ana" } }, { "x-device": ANA }), ctx(store.id));
    text = decoder.decode((await reader.read()).value);
    expect(text).toBe('event: change\ndata: {"collection":"orders"}\n\n');
    abort.abort();
    await reader.cancel().catch(() => undefined);

    // Only the collection that changed has a new version.
    const after = await versions();
    expect(after.orders).not.toBe(before.orders);
    expect(after.menu).toBe(before.menu);

    // Another server instance's change arrives through PostgreSQL NOTIFY.
    await startListening();
    await query("select pg_notify('appmaker_data', $1)", [`other:instance|${store.id}|menu`]);
    await vi.waitFor(() => expect(version(store.id, "menu")).not.toBe(before.menu));
  });

  it("is part of the paid plan when payments are on", async () => {
    await setFeature("appData", true);
    const cookie = await account("free");
    process.env.STRIPE_SECRET_KEY = "sk_test_appmaker";
    try {
      const res = await storeRoute(req("/api/appdata", "POST", { projectId: "proj792abc", rules: RULES }, { cookie }));
      expect(res.status).toBe(402);
      expect((await res.json()).error).toMatch(/App databases are part of the paid plan/);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it("is off when the site owner turns it off, and needs an account to turn on", async () => {
    expect((await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", rules: RULES }))).status).toBe(401);
    await setFeature("appData", false);
    clearFeatureCache();
    const cookie = await account("off");
    expect((await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", rules: RULES }, { cookie }))).status).toBe(403);
    await setFeature("appData", true);
  });
});
