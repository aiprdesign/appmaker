import { describe, expect, it } from "vitest";
import { autoDesign, contrast, PALETTES, themeFor, themeModule } from "@/lib/design";
import { applyStyle, DESIGN_STYLES, getStyle, pickStyle, STYLE_CATEGORIES, styleBrief } from "@/lib/styles";
import { buildUserMessage, SYSTEM_PROMPT } from "@/lib/prompt";
import { validateApp } from "@/lib/validate";

const base = { primary: "#4F46E5", mode: "auto", corners: "rounded", cards: "raised", headings: "bold" } as const;

describe("design styles", () => {
  it("has a dozen styles across six categories, each with a full look and layout direction", () => {
    expect(DESIGN_STYLES.length).toBeGreaterThanOrEqual(12);
    for (const c of STYLE_CATEGORIES) expect(DESIGN_STYLES.filter((s) => s.category === c.id).length, c.id).toBeGreaterThanOrEqual(2);
    expect(new Set(DESIGN_STYLES.map((s) => s.id)).size).toBe(DESIGN_STYLES.length);
    for (const s of DESIGN_STYLES) expect(s.direction.length, s.id).toBeGreaterThan(150);
  });

  it("keeps every style readable with every color scheme, in light and dark (WCAG 2.1 AA)", () => {
    for (const style of DESIGN_STYLES) {
      for (const p of [...PALETTES, { id: "yellow", primary: "#FFFF00", accent: "#00FFFF" }]) {
        for (const mode of ["light", "dark"] as const) {
          const d = applyStyle({ ...base, primary: p.primary, accent: p.accent }, style, true);
          const t = themeFor(d, mode);
          const at = `${style.id} ${p.id} ${mode}`;
          const { colors } = t;
          for (const bg of [colors.background, colors.surface]) {
            expect(contrast(colors.text, bg), `${at} text`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(colors.muted, bg), `${at} muted`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(colors.primary, bg), `${at} primary`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(colors.outline, bg), `${at} outline`).toBeGreaterThanOrEqual(3);
          }
          expect(contrast(colors.onPrimary, colors.primary), `${at} button`).toBeGreaterThanOrEqual(4.5);
          for (const stop of t.backgroundGradient) expect(contrast(colors.muted, stop), `${at} muted on gradient`).toBeGreaterThanOrEqual(4.5);
          for (const stop of t.gradient) expect(contrast(t.onGradient, stop), `${at} on gradient`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("gives each style its own theme: surfaces, cards, type and labels", () => {
    const theme = (id: string, mode: "light" | "dark" = "light") => themeFor(applyStyle(base, getStyle(id)!, true), mode);
    expect(theme("brutalist").card).toMatchObject({ borderWidth: 2, boxShadow: "4px 4px 0px #0A0A0A" });
    expect(String(theme("clay").card.boxShadow)).toContain("inset");
    expect(theme("editorial").headingFamily).toBe("serif");
    expect(theme("neon").headingFamily).toBe("mono");
    expect(theme("organic").colors.background).toBe("#F4EFE6");
    expect(theme("swiss").labelCaps).toBe(true);
    expect(theme("calm").colors.background).not.toBe(theme("swiss").colors.background);
    // Dark-first styles start dark, with their signature colors unless the app keeps its own.
    expect(applyStyle(base, getStyle("luxe")!, false)).toMatchObject({ mode: "dark", primary: "#B08D57", style: "luxe" });
    expect(applyStyle(base, getStyle("luxe")!, true).primary).toBe("#4F46E5");
  });

  it("writes heading and label styles into src/theme.js, with a phone font for serif and mono", () => {
    const serif = themeModule(applyStyle(base, getStyle("editorial")!, true));
    expect(serif).toContain("import { Platform } from 'react-native';");
    expect(serif).toContain('const headingFamily = Platform.select({"ios":"Georgia","android":"serif"');
    expect(serif).toMatch(/export const heading = \{ fontFamily: headingFamily, fontWeight: "700", letterSpacing: -0\.3 \};/);
    expect(serif).toContain("textTransform: 'uppercase'");
    expect(serif).toContain('export const style = "editorial";');
    const plain = themeModule(base);
    expect(plain).not.toContain("Platform");
    expect(plain).toContain('export const heading = { fontWeight: "800", letterSpacing: -0.5 };');
    // A theme file in every style is a valid app file.
    for (const s of DESIGN_STYLES) {
      const app = `import React from 'react';\nimport { Text } from 'react-native';\nimport { heading, label } from './src/theme';\nexport default function App() { return <Text style={[heading, label]}>Hi</Text>; }\n`;
      expect(validateApp({ "App.js": app, "src/theme.js": themeModule(applyStyle(base, s, true)) }), s.id).toEqual([]);
    }
  });

  it("picks the style that suits the app, the one asked for first, and varies the rest", () => {
    expect(pickStyle("A meditation and sleep app").style.id).toBe("calm");
    expect(pickStyle("a workout tracker").style.id).toBe("bento");
    expect(pickStyle("An Italian restaurant").style.id).toBe("editorial");
    expect(pickStyle("a music playlist app for DJs").style.id).toBe("neon");
    expect(pickStyle("a luxury hotel concierge").style.id).toBe("luxe");
    expect(pickStyle("a fun quiz for kids").style.id).toBe("clay");
    expect(pickStyle("a gym app\n\nLook and feel: Neo-brutalist.").style.id).toBe("brutalist");
    expect(pickStyle("a gym app\n\nLook and feel: sleek and premium, refined typography.").style.id).toBe("luxe");
    expect(pickStyle("a gym app").why).toMatch(/fitness/);
    // Ideas that fit no kind still get different styles, the same one each time.
    const odd = ["a widget that counts pigeons", "an app for my book of jokes", "a coin flipper", "a random name generator", "a parking spot finder", "a karaoke lyric viewer"];
    const picked = odd.map((p) => pickStyle(p).style.id);
    expect(new Set(picked).size).toBeGreaterThanOrEqual(3);
    expect(odd.map((p) => pickStyle(p).style.id)).toEqual(picked);
  });

  it("tells the AI the app's style with every request", () => {
    const brief = styleBrief(getStyle("bento")!);
    expect(brief).toMatch(/^<design_style name="Bento grid">/);
    expect(buildUserMessage("a gym app", {}, undefined, undefined, getStyle("bento"))).toContain(brief);
    expect(buildUserMessage("make it blue", { "App.js": "x" }, {}, undefined, getStyle("bento"))).toContain(brief);
    expect(buildUserMessage("a gym app", {})).not.toContain("design_style");
    expect(SYSTEM_PROMPT).toContain("<design_style>");
    expect(SYSTEM_PROMPT).toContain("heading");
  });

  it("auto designs use the style picked for the app", () => {
    expect(autoDesign({ primaryColor: "#15803D" }, "a plant care app")).toMatchObject({ style: "organic", surface: "warm", font: "serif", primary: "#15803D" });
    expect(autoDesign({ primaryColor: "#15803D" }, "a DJ set planner")).toMatchObject({ style: "neon", mode: "dark", primary: "#8B5CF6" });
    expect(autoDesign({ primaryColor: "#15803D" }, "Turn our music club (club.example) into an app", true)).toMatchObject({ style: "neon", primary: "#15803D" });
  });
});
