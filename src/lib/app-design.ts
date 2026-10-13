import { userFacingText } from "./claims";
import type { FileMap } from "./types";

/**
 * Modern app design, so Appmaker's apps don't look AI-made: the rules the app
 * designer follows (in the system prompt and the UI agent's review), and a
 * check of the code for the usual tells, sent back to the AI to fix.
 */

export const DESIGN_CRAFT = `## Modern design, not generic AI design
People can spot AI-made apps: purple gradients on everything, emoji instead of icons, every line centered, the same rounded card stacked down every screen, and "Unlock your potential" copy. Design like a top product team instead:
- Start from the content: what the person needs most on each screen is biggest and first (today's number, the next booking, the item they're looking at). Decide the layout from that, not from a card template. Vary composition between screens: a big-number hero, a two-column grid of tiles, an edge-to-edge photo, a plain grouped list. Not every screen is a column of identical cards.
- Restraint with color: the background and surfaces are calm (theme background and surface); the brand color is for the one primary action, the selected state and one hero moment per screen. At most one gradient per screen (the hero), always the theme's \`gradient\`. No rainbow gradients, glows around everything or colored shadows.
- Type does the work: a strong size contrast (a 32–40 title or number against 15–17 body), tight letterSpacing on big headings (-0.5 to -1), regular weight body text, and weights 600–700 for emphasis (800–900 only for one big display number). At most 4 font sizes in a file, all from the scale 12, 13, 15, 17, 20, 22, 28, 34, 40.
- Left-aligned by default: titles, paragraphs and lists start on the same left edge. Center only short things meant to be centered: an empty state, onboarding, a single big number.
- Icons, not emoji: UI icons are Lucide icons in the theme's colors. Emoji only where they are content the person chose (a mood, a category they named), never as decoration in headings, buttons, tabs or list rows.
- Real detail instead of decoration: actual numbers, dates, names, progress, small charts drawn with Views (bars, rings, sparklines), status chips, avatars with initials, and thumbnails. One meaningful detail beats three decorative blobs.
- Spacing is generous and consistent: only 4, 8, 12, 16, 20, 24, 32, 40, 48; 20–24 screen padding; 32–40 between sections, so screens breathe. Lists of settings-like rows are grouped in inset sections with hairline separators, not every row in its own card.
- Depth is subtle: hairline borders or the theme's \`card\` style; shadowOpacity at most 0.12, elevation at most 4. One corner radius family (the theme's radius.sm/md/lg), never a mix of random values.
- Native feel: large titles that sit at the top left, a bottom tab bar with 3–5 tabs, sheets and modals for adding and editing, a pressed state on everything tappable, haptics on primary actions, and safe areas respected.
- Copy sounds like the business or a helpful person, specific to this app: "Log today's water", "3 bookings this week", "Next: Haircut with Sam, 2:30". Never filler like "Welcome to the app", "Unlock your potential", "Elevate your experience", "Seamless", "Embark on your journey", "at your fingertips", "Discover the power of", or Lorem ipsum.
- Before finishing, look at each screen as a designer would: would this look at home next to Things, Linear, Airbnb or Apple's own apps? If it looks like a template, change the composition, not just the colors.`;

const SKIP = /^src\/(theme|live|booking|appmaker)\.js$|^src\/data\//;
const GENERIC =
  /\b(welcome to (the|our|your|this) app|unlock (your )?(full )?potential|elevate your|seamless(ly)?|revolutioni[sz]e|embark on|your (wellness |fitness |learning )?journey|at your fingertips|game[- ]changer|discover the power|supercharge|take (it|your \w+) to the next level|lorem ipsum)\b/i;
const EMOJI = /^\s*\p{Extended_Pictographic}[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]*$/u;
const FONT_SCALE = new Set([11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 30, 32, 34, 36, 40, 44, 48, 56, 64]);
const SPACE_SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]);

export interface DesignIssue {
  file: string;
  message: string;
}

const values = (code: string, prop: string) => [...code.matchAll(new RegExp(`\\b${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\b`, "g"))].map((m) => Number(m[1]));

/** The tells of generic AI design in an app's code (screens and components; theme and data files are skipped). */
export function designIssues(files: FileMap): DesignIssue[] {
  const out: DesignIssue[] = [];
  for (const [file, code] of Object.entries(files)) {
    if (!/\.(js|jsx)$/.test(file) || SKIP.test(file)) continue;
    const add = (message: string) => out.push({ file, message });
    // Emoji as UI icons.
    const emoji = [...code.matchAll(/>([^<>{}]{1,12})</g)].map((m) => m[1]).filter((t) => EMOJI.test(t));
    if (emoji.length >= 3) add(`uses emoji as icons (${[...new Set(emoji.map((e) => e.trim()))].slice(0, 4).join(" ")}); use Lucide icons in the theme's colors instead`);
    // Filler copy.
    const filler = userFacingText(code).find((t) => GENERIC.test(t));
    if (filler) add(`says "${filler.slice(0, 60)}", which reads like generic AI copy; write specific words for this app and its people`);
    // Hard-coded colors.
    // (Only in styles: content colors, like a category's own color in the data, are fine.)
    const styles = code
      .split("\n")
      .filter((line) => !/\b(label|name|title|key|id)\s*:/.test(line))
      .join("\n");
    const hex = new Set([...styles.matchAll(/\b(?:color|backgroundColor|borderColor|tintColor|shadowColor)\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/g)].map((m) => m[1].toLowerCase()));
    if (hex.size >= 5) add(`hard-codes ${hex.size} colors (${[...hex].slice(0, 4).join(", ")}…); use the theme's colors so the app is consistent and works in dark mode`);
    // Rainbow gradients.
    if (/<LinearGradient[^>]*colors=\{\s*\[\s*['"]#[^\]]*,[^\]]*,[^\]]*\]/.test(code)) add("has a gradient with three or more hard-coded colors; use the theme's gradient, on the hero only");
    // Too many type sizes, or sizes off the scale.
    const sizes = new Set(values(code, "fontSize"));
    // Files holding several screens get room for each one's title.
    // (Long files usually hold several screens, each with its own title: roughly one screen per 150 lines.)
    const screens = Math.max(1, (code.match(/\b(?:function|const)\s+[A-Z]\w*(?:Screen|Tab|Page)\b/g) ?? []).length, Math.ceil(code.split("\n").length / 150));
    if (sizes.size > 6 + 2 * (screens - 1)) add(`uses ${sizes.size} different font sizes (${[...sizes].sort((a, b) => a - b).join(", ")}); keep to about 4 from the type scale for a clear hierarchy`);
    const offType = [...sizes].filter((s) => !FONT_SCALE.has(s));
    if (offType.length >= 2) add(`uses font sizes off the type scale (${offType.join(", ")}); use 12, 13, 15, 17, 20, 22, 28, 34 or 40`);
    // Off-grid spacing.
    const space = ["padding", "paddingHorizontal", "paddingVertical", "paddingTop", "paddingBottom", "margin", "marginTop", "marginBottom", "marginHorizontal", "marginVertical", "gap"].flatMap((p) => values(code, p));
    const offGrid = [...new Set(space.filter((v) => !SPACE_SCALE.has(v)))];
    if (offGrid.length >= 3) add(`uses spacing off the 4-point grid (${offGrid.slice(0, 5).join(", ")}); use 4, 8, 12, 16, 20, 24, 32, 40 or 48`);
    // Heavy shadows.
    const heavy = values(code, "shadowOpacity").some((v) => v >= 0.3) || values(code, "elevation").some((v) => v >= 10);
    if (heavy) add("has heavy shadows (shadowOpacity 0.3+ or elevation 10+); keep depth subtle (at most 0.12 and elevation 4) or use the theme's card style");
    // Mixed corner radii.
    const radii = new Set(values(code, "borderRadius").filter((r) => r > 2 && r < 100));
    if (radii.size > 4) add(`mixes ${radii.size} corner radii (${[...radii].sort((a, b) => a - b).join(", ")}); use the theme's radius.sm, radius.md and radius.lg`);
    // Everything centered.
    const centered = (code.match(/textAlign\s*:\s*['"]center['"]/g) ?? []).length;
    if (centered >= 6) add(`centers text in ${centered} places; left-align titles, paragraphs and lists, and center only empty states, onboarding and single big numbers`);
    // Everything extra bold.
    const heavyType = (code.match(/fontWeight\s*:\s*['"](800|900)['"]/g) ?? []).length;
    if (heavyType >= 4) add(`uses weight 800–900 in ${heavyType} places; use 600–700 for emphasis and keep 800+ for one big display number`);
  }
  return out;
}

export function describeDesign(issues: DesignIssue[]): string {
  return issues.map((i) => `- ${i.file}: ${i.message}`).join("\n");
}
