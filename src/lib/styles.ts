import type { AppDesign } from "./types";

/**
 * Design styles: complete looks for an app, from today's app design trends
 * (Apple's liquid glass, bento grids, neo-brutalism, the editorial serif
 * revival, soft 3D clay, aurora gradients…). A style sets the theme (surfaces,
 * cards, corners, type, labels, light or dark) and tells the AI how to lay
 * screens out, so apps don't all look the same. One is picked automatically
 * for each app; people can change it in the Design tab.
 */

export type StyleCategory = "minimal" | "glass" | "bold" | "elegant" | "natural" | "playful";

export const STYLE_CATEGORIES: { id: StyleCategory; name: string }[] = [
  { id: "minimal", name: "Clean & minimal" },
  { id: "glass", name: "Glass & light" },
  { id: "bold", name: "Bold & graphic" },
  { id: "elegant", name: "Elegant" },
  { id: "natural", name: "Warm & natural" },
  { id: "playful", name: "Playful & night" },
];

export interface DesignStyle {
  id: string;
  name: string;
  category: StyleCategory;
  /** One line for the style picker. */
  blurb: string;
  /** The theme settings the style sets. */
  look: Required<Pick<AppDesign, "mode" | "corners" | "cards" | "headings" | "font" | "surface" | "labels">>;
  /** Signature colors, used when the app has no brand color of its own (a website's). */
  colors?: { primary: string; accent: string };
  /** How the AI lays screens out in this style. */
  direction: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: "swiss",
    name: "Swiss minimal",
    category: "minimal",
    blurb: "White space, a strict grid, big confident type",
    look: { mode: "auto", corners: "sharp", cards: "outlined", headings: "bold", font: "system", surface: "paper", labels: "caps" },
    direction:
      "Lots of white space on a strict left-aligned grid. Big confident screen titles (36–40) with tight letter spacing. Hairline dividers and plain lists instead of boxes; outlined cards only where grouping helps. One accent color, used sparingly for actions and key numbers. Small uppercase section labels (label style). Monochrome icons in colors.text. No gradients, no decoration.",
  },
  {
    id: "calm",
    name: "Calm pastel",
    category: "minimal",
    blurb: "Airy, soft and quiet, with gentle tints",
    look: { mode: "auto", corners: "soft", cards: "raised", headings: "regular", font: "system", surface: "tinted", labels: "normal" },
    direction:
      "Airy and quiet: a softly tinted background, generous spacing, soft rounded cards with gentle shadows, regular-weight headings. Pastel icon tiles (primarySoft) and friendly pill-shaped filter chips. One soft gradient hero at most; nothing loud, slow subtle motion only.",
  },
  {
    id: "liquid-glass",
    name: "Liquid glass",
    category: "glass",
    blurb: "Apple's newest look: frosted, floating, translucent",
    look: { mode: "auto", corners: "soft", cards: "glass", headings: "bold", font: "system", surface: "default", labels: "normal" },
    direction:
      "Apple's liquid glass look: every screen sits on backgroundGradient with frosted translucent cards (the card style) so color shows through. A floating, inset tab bar made of BlurView with rounded ends and a pill-shaped highlight behind the selected tab. Large titles; controls and filters as glass pills; headers translucent with content scrolling under them. Gradients and photos behind the glass, never inside it.",
  },
  {
    id: "aurora",
    name: "Aurora gradient",
    category: "glass",
    blurb: "Glowing gradients, bold hero, glass below",
    look: { mode: "auto", corners: "soft", cards: "glass", headings: "bold", font: "system", surface: "default", labels: "normal" },
    direction:
      "The brand gradient is the signature: a bold full-width gradient hero at the top of the main screens with a large onGradient title and the key stat or next action, and the primary button in the gradient too. Below it, glass cards on backgroundGradient, pill chips, soft corners. A soft glow (shadowColor in colors.primary, large radius, low opacity) under the hero.",
  },
  {
    id: "bento",
    name: "Bento grid",
    category: "bold",
    blurb: "A dashboard of tiles in different sizes",
    look: { mode: "auto", corners: "soft", cards: "flat", headings: "bold", font: "system", surface: "default", labels: "normal" },
    direction:
      "Bento grid: the home screen is a grid of tiles in different sizes with 12pt gaps (one large 2×2 hero tile, 2×1 and 1×1 tiles, built with flexDirection row and flexWrap). Each tile holds one idea: a big number, a big icon or a short list, with a small label. Vary tile fills: surface, primarySoft, primary with onPrimary text, one gradient tile. Other screens keep the tile language (tiles for categories, stats and shortcuts).",
  },
  {
    id: "brutalist",
    name: "Neo-brutalist",
    category: "bold",
    blurb: "Thick borders, hard shadows, loud blocks",
    look: { mode: "light", corners: "sharp", cards: "brutal", headings: "bold", font: "system", surface: "cream", labels: "caps" },
    direction:
      "Neo-brutalist: flat bold blocks of color, thick 2pt borders in colors.text and hard offset shadows (the card style has both), sharp corners. Chunky uppercase labels (label style), big heavy headings. Buttons are bordered blocks with the same hard shadow, pressed state moves them 2pt toward the shadow. Sections can sit on solid primary or primarySoft blocks. No gradients, no blur, no soft shadows.",
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "elegant",
    blurb: "Magazine layout with serif headlines",
    look: { mode: "auto", corners: "sharp", cards: "flat", headings: "regular", font: "serif", surface: "paper", labels: "caps" },
    direction:
      "Magazine layout: serif headlines (heading style) set large (36–44) with real hierarchy, small uppercase letter-spaced labels (label style) above sections, full-width photos (or large icon illustrations) with short captions, hairline rules between stories, generous margins. Restrained color: mostly colors.text, the accent for links and one highlight. Quiet flat cards; no gradients except over photos.",
  },
  {
    id: "luxe",
    name: "Dark luxe",
    category: "elegant",
    blurb: "Deep black, gold accents, refined type",
    look: { mode: "dark", corners: "rounded", cards: "outlined", headings: "light", font: "serif", surface: "ink", labels: "caps" },
    colors: { primary: "#B08D57", accent: "#8C6A3F" },
    direction:
      "Dark luxe: near-black surfaces, a champagne or gold accent used sparingly, light elegant serif headings with wide spacing, uppercase letter-spaced labels, thin hairline borders on cards, lots of space. Large photography or one big icon per screen. It should feel like a premium membership card: calm, precise, nothing busy.",
  },
  {
    id: "organic",
    name: "Organic warm",
    category: "natural",
    blurb: "Warm paper tones, soft shapes, calm",
    look: { mode: "auto", corners: "soft", cards: "raised", headings: "regular", font: "serif", surface: "warm", labels: "normal" },
    direction:
      "Organic and warm: a warm paper background, earthy tones, very soft corners, gentle raised cards, serif headings (heading style) at a relaxed size. Nature-like rounded icon tiles, relaxed spacing, friendly hand-made feel. Photos with soft rounded corners; no hard lines.",
  },
  {
    id: "clay",
    name: "Soft 3D clay",
    category: "natural",
    blurb: "Puffy, touchable, toy-like shapes",
    look: { mode: "light", corners: "soft", cards: "clay", headings: "bold", font: "system", surface: "tinted", labels: "normal" },
    direction:
      "Soft 3D clay: chunky puffy cards (the card style has the soft 3D shadow) on a pastel tinted background, big friendly icons in rounded squares, bold headings, oversized pill buttons (height 56, radius pill). Everything feels squeezable: pressed state scales to 0.96. Bright but soft colors, never harsh.",
  },
  {
    id: "pop",
    name: "Playful pop",
    category: "playful",
    blurb: "Bright, bold, colorful and energetic",
    look: { mode: "auto", corners: "soft", cards: "raised", headings: "bold", font: "system", surface: "default", labels: "normal" },
    direction:
      "Playful pop: bright confident colors, big bold headings, category tiles each in a different cheerful content color with a big icon, sticker-like badges and counters, soft corners, celebratory moments (a big check or emoji when something is done). Energetic but tidy: still one primary action per screen.",
  },
  {
    id: "neon",
    name: "Neon night",
    category: "playful",
    blurb: "Dark mode with glowing neon accents",
    look: { mode: "dark", corners: "rounded", cards: "outlined", headings: "bold", font: "mono", surface: "ink", labels: "caps" },
    colors: { primary: "#8B5CF6", accent: "#06B6D4" },
    direction:
      "Neon night: dark-first with a deep background, neon accents that glow (shadowColor in colors.primary or the accent with a 12–20 radius around the hero and the primary button), mono type for numbers, stats and labels (heading style), thin outlined cards, the gradient as a glowing hero or progress bar. Feels like a game, music or night-life app.",
  },
];

export const getStyle = (id: string | undefined): DesignStyle | undefined => DESIGN_STYLES.find((s) => s.id === id);

/** The style the person asked for in the app brief ("Look and feel: …"). */
const ASKED: { match: RegExp; style: string }[] = [
  ...DESIGN_STYLES.map((s) => ({ match: new RegExp(`look and feel: ${s.name}\\b`, "i"), style: s.id })),
  // The brief's older answers.
  { match: /look and feel: clean and simple/i, style: "swiss" },
  { match: /look and feel: bold and colorful/i, style: "pop" },
  { match: /look and feel: calm and soft/i, style: "calm" },
  { match: /look and feel: sleek and premium/i, style: "luxe" },
];

/** What suits each kind of app, most specific first. */
const KINDS: { match: RegExp; style: string; why: string }[] = [
  { match: /\b(meditat|mindful|sleep|breath|calm|therapy|spa|wellbeing|wellness)/i, style: "calm", why: "calm, wellness apps" },
  { match: /\b(kids?|children|toddler|baby|nursery|preschool)/i, style: "clay", why: "apps for kids and families" },
  { match: /\b(music|playlist|dj|nightlife|club|party|gaming|games?|esports|stream)/i, style: "neon", why: "music, gaming and night-life apps" },
  { match: /\b(crypto|trading|stocks?|developer|coding|hacker|tech|ai\b)/i, style: "neon", why: "tech and trading apps" },
  { match: /\b(luxury|jewel|wine|cocktail|hotel|real estate|property|villa|concierge|tailor)/i, style: "luxe", why: "premium brands" },
  { match: /\b(barber|fashion|boutique|streetwear|sneakers?|tattoo)/i, style: "brutalist", why: "fashion and street brands" },
  { match: /\b(magazine|news|blog|journal|diary|writing|poetry|book club|reading|recipe)/i, style: "editorial", why: "reading and writing apps" },
  { match: /\b(restaurant|cafe|café|bakery|bistro|food|menu|pizza|bar)\b/i, style: "editorial", why: "restaurants and cafés" },
  { match: /\b(salon|hair|nails|beauty|makeup|skincare|florist|wedding)/i, style: "editorial", why: "beauty and style businesses" },
  { match: /\b(gym|fitness|workout|exercise|training|running|run|sport|athlet|steps|calories)/i, style: "bento", why: "fitness trackers" },
  { match: /\b(budget|expense|money|finance|bank|invest|savings?|bills?|invoice|dashboard|stats|analytics)/i, style: "bento", why: "money and stats dashboards" },
  { match: /\b(habit|streak|goals?)/i, style: "bento", why: "habit and goal trackers" },
  { match: /\b(travel|trip|holiday|vacation|itinerary|flight|weather|camera|photo)/i, style: "liquid-glass", why: "travel and photo apps" },
  { match: /\b(pet|dog|cat|garden|plant|farm|nature|hiking|outdoor|organic|church|community|charity)/i, style: "organic", why: "nature and community apps" },
  { match: /\b(learn|study|quiz|flashcards?|language|school|course|lesson|trivia)/i, style: "pop", why: "learning apps" },
  { match: /\b(clinic|dentist|doctor|health|physio|pharmacy|medical|legal|lawyer|accountant|insurance)/i, style: "swiss", why: "clinics and professional services" },
  { match: /\b(todo|to-do|tasks?|notes?|planner|productivity|calendar|schedule|shopping list)/i, style: "swiss", why: "productivity apps" },
  { match: /\b(event|countdown|festival|conference|concert|launch)/i, style: "aurora", why: "events and launches" },
  { match: /\b(shop|store|products?|catalog|market)/i, style: "liquid-glass", why: "shops and catalogs" },
];

/** For apps that fit no kind: varied, but always the same style for the same idea. */
const VARIETY = ["aurora", "liquid-glass", "bento", "calm", "pop", "swiss", "organic"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The best style for an app, and why it was picked. */
export function pickStyle(prompt: string): { style: DesignStyle; why: string } {
  const asked = ASKED.find((a) => a.match.test(prompt));
  if (asked) return { style: getStyle(asked.style)!, why: "the look you asked for" };
  // The idea itself, before any details the brief added.
  const idea = prompt.split(/\n\s*\n/)[0];
  const kind = KINDS.find((k) => k.match.test(idea)) ?? KINDS.find((k) => k.match.test(prompt));
  if (kind) return { style: getStyle(kind.style)!, why: `a great fit for ${kind.why}` };
  return { style: getStyle(VARIETY[hash(idea.trim().toLowerCase()) % VARIETY.length])!, why: "a modern look for this idea" };
}

/** A design in a style: its look, and its signature colors unless the app keeps its own (a website's brand). */
export function applyStyle(design: AppDesign, style: DesignStyle, keepColors: boolean): AppDesign {
  const colors = !keepColors && style.colors ? { primary: style.colors.primary, accent: style.colors.accent } : {};
  return { ...design, ...style.look, ...colors, style: style.id };
}

/** The style as the AI is told about it, with each request. */
export function styleBrief(style: DesignStyle): string {
  return `<design_style name="${style.name}">\nThis app's design style is ${style.name}. Lay out every screen in this style (src/theme.js already has its colors, surfaces, cards, corners and type):\n${style.direction}\nAll the accessibility, contrast and touch-size rules still apply.\n</design_style>`;
}
