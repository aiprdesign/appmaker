import { describe, expect, it } from "vitest";
import { featureData, searchIndex, withSiteFeatures } from "@/lib/site-features";
import { openAt, parseHours } from "@/lib/site-hours";
import { FEATURES_RUNTIME } from "@/lib/site-features-runtime";
import { validateSite } from "@/lib/website";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const page = (title: string, main: string) =>
  `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>${title} · Luigi's</title><meta name="description" content="${title} at Luigi's."></head><body><a href="#main">Skip to content</a><main id="main"><h1>${title}</h1>${main}</main><footer><p>214 Court Street, Brooklyn</p></footer></body></html>`;
const info = {
  siteName: "Luigi's",
  url: "https://luigis.example/old",
  phone: "+1 (718) 555-0142",
  email: "ciao@luigis.example",
  address: "214 Court Street, Brooklyn",
  whatsapp: "+1 718 555 0142",
  booking: "https://www.opentable.com/luigis",
  hours: ["Mo-Fr 12:00-22:00", "Sa 17:00-23:30", "Su closed"],
  primary: "#fde047",
};
const words = (n: number) => "pasta ".repeat(n);
const files = {
  "index.html": page("Home", "<p>Fresh pasta.</p>"),
  "faq.html": page("Questions", "<details><summary>Do you deliver?</summary><p>Yes, within 3 miles.</p></details><details><summary>Is it gluten free?</summary><p>Ask for our gluten-free pasta.</p></details>"),
  "blog/story.html": page("Our story", `<p>${words(900)}</p>`),
};

describe("opening hours", () => {
  it("reads the usual ways websites write them", () => {
    expect(parseHours(["Mo-Fr 09:00-17:00"])).toMatchObject({ 1: [[540, 1020]], 5: [[540, 1020]] });
    expect(parseHours(["Monday – Friday: 9am – 5:30pm", "Sunday: Closed"])).toMatchObject({ 0: [], 3: [[540, 1050]] });
    expect(parseHours(["Mon, Wed & Fri: 9–5"])).toEqual({ 1: [[540, 1020]], 3: [[540, 1020]], 5: [[540, 1020]] });
    expect(parseHours(["Call us for opening times"])).toBeNull();
  });
  it("knows when it's open, including late nights", () => {
    const week = parseHours(["Fri 6pm - 2am", "Sa 10:00-14:00"])!;
    expect(openAt(week, new Date(2026, 9, 16, 23, 0))).toMatchObject({ open: true }); // Friday 11pm
    expect(openAt(week, new Date(2026, 9, 17, 1, 0))).toMatchObject({ open: true }); // Saturday 1am
    expect(openAt(week, new Date(2026, 9, 17, 8, 0))).toEqual({ open: false, opens: 600 });
  });
});

describe("website features", () => {
  const out = withSiteFeatures(files, info);
  it("adds the runtime with the business's details, readable on the brand colour", () => {
    const data = featureData(info);
    expect(data).toMatchObject({ tel: "+17185550142", whatsapp: "https://wa.me/17185550142", booking: "https://www.opentable.com/luigis", ink: "#111111", site: "https://luigis.example/" });
    expect(data.maps).toContain("214%20Court%20Street");
    expect(data.week?.[6]).toEqual([[1020, 1410]]);
    expect(out["features.js"]).toContain('var APPMAKER_SITE = {"name":"Luigi\'s"');
    expect(() => new Function(out["features.js"])).not.toThrow();
    expect(() => new Function(out["sw.js"])).not.toThrow();
    expect(FEATURES_RUNTIME).not.toContain("${");
    for (const p of ["index.html", "faq.html"]) expect(out[p]).toContain('<script src="features.js" defer></script>');
    expect(out["blog/story.html"]).toContain('<script src="../features.js" defer></script>');
  });
  it("adds FAQ and breadcrumb data, the map link and reading time", () => {
    expect(out["faq.html"]).toContain('"@type":"FAQPage"');
    expect(out["faq.html"]).toContain('"name":"Do you deliver?"');
    expect(out["index.html"]).not.toContain("FAQPage");
    expect(out["blog/story.html"]).toContain('"@type":"BreadcrumbList"');
    expect(out["blog/story.html"]).toContain('"item":"https://luigis.example/blog/story.html"');
    expect(out["index.html"]).not.toContain("BreadcrumbList");
    expect(out["index.html"]).toMatch(/<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=214%20Court[^"]*" target="_blank"[^>]*>214 Court Street, Brooklyn<span class="sr-only">/);
    expect(out["blog/story.html"]).toContain('<p data-appmaker-reading class="mt-2 text-sm opacity-75">4 min read</p>');
  });
  it("indexes every page for search, and is safe to run again", () => {
    expect(searchIndex(files).map((p) => [p.url, p.title])).toEqual([["index.html", "Home"], ["blog/story.html", "Our story"], ["faq.html", "Questions"]]);
    expect(out["search.js"]).toContain("window.APPMAKER_SEARCH = [");
    expect(withSiteFeatures(out, info)).toEqual(out);
    expect(validateSite(out).filter((i) => !/script|<title>|description/.test(i.message))).toEqual([]);
    expect(validateSite(out).map((i) => i.message).join()).not.toMatch(/features\.js|search\.js|sw\.js/);
  });
  it("shows nothing it doesn't know", () => {
    const bare = featureData({ siteName: "X" });
    expect(Object.keys(bare).sort()).toEqual(["color", "ink", "name"]);
  });
});

describe("app extras", () => {
  it("tells the app builder about the useful extras", () => {
    for (const t of ["Share.share", "Add to calendar", "Recently viewed", "Export as CSV", "Back up my data", "Send feedback"]) expect(SYSTEM_PROMPT).toContain(t);
  });
});
