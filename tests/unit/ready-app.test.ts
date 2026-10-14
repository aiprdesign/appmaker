import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, templateSlug } from "@/lib/templates";
import { READY_PRESETS, stagesOf, infoFromSite, parseItemList, readyAppFiles, readyDesign, readyListing, readyRules } from "@/lib/ready-app";
import { validateApp, isLucideIcon } from "@/lib/validate";
import { designIssues } from "@/lib/app-design";
import { parseRules } from "@/lib/app-data";

describe("ready-made business apps", () => {
  it("has one for every business template", () => {
    for (const t of BUSINESS_TEMPLATES) expect(READY_PRESETS[templateSlug(t)], t.title).toBeDefined();
  });
  for (const [slug, preset] of Object.entries(READY_PRESETS)) {
    it(`${slug}: passes the app and design checks`, () => {
      const files = readyAppFiles(preset, preset.sample, readyDesign(preset.sample, slug));
      expect(validateApp(files), slug).toEqual([]);
      expect(designIssues(files), slug).toEqual([]);
      for (const icon of [preset.itemsIcon, preset.heroIcon, ...stagesOf(preset).map((st) => st[2])]) expect(isLucideIcon(icon), icon).toBe(true);
      // The tracker's steps are the statuses staff set, in order, and finishing one is recognised as done.
      expect(readyRules(preset, preset.sample).requests.statuses).toEqual([...stagesOf(preset).map((st) => st[0]), "cancelled"]);
      // The rules are ones Appmaker's database accepts as they are.
      expect(parseRules(readyRules(preset, preset.sample))).toEqual(readyRules(preset, preset.sample));
      const listing = readyListing(slug, preset, preset.sample, "x");
      expect(listing.name.length).toBeLessThanOrEqual(30);
      expect(listing.subtitle.length).toBeLessThanOrEqual(30);
    });
  }
  it("puts the owner's details in the app, safely", () => {
    const p = READY_PRESETS["pizza-takeaway"];
    const files = readyAppFiles(p, { ...p.sample, name: 'Mario\'s "Best" </script>', phone: "+44 20 7946 0000" }, readyDesign(p.sample, "pizza"));
    expect(files["src/business.js"]).toContain('"name": "Mario\'s \\"Best\\" </script>"');
    expect(files["src/business.js"]).toContain("+44 20 7946 0000");
  });
});

describe("adding items quickly", () => {
  it("reads a pasted menu: categories, names, descriptions and prices", () => {
    expect(
      parseItemList("Pizza:\n• Margherita - Tomato, basil - $11\nPepperoni $13\n\nDrinks:\nCola 330 ml, 2.50\nWater | Still or sparkling | £1.50\nTasting menu\n"),
    ).toEqual([
      { name: "Margherita", description: "Tomato, basil", price: "$11", category: "Pizza" },
      { name: "Pepperoni", description: "", price: "$13", category: "Pizza" },
      { name: "Cola 330 ml", description: "", price: "2.50", category: "Drinks" },
      { name: "Water", description: "Still or sparkling", price: "£1.50", category: "Drinks" },
      { name: "Tasting menu", description: "", price: "", category: "Drinks" },
    ]);
  });

  it("fills the details in from the business's website", () => {
    const p = READY_PRESETS["pizza-takeaway"];
    const { info, photos } = infoFromSite(
      {
        url: "https://luigis.example",
        siteName: "Luigi's",
        title: "",
        description: "Wood-fired pizza in Leeds. Since 1998.",
        colors: ["#0a7d32"],
        language: "en",
        pages: [],
        images: ["https://luigis.example/oven.jpg", "http://old.example/x.jpg"],
        contact: { phones: ["+44 113 000 0000"], emails: [], hours: ["Mo-Su 12:00-22:00"], social: [], whatsapp: "https://wa.me/441130000000" },
        items: [{ name: "Diavola", description: "", price: "£13.50", category: "Pizza", image: "https://luigis.example/diavola.jpg" }],
      },
      p.sample,
    );
    expect(info).toMatchObject({ name: "Luigi's", tagline: "Wood-fired pizza in Leeds", phone: "+44 113 000 0000", whatsapp: "+441130000000", hours: "Mo-Su 12:00-22:00", color: "#0a7d32", email: p.sample.email });
    expect(info.items).toEqual([{ name: "Diavola", description: "", price: "£13.50", category: "Pizza", image: "https://luigis.example/diavola.jpg" }]);
    expect(photos).toEqual(["https://luigis.example/diavola.jpg", "https://luigis.example/oven.jpg"]);
  });

  it("keeps only https photo links in the app", () => {
    const p = READY_PRESETS.bakery;
    const rules = readyRules(p, { ...p.sample, items: [{ ...p.sample.items[0], image: "javascript:alert(1)" }, { ...p.sample.items[1], image: "https://x.example/a.jpg" }] });
    expect(rules.items.seed!.map((i) => i.image)).toEqual([undefined, "https://x.example/a.jpg"]);
  });
});
