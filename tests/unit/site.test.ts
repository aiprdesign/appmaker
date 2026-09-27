import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/site/route";
import { demoResponse } from "@/lib/demo";
import { parseGeneration } from "@/lib/parse";
import { formatSite } from "@/lib/prompt";
import { importSite, isPublicAddress, normalizeUrl, SiteError } from "@/lib/site";
import type { SiteSummary } from "@/lib/types";

const PORT = 3291;
const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, ["tests/fixtures/site-server.mjs"], { env: { ...process.env, SITE_PORT: String(PORT) } });
  await new Promise<void>((resolve) => server.stdout!.once("data", () => resolve()));
});
afterAll(() => {
  server.kill();
});

const withPrivate = async <T>(fn: () => Promise<T>) => {
  process.env.APPMAKER_ALLOW_PRIVATE_URLS = "1";
  try {
    return await fn();
  } finally {
    delete process.env.APPMAKER_ALLOW_PRIVATE_URLS;
  }
};

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "93.184.216.34", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe("normalizeUrl", () => {
  it("adds https and drops the hash", () => {
    expect(normalizeUrl("example.com/menu#top").toString()).toBe("https://example.com/menu");
  });
  it.each([
    "ftp://example.com",
    "https://user:pw@example.com",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://example.com:8443",
    "http://printer.local",
    "",
  ])("rejects %s", (u) => expect(() => normalizeUrl(u)).toThrow(SiteError));
});

describe("importSite", () => {
  it("reads the page plus key pages and extracts branding", async () => {
    const site = await withPrivate(() => importSite(`${BASE}/old`));
    expect(site.url).toBe(`${BASE}/`);
    expect(site.siteName).toBe("Luigi's Trattoria");
    expect(site.description).toMatch(/handmade pasta/);
    expect(site.colors[0]).toBe("#b91c1c");
    expect(site.colors).toContain("#15803d");
    expect(site.colors).not.toContain("#ffffff");
    expect(site.language).toBe("en");

    const urls = site.pages.map((p) => new URL(p.url).pathname);
    expect(urls[0]).toBe("/");
    expect(urls).toEqual(expect.arrayContaining(["/menu", "/about", "/reservations"]));
    expect(urls).not.toContain("/login");
    expect(urls).not.toContain("/privacy");
    expect(site.pages).toHaveLength(4);

    const menu = site.pages.find((p) => p.url.endsWith("/menu"))!;
    expect(menu.headings).toContain("Cacio e pepe — $19");
    expect(site.pages[0].navigation).toContain("Menu");
    expect(JSON.stringify(site)).not.toContain("SHOULD_NOT_APPEAR");
  });

  it("refuses private addresses unless explicitly allowed", async () => {
    await expect(importSite(`${BASE}/`)).rejects.toThrow(SiteError);
    await expect(importSite("http://127.0.0.1/")).rejects.toThrow(/private network/);
  });

  it("gives friendly errors", async () => {
    await withPrivate(async () => {
      await expect(importSite(`${BASE}/missing`)).rejects.toThrow(/HTTP 404/);
      await expect(importSite(`${BASE}/image.png`)).rejects.toThrow(/isn't a web page/);
      await expect(importSite(`${BASE}/empty`)).rejects.toThrow(/almost no readable text/);
    });
  });
});

describe("POST /api/site", () => {
  const call = (body: unknown) => POST(new Request("http://localhost/api/site", { method: "POST", body: JSON.stringify(body) }));

  it("validates input and blocks private targets", async () => {
    expect((await call({})).status).toBe(400);
    const res = await call({ url: "http://169.254.169.254/latest/meta-data" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/private network/);
  });
});

describe("using an imported site", () => {
  let site: SiteSummary;
  beforeAll(async () => {
    site = await withPrivate(() => importSite(`${BASE}/`));
  });

  it("fences website text so it can't break out of <website_content>", () => {
    const text = formatSite(site);
    expect(text.match(/<\/website_content>/g)).toHaveLength(1);
    expect(text.startsWith("<website_content>")).toBe(true);
    expect(text).toContain("Cacio e pepe");
  });

  it("brands the demo app with the site's name and color", () => {
    const parsed = parseGeneration(demoResponse("Turn this into an app", false, site));
    expect(parsed.listing?.name).toBe("Luigi's Trattoria");
    expect(parsed.listing?.primaryColor).toBe("#b91c1c");
    expect(parsed.files["App.js"]).toContain("#b91c1c");
    expect(parsed.files["App.js"]).toContain("Luigi's Trattoria");
  });
});
