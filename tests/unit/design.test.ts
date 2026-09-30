import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCodeSafety } from "@/lib/code-safety";
import { contrast, defaultDesign, PALETTES, THEME_FILE, themeFor, themeModule, usesTheme } from "@/lib/design";
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
  it("keeps every color scheme readable in light and dark mode", () => {
    for (const d of designs) {
      const { colors } = themeFor(d);
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
