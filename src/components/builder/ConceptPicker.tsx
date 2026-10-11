"use client";

import { useState } from "react";
import { Check, Loader2, RotateCw } from "lucide-react";
import { getStyle } from "@/lib/styles";
import { CONCEPT_TIERS, type SiteConcept } from "@/lib/website";
import { SitePreview } from "./SitePreview";

/** The three design concepts side by side: look through each, then choose one. */
export function ConceptPicker({
  concepts,
  onChoose,
  onRetry,
  busy,
}: {
  concepts: SiteConcept[];
  onChoose: (index: number) => void;
  onRetry: (index: number) => void;
  busy: boolean;
}) {
  const firstReady = Math.max(0, concepts.findIndex((c) => c.status === "ready"));
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? firstReady;
  const concept = concepts[shown];
  const writing = concepts.filter((c) => c.status === "writing").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-center">
        <h2 className="text-base font-semibold">Choose a design</h2>
        <p className="text-xs text-muted">
          Your home page and one inside page in three directions: simple, balanced, and bold & colorful.{" "}
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
                {c.tier && <span className="text-muted">· {CONCEPT_TIERS.find((t) => t.tier === c.tier)?.name}</span>}
              </div>
              <div className="truncate text-[11px] text-muted">{style?.name ?? c.style} style</div>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {concept?.status === "ready" ? (
          <SitePreview key={shown} files={concept.files} />
        ) : concept?.status === "failed" ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div>
              <p>Design {shown + 1} couldn&apos;t be made{concept.error ? `: ${concept.error}` : "."}</p>
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
