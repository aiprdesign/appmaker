import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createLive } from "@/app/api/live/route";
import { DELETE as deleteLive, GET as getLive, POST as refreshLive } from "@/app/api/live/[id]/route";
import { checkCodeSafety } from "@/lib/code-safety";
import { LIVE_MERGE_SOURCE, liveContentFromSite, liveModule, type LiveContent } from "@/lib/live";
import { closeDatabase, query } from "@/lib/server/db";
import { isStale } from "@/lib/server/live";
import type { SiteSummary } from "@/lib/types";
import { validateApp } from "@/lib/validate";

// The same merge the apps run, taken from the source they ship with.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const mergeLive = new Function(`${LIVE_MERGE_SOURCE}; return mergeLive;`)() as (base: unknown, live: unknown) => Record<string, unknown>;

const SITE: SiteSummary = {
  url: "https://luigis.example/",
  siteName: "Luigi's Trattoria",
  title: "Luigi's",
  description: "",
  colors: [],
  language: "en",
  logo: "https://img.luigis.example/logo.png",
  images: ["https://img.luigis.example/a.jpg", "https://img.luigis.example/logo.png", "http://insecure.example/b.jpg"],
  contact: { phones: ["+1 718 555 0142"], emails: ["ciao@luigis.example"], hours: ["Tu-Su 17:00-23:00"], social: [], booking: "https://book.example/luigis" },
  pages: [
    {
      url: "https://luigis.example/menu",
      title: "Menu | Luigi's",
      headings: ["Cacio e pepe — $19", "Margherita pizza — $16", "Chef's special this week", "Delivery — $5"],
      navigation: [],
      text: "Tiramisu ..... $9\nOpen daily\nTotal: $44",
    },
  ],
};

describe("live content from a website", () => {
  it("finds photos, contact details, hours, prices and offers, without AI", () => {
    const live = liveContentFromSite(SITE, new Date("2026-09-30T10:00:00Z"));
    expect(live).toMatchObject({
      v: 1,
      name: "Luigi's Trattoria",
      logo: "https://img.luigis.example/logo.png",
      images: ["https://img.luigis.example/a.jpg"],
      contact: { phone: "+1 718 555 0142", email: "ciao@luigis.example", booking: "https://book.example/luigis" },
      hours: ["Tu-Su 17:00-23:00"],
      offers: [{ title: "Chef's special this week" }],
    });
    expect(live.items).toEqual([
      { name: "Cacio e pepe", price: "$19", section: "Menu" },
      { name: "Margherita pizza", price: "$16", section: "Menu" },
      { name: "Tiramisu", price: "$9", section: "Menu" },
    ]);
  });

  it("merges into the app's content: the website wins for facts, the app keeps its wording", () => {
    const base = {
      name: "Luigi's",
      tagline: "Handmade pasta",
      images: ["https://old.example/1.jpg"],
      contact: { phone: "+1 000", website: "https://luigis.example" },
      hours: ["old hours"],
      items: [{ name: "Cacio e pepe", description: "Pecorino, pepper", price: "$17", category: "Pasta" }],
      offers: [{ title: "Old offer", text: "" }],
    };
    const merged = mergeLive(base, liveContentFromSite(SITE));
    expect(merged.tagline).toBe("Handmade pasta");
    expect(merged.images).toEqual(["https://img.luigis.example/a.jpg"]);
    expect(merged.contact).toMatchObject({ phone: "+1 718 555 0142", website: "https://luigis.example", booking: "https://book.example/luigis" });
    expect(merged.hours).toEqual(["Tu-Su 17:00-23:00"]);
    const items = merged.items as { name: string; price: string; description: string; category: string }[];
    expect(items[0]).toEqual({ name: "Cacio e pepe", description: "Pecorino, pepper", price: "$19", category: "Pasta" });
    expect(items.map((i) => i.name)).toEqual(["Cacio e pepe", "Margherita pizza", "Tiramisu"]);
    expect(items[1]).toMatchObject({ category: "Menu", description: "" });
    expect(merged.offers).toEqual([{ title: "Chef's special this week", text: "" }]);
    // Nothing usable: the app's own content is kept.
    expect(mergeLive(base, null)).toBe(base);
    expect(mergeLive(base, { v: 2 })).toBe(base);
  });

  it("ships a live file that passes the app checks, with or without a feed", () => {
    for (const file of [liveModule(null), liveModule("https://appmaker.example/api/live/abc123def")]) {
      const files = { "App.js": "import { useLive } from './src/live';\nexport default function App() { return null; }", "src/live.js": file };
      expect(checkCodeSafety(files)).toEqual([]);
      expect(validateApp(files)).toEqual([]);
    }
    expect(liveModule(null)).toContain("const FEED = null;");
    expect(liveModule("https://a.example/api/live/x")).toContain('const FEED = "https://a.example/api/live/x";');
  });

  it("re-reads a site only when the copy is over a day old", () => {
    const feed = { id: "x", url: "", content: null, error: null };
    expect(isStale({ ...feed, fetchedAt: null })).toBe(true);
    expect(isStale({ ...feed, fetchedAt: new Date(Date.now() - 60_000).toISOString() })).toBe(false);
    expect(isStale({ ...feed, fetchedAt: new Date(Date.now() - 25 * 3600_000).toISOString() })).toBe(true);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const PORT = 3292;
const ORIGIN = "http://localhost:3000";
const req = (path: string, method: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "10.78.0.1", ...(cookie ? { cookie } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!DB)("live content feeds (PostgreSQL)", () => {
  let server: ChildProcess;
  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.APPMAKER_ALLOW_PRIVATE_URLS = "1";
    server = spawn(process.execPath, ["tests/fixtures/site-server.mjs"], { env: { ...process.env, SITE_PORT: String(PORT) } });
    await new Promise<void>((resolve) => server.stdout!.once("data", () => resolve()));
  });
  afterAll(async () => {
    server.kill();
    await closeDatabase();
    delete process.env.DATABASE_URL;
    delete process.env.APPMAKER_ALLOW_PRIVATE_URLS;
  });
  beforeEach(async () => {
    await query("delete from app_users where email like '%@live.example.com'");
  });

  it("turns on live content, serves it publicly with CORS, refreshes and turns off", async () => {
    expect((await createLive(req("/api/live", "POST", { projectId: "proj123abc", url: `http://localhost:${PORT}/` }))).status).toBe(401);
    const res = await signup(req("/api/auth/signup", "POST", { email: "owner@live.example.com", password: "correct horse" }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];

    const created = await createLive(req("/api/live", "POST", { projectId: "proj123abc", url: `http://localhost:${PORT}/` }, cookie));
    expect(created.status).toBe(200);
    const feed = await created.json();
    expect(feed.feedUrl).toBe(`http://localhost:3000/api/live/${feed.id}`);
    expect(feed.content.name).toBe("Luigi's Trattoria");
    expect(feed.content.contact.booking).toBe("https://www.opentable.com/r/luigis-trattoria");

    const pub = await getLive(req(`/api/live/${feed.id}`, "GET", undefined), ctx(feed.id));
    expect(pub.status).toBe(200);
    expect(pub.headers.get("access-control-allow-origin")).toBe("*");
    expect(pub.headers.get("cache-control")).toMatch(/max-age=3600/);
    const content = (await pub.json()) as LiveContent;
    expect(content.images.length).toBeGreaterThan(0);
    expect(content.items).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cacio e pepe", price: "$19" })]));

    expect((await refreshLive(req(`/api/live/${feed.id}`, "POST", {}, cookie), ctx(feed.id))).status).toBe(200);
    // Only the owner can refresh or turn it off.
    const other = await signup(req("/api/auth/signup", "POST", { email: "other@live.example.com", password: "correct horse" }));
    const otherCookie = other.headers.get("set-cookie")!.split(";")[0];
    expect((await refreshLive(req(`/api/live/${feed.id}`, "POST", {}, otherCookie), ctx(feed.id))).status).toBe(404);
    expect((await deleteLive(req(`/api/live/${feed.id}`, "DELETE", {}, otherCookie), ctx(feed.id))).status).toBe(404);

    expect((await deleteLive(req(`/api/live/${feed.id}`, "DELETE", {}, cookie), ctx(feed.id))).status).toBe(200);
    expect((await getLive(req(`/api/live/${feed.id}`, "GET", undefined), ctx(feed.id))).status).toBe(404);
  });
});
