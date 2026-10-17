"use client";

import { useState } from "react";
import { Check, Loader2, Palette, RotateCw } from "lucide-react";
import { getStyle } from "@/lib/styles";
import { tierName, type SiteConcept } from "@/lib/website";
import type { SiteColors } from "@/lib/types";
import { SitePreview } from "./SitePreview";
import type { ContentEdit } from "@/lib/site-content";

/** The three design concepts side by side: look through each, then choose one. */
export function ConceptPicker({
  concepts,
  onChoose,
  onRetry,
  busy,
  running = false,
  assets,
  onEdit,
}: {
  concepts: SiteConcept[];
  onChoose: (index: number) => void;
  onRetry: (index: number) => void;
  busy: boolean;
  /** Designs are still being made (one at a time): a failed one can be tried again once they're done. */
  running?: boolean;
  /** Screenshot parts of the current site the designs may use. */
  assets?: Record<string, string>;
  /** Text edited on a design: made on all three designs. */
  onEdit?: (edit: ContentEdit) => number;
}) {
  const firstReady = Math.max(
    0,
    concepts.findIndex((c) => c.status === "ready"),
  );
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? firstReady;
  const concept = concepts[shown];
  const writing = concepts.filter((c) => c.status === "writing" || c.status === "queued").length;
  const ready = concepts.filter((c) => c.status === "ready").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Choose a design</h2>
          <p className="text-xs text-muted" aria-live="polite">{writing ? `${ready} of ${concepts.length} ready · ${ready ? "choose one now, or wait for the others" : "designing one at a time"}` : "Two pages each for now; the rest are made in the one you pick."}</p>
        </div>
        <div role="tablist" aria-label="Design options" className="inline-flex rounded-full border border-line p-0.5">
          {concepts.map((c, i) => {
            const style = getStyle(c.style);
            const name = c.tier ? tierName(c.tier) : (style?.name ?? c.style);
            return (
              <button
                key={i}
                role="tab"
                aria-selected={shown === i}
                aria-label={`Design ${i + 1} · ${name}`}
                title={name}
                tabIndex={shown === i ? 0 : -1}
                onClick={() => setPicked(i)}
                onKeyDown={(e) => {
                  // 71. Arrow keys, Home and End move between designs, as in any tab list.
                  const n = concepts.length;
                  const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
                  if (next == null) return;
                  e.preventDefault();
                  setPicked(next);
                  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                }}
                className={`relative inline-flex min-h-9 items-center gap-1.5 overflow-hidden rounded-full px-4 text-sm transition ${shown === i ? "bg-foreground font-medium text-background" : "text-muted hover:text-foreground"}`}
              >
                {c.status === "writing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : c.status === "failed" ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-400" /> : null}
                {i + 1}
                {c.status === "writing" && (
                  <span aria-hidden className="absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-white/20">
                    <span className="block h-full rounded-full bg-brand-400 transition-[width] duration-500" style={{ width: `${c.progress ?? 4}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {concept?.status === "ready" ? (
          <SitePreview key={shown} files={concept.files} assets={assets} onEdit={onEdit} demo />
        ) : concept?.status === "writing" && concept.files["index.html"] ? (
          // The home page is done: look at it while the inside page is written.
          <div className="relative h-full">
            <SitePreview key={`${shown}-early`} files={concept.files} assets={assets} demo />
            <span role="status" className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {concept.stage ?? "Finishing"} · {concept.progress ?? 60}%
            </span>
          </div>
        ) : concept?.status === "failed" ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div>
              <p>
                Design {shown + 1} couldn&apos;t be made{concept.error ? `: ${concept.error}` : "."}
              </p>
              <button
                onClick={() => onRetry(shown)}
                disabled={busy || running}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-4 text-xs text-foreground hover:border-white/20 disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <div role="status" className="w-full max-w-sm space-y-4 px-6">
              <p className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium">
                  {concept?.status === "queued" ? (
                    <>Design {shown + 1} starts after design {shown}…</>
                  ) : (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {concept?.stage ?? "Starting"}…
                    </>
                  )}
                </span>
                <span className="tabular-nums text-muted">{concept?.status === "queued" ? "Waiting" : `${concept?.progress ?? 2}%`}</span>
              </p>
              <ul className="space-y-2.5" aria-label="All designs">
                {concepts.map((c, i) => (
                  <li key={i} className="space-y-1">
                    <span className="flex justify-between text-xs text-muted">
                      <span className={i === shown ? "text-foreground" : ""}>
                        Design {i + 1} · {c.tier ? tierName(c.tier) : (getStyle(c.style)?.name ?? c.style)}
                      </span>
                      <span className="tabular-nums">{c.status === "ready" ? "Ready" : c.status === "failed" ? "Failed" : c.status === "queued" ? "Waiting" : `${c.progress ?? 2}%`}</span>
                    </span>
                    <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-white/10">
                      <span className={`block h-full rounded-full transition-[width] duration-500 ${c.status === "failed" ? "bg-red-400" : "bg-brand-400"}`} style={{ width: `${c.status === "ready" ? 100 : c.status === "queued" ? 0 : (c.progress ?? 2)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs text-muted">{concept ? (concept.tier ? tierName(concept.tier) : (getStyle(concept.style)?.name ?? "")) : ""}</p>
        <button
          onClick={() => onChoose(shown)}
          disabled={busy || concept?.status !== "ready"}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-40"
        >
          <Check className="h-4 w-4" aria-hidden /> Use design {shown + 1}
        </button>
      </div>
    </div>
  );
}

/** Website colours (left column): auto, the brand's own, or custom. */
export function SiteColorsPanel({
  colors,
  brand,
  busy,
  applyLabel,
  onApply,
}: {
  /** The colours the website uses now. */
  colors: SiteColors;
  /** Brand colours found on the current website (logo, buttons, stylesheets). */
  brand: string[];
  busy: boolean;
  applyLabel: string;
  onApply: (colors: SiteColors) => void;
}) {
  const [draft, setDraft] = useState<SiteColors>(colors);
  const [open, setOpen] = useState(false);
  const brandColors = brand.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  const changed = JSON.stringify(draft) !== JSON.stringify(colors);
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Palette className="h-3.5 w-3.5 text-brand-300" />
        <span className="font-medium">Website colors</span>
        <div role="radiogroup" aria-label="Colors" className="flex rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              ["auto", "Auto colors"],
              ["brand", "Brand colors"],
              ["custom", "Custom colors"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              role="radio"
              aria-checked={draft.mode === mode}
              disabled={mode === "brand" && !brandColors.length}
              onClick={() => {
                setOpen(true);
                setDraft(
                  mode === "brand"
                    ? { mode, primary: brandColors[0], accent: brandColors[1] }
                    : mode === "custom"
                      ? { mode, primary: draft.primary ?? brandColors[0] ?? "#4f46e5", accent: draft.accent ?? brandColors[1] ?? "#db2777" }
                      : { mode },
                );
              }}
              className={`rounded-md px-2.5 py-1 ${draft.mode === mode ? "bg-surface-2 font-medium text-foreground" : "text-muted"} disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.mode !== "auto" && draft.primary && (
          <span className="flex items-center gap-1" aria-label="Chosen colors">
            {[draft.primary, draft.accent].filter(Boolean).map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: c }} aria-hidden />
                {/* 74. The color's code, to copy into other tools. */}
                <span className="font-mono text-[11px] uppercase text-muted">{c}</span>
              </span>
            ))}
          </span>
        )}
        {changed && (
          <button
            onClick={() => onApply(draft)}
            disabled={busy}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-50"
          >
            <RotateCw className="h-3.5 w-3.5" /> {applyLabel}
          </button>
        )}
      </div>
      {open && draft.mode === "brand" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          From your logo, buttons and styles:
          {brandColors.map((c, i) => (
            <button
              key={c}
              onClick={() => setDraft({ mode: "brand", primary: c, accent: brandColors.find((x) => x !== c) })}
              aria-label={`Use ${c} as the main brand color`}
              aria-pressed={draft.primary === c}
              className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-background ${draft.primary === c ? "ring-2 ring-white" : "ring-1 ring-white/20"}`}
              style={{ backgroundColor: c }}
              title={i === 0 ? `${c} (most used)` : c}
            />
          ))}
        </div>
      )}
      {draft.mode === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <label className="flex items-center gap-1.5">
            Main
            <input
              type="color"
              value={draft.primary ?? "#4f46e5"}
              onChange={(e) => setDraft({ ...draft, primary: e.target.value })}
              aria-label="Main color"
              className="h-7 w-10 cursor-pointer rounded border border-line bg-surface"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Accent
            <input
              type="color"
              value={draft.accent ?? "#db2777"}
              onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
              aria-label="Accent color"
              className="h-7 w-10 cursor-pointer rounded border border-line bg-surface"
            />
          </label>
          <span>Text stays readable: the designer builds the palette around these.</span>
        </div>
      )}
      {draft.mode === "auto" && open && <p className="mt-2 text-[11px] text-muted">The designer picks the most beautiful palette for each design.</p>}
      {!brandColors.length && (
        <p className="mt-2 text-[11px] text-muted">No brand colors could be read from the website (they may be in an image logo). Pick yours with Custom colors.</p>
      )}
    </div>
  );
}
