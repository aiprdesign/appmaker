import type { FileMap, StoreListing } from "./types";

/**
 * Claim-safe wording. App text and store listings stay descriptive: no
 * superlatives, absolutes, speed promises or unsupported comparisons, which
 * app stores and advertising rules treat as claims that need proof.
 */

export type Wording = "claim-safe" | "standard";
export const DEFAULT_WORDING: Wording = "claim-safe";

/** Shown wherever wording checks appear: the checks help, the app owner is responsible. */
export const RESPONSIBILITY =
  "You're responsible for everything in your app and its store listing: text, claims, prices, images and features. Make sure it's true, accurate and allowed, and that it follows the law and Apple's and Google's rules. Appmaker's checks help, but they can't catch everything and aren't legal advice.";

export const CLAIM_SAFE_RULES = `## Wording: claim-safe (on)
All user-visible text — screen text, buttons, placeholders, empty states, alerts, notifications and the store listing — must be descriptive, not promotional. Describe what the app does; never make claims about it. Do NOT use:
- superlatives and rankings: "best", "#1", "number one", "leading", "top-rated", "world's fastest" or any "world's …est"
- absolutes: "100%", "guaranteed"/"guarantee", "never", "always"
- speed promises: "in seconds", "instantly", "10x faster" (or any "Nx")
- unsupported comparisons: "faster", "better", "smarter", "easier than"
Write instead, for example: "Track your daily habits", "Plan meals for the week", "Longest streak: 12 days", "Don't miss a day" → "Daily reminder at 8 PM". Neutral labels like "Highest score" or "Longest streak" are fine.`;

interface Rule {
  id: "superlative" | "absolute" | "speed" | "comparative";
  label: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { id: "superlative", label: "superlative or ranking", pattern: /(?:^|[^\w#])(#\s?1|no\.\s?1)(?![\d])|\b(best|number\s+one|leading|top[-\s]rated|world'?s\s+\w+est)\b/gi },
  { id: "absolute", label: "absolute promise", pattern: /\b100\s?%|\b(guarantee[sd]?|never|always)\b/gi },
  { id: "speed", label: "speed promise", pattern: /\bin\s+(seconds|a\s+second|no\s+time)\b|\binstantly\b|\b\d+(\.\d+)?\s?x\s+(faster|better|quicker|more)\b/gi },
  { id: "comparative", label: "unsupported comparison", pattern: /\b(faster|better|quicker|smarter|easier)\b/gi },
];

export interface ClaimHit {
  /** Where it was found: a file path or a store listing field. */
  where: string;
  phrase: string;
  kind: string;
  /** The text around it, for context. */
  context: string;
}

export function findClaims(text: string): { phrase: string; kind: string; index: number }[] {
  const hits: { phrase: string; kind: string; index: number }[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      // "#1" is matched with the character before it; report just "#1".
      const phrase = (rule.id === "superlative" && m[1] ? m[1] : m[0]).trim();
      const index = (m.index ?? 0) + m[0].indexOf(phrase);
      if (!hits.some((h) => index >= h.index && index < h.index + h.phrase.length)) hits.push({ phrase, kind: rule.label, index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Text a person would see in the app: JSX text and prose-like string literals (not imports, keys, colours or URLs). */
export function userFacingText(code: string): string[] {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
    .replace(/^\s*import[^\n]*$/gm, " ")
    .replace(/require\(\s*['"][^'"]*['"]\s*\)/g, " ");
  const out: string[] = [];
  for (const m of stripped.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t && !/^[\w.]+$/.test(t)) out.push(t);
    else if (t && /^[A-Z][a-z]/.test(t)) out.push(t);
  }
  for (const m of stripped.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const t = m[2].replace(/\$\{[^}]*\}/g, " ").trim();
    if (!/[A-Za-z]/.test(t) || /^(https?:|#[0-9a-f]{3,8}$|\.{0,2}\/)/i.test(t)) continue;
    // Prose has spaces or starts with a capital; identifiers and style values don't.
    if (/\s/.test(t) || /^[A-Z][a-z]/.test(t)) out.push(t);
  }
  return out;
}

const LISTING_FIELDS: (keyof StoreListing)[] = ["name", "subtitle", "description", "keywords", "privacyNotes"];

export function checkClaims(files: FileMap, listing?: Partial<StoreListing>): ClaimHit[] {
  const hits: ClaimHit[] = [];
  const add = (where: string, text: string) => {
    for (const h of findClaims(text)) {
      if (hits.some((x) => x.where === where && x.phrase.toLowerCase() === h.phrase.toLowerCase())) continue;
      const start = Math.max(0, h.index - 30);
      hits.push({ where, phrase: h.phrase, kind: h.kind, context: text.slice(start, h.index + h.phrase.length + 30).trim() });
    }
  };
  for (const [path, code] of Object.entries(files)) {
    if (!/\.(jsx?|json)$/.test(path)) continue;
    for (const text of userFacingText(code)) add(path, text);
  }
  for (const field of LISTING_FIELDS) {
    const value = listing?.[field];
    if (typeof value === "string" && value) add(`Store listing: ${field}`, value);
  }
  return hits;
}

/** An instruction for the automatic fix pass. */
export function describeClaims(hits: ClaimHit[]): string {
  return hits.map((h) => `- ${h.where}: "${h.phrase}" (${h.kind}) in “${h.context}”`).join("\n");
}
