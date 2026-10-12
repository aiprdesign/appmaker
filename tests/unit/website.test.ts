import { describe, expect, it } from "vitest";
import { previewDocument } from "@/components/builder/SitePreview";
import { buildUserMessage } from "@/lib/prompt";
import { getStyle } from "@/lib/styles";
import { demoWebsiteResponse, isAllowedSitePath, validateSite, websiteSystemPrompt } from "@/lib/website";
import { parseGeneration } from "@/lib/parse";

const good = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Home · Luigi's</title><meta name="description" content="Pasta."><link rel="stylesheet" href="styles.css"><script src="https://cdn.tailwindcss.com"></script></head><body><a href="#main">Skip to content</a><main id="main"><h1>Luigi's</h1><a href="contact.html">Contact</a><img src="https://x/a.jpg" alt="Pasta"></main><script src="script.js"></script></body></html>`;

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
  it("offers ultra-modern editorial, modern soft & rounded, and the business's own style", async () => {
    const { conceptStyles, conceptPrompt, finishSitePrompt, tierName } = await import("@/lib/website");
    const { DESIGN_STYLES } = await import("@/lib/styles");
    for (const picked of DESIGN_STYLES) {
      const three = conceptStyles(picked, DESIGN_STYLES);
      expect(three.map((c) => c.tier.tier)).toEqual(["editorial", "soft", "themed"]);
      expect(three[0].style.id).toBe("editorial");
      expect(new Set(three.map((c) => c.style.id)).size).toBe(3);
    }
    // The third is the style picked for the business; if that's editorial or soft, the next best.
    expect(conceptStyles(getStyle("pop")!, DESIGN_STYLES).map((c) => c.style.id)).toEqual(["editorial", "clay", "pop"]);
    expect(conceptStyles(getStyle("luxe")!, DESIGN_STYLES).map((c) => c.style.id)).toEqual(["editorial", "clay", "luxe"]);
    expect(conceptStyles(getStyle("calm")!, DESIGN_STYLES).map((c) => c.style.id)).toEqual(["editorial", "calm", "luxe"]);
    expect(conceptStyles(getStyle("editorial")!, DESIGN_STYLES)[2].style.id).toBe("luxe");
    expect(conceptPrompt("Redesign it", getStyle("editorial")!, 1, "editorial")).toMatch(/direction ULTRA-MODERN EDITORIAL: like a design-led magazine/);
    expect(conceptPrompt("Redesign it", getStyle("clay")!, 2, "soft")).toMatch(/direction MODERN SOFT & ROUNDED: .*rounded-3xl/);
    expect(conceptPrompt("Redesign it", getStyle("pop")!, 3, "themed")).toMatch(/direction MADE FOR THIS BUSINESS/);
    // Older projects keep their direction names.
    expect(tierName("balanced")).toBe("Balanced");
    expect(tierName("soft")).toBe("Modern soft & rounded");
    const style = getStyle("editorial")!;
    expect(conceptPrompt("Redesign Luigi's", style, 2)).toMatch(/Design concept 2 of 3, in the Editorial style\./);
    expect(conceptPrompt("Redesign Luigi's", style, 2)).toContain("Write ONLY two pages");
    expect(finishSitePrompt(style, ["index.html", "menu.html"])).toMatch(/index\.html and menu\.html are already written[\s\S]*sitemap\.xml and robots\.txt/);
    expect(websiteSystemPrompt()).toContain("Commercially safe resources only");
  });
});

describe("website colours", () => {
  it("uses brand colours by default, the owner's custom colours, or lets the designer choose", async () => {
    const { resolveSiteColors, colorInstruction, conceptPrompt } = await import("@/lib/website");
    expect(resolveSiteColors(undefined, ["#b91c1c", "#f59e0b"])).toEqual({ mode: "brand", primary: "#b91c1c", accent: "#f59e0b" });
    expect(resolveSiteColors(undefined, [])).toEqual({ mode: "auto" });
    expect(resolveSiteColors({ mode: "auto" }, ["#b91c1c"])).toEqual({ mode: "auto" });
    expect(resolveSiteColors({ mode: "custom", primary: "#123456", accent: "nope" })).toEqual({ mode: "custom", primary: "#123456", accent: undefined });
    expect(colorInstruction({ mode: "brand", primary: "#b91c1c", accent: "#f59e0b" })).toMatch(/brand colours exactly: #b91c1c with #f59e0b as the accent/);
    expect(colorInstruction({ mode: "auto" })).toMatch(/choose the most beautiful palette/);
    expect(conceptPrompt("Redesign", getStyle("swiss")!, 1, "simple", { mode: "custom", primary: "#123456" })).toContain("the owner chose these colours: #123456");
  });
});

describe("motion design", () => {
  it("tells the designer how to animate, per direction, and checks reduced motion", async () => {
    const { conceptPrompt, validateSite, websiteSystemPrompt } = await import("@/lib/website");
    for (const t of ["Motion design", "IntersectionObserver", "@view-transition", "cubic-bezier(0.22, 1, 0.36, 1)", "prefers-reduced-motion", "Animate only transform and opacity"]) {
      expect(websiteSystemPrompt()).toContain(t);
    }
    expect(conceptPrompt("x", getStyle("editorial")!, 1, "editorial")).toContain("Motion: refined and slow");
    expect(conceptPrompt("x", getStyle("clay")!, 2, "soft")).toContain("Motion: springy and smooth");
    const page = good;
    const animated = { "index.html": page, "contact.html": page, "styles.css": ".card{transition: transform .2s}", "script.js": "1" };
    expect(validateSite(animated).map((i) => i.message)).toContain(
      "has animations but never checks prefers-reduced-motion; switch motion off for people who turn it off in their settings",
    );
    expect(validateSite({ ...animated, "styles.css": "@media (prefers-reduced-motion: no-preference){.card{transition: transform .2s}}" })).toEqual([]);
  });
});

describe("accessibility widget", () => {
  it("is added to every page and the site, once, and doesn't trip the motion check", async () => {
    const { withA11yWidget, A11Y_WIDGET } = await import("@/lib/site-a11y");
    const post = good.replace('href="contact.html"', 'href="../contact.html"').replace(/(href|src)="(styles\.css|script\.js)"/g, '$1="../$2"');
    const files = withA11yWidget({ "index.html": good, "blog/post.html": post, "styles.css": "a{}", "script.js": "1" });
    expect(files["a11y.js"]).toBe(A11Y_WIDGET);
    expect(files["index.html"]).toContain('<script src="a11y.js" defer></script>\n</body>');
    expect(files["blog/post.html"]).toMatch(/<script src="\.\.\/a11y\.js" defer><\/script>\n<\/body>/);
    expect(withA11yWidget(files)["index.html"].match(/a11y\.js/g)).toHaveLength(1);
    expect(validateSite({ ...files, "contact.html": good })).toEqual([]);
    // No background requests at all. The only addresses are the SVG namespace (never fetched)
    // and, for the video player, YouTube's cookie-free stills and the official players it
    // loads when someone presses play.
    expect(A11Y_WIDGET).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
    const addresses = A11Y_WIDGET.match(/https?:(?:\\?\/){2}[\w.-]+/g) ?? [];
    const allowed = /^https?:(?:\\?\/){2}(www\.w3\.org|i\.ytimg\.com|www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com|www\.instagram\.com|www\.tiktok\.com)$/;
    expect(addresses.filter((a) => !allowed.test(a.replace(/\\/g, "")))).toEqual([]);
  });
});

describe("WCAG 2.2 AA page checks", () => {
  it("finds structural accessibility problems in the HTML", async () => {
    const { pageA11yIssues } = await import("@/lib/website");
    expect(pageA11yIssues("index.html", good)).toEqual([]);
    const bad = `<html lang="en"><body><h1>A</h1><h1>B</h1><h4>Deep</h4>
      <input type="email" name="email"><button><svg></svg></button><a href="/x">click here</a><a href="/y"></a>
      <div tabindex="3">x</div><iframe src="https://maps"></iframe><p id="a"></p><p id="a"></p></body></html>`;
    const found = pageA11yIssues("index.html", bad).join("\n");
    for (const m of [
      "has no <main> landmark",
      'has no "Skip to content" link',
      "has 2 <h1> headings",
      "skips a heading level (h1 to h4",
      "form field without a label (email)",
      "email field without autocomplete",
      "button with no name",
      'only says "click here"',
      "tabindex greater than 0",
      "<iframe> without a title",
      'repeats the id "a"',
    ]) {
      expect(found, m).toContain(m);
    }
    const labelled = '<a href="#main">Skip to content</a><main id="main"><h1>C</h1><label for="e">Email</label><input id="e" type="email" autocomplete="email"><label>Name <input name="n"></label><button aria-label="Open menu"><svg></svg></button></main>';
    expect(pageA11yIssues("contact.html", labelled)).toEqual([]);
  });
});
