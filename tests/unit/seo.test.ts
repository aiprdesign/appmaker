import { describe, expect, it } from "vitest";
import { SEO_PAGES, seoPage } from "@/lib/seo";
import { BUSINESS_TEMPLATES } from "@/lib/templates";

describe("SEO landing pages", () => {
  it("has one page per business template, plus the guides, each with its own address, title and heading", () => {
    expect(SEO_PAGES.filter((p) => p.template)).toHaveLength(BUSINESS_TEMPLATES.length);
    for (const key of ["path", "title", "h1", "description"] as const) expect(new Set(SEO_PAGES.map((p) => p[key])).size).toBe(SEO_PAGES.length);
    expect(seoPage("/apps/pizza-takeaway")?.h1).toBe("Pizza & takeaway ordering app");
    expect(seoPage("/apps/church-or-community")?.h1).toBe("Church & community app");
  });
  it("keeps titles and descriptions the length search engines show, and the text short", () => {
    for (const p of SEO_PAGES) {
      expect(p.title.length, p.title).toBeLessThanOrEqual(70);
      expect(p.description.length, p.description).toBeGreaterThan(70);
      expect(p.description.length, p.description).toBeLessThanOrEqual(165);
      expect(p.benefits).toHaveLength(3);
      expect(p.faq.length).toBeGreaterThanOrEqual(2);
      expect(p.path).toMatch(/^\/[a-z0-9/-]+$/);
    }
  });
});
