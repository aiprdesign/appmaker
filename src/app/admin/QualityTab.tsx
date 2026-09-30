"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";
import { QUALITY_EVENTS, QUALITY_HINTS, type QualityEvent } from "@/lib/quality";
import type { QualityReport } from "@/lib/server/quality";

const PROBLEMS: QualityEvent[] = [
  "check:code",
  "crash",
  "layout",
  "contrast",
  "text-size",
  "overflow",
  "touch",
  "label",
  "cutoff",
  "unfixed:checks",
  "check:claims",
  "check:regulated",
  "down:looks",
  "down:broken",
  "down:wrong",
  "down:layout",
];

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Change over the last 7 days vs the 7 before; for problems, down is good. */
function Trend({ last7, prev7 }: { last7: number; prev7: number }) {
  if (!last7 && !prev7) return <span className="text-muted">—</span>;
  const diff = last7 - prev7;
  if (diff === 0) return <Minus className="inline h-3.5 w-3.5 text-muted" aria-label="No change" />;
  return diff < 0 ? (
    <span className="inline-flex items-center gap-0.5 text-emerald-300">
      <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" /> {Math.abs(diff)} fewer
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-amber-300">
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> {diff} more
    </span>
  );
}

/**
 * The kaizen board: what goes wrong in AI builds, most frequent first, and
 * whether it's getting better week on week. Improve the AI instructions for
 * the top problem, then watch its count fall.
 */
export function QualityTab() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/quality", { cache: "no-store" })
      .then(async (r) => (r.ok ? setReport(await r.json()) : setError((await r.json().catch(() => ({}))).error || "Couldn't load the report.")))
      .catch(() => setError("Couldn't load the report."));
  }, []);
  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!report) return <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading" />;

  const count = (e: QualityEvent) => report.events.find((x) => x.event === e)?.total ?? 0;
  const builds = count("build:new") + count("build:edit");
  const up = count("feedback:up");
  const down = count("feedback:down");
  const problems = report.events.filter((e) => PROBLEMS.includes(e.event as QualityEvent) && e.total > 0).sort((a, b) => b.total - a.total);
  const top = problems[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "AI builds and changes", value: builds.toLocaleString() },
          { label: "Passed every preview check", value: pct(count("screen:clean"), builds) },
          {
            label: "Needed an automatic fix",
            value: pct(
              count("check:code") +
                count("crash") +
                problems.filter((p) => ["layout", "contrast", "text-size", "overflow", "touch", "label"].includes(p.event)).reduce((n, p) => n + p.total, 0),
              builds,
            ),
          },
          { label: "Thumbs up", value: up + down ? pct(up, up + down) : "—" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-xs text-muted">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      {top && (
        <section aria-labelledby="focus" className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
          <h2 id="focus" className="text-sm font-semibold">
            Improve next: {QUALITY_EVENTS[top.event as QualityEvent]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {top.total.toLocaleString()} times in {report.days} days.{" "}
            {QUALITY_HINTS[top.event as QualityEvent] ?? "Look at recent apps with this problem and add a rule for it to the AI instructions."}
          </p>
          <p className="mt-1 text-xs text-muted">
            Kaizen: change one thing, then check this page next week. The arrows compare the last 7 days with the 7 before.
          </p>
        </section>
      )}

      <section aria-labelledby="problems">
        <h2 id="problems" className="font-semibold">
          Problems, most frequent first (last {report.days} days)
        </h2>
        {problems.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No problems recorded yet. Counts appear here as people build apps.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="p-3 font-medium">Problem</th>
                  <th className="p-3 text-right font-medium">Times</th>
                  <th className="p-3 text-right font-medium">Per 100 builds</th>
                  <th className="p-3 text-right font-medium">This week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {problems.map((p) => (
                  <tr key={p.event}>
                    <td className="p-3">{QUALITY_EVENTS[p.event as QualityEvent]}</td>
                    <td className="p-3 text-right tabular-nums">{p.total.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{builds ? Math.round((p.total / builds) * 100) : "—"}</td>
                    <td className="p-3 text-right text-xs">
                      <Trend last7={p.last7} prev7={p.prev7} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {report.models.length > 0 && (
        <section aria-labelledby="models">
          <h2 id="models" className="font-semibold">
            By AI model
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {report.models.map((m) => (
              <li key={m.model} className="flex flex-wrap justify-between gap-2 p-3">
                <span className="font-mono text-xs">{m.model}</span>
                <span className="text-muted">
                  {m.builds.toLocaleString()} builds · {pct(m.clean, m.builds)} passed every check · {m.problems.toLocaleString()} problems
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">Only anonymous counts are kept (no prompts, code or personal data), for 400 days.</p>
    </div>
  );
}
