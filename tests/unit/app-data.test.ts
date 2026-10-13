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
    expect(staffModule(null)).toContain("Staff mode isn't available yet");
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
    .replace(/^export (async )?function (\w+)/gm, (_m, a: string | undefined, name: string) => `${a ?? ""}function ${name}`);
  const names = [...dataModule(api, parseRules(RULES)).matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  new Function("exports", "AsyncStorage", "fetch", "useState", "useEffect", "useRef", "useCallback", `${code}\n${names.map((n) => `exports.${n} = ${n};`).join("\n")}`)(exports, storage, fetcher, null, null, null, null);
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
    await m.remove("orders", order.id); // orders are cancelled (the business keeps a record), not deleted
    expect(await m.list("orders")).toEqual([expect.objectContaining({ name: "Ana B", status: "cancelled" })]);
    await expect(m.list("secrets")).rejects.toThrow(/Unknown collection/);
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

  it("is off when the site owner turns it off, and needs an account to turn on", async () => {
    expect((await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", rules: RULES }))).status).toBe(401);
    await setFeature("appData", false);
    clearFeatureCache();
    const cookie = await account("off");
    expect((await storeRoute(req("/api/appdata", "POST", { projectId: "proj789abc", rules: RULES }, { cookie }))).status).toBe(403);
    await setFeature("appData", true);
  });
});
