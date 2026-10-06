import type { AppDesign, StoreListing } from "./types";

/**
 * Design settings for an app: color scheme, light or dark, corners, card
 * style and headings. Appmaker writes them into src/theme.js, which every
 * screen imports, so changing the design is instant and needs no AI.
 * Colors are derived so text always meets WCAG AA contrast.
 */

export const THEME_FILE = "src/theme.js";

/** Color schemes: a brand color and the accent its gradient runs to. */
export const PALETTES: { id: string; name: string; primary: string; accent: string }[] = [
  { id: "violet", name: "Violet", primary: "#6D28D9", accent: "#DB2777" },
  { id: "ocean", name: "Ocean", primary: "#0369A1", accent: "#0D9488" },
  { id: "forest", name: "Forest", primary: "#15803D", accent: "#0F766E" },
  { id: "sunset", name: "Sunset", primary: "#C2410C", accent: "#BE185D" },
  { id: "rose", name: "Rose", primary: "#BE123C", accent: "#7C3AED" },
  { id: "midnight", name: "Midnight", primary: "#1E3A8A", accent: "#6D28D9" },
  { id: "slate", name: "Slate", primary: "#334155", accent: "#0F766E" },
  { id: "gold", name: "Gold", primary: "#A16207", accent: "#C2410C" },
  { id: "coffee", name: "Coffee", primary: "#7C4A2D", accent: "#A16207" },
  { id: "mint", name: "Mint", primary: "#0F766E", accent: "#0369A1" },
  // Modern duo-tones.
  { id: "aurora", name: "Aurora", primary: "#4F46E5", accent: "#C026D3" },
  { id: "lagoon", name: "Lagoon", primary: "#0E7490", accent: "#4F46E5" },
  { id: "peach", name: "Peach", primary: "#C2410C", accent: "#DB2777" },
  { id: "citrus", name: "Citrus", primary: "#15803D", accent: "#A16207" },
];

export const CORNERS = { sharp: { sm: 4, md: 8, lg: 12 }, rounded: { sm: 8, md: 14, lg: 20 }, soft: { sm: 12, md: 20, lg: 28 } } as const;
export const HEADINGS = { light: "600", regular: "700", bold: "800" } as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultDesign(listing?: Pick<StoreListing, "primaryColor">): AppDesign {
  const primary = listing && HEX.test(listing.primaryColor) ? listing.primaryColor : PALETTES[0].primary;
  return { primary, mode: "auto", corners: "rounded", cards: "raised", headings: "bold" };
}

type Look = Pick<AppDesign, "corners" | "cards" | "headings">;

/** Looks people can ask for in the app brief ("Look and feel: …"). */
const LOOKS: { match: RegExp; look: Look; palette?: string }[] = [
  { match: /look and feel: clean and simple/i, look: { corners: "rounded", cards: "outlined", headings: "regular" } },
  { match: /look and feel: bold and colorful/i, look: { corners: "soft", cards: "raised", headings: "bold" } },
  { match: /look and feel: calm and soft/i, look: { corners: "soft", cards: "glass", headings: "regular" } },
  { match: /look and feel: sleek and premium/i, look: { corners: "rounded", cards: "glass", headings: "light" }, palette: "midnight" },
];

/** What suits each kind of app: a color scheme and a style. */
const KINDS: { match: RegExp; palette: string; look: Look }[] = [
  {
    match: /\b(meditat|mindful|yoga|sleep|wellness|wellbeing|breath|calm|therapy|spa)/i,
    palette: "lagoon",
    look: { corners: "soft", cards: "glass", headings: "regular" },
  },
  {
    match: /\b(gym|fitness|workout|exercise|training|running|run|sport|athlet)/i,
    palette: "sunset",
    look: { corners: "rounded", cards: "raised", headings: "bold" },
  },
  {
    match: /\b(budget|expense|money|finance|bank|invest|crypto|savings?|bills?|invoice)/i,
    palette: "midnight",
    look: { corners: "rounded", cards: "outlined", headings: "regular" },
  },
  {
    match: /\b(restaurant|cafe|café|coffee|bakery|food|menu|recipe|kitchen|pizza|bar)\b/i,
    palette: "peach",
    look: { corners: "rounded", cards: "raised", headings: "bold" },
  },
  {
    match: /\b(salon|barber|hair|nails|beauty|makeup|skincare|fashion|boutique)/i,
    palette: "rose",
    look: { corners: "soft", cards: "glass", headings: "regular" },
  },
  {
    match: /\b(learn|study|quiz|flashcards?|language|school|kids?|course|lesson)/i,
    palette: "aurora",
    look: { corners: "soft", cards: "raised", headings: "bold" },
  },
  { match: /\b(travel|trip|holiday|vacation|itinerary|hotel|flight)/i, palette: "ocean", look: { corners: "soft", cards: "glass", headings: "bold" } },
  { match: /\b(pet|dog|cat|garden|plant|farm|nature|hiking)/i, palette: "citrus", look: { corners: "soft", cards: "raised", headings: "bold" } },
  { match: /\b(clinic|dentist|doctor|health|physio|pharmacy)/i, palette: "mint", look: { corners: "rounded", cards: "outlined", headings: "regular" } },
  { match: /\b(journal|diary|notes?|writing|mood|gratitude)/i, palette: "violet", look: { corners: "soft", cards: "glass", headings: "regular" } },
];

function hueOf(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * The design a new app starts with, chosen from what it is: the look the
 * person asked for in the brief first, then what suits that kind of app.
 * A website's brand color is always kept; otherwise the AI's color is kept
 * and paired with the accent of the closest scheme.
 */
export function autoDesign(listing: Pick<StoreListing, "primaryColor">, prompt: string, fromWebsite = false): AppDesign {
  const asked = LOOKS.find((l) => l.match.test(prompt));
  const kind = KINDS.find((k) => k.match.test(prompt));
  const look: Look = asked?.look ?? kind?.look ?? { corners: "rounded", cards: "raised", headings: "bold" };
  const scheme = PALETTES.find((p) => p.id === (asked?.palette ?? kind?.palette)) ?? PALETTES.find((p) => p.id === "aurora")!;
  const own = HEX.test(listing.primaryColor) ? listing.primaryColor : null;
  if (fromWebsite && own) return { primary: own, accent: rotateHue(own, 35), mode: "auto", ...look };
  const primary = own ?? scheme.primary;
  // The scheme whose brand color is closest in hue gives the accent.
  const distance = (h: number) => Math.min(Math.abs(h - hueOf(primary)), 360 - Math.abs(h - hueOf(primary)));
  const closest = own ? [...PALETTES].sort((a, b) => distance(hueOf(a.primary)) - distance(hueOf(b.primary)))[0] : scheme;
  return { primary, accent: closest.accent, mode: "auto", ...look };
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
/** The same color with its hue turned by some degrees (for an accent when none is set). */
export function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return hex;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + degrees + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

/** A color with transparency, for glass. */
function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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
  /** Brand gradient (brand color to accent) for hero cards and headers; onGradient text is readable on all of it. */
  gradient: [string, string];
  onGradient: string;
  /** A soft screen background gradient (text and muted text stay readable on it). */
  backgroundGradient: [string, string];
  /** Cards are frosted glass: put them over backgroundGradient or a gradient hero. */
  glass: boolean;
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
  const muted = dark ? "#A1A1AA" : "#5F6B7A";
  // The gradient: brand color to accent, both dark enough for white text.
  const accentBase = design.accent && HEX.test(design.accent) ? design.accent : rotateHue(base, 40);
  const gradient: [string, string] = [readableOn(base, "#FFFFFF", 4.5), readableOn(accentBase, "#FFFFFF", 4.5)];
  // A barely-there tint of both colors behind the screen; text and muted text stay at 4.5:1.
  let tint = dark ? 0.86 : 0.93;
  let backgroundGradient: [string, string] = [mix(base, background, tint), mix(accentBase, background, tint)];
  for (let i = 0; i < 8 && backgroundGradient.some((c) => contrast(muted, c) < 4.5 || contrast(text, c) < 4.5); i++) {
    tint = Math.min(0.98, tint + 0.02);
    backgroundGradient = [mix(base, background, tint), mix(accentBase, background, tint)];
  }
  const card =
    design.cards === "glass"
      ? {
          backgroundColor: alpha(surface, dark ? 0.62 : 0.72),
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.7)",
          boxShadow: dark ? "0px 8px 24px rgba(0, 0, 0, 0.35)" : "0px 8px 24px rgba(17, 24, 39, 0.08)",
        }
      : design.cards === "flat"
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
      muted,
      border,
      outline,
      success: dark ? "#34D399" : "#047857",
      danger: dark ? "#F87171" : "#B91C1C",
    },
    radius,
    font: { heading: HEADINGS[design.headings], body: "400" },
    card,
    gradient,
    onGradient: "#FFFFFF",
    backgroundGradient,
    glass: design.cards === "glass",
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
  const one = (t: Theme) =>
    `{ colors: ${JSON.stringify(t.colors)}, card: ${JSON.stringify(t.card)}, gradient: ${JSON.stringify(t.gradient)}, backgroundGradient: ${JSON.stringify(t.backgroundGradient)} }`;
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
// Brand gradient (use with LinearGradient from 'expo-linear-gradient'); text on it uses onGradient.
export const gradient = current.gradient;
export const onGradient = ${JSON.stringify(light.onGradient)};
// A soft gradient for screen backgrounds, behind glass cards.
export const backgroundGradient = current.backgroundGradient;
// True when cards are frosted glass.
export const glass = ${JSON.stringify(light.glass)};

const theme = { mode, colors, radius, font, card, gradient, onGradient, backgroundGradient, glass };
export default theme;
`;
}

/** True when the app's code reads its design from src/theme.js. */
export function usesTheme(files: Record<string, string>): boolean {
  return Object.entries(files).some(([path, code]) => path !== THEME_FILE && /from\s*["'](?:\.{1,2}\/)+(?:src\/)?theme["']/.test(code));
}
