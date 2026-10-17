import { Check } from "lucide-react";

export interface PublishStep {
  title: string;
  /** A one-word name for small screens. */
  short: string;
  /** What's still open that this step can fix (never blocks the other steps). */
  todo: { label: string; hint?: string }[];
  hint: string;
  /** true when complete, false when something is missing, null when there's nothing to check. */
  done: boolean | null;
}

/** Publishing, one step at a time: where you are, what's done, and any step one click away. */
export function PublishSteps({
  step,
  steps,
  onStep,
  all,
  onAll,
}: {
  step: number;
  steps: PublishStep[];
  onStep: (i: number) => void;
  /** Every step on one page instead. */
  all: boolean;
  onAll: (all: boolean) => void;
}) {
  const ready = steps.filter((s) => s.done !== false).length;
  const current = steps[step];
  return (
    <nav aria-label="Publishing steps" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{all ? "Publish your app" : `Step ${step + 1} of ${steps.length}: ${steps[step].title}`}</h2>
        <span className="shrink-0 text-xs text-muted">
          {ready} of {steps.length} steps ready
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {all ? "Every step on one page." : current.hint} Do the steps in any order; none of them waits for another.
      </p>
      {!all && current.todo.length > 0 && (
        <div role="status" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="font-medium text-amber-100">{step === steps.length - 1 ? "Still open (ask the AI in the chat)" : "Left on this step"}</div>
          <ul className="mt-1 space-y-1 text-amber-100/80">
            {current.todo.map((t) => (
              <li key={t.label}>
                • {t.label}
                {t.hint && <span className="block pl-3 text-[11px] text-amber-100/60">{t.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="mt-1 grid grid-cols-5 gap-1.5">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button
              onClick={() => {
                onStep(i);
                if (all) onAll(false);
              }}
              aria-current={!all && i === step ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.title}${s.done ? " (done)" : s.done === false ? " (needs attention)" : ""}`}
              className="group block min-h-11 w-full py-2 text-left"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${!all && i === step ? "bg-brand-400" : s.done ? "bg-emerald-500/70" : "bg-surface-2 group-hover:bg-white/20"}`}
              />
              <span className={`mt-1.5 flex items-start gap-1 text-[11px] leading-tight ${!all && i === step ? "font-medium text-foreground" : "text-muted"}`}>
                {s.done ? (
                  <Check className="mt-px h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : s.done === false ? (
                  <span aria-hidden="true" className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                ) : (
                  <span aria-hidden="true">{i + 1}.</span>
                )}
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <button onClick={() => onAll(!all)} className="mt-1 inline-flex min-h-8 items-center text-[11px] text-muted underline underline-offset-2 hover:text-foreground">
        {all ? "Go step by step" : "Show all steps on one page"}
      </button>
    </nav>
  );
}
