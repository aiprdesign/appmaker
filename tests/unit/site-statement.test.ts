import { describe, expect, it } from "vitest";
import { conformanceText, statementPage, withStatement, STATEMENT_FILE } from "@/lib/site-statement";
import { pageA11yIssues, validateSite } from "@/lib/website";

const home = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home · Luigi's</title><meta name="description" content="Pasta."><link rel="canonical" href="https://luigis.example/"><script src="https://cdn.tailwindcss.com"></script></head>
<body><a href="#main">Skip to content</a><header><nav aria-label="Main"><a href="index.html" aria-current="page">Home</a><a href="menu.html">Menu</a></nav></header>
<main id="main"><h1>Luigi's Trattoria</h1><p>Pasta.</p></main><footer><p>© Luigi's</p></footer></body></html>`;
const files = { "index.html": home, "menu.html": home.replace("Home · ", "Menu · "), "blog/news.html": home };
const day = Date.UTC(2026, 9, 12);

describe("accessibility statement", () => {
  it("is a page in the site's own design that passes the site's checks", () => {
    const page = statementPage(files, { siteName: "Luigi's Trattoria", email: "ciao@luigis.example", phone: "+1 718-555-0142" }, day);
    expect(page).toContain('<nav aria-label="Main">');
    expect(page).toContain("<footer><p>© Luigi's</p></footer>");
    expect(page).toContain("<title>Accessibility statement · Luigi&#39;s Trattoria</title>".replace("&#39;", "'"));
    expect(page).not.toContain("aria-current");
    expect(page).not.toContain('rel="canonical"');
    expect(page).toMatch(/<h1[^>]*>Accessibility statement<\/h1>/);
    expect(page).toContain("aims to meet <strong>WCAG 2.2 level AA</strong>");
    expect(page).toContain('href="mailto:ciao@luigis.example"');
    expect(page).toContain('href="tel:+17185550142"');
    expect(page).toContain("prepared on 12 October 2026");
    expect(pageA11yIssues(STATEMENT_FILE, page)).toEqual([]);
    const site = withStatement(files, { siteName: "Luigi's Trattoria" }, day);
    expect(validateSite({ ...site, "blog/news.html": site["blog/news.html"] }).filter((i) => i.file === STATEMENT_FILE)).toEqual([]);
  });

  it("never claims full conformance from automated checks, and says what they found", () => {
    expect(conformanceText().status).toBe("Partially conformant");
    expect(conformanceText().detail).toMatch(/not yet been fully tested/);
    const clean = conformanceText({ checkedAt: day, pages: [{ page: "index.html", issues: [] }, { page: "menu.html", issues: [] }] });
    expect(clean.status).toBe("Partially conformant");
    expect(clean.detail).toMatch(/On 12 October 2026, automated checks of all 2 pages .* found no failures\. Automated tools can only detect some/);
    const some = conformanceText({ checkedAt: day, pages: [{ page: "index.html", issues: [{ id: "color-contrast", impact: "serious", help: "Contrast", count: 3 }] }, { page: "menu.html", issues: [] }] });
    expect(some.detail).toMatch(/found 3 issues on 1 of 2 pages\. We are fixing them/);
  });

  it("is linked from every footer once, and an owner's own statement is kept", () => {
    const site = withStatement(files, { siteName: "Luigi's" }, day);
    expect(site["index.html"]).toMatch(/<a href="accessibility\.html"[^>]*>Accessibility statement<\/a><\/p>\n<\/footer>/);
    expect(site["blog/news.html"]).toContain('href="../accessibility.html"');
    expect(withStatement(site, { siteName: "Luigi's" }, day)["index.html"].match(/accessibility\.html/g)).toHaveLength(1);
    const own = withStatement({ ...files, [STATEMENT_FILE]: "<html><body>Our own statement</body></html>" }, { siteName: "Luigi's" }, day);
    expect(own[STATEMENT_FILE]).toBe("<html><body>Our own statement</body></html>");
    expect(withStatement({ "menu.html": home }, { siteName: "x" })).toEqual({ "menu.html": home });
  });
});
