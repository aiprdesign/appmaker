import type { SiteSummary } from "./types";

/**
 * A name for a new app before the AI has written its store listing: the
 * website's name, a name the prompt gives ("called Luna", "my salon Studio
 * Luxe"), or the main words of the idea ("Habit Tracker").
 */

const BUSINESS =
  "restaurant|cafe|café|coffee shop|bakery|bar|salon|barber(?:shop)?|spa|gym|studio|clinic|dentist|practice|shop|store|boutique|church|agency|business|company|brand|school|hotel";
const NAME = "([A-Z0-9][\\w'’&.-]*(?:\\s+(?:&\\s+)?[A-Z0-9][\\w'’&.-]*){0,3})";
const STOP = new Set(
  "a an the my our your me i we want need would like to please build make create design develop simple small new basic nice beautiful app apps application mobile ios android native for of".split(
    " ",
  ),
);
const BREAK = new Set("with where that which who to and so using including where you for in on at from".split(" "));

function titleCase(words: string[]): string {
  return words.map((w) => (w.length > 2 || words.length === 1 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export function titleFromPrompt(prompt: string): string {
  const text = prompt.replace(/\s+/g, " ").trim();
  const nameAt = (from: number) => new RegExp(`^["“'‘]?${NAME}`).exec(text.slice(from))?.[1];
  const called = /\b(?:called|named)\s+/.exec(text);
  const business = new RegExp(`\\bmy (?:${BUSINESS})\\s+`, "i").exec(text);
  // The business word matches any case; the name itself must be capitalized.
  const named = (called && nameAt(called.index + called[0].length)) || (business && nameAt(business.index + business[0].length));
  if (named) return named.replace(/[.,]+$/, "").slice(0, 30);
  const words: string[] = [];
  for (const raw of text.replace(/\[[^\]]*\]/g, " ").split(" ")) {
    const w = raw.replace(/[^\p{L}\p{N}'’-]/gu, "");
    if (!w) continue;
    const lower = w.toLowerCase();
    if (words.length && BREAK.has(lower)) break;
    if (STOP.has(lower)) continue;
    words.push(lower);
    if (words.length === 3) break;
  }
  return words.length ? titleCase(words).slice(0, 30) : "My App";
}

export function appTitle(prompt: string, site?: SiteSummary | null): string {
  const siteName = site?.siteName.replace(/\s+/g, " ").trim();
  return siteName ? siteName.slice(0, 30) : titleFromPrompt(prompt);
}
