import { getAiSettings } from "./ai/settings";

/**
 * Kaizen for app quality: every AI build reports what happened to it as
 * anonymous counts (no prompts, code or personal data), so the admin's
 * Quality page shows which problems happen most, and whether a fix to the
 * AI instructions made them happen less.
 */

export const QUALITY_EVENTS = {
  "build:new": "New apps built",
  "build:edit": "Changes made",
  "check:code": "Code problems found (imports, missing files, unsafe code…)",
  "check:claims": "Marketing claims rewritten",
  "check:regulated": "Health or money claims rewritten",
  cutoff: "Reply too long, finished in parts",
  crash: "App crashed in the preview",
  layout: "Layout didn't fill the screen",
  contrast: "Hard-to-read text (contrast)",
  "text-size": "Text smaller than 11pt",
  overflow: "Content wider than the screen",
  touch: "Buttons too small to tap",
  "screen:clean": "Passed every check in the preview",
  "unfixed:checks": "Problems left after automatic fixes",
  "feedback:up": "👍 from users",
  "feedback:down": "👎 from users",
  "down:looks": "👎 Looks wrong",
  "down:broken": "👎 Something doesn't work",
  "down:wrong": "👎 Not what I asked for",
  "down:layout": "👎 Layout off on a phone",
} as const;

export type QualityEvent = keyof typeof QUALITY_EVENTS;
export const isQualityEvent = (e: unknown): e is QualityEvent => typeof e === "string" && Object.hasOwn(QUALITY_EVENTS, e);

/** What each problem means for the AI instructions: shown on the Quality page. */
export const QUALITY_HINTS: Partial<Record<QualityEvent, string>> = {
  "check:code": "Look at the most common messages in the chat; add the missing rule to the Runtime constraints in src/lib/prompt.ts.",
  crash: "Usually undefined data on first render or a wrong import. Strengthen the 'guard against empty input and missing data' rule.",
  layout: "The layout rules in src/lib/prompt.ts (flex: 1 chain, tab bar last).",
  contrast: "Colors should come from src/theme.js; check apps that hard-code greys.",
  touch: "The 44×44pt rule; icon-only buttons are the usual cause.",
  cutoff: "Apps are too big for one reply: ask for fewer screens in the first version, or use a model with a larger output limit.",
  "down:wrong": "Prompts are being misunderstood: consider asking one clarifying question for vague prompts.",
};

let lastReport = "";

/** Sends counts for this AI build (fire and forget; never blocks the builder). */
export function reportQuality(events: QualityEvent[]): void {
  if (!events.length || typeof window === "undefined") return;
  // The same result twice in a row (e.g. the preview reloading) counts once.
  const key = events.join(",") + Math.floor(Date.now() / 5000);
  if (key === lastReport) return;
  lastReport = key;
  const s = getAiSettings();
  const model = s.provider ? `${s.provider}/${s.model || "default"}` : "";
  fetch("/api/quality", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events, model }), keepalive: true }).catch(
    () => {},
  );
}

const FIXES: Record<string, string> = {
  layout:
    "the root View and every wrapper down to each screen need flex: 1 (no fixed screen heights from Dimensions), each screen's content scrolls in a ScrollView with flex: 1, and the bottom tab bar is the last child of the root column with the bottom safe-area inset as padding",
  contrast: "use the theme's text and muted colors on light backgrounds and onPrimary on primary buttons; never light grey text on white",
  "text-size": "use at least 11pt for all text, 13pt or more for body text",
  overflow: "use flexWrap, flex: 1 or percentage widths instead of fixed widths; put wide rows in a horizontal ScrollView",
  touch: "give every tappable element at least 44×44pt, including icon-only buttons (use padding or minWidth/minHeight)",
};

/** A clear request for the AI to fix what the preview's quality check found. */
export function qualityFixRequest(issues: { kind: string; message: string }[]): string {
  return [
    "the preview on a 390×844 phone found these problems:",
    ...issues.map((i) => `- ${i.message}`),
    "",
    "Fix them so the app looks right on iPhone, Android and the web:",
    ...issues.filter((i) => FIXES[i.kind]).map((i) => `- ${FIXES[i.kind]}`),
    "Keep everything else the same.",
  ].join("\n");
}
