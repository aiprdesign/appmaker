import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCodeSafety } from "@/lib/code-safety";
import { autoDesign, contrast, defaultDesign, PALETTES, THEME_FILE, themeFor, themeModule, usesTheme } from "@/lib/design";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import type { AppDesign } from "@/lib/types";
import { validateApp } from "@/lib/validate";

const APP = `import React from 'react';
import { View, Text } from 'react-native';
import { colors, card } from './src/theme';
export default function App() {
  return <View style={{ flex: 1, backgroundColor: colors.background }}><Text style={[card, { color: colors.text }]}>Hi</Text></View>;
}
`;

const designs: AppDesign[] = [];
for (const primary of [...PALETTES.map((p) => p.primary), "#FFFF00", "#00FFFF", "#111111", "#FF69B4"]) {
  for (const mode of ["light", "dark"] as const) designs.push({ primary, mode, corners: "rounded", cards: "raised", headings: "bold" });
}

describe("app design", () => {
  it("keeps every color scheme readable in light and dark mode (WCAG 2.1 AA)", () => {
    for (const d of designs) {
      const { colors } = themeFor(d);
      // The brand color is used as small text (links, tab labels, chips) on every background.
      for (const bg of [colors.background, colors.surface, colors.primarySoft])
        expect(contrast(colors.primary, bg), `${d.primary} ${d.mode} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      // Outlines of inputs and controls (1.4.11 non-text contrast).
      for (const bg of [colors.background, colors.surface]) expect(contrast(colors.outline, bg), `${d.primary} ${d.mode} outline`).toBeGreaterThanOrEqual(3);
      const label = `${d.primary} ${d.mode}`;
      expect(contrast(colors.text, colors.background), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.text, colors.surface), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.muted, colors.surface), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.muted, colors.background), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.onPrimary, colors.primary), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primary, colors.background), label).toBeGreaterThanOrEqual(3);
      expect(contrast(colors.text, colors.primarySoft), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.danger, colors.surface), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.success, colors.surface), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("starts from the app's brand color and falls back for a bad one", () => {
    expect(defaultDesign({ primaryColor: "#0369A1" }).primary).toBe("#0369A1");
    expect(defaultDesign({ primaryColor: "red; drop" }).primary).toBe(PALETTES[0].primary);
    expect(themeFor({ ...defaultDesign(), primary: "javascript:x" }).colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("maps corners, cards and headings", () => {
    const base = defaultDesign();
    expect(themeFor({ ...base, corners: "sharp" }).radius.lg).toBeLessThan(themeFor({ ...base, corners: "soft" }).radius.lg);
    expect(themeFor({ ...base, cards: "outlined" }).card).toMatchObject({ borderWidth: 1 });
    expect(themeFor({ ...base, cards: "flat" }).card).not.toHaveProperty("boxShadow");
    expect(themeFor({ ...base, headings: "light" }).font.heading).toBe("600");
    expect(defaultDesign().mode).toBe("auto");
  });

  it("in auto mode, the theme file follows the phone's light or dark setting", () => {
    const file = themeModule(defaultDesign({ primaryColor: "#0369A1" }));
    expect(file).toContain("import { Appearance } from 'react-native';");
    expect(file).toContain("Appearance.getColorScheme() === 'dark'");
    expect(file).toContain(themeFor(defaultDesign({ primaryColor: "#0369A1" }), "dark").colors.background);
    expect(themeModule({ ...defaultDesign(), mode: "dark" })).not.toContain("Appearance");
    expect(checkCodeSafety({ "App.js": APP, [THEME_FILE]: file })).toEqual([]);
    expect(validateApp({ "App.js": APP, [THEME_FILE]: file })).toEqual([]);
  });

  it("writes a theme file that passes the code checks", () => {
    for (const d of designs.slice(0, 4)) {
      const files = { "App.js": APP, [THEME_FILE]: themeModule(d) };
      expect(checkCodeSafety(files)).toEqual([]);
      expect(validateApp(files)).toEqual([]);
    }
  });

  it("tells apps that read the theme from ones with colors written in", () => {
    expect(usesTheme({ "App.js": APP })).toBe(true);
    expect(usesTheme({ "src/screens/Home.js": "import { colors } from '../theme';" })).toBe(true);
    expect(usesTheme({ "App.js": "const ACCENT = '#123456';", [THEME_FILE]: themeModule(defaultDesign()) })).toBe(false);
  });

  it("ships the journal demo with a current theme file and tells the AI about it", () => {
    const shipped = readFileSync(path.join(process.cwd(), "demo-apps/journal/src/theme.js"), "utf8");
    expect(shipped).toBe(themeModule(defaultDesign({ primaryColor: "#2563EB" })));
    expect(SYSTEM_PROMPT).toContain("src/theme.js");
    expect(SYSTEM_PROMPT).not.toContain("use emoji or simple shapes drawn with Views");
  });
});

describe("booking rules", () => {
  it("apply to every business app and ask when the details are missing", () => {
    expect(SYSTEM_PROMPT).toContain("Bookings, reservations and orders (every business app");
    expect(SYSTEM_PROMPT).toContain("Never build a booking screen that goes nowhere");
    expect(SYSTEM_PROMPT).toMatch(/don't change any files\. Reply with only <plan> and <summary>/);
  });
});

describe("gradients, glass and automatic designs", () => {
  it("keeps white text readable on every scheme's gradient, and text on the background gradient, in light and dark", () => {
    for (const p of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const t = themeFor({ primary: p.primary, accent: p.accent, mode, corners: "rounded", cards: "glass", headings: "bold" }, mode);
        for (const stop of t.gradient) expect(contrast(t.onGradient, stop), `${p.id} ${mode} gradient`).toBeGreaterThanOrEqual(4.5);
        for (const stop of t.backgroundGradient) {
          expect(contrast(t.colors.text, stop), `${p.id} ${mode} text`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t.colors.muted, stop), `${p.id} ${mode} muted`).toBeGreaterThanOrEqual(4.5);
        }
        expect(t.glass).toBe(true);
        expect(String(t.card.backgroundColor)).toMatch(/^rgba\(/);
      }
    }
  });

  it("writes the gradient and glass settings into src/theme.js", () => {
    const code = themeModule({ ...defaultDesign({ primaryColor: "#6D28D9" }), cards: "glass" });
    expect(code).toContain("export const gradient = current.gradient;");
    expect(code).toContain("export const backgroundGradient = current.backgroundGradient;");
    expect(code).toContain("export const glass = true;");
    expect(SYSTEM_PROMPT).toContain("expo-linear-gradient");
    expect(SYSTEM_PROMPT).toContain("expo-blur");
  });

  it("chooses a look that suits the app, the brief's look first, and keeps a website's brand color", () => {
    expect(autoDesign({ primaryColor: "" }, "A meditation and sleep app")).toMatchObject({ cards: "glass", corners: "soft", primary: "#0E7490" });
    expect(autoDesign({ primaryColor: "" }, "A gym workout tracker")).toMatchObject({ cards: "raised", headings: "bold", primary: "#C2410C" });
    expect(autoDesign({ primaryColor: "" }, "a budget app\n\nLook and feel: clean and simple, lots of white space.")).toMatchObject({
      cards: "outlined",
      headings: "regular",
    });
    const site = autoDesign({ primaryColor: "#E11D48" }, "Turn Luigi's (luigis.com) into a mobile app for its customers.", true);
    expect(site.primary).toBe("#E11D48");
    // The AI's own color is kept, with a matching accent.
    const own = autoDesign({ primaryColor: "#2563EB" }, "a notes app");
    expect(own.primary).toBe("#2563EB");
    expect(own.accent).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
