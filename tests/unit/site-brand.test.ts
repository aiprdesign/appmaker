import { describe, expect, it } from "vitest";
import { heroCssImages, logoCssImages, summarizeHtml } from "@/lib/site";
import { formatSite } from "@/lib/prompt";
import { contentIssues, ensureBrand } from "@/lib/website";
import type { SiteSummary } from "@/lib/types";

/**
 * Quality rounds for website redesigns: on the ways real sites put their logo and
 * hero picture on the home page, the importer finds both (the logo first, the hero
 * as the first picture), and every design then shows them.
 */
const page = (body: string, head = "") => `<!doctype html><html lang="en"><head><title>Bella Pizza</title>${head}</head><body>${body}<main><h2>About us</h2><p>Wood-fired pizza since 1998, made with our own dough every morning.</p><img src="/img/oven.jpg" width="800" height="600" alt="Our oven"></main></body></html>`;

const SITES: { name: string; html: string; logo: string; hero: string }[] = [
  {
    name: "WordPress custom logo and cover block",
    html: page(
      `<header><div class="site-branding"><a href="/" class="custom-logo-link"><img class="custom-logo" src="/wp-content/uploads/2024/01/bella.png" width="200" height="60" alt="Bella Pizza"></a></div></header>
       <div class="wp-block-cover"><img class="wp-block-cover__image-background" src="/wp-content/uploads/2024/01/hero.jpg" alt=""><h1>Pizza night</h1></div>`,
    ),
    logo: "https://bella.example/wp-content/uploads/2024/01/bella.png",
    hero: "https://bella.example/wp-content/uploads/2024/01/hero.jpg",
  },
  {
    name: "SVG logo in a navbar brand, hero background inline",
    html: page(`<nav><a class="navbar-brand" href="/"><img src="/img/bella.svg" alt="Bella"></a></nav><section class="hero" style="background-image:url('/img/hero-bg.jpg')"><h1>Pizza night</h1></section>`),
    logo: "https://bella.example/img/bella.svg",
    hero: "https://bella.example/img/hero-bg.jpg",
  },
  {
    name: "unlabelled header picture linking home, hero in a style block",
    html: page(`<header><a href="https://bella.example/"><img src="/assets/mark.png" alt="Bella"></a></header><section class="intro-banner"><h1>Pizza night</h1></section>`, `<style>.intro-banner{background:#000 url(/img/big.jpg) center/cover}</style>`),
    logo: "https://bella.example/assets/mark.png",
    hero: "https://bella.example/img/big.jpg",
  },
  {
    name: "lazy-loaded logo and a slider",
    html: page(
      `<header><img class="lazyload" src="data:image/gif;base64,R0lGOD" data-src="/logo-small.png" alt="Shop logo" height="40"></header>
       <div class="rs-slider"><div class="rs-slide"><img src="/dummy.png" data-lazyload="/slides/one.jpg" alt=""></div><div class="rs-slide"><img src="/dummy.png" data-lazyload="/slides/two.jpg" alt=""></div></div>`,
    ),
    logo: "https://bella.example/logo-small.png",
    hero: "https://bella.example/slides/one.jpg",
  },
  {
    name: "theme custom property and a hero video poster",
    html: page(`<header><a href="/" id="logo"><img src="/brand/bella-wordmark.webp" alt="Bella"></a></header><section class="top" style="--bg-image:url(/img/hero.webp)"><video poster="/img/poster.jpg" autoplay muted></video><h1>Pizza night</h1></section>`),
    logo: "https://bella.example/brand/bella-wordmark.webp",
    hero: "https://bella.example/img/poster.jpg",
  },
  {
    name: "picture element with srcset in the hero, logo in a wrapper",
    html: page(`<header><div class="header__logo"><a href="/index.html"><img src="/i/b.png" alt="Bella"></a></div></header><div class="masthead"><picture><source srcset="/i/hero-800.webp 800w, /i/hero-1600.webp 1600w"><img src="/i/hero-800.jpg" alt=""></picture><h1>Pizza night</h1></div>`),
    logo: "https://bella.example/i/b.png",
    hero: "https://bella.example/i/hero-1600.webp",
  },
  {
    name: "client logos aren't the business's logo",
    html: page(`<header><a href="/" class="logo"><img src="/me.png" alt="Bella"></a></header><div class="banner" data-bg="/img/banner.jpg"><h1>Pizza night</h1></div><section class="clients"><h2>Trusted by</h2><img class="logo" src="/c/acme.png" width="120" height="40" alt="Acme"><img class="logo" src="/c/globex.png" width="120" height="40" alt="Globex"><img class="logo" src="/c/initech.png" width="120" height="40" alt="Initech"></section>`),
    logo: "https://bella.example/me.png",
    hero: "https://bella.example/img/banner.jpg",
  },
  {
    name: "home link to the www address, logo with no hint",
    html: page(`<div class="top-bar"><a href="https://www.bella.example/"><img src="/files/b-mark.png" alt="Bella"></a></div><header><a href="#"><img src="/files/wordmark.png" alt="Bella Pizza"></a></header><div class="hero" style="background:url(/files/h.jpg)"><h1>Pizza night</h1></div>`),
    logo: "https://bella.example/files/wordmark.png",
    hero: "https://bella.example/files/h.jpg",
  },
  {
    name: "logo as a background picture",
    html: page(`<header><a href="/" class="site-logo" style="background-image:url('/img/logo-bg.png')">Bella</a></header><section class="hero"><img src="/img/hero2.jpg" alt=""><h1>Pizza night</h1></section>`),
    logo: "https://bella.example/img/logo-bg.png",
    hero: "https://bella.example/img/hero2.jpg",
  },
  {
    name: "structured data logo, http pictures upgraded",
    html: page(`<script type="application/ld+json">{"@type":"Restaurant","logo":"http://bella.example/ld-logo.png"}</script><div class="hero"><img src="http://bella.example/hero-http.jpg" alt=""></div>`),
    logo: "https://bella.example/ld-logo.png",
    hero: "https://bella.example/hero-http.jpg",
  },
];

describe("redesign quality rounds: logo and hero picture", () => {
  for (const round of [1, 2]) {
    for (const s of SITES) {
      it(`round ${round}: ${s.name}`, () => {
        const { details } = summarizeHtml(s.html, new URL("https://bella.example/"));
        expect(details.logos[0]).toBe(s.logo);
        expect(details.images[0]).toBe(s.hero);
        expect(details.images).not.toContain(s.logo);
      });
    }
  }

  it("keeps a logo the site draws inline as SVG (without scripts)", () => {
    const paths = '<path d="M10 10 L 90 10 L 90 30 L 10 30 Z M 20 15 L 80 15 L 80 25 L 20 25 Z" fill="currentColor"/>'.repeat(4);
    const html = page(`<header><a href="/" class="brand" aria-label="Bella"><svg viewBox="0 0 100 40" onload="alert(1)">${paths}<script>alert(1)</script></svg></a></header>`);
    const { details } = summarizeHtml(html, new URL("https://bella.example/"));
    expect(details.logos).toEqual([]);
    expect(details.logoSvg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(details.logoSvg).not.toMatch(/script|onload|currentColor/);
  });

  it("finds logos set in stylesheets", () => {
    expect(logoCssImages(".site-logo a{background:url(../img/logo.svg) no-repeat} .clients .logo{background:url(/c.png)}", new URL("https://a.example/css/x.css"))).toEqual(["https://a.example/img/logo.svg"]);
  });

  it("gives the AI the saved logo's path", () => {
    const text = formatSite({ url: "https://bella.example/", siteName: "Bella", title: "", description: "", colors: [], language: "en", pages: [], logo: "https://bella.example/broken.png", logoPath: "images/logo.svg" });
    expect(text).toContain("Logo: images/logo.svg (the business's own logo: use exactly this picture in the header and the footer of every page)");
  });

  it("finds hero backgrounds in stylesheets", () => {
    expect(heroCssImages(".hero-section{background-image:url(../img/h.jpg)} .card{background:url(/x.jpg)}", new URL("https://a.example/css/site.css"))).toEqual(["https://a.example/img/h.jpg"]);
  });

  const site = { url: "https://bella.example/", siteName: "Bella Pizza", title: "", description: "", colors: [], logo: "https://bella.example/logo.png", images: ["https://bella.example/hero.jpg", "https://bella.example/oven.jpg"] } as unknown as SiteSummary;
  const design = {
    "index.html": `<html><body><header class="sticky"><a href="index.html" class="font-bold">Bella Pizza</a><nav><a href="menu.html">Menu</a></nav></header><main><section class="hero"><h1>Pizza night</h1></section><section><h2>Menu</h2></section></main></body></html>`,
    "menu.html": `<html><body><header><a href="index.html"></a></header><main><section><h1>Menu</h1></section></main></body></html>`,
  };

  it("every design shows the logo on each page and a real photo on the home page", () => {
    const issues = contentIssues(design, site);
    expect(issues.filter((i) => /logo/.test(i.message)).map((i) => i.file).sort()).toEqual(["index.html", "menu.html"]);
    expect(issues.some((i) => /none of the current site's photos/.test(i.message))).toBe(true);
    const { files, added } = ensureBrand(design, site);
    expect(added).toBe(3);
    // Beside the name, the logo has empty alt text; alone, it's named.
    expect(files["index.html"]).toContain(`<a href="index.html" class="font-bold"><img src="https://bella.example/logo.png" alt=""`);
    expect(files["menu.html"]).toContain(`alt="Bella Pizza"`);
    expect(files["index.html"].indexOf("hero.jpg")).toBeLessThan(files["index.html"].indexOf("<h2>Menu"));
    expect(contentIssues(files, site).filter((i) => /logo|photos/.test(i.message))).toEqual([]);
    // Nothing to add twice.
    expect(ensureBrand(files, site).added).toBe(0);
  });

  it("puts the logo in the footer too, and in a page with no header at all", () => {
    const local = { ...site, logo: undefined, logoPath: "images/logo.png" } as unknown as SiteSummary;
    const pages = {
      "index.html": `<html><body><header><a href="index.html"><img src="images/logo.png" alt="Bella"></a></header><main><section><img src="https://bella.example/hero.jpg" alt=""></section></main><footer class="bg-black"><div class="grid"><p>© Bella</p></div></footer></body></html>`,
      "about.html": `<html><body><main><h1>About</h1></main><footer><p>© Bella</p></footer></body></html>`,
    };
    expect(contentIssues(pages, local).map((i) => `${i.file}: ${i.message.split(":")[0]}`)).toEqual([
      "about.html: the business's logo images/logo.png is missing from the header",
      "index.html: the business's logo images/logo.png is missing from the footer",
      "about.html: the business's logo images/logo.png is missing from the footer",
    ]);
    const { files, added } = ensureBrand(pages, local);
    expect(added).toBe(3);
    expect(files["index.html"]).toContain(`<footer class="bg-black"><div class="grid">\n<a href="index.html" class="brand-footer-logo`);
    expect(files["about.html"]).toMatch(/<body>\n<header class="brand-bar[^"]*"><a href="index.html"><img src="images\/logo.png" alt="Bella Pizza"/);
    expect(contentIssues(files, local).filter((i) => /logo/.test(i.message))).toEqual([]);
  });
});
