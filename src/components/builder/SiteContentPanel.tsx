"use client";

import { useState } from "react";
import { ChevronDown, ListChecks, RotateCw } from "lucide-react";
import { sectionKey } from "@/lib/site-content";
import type { SiteSummary } from "@/lib/types";

/**
 * Website content (left column): every section of the imported site, page by
 * page, with a checkbox. Unticked sections are left out of the designs; the
 * content keeper stops asking for them.
 */
export function SiteContentPanel({
  site,
  excluded,
  busy,
  applyLabel,
  onApply,
}: {
  site: SiteSummary;
  excluded: string[];
  busy: boolean;
  applyLabel: string;
  onApply: (excluded: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(excluded);
  const pages = site.pages.filter((p) => p.sections?.length);
  if (!pages.length) return null;
  const total = pages.reduce((n, p) => n + p.sections!.length, 0);
  const kept = total - draft.length;
  const changed = [...draft].sort().join("|") !== [...excluded].sort().join("|");
  const path = (url: string) => {
    try {
      return new URL(url).pathname.replace(/\/$/, "") || "Home page";
    } catch {
      return url;
    }
  };
  const setPage = (url: string, count: number, keep: boolean) =>
    setDraft((d) => {
      const keys = Array.from({ length: count }, (_, i) => sectionKey(url, i));
      const rest = d.filter((k) => !keys.includes(k));
      return keep ? rest : [...rest, ...keys];
    });
  const toggle = (key: string) => setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  return (
    <div className="border-b border-line px-4 py-3 text-xs">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-8 w-full items-center gap-2 text-left">
        <ListChecks className="h-3.5 w-3.5 text-brand-300" />
        <span className="font-medium">Website content</span>
        <span className="text-muted">
          {kept} of {total} sections
        </span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-muted">Untick sections to leave them out of the new website. Everything ticked keeps its words and pictures.</p>
          {/* 72. Keep or leave out everything at once. */}
          <div className="flex gap-2">
            <button onClick={() => setDraft([])} disabled={!draft.length} className="min-h-8 rounded-lg border border-line px-2.5 hover:border-white/20 disabled:opacity-40">
              Keep all
            </button>
            <button
              onClick={() => setDraft(pages.flatMap((p) => p.sections!.map((_, i) => sectionKey(p.url, i))))}
              disabled={kept === 0}
              className="min-h-8 rounded-lg border border-line px-2.5 hover:border-white/20 disabled:opacity-40"
            >
              Leave all out
            </button>
          </div>
          <div className="scrollbar-thin max-h-72 space-y-3 overflow-y-auto pr-1">
            {pages.map((p) => (
              <fieldset key={p.url}>
                <legend className="mb-1 flex w-full items-center gap-2">
                  <span className="font-mono text-[11px] text-foreground/80">{path(p.url)}</span>
                  {/* 73. A whole page's sections in one go. */}
                  <button onClick={() => setPage(p.url, p.sections!.length, true)} aria-label={`Keep all sections of ${path(p.url)}`} className="ml-auto min-h-6 text-muted underline-offset-2 hover:text-foreground hover:underline">
                    all
                  </button>
                  <button onClick={() => setPage(p.url, p.sections!.length, false)} aria-label={`Leave out all sections of ${path(p.url)}`} className="min-h-6 text-muted underline-offset-2 hover:text-foreground hover:underline">
                    none
                  </button>
                </legend>
                <ul className="space-y-1">
                  {p.sections!.map((s, i) => {
                    const key = sectionKey(p.url, i);
                    const label = s.heading || `${s.text.slice(0, 60)}${s.text.length > 60 ? "…" : ""}` || `Pictures (${s.images.length})`;
                    return (
                      <li key={key}>
                        <label className="flex min-h-6 cursor-pointer items-start gap-2">
                          <input type="checkbox" checked={!draft.includes(key)} onChange={() => toggle(key)} className="mt-0.5 h-3.5 w-3.5 accent-brand-500" />
                          <span className={draft.includes(key) ? "text-muted line-through" : ""}>
                            {label}
                            {s.images.length > 0 && <span className="ml-1 text-muted">· {s.images.length} picture{s.images.length === 1 ? "" : "s"}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
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
      )}
    </div>
  );
}
