import { describe, expect, it } from "vitest";
import { contrast, PALETTES } from "@/lib/design";
import { defaultCaptions, palette, SHOT_SIZES, FEATURE_GRAPHIC } from "@/lib/store-shots";

describe("store screenshots", () => {
  it("uses the sizes the stores ask for", () => {
    expect(SHOT_SIZES.apple).toMatchObject({ w: 1290, h: 2796 });
    expect(SHOT_SIZES.google).toMatchObject({ w: 1080, h: 1920 });
    // Google Play: the long side at most twice the short side.
    expect(SHOT_SIZES.google.h / SHOT_SIZES.google.w).toBeLessThanOrEqual(2);
    expect(FEATURE_GRAPHIC).toEqual({ w: 1024, h: 500 });
  });

  it("keeps headlines readable (4.5:1) on every background, for any brand color", () => {
    for (const color of [...PALETTES.map((p) => p.primary), "#FFFF00", "#00FFFF", "#FF69B4", "#FFFFFF", "#000000", "#808080", "not a color"]) {
      for (const style of ["brand", "light", "dark"] as const) {
        const p = palette(style, color);
        for (const text of [p.title, p.subtitle]) for (const bg of [p.from, p.to]) expect(contrast(text, bg), `${color} ${style}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("starts with short headlines from the listing", () => {
    const listing = {
      name: "Streakly",
      subtitle: "Build habits that stick",
      description:
        "Streakly makes building good habits effortless and fun for everyone. Check off habits in one tap. See your longest streak.\n\nPrivate by design.",
      keywords: "",
      category: "",
      bundleId: "",
      primaryColor: "#6D28D9",
      iconEmoji: "✅",
      privacyNotes: "",
    };
    const c = defaultCaptions(listing, 4);
    expect(c[0]).toEqual({ title: "Build habits that stick", subtitle: "Streakly" });
    expect(c.slice(1).map((x) => x.title)).toEqual(["Check off habits in one tap", "See your longest streak", "Private by design"]);
    for (const x of c) expect(x.title.length).toBeLessThanOrEqual(38);
  });
});
