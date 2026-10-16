import { DEFAULT_WORDING, findClaims, type Wording } from "./claims";
import { checkRegulatedClaims } from "./regulated";

/**
 * Claims in text the owner types themselves (business details, item names and descriptions): the same
 * checks the AI's work gets, so a hand edit can't slip in "the best in town" or "cures back pain".
 * Health, medical and financial claims are always checked; marketing claims when claim-safe wording is on.
 */
export function claimsInText(text: string, wording: Wording = DEFAULT_WORDING): { phrase: string; kind: string; regulated: boolean }[] {
  if (!text.trim()) return [];
  const out: { phrase: string; kind: string; regulated: boolean }[] = [];
  for (const h of checkRegulatedClaims({ "edit.js": `const t = ${JSON.stringify(text)};` })) out.push({ phrase: h.phrase, kind: h.kind, regulated: true });
  if (wording === "claim-safe") {
    for (const h of findClaims(text)) if (!out.some((o) => o.phrase.toLowerCase() === h.phrase.toLowerCase())) out.push({ phrase: h.phrase, kind: h.kind, regulated: false });
  }
  return out;
}
