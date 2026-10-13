import { describe, expect, it } from "vitest";
import { polishSite } from "@/lib/site-polish";
import { pageA11yIssues, validateSite } from "@/lib/website";

const page = (title: string, extra = "") => `<!doctype html><html><head><title>${title} · Luigi's</title><meta name="description" content="Fresh pasta in Brooklyn."></head>
<body><a href="#main">Skip to content</a><header><nav aria-label="Main"><a href="index.html">Home</a></nav></header><main id="main"><h1>${title}</h1>
<img src="https://img.example/hero.jpg" alt="The dining room"><img src="https://img.example/pasta.jpg" alt="Cacio e pepe"><img src="images/site-1.jpg" alt="Our oven">
<a href="https://instagram.com/luigis" target="_blank">Instagram</a><a href="tel:+1 (718) 555-0142">Call</a><a href="www.opentable.com/luigis">Book</a>${extra}</main><footer>©</footer></body></html>`;
const info = {
  siteName: "Luigi's Trattoria",
  url: "https://luigis.example/old/page",
  lang: "it",
  primary: "#b91c1c",
  emoji: "🍝",
  description: "Fresh pasta in Brooklyn.",
  phone: "+1 718-555-0142",
  email: "ciao@luigis.example",
  address: "214 Court Street, Brooklyn",
  social: ["https://instagram.com/luigis"],
  assetSizes: { "images/site-1.jpg": { width: 800, height: 600 } },
};

describe("finishing touches for every redesigned website", () => {
  const files = { "index.html": page("Home"), "menu.html": page("Menu") };
  const out = polishSite(files, info);
  const home = out["index.html"];

  it("adds what browsers, search engines and sharing need", () => {
    expect(home).toMatch(/<html lang="it">/);
    expect(home).toMatch(/<head>\n<meta charset="utf-8">/);
    for (const t of [
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="theme-color" content="#b91c1c">',
      '<meta name="color-scheme" content="light">',
      '<meta property="og:title" content="Home · Luigi\'s">',
      '<meta property="og:description" content="Fresh pasta in Brooklyn.">',
      '<meta property="og:image" content="https://img.example/hero.jpg">',
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="Luigi\'s Trattoria">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<link rel="manifest" href="site.webmanifest">',
    ])
      expect(home).toContain(t);
    expect(home).toMatch(/<link rel="icon" href="data:image\/svg\+xml,[^"]*%F0%9F%8D%9D/);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)![1]);
    expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Luigi's Trattoria", url: "https://luigis.example/", telephone: "+1 718-555-0142", sameAs: ["https://instagram.com/luigis"] });
    expect(out["menu.html"]).not.toContain("application/ld+json");
  });

  it("makes pictures and links load and behave better", () => {
    expect(home).toMatch(/<img decoding="async" src="https:\/\/img\.example\/hero\.jpg"/);
    expect(home).toMatch(/<img decoding="async" loading="lazy" src="https:\/\/img\.example\/pasta\.jpg"/);
    const oven = /<img[^>]*src="images\/site-1\.jpg"[^>]*>/.exec(home)![0];
    for (const attr of ['width="800"', 'height="600"', 'loading="lazy"', 'decoding="async"']) expect(oven).toContain(attr);
    expect(home).toContain('<a href="https://instagram.com/luigis" target="_blank" rel="noopener noreferrer">Instagram<span class="sr-only"> (opens in a new tab)</span></a>');
    expect(home).toContain('href="tel:+17185550142"');
    expect(home).toContain('href="https://www.opentable.com/luigis"');
  });

  it("adds a sitemap, robots.txt, a 404 page and a manifest, in the site's design", () => {
    expect(out["sitemap.xml"]).toContain("<loc>https://luigis.example/</loc>");
    expect(out["sitemap.xml"]).toContain("<loc>https://luigis.example/menu.html</loc>");
    expect(out["robots.txt"]).toContain("Sitemap: https://luigis.example/sitemap.xml");
    expect(out["404.html"]).toContain('<nav aria-label="Main">');
    expect(out["404.html"]).toMatch(/<h1[^>]*>This page couldn&apos;t be found<\/h1>/);
    expect(out["404.html"]).toContain('<meta name="robots" content="noindex">');
    expect(out["sitemap.xml"]).not.toContain("404");
    expect(JSON.parse(out["site.webmanifest"])).toMatchObject({ name: "Luigi's Trattoria", theme_color: "#b91c1c" });
    expect(validateSite(out).filter((i) => !/script|placeholder/.test(i.message))).toEqual([]);
  });

  it("changes nothing the second time, and keeps what the AI already wrote", () => {
    expect(polishSite(out, info)).toEqual(out);
    const own = polishSite({ "index.html": page("Home").replace("<title>", '<meta property="og:title" content="Mine"><title>'), "robots.txt": "User-agent: *\nDisallow:" }, info);
    expect(own["index.html"].match(/og:title/g)).toHaveLength(1);
    expect(own["robots.txt"]).toBe("User-agent: *\nDisallow:");
  });
});

describe("quality checks for AI mistakes", () => {
  const issues = (extra: string) => pageA11yIssues("index.html", page("Home", extra).replace("<html>", '<html lang="en">'));
  it("finds dead links, placeholder text, vague picture descriptions and loud autoplay", () => {
    expect(issues('<a href="#">Our menu</a>').join()).toMatch(/link that goes nowhere \("Our menu"\)/);
    expect(issues("<p>Lorem ipsum dolor sit amet</p>").join()).toMatch(/placeholder text \("Lorem ipsum"\)/i);
    expect(issues("<p>Call [your phone number]</p>").join()).toMatch(/placeholder text/);
    expect(issues('<img src="x.jpg" alt="IMG_2041.jpg">').join()).toMatch(/described only as "IMG_2041\.jpg"/);
    expect(issues('<video src="v.mp4" autoplay></video>').join()).toMatch(/plays by itself with sound/);
    expect(issues('<video src="v.mp4" autoplay muted></video><a href="#main">Back up</a>').join()).not.toMatch(/sound|nowhere/);
  });
});
