import type { FileMap, SiteSummary } from "./types";

/**
 * The owner's say over a website redesign's content:
 * - which sections of the current site to keep (the rest are left out of the
 *   designs and aren't required by the content keeper), and
 * - text they edited right on the design, applied to every design and kept
 *   through later AI changes.
 */

/** A section of the imported site, as "page URL#index". */
export const sectionKey = (pageUrl: string, index: number) => `${pageUrl}#${index}`;

/** The imported site without the sections the owner left out. */
export function selectedSite(site: SiteSummary | undefined, excluded: string[] | undefined): SiteSummary | undefined {
  if (!site || !excluded?.length) return site;
  const out = new Set(excluded);
  return {
    ...site,
    pages: site.pages.map((p) => (p.sections ? { ...p, sections: p.sections.filter((_, i) => !out.has(sectionKey(p.url, i))) } : p)),
  };
}

export interface ContentEdit {
  /** The text as it was (one element's whole text). */
  from: string;
  /** The text the owner wrote. */
  to: string;
}

const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const variants = (t: string) => [...new Set([t, escapeText(t), escapeText(t).replace(/'/g, "&#39;"), escapeText(t).replace(/"/g, "&quot;"), t.replace(/'/g, "’")])];

/**
 * Applies one edit to every page: each place the old text appears as an element's
 * text (between > and <, give or take spaces) becomes the new text. Returns how
 * many places changed (0 when the text is split by other tags, for example).
 */
export function applyEdit(files: FileMap, edit: ContentEdit): { files: FileMap; changed: number } {
  const from = edit.from.trim();
  const to = escapeText(edit.to.trim());
  if (!from || from === edit.to.trim()) return { files, changed: 0 };
  const out: FileMap = { ...files };
  let changed = 0;
  for (const [path, code] of Object.entries(files)) {
    if (!path.endsWith(".html")) continue;
    let next = code;
    for (const v of variants(from)) {
      const pattern = new RegExp(`>(\\s*)${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(\\s*)<`, "g");
      next = next.replace(pattern, (_m, a: string, b: string) => {
        changed += 1;
        return `>${a}${to}${b}<`;
      });
    }
    out[path] = next;
  }
  return { files: out, changed };
}

/** Applies every saved edit, in order (used after the AI writes or rewrites pages). */
export function applyEdits(files: FileMap, edits: ContentEdit[] | undefined): FileMap {
  let out = files;
  for (const e of edits ?? []) out = applyEdit(out, e).files;
  return out;
}

/** Adds an edit to the list, folding a change of a changed text into the first one. */
export function addEdit(edits: ContentEdit[] | undefined, edit: ContentEdit): ContentEdit[] {
  const list = [...(edits ?? [])];
  const earlier = list.findIndex((e) => e.to.trim() === edit.from.trim());
  if (earlier >= 0) list[earlier] = { from: list[earlier].from, to: edit.to };
  else list.push(edit);
  return list.filter((e) => e.from.trim() !== e.to.trim()).slice(-60);
}

/** The edits as the AI is told about them, so later changes keep the owner's words. */
export function editsNote(edits: ContentEdit[] | undefined): string {
  if (!edits?.length) return "";
  return `The owner edited this text on the design. Keep their wording exactly wherever it appears (on every page):\n${edits
    .slice(-30)
    .map((e) => `- “${e.from.slice(0, 200)}” is now “${e.to.slice(0, 400)}”`)
    .join("\n")}`;
}
