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
  assets,
  onEdit,
}: {
  concepts: SiteConcept[];
  onChoose: (index: number) => void;
  onRetry: (index: number) => void;
  busy: boolean;
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
  const writing = concepts.filter((c) => c.status === "writing").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-center">
        <h2 className="text-base font-semibold">Choose a design</h2>
        <p className="text-xs text-muted">
          Your home page and one inside page in three directions: ultra-modern editorial, modern soft &amp; rounded, and a style made for your business.{" "}
          {writing ? `${writing} still being designed…` : "Pick the one you like; then the other pages are made in that design."}
        </p>
      </div>
      <div role="tablist" aria-label="Design options" className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2">
        {concepts.map((c, i) => {
          const style = getStyle(c.style);
          return (
            <button
              key={i}
              role="tab"
              aria-selected={shown === i}
              onClick={() => setPicked(i)}
              className={`rounded-xl border px-3 py-2 text-left transition ${shown === i ? "border-violet-400 bg-violet-500/10" : "border-line hover:border-white/25"}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {c.status === "writing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />}
                Design {i + 1}
                {c.tier && <span className="text-muted">· {tierName(c.tier)}</span>}
              </div>
              <div className="truncate text-[11px] text-muted">{style?.name ?? c.style} style</div>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {concept?.status === "ready" ? (
          <SitePreview key={shown} files={concept.files} assets={assets} onEdit={onEdit} />
        ) : concept?.status === "failed" ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div>
              <p>
                Design {shown + 1} couldn&apos;t be made{concept.error ? `: ${concept.error}` : "."}
              </p>
              <button
                onClick={() => onRetry(shown)}
                disabled={busy}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-foreground hover:border-white/20 disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" /> Try this design again
              </button>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> Designing option {shown + 1}…
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-center">
        <button
          onClick={() => onChoose(shown)}
          disabled={busy || concept?.status !== "ready"}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> Use design {shown + 1} and make the other pages
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
        <Palette className="h-3.5 w-3.5 text-violet-300" />
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
              <span key={c} className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: c }} title={c} />
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
