import { Check } from "lucide-react";

export interface PublishStep {
  title: string;
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
  const done = steps.filter((s) => s.done).length;
  return (
    <nav aria-label="Publishing steps" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{all ? "Publish your app" : `Step ${step + 1} of ${steps.length}: ${steps[step].title}`}</h2>
        <span className="shrink-0 text-xs text-muted">
          {done} of {steps.filter((s) => s.done !== null).length} checks done
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{all ? "Every step on one page." : steps[step].hint}</p>
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
              className="group block min-h-11 w-full py-2 text-left sm:min-h-0"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${!all && i === step ? "bg-gradient-to-r from-violet-500 to-pink-500" : s.done ? "bg-emerald-500/70" : "bg-surface-2 group-hover:bg-white/20"}`}
              />
              <span className={`mt-1.5 hidden items-center gap-1 text-[11px] sm:flex ${!all && i === step ? "font-medium text-foreground" : "text-muted"}`}>
                {s.done ? <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" /> : <span aria-hidden="true">{i + 1}.</span>}
                <span className="truncate">{s.title}</span>
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
