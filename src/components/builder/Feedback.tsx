"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { qualityFixRequest, reportQuality, type QualityEvent } from "@/lib/quality";

type Reason = "looks" | "broken" | "wrong" | "layout";

const REASONS: { key: Reason; label: string }[] = [
  { key: "looks", label: "Looks wrong" },
  { key: "broken", label: "Something doesn't work" },
  { key: "wrong", label: "Not what I asked for" },
  { key: "layout", label: "Layout off on my phone" },
];

/** What to ask the AI for each reason: feedback turns straight into a fix. */
export function fixFor(reason: Reason, prompt: string): string {
  switch (reason) {
    case "looks":
      return "The app doesn't look good enough yet. Give it a polished, modern design: a clear visual hierarchy, consistent spacing on an 8pt grid, aligned elements, the theme's colors and card style, readable text sizes, and Lucide icons where they help. Keep every feature and all content.";
    case "broken":
      return "Something in the app doesn't work. Go through every screen and every button: make sure each one does what its label says, forms save and show the new item, lists update, data is still there after a restart, and nothing crashes on empty data. Fix whatever doesn't work.";
    case "wrong":
      return `This isn't what I asked for. My original request was: "${prompt.slice(0, 600)}". Re-read it and change the app so it does exactly that, keeping what already matches.`;
    case "layout":
      return `Quality check: ${qualityFixRequest([{ kind: "layout", message: "The layout looks off on a real phone (reported by the user)." }])}`;
  }
}

/**
 * 👍 / 👎 on the latest version. A 👎 asks why, in one tap, and offers to fix
 * it right away. The counts (anonymous) feed the admin's Quality page.
 */
export function Feedback({
  value,
  prompt,
  canFix,
  onChange,
  onFix,
}: {
  value?: "up" | "down";
  prompt: string;
  canFix: boolean;
  onChange: (v: "up" | "down") => void;
  onFix: (request: string) => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const vote = (v: "up" | "down") => {
    if (value === v) return;
    onChange(v);
    reportQuality([v === "up" ? "feedback:up" : "feedback:down"]);
  };
  const button = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-lg border ${active ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line text-muted hover:border-white/20 hover:text-foreground"}`;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>How&apos;s this version?</span>
        <button onClick={() => vote("up")} aria-label="Good version" aria-pressed={value === "up"} className={button(value === "up")}>
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => vote("down")} aria-label="Needs work" aria-pressed={value === "down"} className={button(value === "down")}>
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {value === "down" && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-2.5">
          <p className="text-xs text-muted">What&apos;s wrong?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What's wrong">
            {REASONS.map((r) => (
              <button
                key={r.key}
                role="radio"
                aria-checked={reason === r.key}
                onClick={() => {
                  if (reason !== r.key) reportQuality([`down:${r.key}` as QualityEvent]);
                  setReason(r.key);
                }}
                className={`min-h-8 rounded-full border px-3 text-xs ${reason === r.key ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line text-muted hover:text-foreground"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {reason && canFix && (
            <button
              onClick={() => {
                onFix(fixFor(reason, prompt));
                setReason(null);
              }}
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black"
            >
              <Wand2 className="h-3.5 w-3.5" /> Fix it
            </button>
          )}
        </div>
      )}
    </div>
  );
}
