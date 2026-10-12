import { describe, expect, it } from "vitest";
import { addEdit, applyEdit, applyEdits, editsNote, sectionKey, selectedSite } from "@/lib/site-content";
import type { SiteSummary } from "@/lib/types";

describe("the owner's content choices", () => {
  it("leaves out the sections the owner unticked, and nothing else", () => {
    const site = {
      siteName: "Luigi's",
      url: "https://l.example/",
      colors: [],
      pages: [
        { url: "https://l.example/", title: "", headings: [], navigation: [], text: "", sections: [{ heading: "A", text: "", images: [] }, { heading: "B", text: "", images: [] }] },
        { url: "https://l.example/about", title: "", headings: [], navigation: [], text: "", sections: [{ heading: "C", text: "", images: [] }] },
      ],
    } as unknown as SiteSummary;
    const picked = selectedSite(site, [sectionKey("https://l.example/", 1)])!;
    expect(picked.pages[0].sections!.map((s) => s.heading)).toEqual(["A"]);
    expect(picked.pages[1].sections!.map((s) => s.heading)).toEqual(["C"]);
    expect(site.pages[0].sections).toHaveLength(2);
    expect(selectedSite(site, [])).toBe(site);
  });

  it("changes text on every page and every design, safely", () => {
    const files = {
      "index.html": `<h1 class="text-6xl">\n  Fresh bread every morning\n</h1><p>Baked by hand &amp; with love.</p><a href="#">Book a table</a>`,
      "about.html": `<h2>Fresh bread every morning</h2><p>Book a table</p>`,
      "styles.css": "/* Fresh bread every morning */",
    };
    const one = applyEdit(files, { from: "Fresh bread every morning", to: "Warm bread <daily> & more" });
    expect(one.changed).toBe(2);
    expect(one.files["index.html"]).toContain(">\n  Warm bread &lt;daily&gt; &amp; more\n</h1>");
    expect(one.files["about.html"]).toContain("<h2>Warm bread &lt;daily&gt; &amp; more</h2>");
    expect(one.files["styles.css"]).toBe(files["styles.css"]);
    // Text with an entity in the HTML still matches.
    expect(applyEdit(files, { from: "Baked by hand & with love.", to: "Baked by hand." }).files["index.html"]).toContain("<p>Baked by hand.</p>");
    // Only whole element texts: "Book a table" inside a longer text isn't touched.
    expect(applyEdit({ "a.html": "<p>Book a table today</p>" }, { from: "Book a table", to: "Reserve" }).changed).toBe(0);
    // Saved edits keep the owner's words after the AI rewrites a page.
    const edits = addEdit(addEdit([], { from: "Book a table", to: "Reserve" }), { from: "Reserve", to: "Reserve now" });
    expect(edits).toEqual([{ from: "Book a table", to: "Reserve now" }]);
    expect(applyEdits({ "x.html": "<a>Book a table</a>" }, edits)["x.html"]).toBe("<a>Reserve now</a>");
    expect(editsNote(edits)).toContain("“Book a table” is now “Reserve now”");
    expect(editsNote([])).toBe("");
  });
});
