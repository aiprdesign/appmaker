import { DataInputError, fieldLabel, parseRules, type DataRules } from "./app-data";
import type { FileMap } from "./types";

/**
 * "Your data": the shape of an app's data in plain words, and the changes a business can make
 * safely. Steps (statuses) change directly: the trackers, staff mode and owner page read them.
 * New fields and kinds of data go through the AI, so the app's forms and screens change with them.
 */

/** "Table number" → "tableNumber". Throws with a plain message when it can't be a field. */
export function toFieldName(words: string): string {
  const parts = words
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length || !/^[A-Za-z]/.test(parts[0])) throw new DataInputError("Start the name with a letter, e.g. “Table number”.");
  const name = parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join("");
  // The same checks the server makes (names, length, and nothing that must never be collected).
  const ok = parseRules({ x: { access: "public", fields: [name] } }).x.fields.length === 1;
  if (!ok) throw new DataInputError(`Appmaker can't collect “${words.trim()}”: passwords, card numbers, bank and ID details are never stored in apps.`);
  return name;
}

const USE = /useCollection\(\s*['"]([a-z][a-zA-Z0-9_]*)['"]/g;

/** Which files use each collection (a collection a screen uses can't simply be removed). */
export function usedBy(files: FileMap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [path, code] of Object.entries(files)) {
    if (!/\.(js|jsx)$/.test(path) || /(^|\/)(appdata|staff)\.js$/.test(path)) continue;
    for (const m of code.matchAll(USE)) {
      const list = (out[m[1]] ??= []);
      if (!list.includes(path)) list.push(path);
    }
  }
  return out;
}

/** "src/screens/MenuScreen.js" → "Menu screen". */
export const screenName = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/\.(jsx?)$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ (\w)/g, (_, c: string) => " " + c.toLowerCase());

const STOPPED = /^(cancel|declin|reject)/i;

/** Adds a step before the last one ("ready" before "collected"), keeping cancelled at the end. */
export function addStep(rules: DataRules, collection: string, words: string): DataRules {
  const rule = rules[collection];
  const step = words.trim().toLowerCase().replace(/\s+/g, " ");
  if (!rule?.statuses) throw new DataInputError("Only orders and requests have steps.");
  if (!/^[a-z][a-z0-9 '’-]{0,23}$/.test(step)) throw new DataInputError("Use a short name for the step (up to 24 letters), e.g. “Out for delivery”.");
  if (rule.statuses.includes(step)) throw new DataInputError("There's a step with that name already.");
  const real = rule.statuses.filter((s) => !STOPPED.test(s));
  if (real.length >= 7) throw new DataInputError("Keep it to 7 steps at most, so customers can follow it at a glance.");
  const stopped = rule.statuses.filter((s) => STOPPED.test(s));
  const statuses = [...real.slice(0, -1), step, ...real.slice(-1), ...stopped];
  return { ...rules, [collection]: { ...rule, statuses } };
}

/** Removes a step. The first (where new orders start) and the last (done) stay. */
export function removeStep(rules: DataRules, collection: string, step: string): DataRules {
  const rule = rules[collection];
  if (!rule?.statuses) return rules;
  const real = rule.statuses.filter((s) => !STOPPED.test(s));
  if (step === real[0] || step === real[real.length - 1] || STOPPED.test(step)) throw new DataInputError("The first and last steps, and Cancelled, are always kept.");
  return { ...rules, [collection]: { ...rule, statuses: rule.statuses.filter((s) => s !== step) } };
}

/** What the AI is asked, so the data and the app's screens change together. */
export function fieldRequest(collection: string, change: { add: string } | { remove: string }): string {
  const what = fieldLabel(collection).toLowerCase();
  return "add" in change
    ? `Add a field “${fieldLabel(change.add)}” (${change.add}) to ${what}: add it to src/data-rules.json and to the screen or form where people fill in ${what}, and show it where ${what} are listed. Keep everything else the same.`
    : `Remove the field “${fieldLabel(change.remove)}” (${change.remove}) from ${what}: take it out of src/data-rules.json and out of every form and screen. Keep everything else the same.`;
}

export const collectionRequest = (words: string) =>
  `Add a new kind of data to the app: ${words.trim()}. Add it to src/data-rules.json with the right access and fields (collect only what's needed), and build the screens to add and see it. Keep everything else the same.`;
