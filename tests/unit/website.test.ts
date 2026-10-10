import { describe, expect, it } from "vitest";
import { previewDocument } from "@/components/builder/SitePreview";
import { buildUserMessage } from "@/lib/prompt";
import { getStyle } from "@/lib/styles";
import { demoWebsiteResponse, isAllowedSitePath, validateSite, websiteSystemPrompt } from "@/lib/website";
import { parseGeneration } from "@/lib/parse";

const good = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Home · Luigi's</title><meta name="description" content="Pasta."><link rel="stylesheet" href="styles.css"><script src="https://cdn.tailwindcss.com"></script></head><body><a href="contact.html">Contact</a><img src="https://x/a.jpg" alt="Pasta"><script src="script.js"></script></body></html>`;

describe("website redesign", () => {
  it("accepts website files only", () => {
    for (const p of ["index.html", "about-us.html", "styles.css", "script.js", "sitemap.xml", "robots.txt", "blog/post-1.html"]) expect(isAllowedSitePath(p), p).toBe(true);
    for (const p of ["App.js", "../x.html", "a/b/c.html", "Index.HTML", ".env", "server.php"]) expect(isAllowedSitePath(p), p).toBe(false);
  });

  it("checks pages for SEO, accessibility, missing pages and foreign scripts", () => {
    const files = { "index.html": good, "contact.html": good, "styles.css": "a{}", "script.js": "1" };
    expect(validateSite(files)).toEqual([]);
    const bad = good
      .replace(/<title>.*<\/title>/, "")
      .replace(' alt="Pasta"', "")
      .replace("contact.html", "missing.html")
      .replace("https://cdn.tailwindcss.com", "https://evil.example/x.js");
    const messages = validateSite({ ...files, "index.html": bad }).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no <title>/),
        expect.stringMatching(/<img> without alt/),
        expect.stringMatching(/links to missing\.html, which doesn't exist/),
        expect.stringMatching(/loads a script from https:\/\/evil\.example/),
      ]),
    );
    expect(validateSite({ "about.html": good }).map((i) => i.message)).toContain("index.html (the home page) is missing");
  });

  it("previews a page with its own stylesheet and script inline", () => {
    const doc = previewDocument({ "index.html": good, "styles.css": "h1{color:red}", "script.js": "window.x=1" }, "index.html");
    expect(doc).toContain("<style>h1{color:red}</style>");
    expect(doc).toContain(">window.x=1</script>");
    expect(doc).toContain("appmaker:site-page");
    expect(doc).toContain('src="https://cdn.tailwindcss.com"');
  });

  it("tells the AI to keep real content, add SEO and use the design style", () => {
    const system = websiteSystemPrompt();
    for (const s of ["Never invent facts", "cdn.tailwindcss.com", "sitemap.xml", "JSON-LD", "mailto:", "Skip to content"]) expect(system).toContain(s);
    const msg = buildUserMessage("Redesign it", {}, undefined, undefined, getStyle("editorial"), "website");
    expect(msg).toMatch(/Design this website in the Editorial style/);
    expect(msg).toMatch(/Redesign this website:/);
    expect(msg).not.toContain("src/theme.js");
  });

  it("has a valid sample redesign for demo mode", () => {
    const parsed = parseGeneration(demoWebsiteResponse({ siteName: "Luigi's", url: "https://luigis.example" }));
    expect(Object.keys(parsed.files)).toEqual(["index.html", "contact.html"]);
    expect(validateSite(parsed.files)).toEqual([]);
  });
});

describe("website download", () => {
  it("saves the site's images into the ZIP, straight from the business's website", async () => {
    const JSZip = (await import("jszip")).default;
    const { siteZip } = await import("@/lib/website");
    const files = {
      "index.html": `<img src="https://luigis.example/img/Pasta%20Dish.jpg?w=800" alt="Pasta"><img src="https://cdn.locked.example/a.png" alt="x">`,
      "blog/post.html": `<img src="https://luigis.example/img/Pasta%20Dish.jpg?w=800" alt="Pasta">`,
      "styles.css": `.hero{background:url('https://luigis.example/hero.webp')}`,
    };
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      if (url.includes("locked")) throw new TypeError("Failed to fetch (CORS)");
      const type = url.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": type } });
    }) as typeof fetch;
    const { blob, saved, linked } = await siteZip(files, fetcher);
    expect({ saved, linked }).toEqual({ saved: 2, linked: 1 });
    expect(asked.every((u) => !u.includes("appmaker"))).toBe(true);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "blog/", "blog/post.html", "images/", "images/hero.webp", "images/pasta-dish.jpg", "index.html", "styles.css"]);
    expect(await zip.file("index.html")!.async("string")).toContain('src="images/pasta-dish.jpg"');
    expect(await zip.file("index.html")!.async("string")).toContain("https://cdn.locked.example/a.png");
    expect(await zip.file("blog/post.html")!.async("string")).toContain('src="../images/pasta-dish.jpg"');
    expect(await zip.file("styles.css")!.async("string")).toContain("url('images/hero.webp')");
    expect(await zip.file("README.txt")!.async("string")).toMatch(/1 image is still loaded from your current website/);
  });
});

describe("three design concepts", () => {
  it("offers the picked style plus two from other categories", async () => {
    const { conceptStyles, conceptPrompt, finishSitePrompt } = await import("@/lib/website");
    const { DESIGN_STYLES } = await import("@/lib/styles");
    for (const picked of DESIGN_STYLES) {
      const three = conceptStyles(picked, DESIGN_STYLES);
      expect(three[0]).toBe(picked);
      expect(three).toHaveLength(3);
      expect(new Set(three.map((s) => s.category)).size).toBe(3);
    }
    const style = getStyle("editorial")!;
    expect(conceptPrompt("Redesign Luigi's", style, 2)).toMatch(/Design concept 2 of 3, in the Editorial style\. Write ONLY two pages/);
    expect(finishSitePrompt(style, ["index.html", "menu.html"])).toMatch(/index\.html and menu\.html are already written.*sitemap\.xml and robots\.txt/s);
    expect(websiteSystemPrompt()).toContain("Commercially safe resources only");
  });
});
