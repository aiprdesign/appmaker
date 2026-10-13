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
    expect(rules.orders.statuses).toEqual(["new", "preparing", "ready"]);
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
        "App.js": "import React from 'react';\nimport { Text } from 'react-native';\nimport { useCollection } from './src/appdata';\nexport default function App() { const { items } = useCollection('menu'); return <Text>{items.length}</Text>; }\n",
        [RULES_FILE]: JSON.stringify(RULES),
        [DATA_FILE]: dataModule(api, rules),
      };
      expect(validateApp(files)).toEqual([]);
      expect(checkCodeSafety(files)).toEqual([]);
      expect(usesData(files)).toBe(true);
      expect(appRules(files)).toEqual(rules);
    }
    expect(dataModule(null, rules)).toContain("const API = null;");
    expect(SYSTEM_PROMPT).toContain("App data (Appmaker's built-in database");
    expect(SYSTEM_PROMPT).toContain("useCollection('orders')");
  });
});

/** Runs src/appdata.js with a fake AsyncStorage (and fetch), as an app would. */
function runModule(api: string | null, fetcher?: typeof fetch) {
  const store = new Map<string, string>();
  const storage = { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => void store.set(k, v) };
  const code = dataModule(api, parseRules(RULES))
    .replace(/^import .*$/gm, "")
    .replace(/^export (async )?function (\w+)/gm, (_m, a: string | undefined, name: string) => `exports.${name} = ${a ?? ""}function ${name}`);
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  new Function("exports", "AsyncStorage", "fetch", "useState", "useEffect", "useRef", "useCallback", code)(exports, storage, fetcher, null, null, null, null);
  return exports;
}

describe("the app's data module", () => {
  it("works on the phone before the database is on: seeds, add, update and remove", async () => {
    const m = runModule(null);
    expect(((await m.list("menu")) as { name: string }[]).map((x) => x.name)).toEqual(["Margherita", "Marinara"]);
    const order = (await m.add("orders", { name: "Ana" })) as { id: string; status: string; mine: boolean };
    expect(order).toMatchObject({ name: "Ana", status: "new", mine: true });
    await m.update("orders", order.id, { name: "Ana B" });
    expect(await m.list("orders")).toEqual([expect.objectContaining({ name: "Ana B" })]);
    await m.remove("orders", order.id);
    expect(await m.list("orders")).toEqual([]);
    await expect(m.list("secrets")).rejects.toThrow(/Unknown collection/);
  });

  it("talks to the database once it's on, with this phone's random id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(init.method === "GET" ? { items: [] } : { item: { id: "x1", name: "Ana" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = runModule("https://appmaker.example/api/appdata/abc12345", fetcher);
    expect(((await m.list("menu")) as unknown[]).length).toBe(2); // empty public menu: the seed items show
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
    expect(orders.items.map((o: { name: string }) => o.name)).toEqual(["Bo", "Ana"]);
    expect(view.collections.find((c: { name: string }) => c.name === "notes")).toMatchObject({ count: 1, items: [] });
    await ownerPost(owner("POST", { action: "status", collection: "orders", id: order.id, status: "ready" }), ctx(store.id));
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=orders"), ctx(store.id))).json()).items[0].status).toBe("ready");
    expect((await ownerPost(owner("POST", { action: "status", collection: "orders", id: order.id, status: "teleported" }), ctx(store.id))).status).toBe(400);
    await ownerPost(owner("POST", { action: "add", collection: "menu", data: { name: "Diavola", price: "14" } }), ctx(store.id));
    expect((await (await appGet(app("GET", undefined, BO, "?collection=menu"), ctx(store.id))).json()).items[0].name).toBe("Diavola");
    expect((await ownerGet(req(`/api/appdata/${store.id}/owner`, "GET", undefined, { "x-owner-key": "wrong" }), ctx(store.id))).status).toBe(404);

    // Saving the rules again keeps the data (seeds aren't added twice); turning off deletes it.
    await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", name: "Luigi's", rules: RULES }, { cookie }));
    expect((await (await appGet(app("GET", undefined, ANA, "?collection=menu"), ctx(store.id))).json()).items).toHaveLength(3);
    expect((await turnOff(req("/api/appdata?projectId=proj789abc", "DELETE", undefined, { cookie }))).status).toBe(200);
    expect((await appGet(app("GET", undefined, ANA, "?collection=menu"), ctx(store.id))).status).toBe(404);
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
