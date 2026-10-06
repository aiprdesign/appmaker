import type { ParsedGeneration } from "./parse";

/** Sent by the server while the AI reasons before writing; removed before parsing. */
export const THINKING_MARK = "<thinking/>";
/** Sent by the server every few seconds while it waits, so the page (and any proxy) knows the connection is alive. */
export const ALIVE_MARK = "<alive/>";
export const ALIVE_EVERY_MS = 10_000;

/** Removes the server's signals from the stream; reports whether the AI was thinking. */
export function takeSignals(raw: string): { text: string; thinking: boolean } {
  const thinking = raw.includes(THINKING_MARK);
  return { text: raw.split(THINKING_MARK).join("").split(ALIVE_MARK).join(""), thinking };
}

/** What the page knows about a running generation: the parsed output, plus signs of life. */
export type LiveGeneration = ParsedGeneration & {
  /** The AI has been reasoning (and hasn't started writing the app yet). */
  thinking?: boolean;
  /** When anything last arrived from the server (ms since epoch). */
  lastActivity?: number;
};

/** Nothing at all from the server for this long (not even its keep-alive signal) means the connection was lost. */
export const STALL_MS = 45_000;
/** Still no app text after this long, without the AI thinking, means the AI is very slow or stuck. */
export const SLOW_START_MS = 180_000;

/** The build's steps and which one is running, from what the AI has streamed so far. */
export function buildProgress(live: LiveGeneration | null): { steps: string[]; stage: number; files: string[] } {
  const files = live ? Object.keys(live.files) : [];
  const stage = !live?.plan && files.length === 0 ? 0 : files.length === 0 ? 1 : live?.listing || live?.summary ? 3 : 2;
  const steps = [
    live?.thinking && stage === 0 ? "Thinking through your idea" : "Understanding your idea",
    "Designing the screens",
    files.length ? `Writing code (${files.length} file${files.length === 1 ? "" : "s"})` : "Writing code",
    "Finishing touches",
  ];
  return { steps, stage, files };
}

/** A file path as people would say it: "src/screens/HomeScreen.js" → "Home screen", "App.js" → "App". */
export function friendlyFile(path: string): string {
  const base = path
    .split("/")
    .pop()!
    .replace(/\.(jsx?|json)$/, "");
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  const text = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  return text || path;
}

/**
 * A line about how the build is going: still thinking, taking a while, or
 * stuck (nothing at all from the AI for STALL_MS).
 */
export function progressNote(live: LiveGeneration | null, startedAt: number | null, now: number): { text: string; stalled: boolean } | null {
  if (!startedAt) return null;
  const { stage } = buildProgress(live);
  const quietFor = now - (live?.lastActivity ?? startedAt);
  if (quietFor > STALL_MS) {
    return { stalled: true, text: "The connection to Appmaker seems to have dropped. Press Stop, check your internet connection, and try again." };
  }
  const ms = now - startedAt;
  if (stage === 0 && !live?.thinking && ms > SLOW_START_MS) {
    return {
      stalled: true,
      text: `The AI hasn't started writing after ${Math.floor(ms / 60_000)} minutes. It may be overloaded: press Stop and try again, or pick a faster model in AI settings.`,
    };
  }
  if (stage === 0 && live?.thinking)
    return { stalled: false, text: "The AI is thinking through your app before it writes it. Bigger apps can think for 1–3 minutes." };
  if (stage === 0 && ms > 20_000) return { stalled: false, text: "The AI plans the whole app before writing — this can take a minute. Keep this tab open." };
  if (stage > 0 && ms > 90_000) return { stalled: false, text: "Bigger apps take 2–4 minutes. Keep this tab open — it's still working." };
  return null;
}

/** What the app looks like so far, while it's being made: shown on the phone. */
export interface BuildingParts {
  /** Photo links, in the order the app uses them (or the website's, before the code uses any). */
  images: string[];
  /** True when `images` are the website's photos the code hasn't used yet. */
  imagesFromSite: boolean;
  /** Lucide icon names the code imports, in order (e.g. "ShoppingBag"). */
  icons: string[];
  colors: { primary: string; accent?: string; name: string } | null;
  /** The latest things added, oldest first. */
  events: { key: string; kind: "photo" | "icon" | "color" | "screen"; text: string }[];
}

const PHOTO_URL = /https:\/\/(?:images\.unsplash\.com\/[^\s'"`)<>]+|[^\s'"`)<>]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s'"`)<>]*)?)(?=['"`)\s]|$)/gi;
const ICON_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react-native["']/g;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** "ShoppingBagIcon" / "LucideShoppingBag" → "ShoppingBag". */
const iconName = (raw: string) =>
  raw
    .trim()
    .split(/\s+as\s+/)[0]
    .trim()
    .replace(/^Lucide(?=[A-Z])/, "")
    .replace(/(?<=.)Icon$/, "");

/** A Lucide name as lucide-react's DynamicIcon wants it: "ShoppingBag" → "shopping-bag", "Grid2x2" → "grid-2x2". */
export const kebabIcon = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    // A dash before a number, but not inside sizes like "2x2".
    .replace(/([a-zA-Z])(\d)/g, (m, letter: string, digit: string, at: number, all: string) => (letter === "x" && /\d/.test(all[at - 1] ?? "") ? m : `${letter}-${digit}`))
    .toLowerCase();

/** "ShoppingBag" → "Shopping bag". */
const spokenIcon = (name: string) => kebabIcon(name).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** A color as people say it: "#B91C1C" → "red". */
export function colorName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  if (sat < 0.15) return light < 0.2 ? "black" : light > 0.85 ? "white" : "gray";
  const d = max - min;
  const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const h = (hue + 360) % 360;
  const names: [number, string][] = [
    [15, "red"],
    [40, "orange"],
    [55, "amber"],
    [70, "yellow"],
    [95, "lime"],
    [150, "green"],
    [175, "teal"],
    [195, "cyan"],
    [225, "blue"],
    [245, "indigo"],
    [275, "violet"],
    [300, "purple"],
    [335, "pink"],
    [350, "rose"],
    [360, "red"],
  ];
  const name = names.find(([max]) => h < max)![1];
  return light < 0.38 && (name === "orange" || name === "amber") ? "brown" : name;
}

export function buildingParts(
  live: LiveGeneration | null,
  ctx: {
    source?: { siteName?: string; url?: string; colors?: string[]; images?: string[]; logo?: string };
    design?: { primary: string; accent?: string };
    palettes?: { name: string; primary: string }[];
    /** The color scheme Appmaker picks once the AI names the brand color. */
    autoColors?: (primaryColor: string) => { primary: string; accent?: string };
  } = {},
): BuildingParts {
  const { source, design, palettes = [] } = ctx;
  const site = source?.siteName || (source?.url ? source.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "your website");
  const events: BuildingParts["events"] = [];
  const images: string[] = [];
  const icons: string[] = [];

  const siteImages = [...(source?.logo ? [source.logo] : []), ...(source?.images ?? [])].filter((u) => u.startsWith("https://"));
  if (siteImages.length) events.push({ key: "site-photos", kind: "photo", text: `Found ${siteImages.length} photo${siteImages.length === 1 ? "" : "s"} on ${site}` });

  const paletteName = (primary: string) => palettes.find((p) => p.primary.toLowerCase() === primary.toLowerCase())?.name;
  let colors: BuildingParts["colors"] = null;
  if (design && HEX_COLOR.test(design.primary)) {
    colors = { primary: design.primary, accent: design.accent, name: paletteName(design.primary) ?? "Your colors" };
    events.push({ key: "colors", kind: "color", text: `Colors: ${colors.name}` });
  } else if (source?.colors?.length && HEX_COLOR.test(source.colors[0])) {
    colors = { primary: source.colors[0], accent: HEX_COLOR.test(source.colors[1] ?? "") ? source.colors[1] : undefined, name: `Brand colors from ${site}` };
    events.push({ key: "site-colors", kind: "color", text: colors.name });
  }

  for (const [path, code] of Object.entries(live?.files ?? {})) {
    for (const m of code.matchAll(ICON_IMPORT)) {
      for (const part of m[1].split(",")) {
        const name = iconName(part);
        if (!/^[A-Z][A-Za-z0-9]+$/.test(name) || icons.includes(name)) continue;
        icons.push(name);
        events.push({ key: `icon:${name}`, kind: "icon", text: `Added the ${spokenIcon(name).toLowerCase()} icon` });
      }
    }
    for (const m of code.matchAll(PHOTO_URL)) {
      const url = m[0];
      if (images.includes(url)) continue;
      images.push(url);
      events.push({ key: `photo:${url}`, kind: "photo", text: images.length === 1 ? "Added the first photo" : `Added photo ${images.length}` });
    }
    if (live?.writing !== path) events.push({ key: `screen:${path}`, kind: "screen", text: `${friendlyFile(path)} ready` });
  }

  // Until the AI names a brand color, show the scheme the idea suggests.
  if (!colors && ctx.autoColors) {
    const guess = ctx.autoColors("");
    colors = { ...guess, name: paletteName(guess.primary) ?? "A color scheme" };
    events.unshift({ key: "colors-guess", kind: "color", text: `Trying colors: ${colors.name}` });
  }

  // The AI names the brand color in the listing; Appmaker picks the scheme from it.
  const brand = live?.listing?.primaryColor;
  if (!design && brand && HEX_COLOR.test(brand)) {
    const picked = ctx.autoColors?.(brand) ?? { primary: brand };
    const described = [picked.primary, picked.accent].filter((c): c is string => !!c && HEX_COLOR.test(c)).map(colorName);
    const said = [...new Set(described)].join(" and ");
    colors = { ...picked, name: paletteName(picked.primary) ?? (source ? `Brand colors from ${site}` : said.charAt(0).toUpperCase() + said.slice(1)) };
    events.push({ key: "colors", kind: "color", text: `Picked colors: ${colors.name}` });
  }

  const imagesFromSite = images.length === 0 && siteImages.length > 0;
  return { images: (imagesFromSite ? siteImages : images).slice(0, 8), imagesFromSite, icons: icons.slice(0, 16), colors, events: events.slice(-4) };
}
