import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, templateSlug } from "@/lib/templates";
import { READY_PRESETS, readyAppFiles, readyDesign, readyListing, readyRules } from "@/lib/ready-app";
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
      for (const icon of [preset.itemsIcon, preset.heroIcon]) expect(isLucideIcon(icon), icon).toBe(true);
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
