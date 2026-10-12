import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderSite, screenshotsAvailable } from "@/lib/site-shots";
import { previewDocument } from "@/components/builder/SitePreview";
import { formatSite } from "@/lib/prompt";
import type { SiteSummary } from "@/lib/types";

let server: Server;
let base = "";

// A site that builds its pictures with JavaScript (like Wix or a React site): the plain import sees none.
const PAGE = `<!doctype html><html><head><title>Luigi's</title></head><body style="margin:0;font-family:sans-serif">
<header style="position:fixed;top:0;width:100%;background:#fff">Luigi's</header>
<div id="app"></div>
<script>
  document.getElementById("app").innerHTML =
    '<section style="height:700px;background:#b91c1c;color:#fff;padding:120px 40px"><h1>Real Italian food</h1></section>' +
    '<section style="height:500px;padding:40px"><h2>Our kitchen</h2><img src="/photo.jpg" width="800" height="400" alt="Kitchen"></section>' +
    '<section style="height:400px;background-image:url(/terrace.jpg);background-size:cover"><h2>The terrace</h2></section>';
</script></body></html>`;

beforeAll(async () => {
  const jpeg = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#d97706" } }).jpeg().toBuffer();
  server = createServer((req, res) => {
    if (req.url === "/photo.jpg" || req.url === "/terrace.jpg") return res.writeHead(200, { "content-type": "image/jpeg" }).end(jpeg);
    res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());

describe("website screenshots (headless browser)", () => {
  it("finds the pictures JavaScript shows, and cuts the hero and picture areas from a screenshot", async () => {
    if (!(await screenshotsAvailable())) return; // No Chromium on this machine.
    process.env.APPMAKER_ALLOW_PRIVATE_URLS = "1";
    try {
      const { images, shots } = await renderSite(`${base}/`, { shots: true });
      expect(images).toEqual(expect.arrayContaining([`${base}/photo.jpg`, `${base}/terrace.jpg`]));
      expect(shots[0]).toMatchObject({ path: "images/shot-hero.jpg", width: 1280, height: 720, label: expect.stringContaining("hero") });
      expect(shots[0].dataUrl).toMatch(/^data:image\/jpeg;base64,\/9j\//);
      expect(shots.some((s) => /Our kitchen|The terrace/.test(s.label))).toBe(true);
      expect(shots.length).toBeLessThanOrEqual(4);
    } finally {
      delete process.env.APPMAKER_ALLOW_PRIVATE_URLS;
    }
  }, 60_000);

  it("never renders private addresses unless allowed", async () => {
    if (!(await screenshotsAvailable())) return;
    const { images, shots } = await renderSite(`${base}/`, { shots: true });
    expect(images).toEqual([]);
    expect(shots.every((s) => s.dataUrl.length < 60_000)).toBe(true); // A blank page at most.
  }, 60_000);

  it("gives the AI only the screenshot parts' names, and the preview shows the pictures", () => {
    const site = {
      siteName: "Luigi's",
      url: "https://luigis.example/",
      colors: [],
      pages: [],
      screenshots: [
        { path: "images/shot-hero.jpg", label: "the top of the home page (its hero)", width: 1280, height: 720 },
        { path: "../../etc/passwd", label: "x", width: 1, height: 1 },
      ],
    } as unknown as SiteSummary;
    const text = formatSite(site);
    expect(text).toContain("- images/shot-hero.jpg (1280×720): the top of the home page (its hero)");
    expect(text).not.toContain("passwd");
    expect(text).not.toContain("base64");

    const html = `<html><body><section style="background-image:url('images/shot-hero.jpg')"></section><img src="./images/shot-hero.jpg"></body></html>`;
    const doc = previewDocument({ "index.html": html }, "index.html", undefined, { "images/shot-hero.jpg": "data:image/jpeg;base64,AAAA" });
    expect(doc).toContain("url('data:image/jpeg;base64,AAAA')");
    expect(doc).toContain('<img src="data:image/jpeg;base64,AAAA">');
  });
});

describe("download with screenshot parts", () => {
  it("puts them in the images folder where the pages expect them", async () => {
    const { siteZip } = await import("@/lib/website");
    const JSZip = (await import("jszip")).default;
    const { blob } = await siteZip(
      { "index.html": '<html><body><img src="images/shot-hero.jpg"></body></html>' },
      (async () => new Response(null, { status: 404 })) as typeof fetch,
      { "images/shot-hero.jpg": "data:image/jpeg;base64,/9j/AAAA", "../evil.sh": "data:image/jpeg;base64,AAAA" },
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toContain("images/shot-hero.jpg");
    expect(Object.keys(zip.files).some((f) => f.includes("evil"))).toBe(false);
    expect((await zip.file("images/shot-hero.jpg")!.async("uint8array"))[0]).toBe(0xff);
  });
});
