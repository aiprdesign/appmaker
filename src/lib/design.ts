import type { AppDesign, StoreListing } from "./types";

/**
 * Design settings for an app: color scheme, light or dark, corners, card
 * style and headings. Appmaker writes them into src/theme.js, which every
 * screen imports, so changing the design is instant and needs no AI.
 * Colors are derived so text always meets WCAG AA contrast.
 */

export const THEME_FILE = "src/theme.js";

export const PALETTES: { id: string; name: string; primary: string }[] = [
  { id: "violet", name: "Violet", primary: "#6D28D9" },
  { id: "ocean", name: "Ocean", primary: "#0369A1" },
  { id: "forest", name: "Forest", primary: "#15803D" },
  { id: "sunset", name: "Sunset", primary: "#C2410C" },
  { id: "rose", name: "Rose", primary: "#BE123C" },
  { id: "midnight", name: "Midnight", primary: "#1E3A8A" },
  { id: "slate", name: "Slate", primary: "#334155" },
  { id: "gold", name: "Gold", primary: "#A16207" },
  { id: "coffee", name: "Coffee", primary: "#7C4A2D" },
  { id: "mint", name: "Mint", primary: "#0F766E" },
];

export const CORNERS = { sharp: { sm: 4, md: 8, lg: 12 }, rounded: { sm: 8, md: 14, lg: 20 }, soft: { sm: 12, md: 20, lg: 28 } } as const;
export const HEADINGS = { light: "600", regular: "700", bold: "800" } as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultDesign(listing?: Pick<StoreListing, "primaryColor">): AppDesign {
  const primary = listing && HEX.test(listing.primaryColor) ? listing.primaryColor : PALETTES[0].primary;
  return { primary, mode: "auto", corners: "rounded", cards: "raised", headings: "bold" };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function mix(hex: string, target: string, amount: number): string {
  const a = rgb(hex);
  const b = rgb(target);
  return toHex(a.map((c, i) => c + (b[i] - c) * amount));
}

/** Nudges a color darker (on light) or lighter (on dark) until it reaches the contrast needed. */
function readableOn(color: string, background: string, min: number): string {
  let c = color;
  const toward = luminance(background) > 0.5 ? "#000000" : "#ffffff";
  for (let i = 0; i < 20 && contrast(c, background) < min; i++) c = mix(c, toward, 0.12);
  return c;
}

export interface Theme {
  mode: "light" | "dark";
  colors: {
    primary: string;
    onPrimary: string;
    primarySoft: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    /** Dividers and card edges (decorative). */
    border: string;
    /** Outlines of inputs and controls: at least 3:1 (WCAG 1.4.11). */
    outline: string;
    success: string;
    danger: string;
  };
  radius: { sm: number; md: number; lg: number; pill: number };
  font: { heading: string; body: string };
  card: Record<string, unknown>;
}

/**
 * The palette for one mode, meeting WCAG 2.1 AA: text, muted text and the
 * brand color used as text reach 4.5:1 on every background they sit on
 * (background, cards and tinted chips); outlines of controls reach 3:1.
 */
export function themeFor(design: AppDesign, forMode?: "light" | "dark"): Theme {
  const mode = forMode ?? (design.mode === "dark" ? "dark" : "light");
  const dark = mode === "dark";
  const background = dark ? "#0B0B10" : "#F7F7FA";
  const surface = dark ? "#16161F" : "#FFFFFF";
  const text = dark ? "#F5F5F7" : "#111827";
  const base = HEX.test(design.primary) ? design.primary : PALETTES[0].primary;
  // A soft tint of the brand color for chips and selected rows (text stays readable on it).
  let soft = dark ? 0.75 : 0.88;
  let primarySoft = mix(base, surface, soft);
  for (let i = 0; i < 10 && contrast(text, primarySoft) < 4.5; i++) {
    soft = Math.min(0.97, soft + 0.03);
    primarySoft = mix(base, surface, soft);
  }
  // The brand color is used for links, tab labels and chips: readable as small
  // text on the background, on cards and on its own tint.
  let primary = base;
  for (let i = 0; i < 4; i++) for (const bg of [background, surface, primarySoft]) primary = readableOn(primary, bg, 4.5);
  const onPrimary = contrast("#FFFFFF", primary) >= 4.5 ? "#FFFFFF" : "#111111";
  const border = dark ? "#2A2A38" : "#E5E7EB";
  const outline = dark ? "#6B6B80" : "#8A8F98";
  const radius = { ...CORNERS[design.corners], pill: 999 };
  const card =
    design.cards === "flat"
      ? { backgroundColor: surface, borderRadius: radius.lg }
      : design.cards === "outlined"
        ? { backgroundColor: surface, borderRadius: radius.lg, borderWidth: 1, borderColor: border }
        : {
            backgroundColor: surface,
            borderRadius: radius.lg,
            boxShadow: dark ? "0px 4px 12px rgba(0, 0, 0, 0.4)" : "0px 4px 12px rgba(17, 24, 39, 0.08)",
          };
  return {
    mode,
    colors: {
      primary,
      onPrimary,
      primarySoft,
      background,
      surface,
      text,
      muted: dark ? "#A1A1AA" : "#5F6B7A",
      border,
      outline,
      success: dark ? "#34D399" : "#047857",
      danger: dark ? "#F87171" : "#B91C1C",
    },
    radius,
    font: { heading: HEADINGS[design.headings], body: "400" },
    card,
  };
}

/**
 * src/theme.js: the design every screen reads. Written by Appmaker from the
 * Design tab. In "auto" mode it follows the phone's light or dark setting
 * when the app starts (the preview can show either).
 */
export function themeModule(design: AppDesign): string {
  const light = themeFor(design, "light");
  const dark = themeFor(design, "dark");
  const one = (t: Theme) => `{ colors: ${JSON.stringify(t.colors)}, card: ${JSON.stringify(t.card)} }`;
  const pick =
    design.mode === "auto"
      ? `// Follows the phone's light or dark setting.
import { Appearance } from 'react-native';

const light = ${one(light)};
const dark = ${one(dark)};

export const mode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const current = mode === 'dark' ? dark : light;`
      : `const current = ${one(design.mode === "dark" ? dark : light)};

export const mode = ${JSON.stringify(design.mode)};`;
  return `// The app's design: colors, corners, card style and fonts.
// Written by Appmaker from the Design tab — change the design there, not here.
${pick}
export const colors = current.colors;
export const card = current.card;
export const radius = ${JSON.stringify(light.radius)};
export const font = ${JSON.stringify(light.font)};

const theme = { mode, colors, radius, font, card };
export default theme;
`;
}

/** True when the app's code reads its design from src/theme.js. */
export function usesTheme(files: Record<string, string>): boolean {
  return Object.entries(files).some(([path, code]) => path !== THEME_FILE && /from\s*["'](?:\.{1,2}\/)+(?:src\/)?theme["']/.test(code));
}
