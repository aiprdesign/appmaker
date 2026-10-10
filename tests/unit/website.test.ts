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
