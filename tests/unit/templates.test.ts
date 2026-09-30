import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_TEMPLATES, TEMPLATES, templateImage, templateSlug } from "@/lib/templates";

describe("templates", () => {
  it("every template has its app screenshot (run scripts/template-screens.ts after adding one)", () => {
    for (const t of [...TEMPLATES, ...BUSINESS_TEMPLATES]) {
      expect(existsSync(path.join("public", templateImage(t))), t.title).toBe(true);
    }
  });

  it("makes URL-safe names", () => {
    expect(templateSlug({ title: "Restaurant or café" })).toBe("restaurant-or-cafe");
    expect(templateSlug({ title: "Gym or studio" })).toBe("gym-or-studio");
  });
});
