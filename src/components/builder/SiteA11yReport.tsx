"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Copy, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { FileMap } from "@/lib/types";
import type { A11yReport } from "@/lib/site-statement";
import { previewDocument, type SiteA11yIssue } from "./SitePreview";

/** WCAG 2.2 success criteria automated tools can't decide: a person checks these. */
const MANUAL_CHECKS: { sc: string; text: string }[] = [
  { sc: "2.1.1", text: "Every menu, button, form and video works with the keyboard alone (Tab, Enter, Space, Esc)." },
  { sc: "2.4.11", text: "The focused item is never hidden behind a sticky header, banner or cookie notice." },
  { sc: "1.1.1", text: "Each picture's text alternative says what matters about it (not just “image”)." },
  { sc: "1.2.2", text: "Videos with speech have captions (YouTube's own captions count)." },
  { sc: "1.4.4 / 1.4.10", text: "At 200% zoom and on a phone, nothing overlaps, is cut off or needs sideways scrolling." },
  { sc: "2.5.7", text: "Anything that can be dragged (sliders, carousels) also works with simple taps or arrows." },
  { sc: "3.2.6", text: "Contact details or help appear in the same place on every page." },
  { sc: "3.3.1 / 3.3.7", text: "Form errors are explained in text, and nothing has to be typed twice." },
  { sc: "3.3.8", text: "No puzzle or memory test is needed to sign in or send a form." },
];

/** Runs the axe-core check (WCAG 2.2 A and AA rules) on one page, in a hidden frame. */
function auditPage(doc: string): Promise<SiteA11yIssue[] | null> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0;visibility:hidden";
    const done = (issues: SiteA11yIssue[] | null) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(issues);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.type !== "appmaker:site-a11y" || !Array.isArray(e.data.violations)) return;
      done(
        (e.data.violations as SiteA11yIssue[])
          .filter((v) => v && typeof v.id === "string" && typeof v.help === "string")
          .map((v) => ({
            id: v.id.slice(0, 60),
            impact: typeof v.impact === "string" ? v.impact : null,
            help: v.help.slice(0, 200),
            count: Number(v.count) || 1,
            sample: (Array.isArray(v.sample) ? v.sample : []).map(String).slice(0, 2),
          })),
      );
    };
    const timer = setTimeout(() => done(null), 25_000);
    window.addEventListener("message", onMessage);
    frame.srcdoc = doc;
    document.body.appendChild(frame);
  });
}

/** 76. Most serious first. */
const IMPACT = ["critical", "serious", "moderate", "minor"];
const rank = (impact: string | null) => (impact && IMPACT.includes(impact) ? IMPACT.indexOf(impact) : IMPACT.length);
export const byImpact = <T extends { impact: string | null }>(issues: T[]) => [...issues].sort((a, b) => rank(a.impact) - rank(b.impact));
const BADGE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-200",
  serious: "bg-orange-500/20 text-orange-200",
  moderate: "bg-amber-500/20 text-amber-200",
  minor: "bg-white/10 text-muted",
};

/** 75. The report as plain text, to paste into an email or a ticket. */
export function reportText(report: A11yReport): string {
  const when = new Date(report.checkedAt).toISOString().slice(0, 10);
  return [
    `WCAG 2.2 level AA check (axe-core), ${when}`,
    ...report.pages.map((p) =>
      p.issues == null
        ? `${p.page}: couldn't be checked`
        : p.issues.length
          ? `${p.page}:\n${byImpact(p.issues).map((i) => `  - [${i.impact ?? "minor"}] ${i.help} (${i.id}, ${i.count}×)`).join("\n")}`
          : `${p.page}: passes`,
    ),
    "",
    "Automated checks find only some problems; a manual review is still needed.",
  ].join("\n");
}

/** One request for the AI covering every page's problems. */
export function siteFixRequest(report: A11yReport): string {
  const lines = report.pages
    .filter((p) => p.issues?.length)
    .map((p) => `${p.page}:\n${byImpact(p.issues!).map((i) => `- ${i.help} (${i.id}, ${i.impact ?? "minor"}, ${i.count} place${i.count === 1 ? "" : "s"})`).join("\n")}`);
  return `WCAG 2.2 AA check (axe-core) of the whole site found:\n${lines.join("\n")}\nFix all of them on every page where they occur, keeping the design and content the same.`;
}

/**
 * The site-wide WCAG 2.2 AA report: every page checked with axe-core, what's wrong
 * and how serious, a Fix all with AI button, and the checks a person has to make.
 * The result also goes into the site's accessibility statement.
 */
export function SiteA11yReport({
  files,
  assets,
  auditSrc,
  report,
  onReport,
  onFix,
}: {
  files: FileMap;
  assets?: Record<string, string>;
  auditSrc?: string;
  report?: A11yReport;
  onReport?: (report: A11yReport) => void;
  onFix?: (request: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<A11yReport | undefined>(report);
  const [copied, setCopied] = useState(false);
  const pages = Object.keys(files)
    .filter((p) => p.endsWith(".html"))
    .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));

  const run = async () => {
    if (!auditSrc) return;
    setOpen(true);
    const out: A11yReport["pages"] = [];
    for (const [i, page] of pages.entries()) {
      setProgress(`Checking ${page} (${i + 1} of ${pages.length})…`);
      const issues = await auditPage(previewDocument(files, page, auditSrc, assets));
      out.push({ page, issues: issues && issues.map(({ id, impact, help, count }) => ({ id, impact, help, count })) });
    }
    const next = { checkedAt: Date.now(), pages: out };
    setResult(next);
    setCopied(false);
    setProgress(null);
    onReport?.(next);
  };

  const shown = result ?? report;
  const checked = shown?.pages.filter((p) => p.issues) ?? [];
  const failing = checked.filter((p) => p.issues!.length);
  const total = failing.reduce((n, p) => n + p.issues!.reduce((m, i) => m + i.count, 0), 0);

  return (
    <>
      <button
        onClick={() => (shown && !open ? setOpen(true) : void run())}
        disabled={!!progress || !auditSrc}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium hover:border-white/20 disabled:opacity-50"
      >
        {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />}
        WCAG 2.2 report
      </button>
      {open && (
        <section aria-labelledby="wcag-report-title" className="basis-full rounded-xl border border-line bg-surface/80 p-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="wcag-report-title" className="text-sm font-semibold">
              WCAG 2.2 level AA report
            </h3>
            <button onClick={() => void run()} disabled={!!progress} className="ml-auto min-h-8 rounded-lg border border-line px-3 hover:border-white/20 disabled:opacity-50">
              Check again
            </button>
            {shown && !progress && (
              <button
                onClick={() => void navigator.clipboard?.writeText(reportText(shown)).then(() => setCopied(true), () => undefined)}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-3 hover:border-white/20"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy report"}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="min-h-8 rounded-lg px-2 text-muted hover:text-foreground">
              Close
            </button>
          </div>
          {progress ? (
            <p role="status" className="mt-2 flex items-center gap-2 text-violet-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}
            </p>
          ) : shown ? (
            <>
              <p role="status" className={`mt-2 flex items-start gap-1.5 ${failing.length ? "text-amber-200" : "text-emerald-300"}`}>
                {failing.length ? <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />}
                {failing.length
                  ? `${total} issue${total === 1 ? "" : "s"} on ${failing.length} of ${checked.length} pages. Automated checks pass on the others.`
                  : `All ${checked.length} pages pass the automated WCAG 2.2 A and AA checks.`}
                {checked.length < (shown.pages.length || 0) ? ` ${shown.pages.length - checked.length} page(s) couldn't be checked.` : ""}
              </p>
              {failing.length > 0 && onFix && (
                <button onClick={() => onFix(siteFixRequest(shown))} className="mt-2 min-h-8 rounded-lg bg-amber-400 px-3 font-medium text-black hover:bg-amber-300">
                  Fix all with AI
                </button>
              )}
              <ul className="mt-3 space-y-1.5">
                {shown.pages.map((p) => (
                  <li key={p.page}>
                    <span className="font-mono">{p.page}</span>:{" "}
                    {p.issues == null ? (
                      <span className="text-muted">couldn&apos;t be checked</span>
                    ) : p.issues.length ? (
                      <ul className="mt-1 space-y-1 pl-3">
                        {byImpact(p.issues).map((i) => (
                          <li key={i.id} className="flex items-start gap-1.5 text-amber-200">
                            {/* 77. How serious, at a glance. */}
                            <span className={`shrink-0 rounded px-1.5 text-[11px] font-medium ${BADGE[i.impact ?? "minor"] ?? BADGE.minor}`}>{i.impact ?? "minor"}</span>
                            <span>
                              {i.help}
                              {i.count > 1 ? ` (${i.count} places)` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-emerald-300">passes</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-3">
                <h4 className="flex items-center gap-1.5 font-semibold">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Check these yourself (automated tools can&apos;t)
                </h4>
                <ul className="mt-2 space-y-1 text-muted">
                  {MANUAL_CHECKS.map((c) => (
                    <li key={c.sc}>
                      <span className="font-mono text-foreground/80">{c.sc}</span> {c.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-muted">
                  The site&apos;s accessibility statement (accessibility.html) is updated with this result. It says the site aims for WCAG 2.2 AA and is partially
                  conformant until a manual review confirms it: automated checks find only some problems.
                </p>
              </div>
            </>
          ) : null}
        </section>
      )}
    </>
  );
}
