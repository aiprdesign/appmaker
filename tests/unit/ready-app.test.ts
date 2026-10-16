import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, templateSlug } from "@/lib/templates";
import { READY_PRESETS, matchReadyPreset, readyProjectFromSite, mergeReadyRules, stagesOf, infoFromSite, parseItemList, readyAppFiles, readyDesign, readyListing, readyRules } from "@/lib/ready-app";
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

describe("the owner's details and the app's data", () => {
  it("only change the menu: collections, fields and statuses added later are kept", () => {
    const p = READY_PRESETS["pizza-takeaway"];
    const later = {
      ...readyRules(p, p.sample),
      reviews: { access: "shared" as const, fields: ["name", "rating", "text"] },
      requests: { access: "inbox" as const, fields: ["name", "phone", "items", "table"], statuses: ["new", "ready", "cancelled"] },
    };
    const merged = mergeReadyRules(p, { ...p.sample, items: [{ name: "Calzone", description: "", price: "12", category: "Pizza" }] }, later);
    expect(merged.reviews).toEqual(later.reviews);
    expect(merged.requests).toEqual(later.requests);
    expect(merged.items.seed).toEqual([{ name: "Calzone", description: "", price: "12", category: "Pizza" }]);
    expect(mergeReadyRules(p, p.sample, null)).toEqual(readyRules(p, p.sample));
  });
});

describe("URL to App picks the ready-made app that fits", () => {
  const site = (siteName: string, description: string, text = "") => ({ siteName, title: siteName, description, pages: [{ url: "", title: "", headings: [], navigation: [], text }] });
  it("matches businesses a template fits", () => {
    expect(matchReadyPreset(site("Tony's", "Stone-baked pizza, takeaway and delivery in Leeds"))).toBe("pizza-takeaway");
    expect(matchReadyPreset(site("Fade Lab", "Barbershop in Camden: skin fades, beard trims", "Book your haircut"))).toBe("salon-or-barber");
    expect(matchReadyPreset(site("Northside Motors", "MOT, servicing and repairs. Family-run garage since 1990."))).toBe("car-repair-auto-shop");
    expect(matchReadyPreset(site("Bright Smiles", "Friendly family dentist", "New patients welcome. Dental check-ups and hygiene."))).toBe("clinic-or-dentist");
    expect(matchReadyPreset(site("Sparkle", "Domestic cleaners and end of tenancy cleaning"))).toBe("cleaning-service");
  });
  it("leaves sites that don't need orders or a business area to the AI", () => {
    expect(matchReadyPreset(site("Jane Doe", "Photographer and visual artist. Selected work, exhibitions and contact."))).toBeNull();
    expect(matchReadyPreset(site("Notes on Rust", "A blog about systems programming"))).toBeNull();
  });
  it("fills the app from the site and never shows the example business's contact details", () => {
    const p = readyProjectFromSite("pizza-takeaway", { title: "Pizza & takeaway", emoji: "🍕", prompt: "pizza" }, {
      url: "https://tonys.example",
      siteName: "Tony's",
      title: "",
      description: "Stone-baked pizza.",
      colors: [],
      language: "en",
      pages: [],
      contact: { phones: ["+44 1"], emails: [], hours: [], social: [] },
    });
    expect(p.ready.info).toMatchObject({ name: "Tony's", phone: "+44 1", email: "", address: "", hours: "" });
    expect(p.examples).toBe(true);
    expect(p.files["src/business.js"]).not.toContain("12 High Street");
  });
});

import { safePayLink, businessModule, PAY_URL_JS } from "@/lib/ready-app";

describe("online payment link", () => {
  it("accepts payment services only, over https", () => {
    expect(safePayLink("paypal.me/tonyspizza")).toBe("https://paypal.me/tonyspizza");
    expect(safePayLink("https://buy.stripe.com/abc123/")).toBe("https://buy.stripe.com/abc123");
    expect(safePayLink("https://evil.example/pay")).toBe("");
    expect(safePayLink("javascript:alert(1)")).toBe("");
    expect(safePayLink("")).toBe("");
    expect(safePayLink("paypal.me")).toBe("");
    expect(safePayLink("https://account.venmo.com/u/tonys")).toBe("https://account.venmo.com/u/tonys");
    expect(safePayLink("cash.app/$tonys")).toBe("https://cash.app/$tonys");
  });
  it("puts the link in the app's business details", () => {
    const preset = READY_PRESETS["pizza-takeaway"];
    expect(businessModule(preset, { ...preset.sample, payLink: "paypal.me/tonys" })).toContain('"payLink": "https://paypal.me/tonys"');
    expect(businessModule(preset, { ...preset.sample, payLink: "paypal.me/tonys" })).toContain('"payWhen": "now"');
    expect(businessModule(preset, { ...preset.sample, payLink: "paypal.me/tonys", payWhen: "accepted" })).toContain('"payWhen": "accepted"');
    // The app's payment code is written into the app exactly as tested here.
    expect(readyAppFiles(preset, { ...preset.sample, payLink: "paypal.me/tonys" }, readyDesign(preset.sample, "x"))["src/actions.js"]).toContain(PAY_URL_JS);
  });
});

describe("payment page for an order", () => {
  const payUrl = new Function(`${PAY_URL_JS}; return payUrl;`)() as (link: string, total?: string, ref?: string) => string;
  it("fills in the amount where the service allows it", () => {
    expect(payUrl("https://paypal.me/tonys", "$26.50", "A12")).toBe("https://paypal.me/tonys/26.50");
    expect(payUrl("https://cash.app/$tonys", "$26", "A12")).toBe("https://cash.app/$tonys/26");
    expect(payUrl("https://venmo.com/u/tonys", "$26", "A12")).toBe("https://venmo.com/?txn=pay&recipients=tonys&amount=26&note=Order%20%23A12");
    expect(payUrl("https://paypal.me/tonys", "26,50 €")).toBe("https://paypal.me/tonys/26.50");
  });
  it("opens the plain link otherwise", () => {
    expect(payUrl("https://buy.stripe.com/abc", "$26")).toBe("https://buy.stripe.com/abc");
    expect(payUrl("https://paypal.me/tonys", "")).toBe("https://paypal.me/tonys");
  });
});
