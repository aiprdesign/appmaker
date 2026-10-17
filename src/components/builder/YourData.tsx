"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { DataInputError, STATUS_WORDS, fieldLabel, type DataRules } from "@/lib/app-data";
import { addStep, collectionRequest, fieldRequest, removeStep, screenName, toFieldName, usedBy } from "@/lib/data-editor";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { FileMap } from "@/lib/types";

export type DataCounts = Record<string, { total: number; statuses: Record<string, number> }>;

const KIND: Record<string, string> = {
  public: "you edit it, everyone sees it",
  inbox: "customers send it to you",
  shared: "everyone adds and sees it",
  private: "each person's own",
};
const STOPPED = /^(cancel|declin|reject)/i;
const word = (s: string) => STATUS_WORDS[s] ?? fieldLabel(s);
const chip = "inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-background/60 pl-3 pr-1.5 text-xs";

/** A small "+ Add …" input that turns into a button press. */
function AddInput({ label, hint, onAdd, busy }: { label: string; hint: string; onAdd: (text: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} disabled={busy} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-line px-3 text-xs text-muted hover:border-white/30 hover:text-foreground disabled:opacity-50">
        <Plus className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
    );
  return (
    <form
      className="flex w-full gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText("");
        setOpen(false);
      }}
    >
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={hint} aria-label={label} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs focus:border-brand-400/60 focus:outline-none" />
      <button type="submit" className="min-h-8 rounded-lg bg-white px-3 text-xs font-medium text-black">
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

/**
 * "Your data": what the app keeps, in plain words, and the changes a business can make without
 * breaking anything. Steps change at once; new or removed fields and kinds of data go to the AI
 * so the app's forms and screens change with them. Nothing a screen uses can simply disappear,
 * and removing something that holds customers' data says what happens to it first.
 */
export function YourData({
  rules,
  files,
  counts,
  on,
  busy,
  onRulesChange,
  onAskData,
}: {
  rules: DataRules;
  files: FileMap;
  counts: DataCounts | null;
  on: boolean;
  busy: boolean;
  onRulesChange: (rules: DataRules) => void;
  onAskData: (request: string) => void;
}) {
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);
  const used = usedBy(files);
  const saved = (c: string) => counts?.[c]?.total ?? 0;
  const try_ = (fn: () => void) => {
    setError("");
    try {
      fn();
    } catch (e) {
      setError(e instanceof DataInputError ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Your data</h4>
      {Object.entries(rules).map(([name, r]) => {
        const screens = used[name] ?? [];
        const n = saved(name);
        const real = (r.statuses ?? []).filter((s) => !STOPPED.test(s));
        return (
          <div key={name} className="space-y-2 rounded-xl border border-line bg-background/50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-sm">
                <span className="font-medium">{fieldLabel(name)}</span> <span className="text-muted">· {KIND[r.access]}</span>
              </p>
              {on && counts && <span className="text-xs text-muted">{n === 1 ? "1 saved" : `${n} saved`}</span>}
            </div>
            {screens.length > 0 && <p className="text-xs text-muted">Used by: {screens.map(screenName).join(", ")}</p>}

            <div className="flex flex-wrap gap-1.5" aria-label={`What ${fieldLabel(name).toLowerCase()} keep`}>
              {r.fields.map((f) => (
                <span key={f} className={chip}>
                  {fieldLabel(f)}
                  <button
                    disabled={busy}
                    aria-label={`Remove ${fieldLabel(f)}`}
                    onClick={() =>
                      setConfirm({
                        title: `Remove “${fieldLabel(f)}”?`,
                        body: `The AI takes it out of ${fieldLabel(name).toLowerCase()} and out of the app's forms and screens (it uses a credit).${n ? ` What's already saved on ${n} ${n === 1 ? "item" : "items"} stays visible on your owner page.` : ""}`,
                        label: "Remove it",
                        run: () => onAskData(fieldRequest(name, { remove: f })),
                      })
                    }
                    className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <AddInput label="Add a field" hint="e.g. Table number" busy={busy} onAdd={(t) => try_(() => onAskData(fieldRequest(name, { add: toFieldName(t) })))} />
            </div>

            {r.statuses && (
              <div>
                <p className="text-xs text-muted">Steps customers follow (staff move each one on):</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {real.map((s, i) => {
                    const fixed = i === 0 || i === real.length - 1;
                    const inStep = counts?.[name]?.statuses[s] ?? 0;
                    return (
                      <span key={s} className="inline-flex items-center gap-1">
                        {i > 0 && <ArrowRight className="h-3 w-3 text-muted" aria-hidden />}
                        <span className={`${chip} ${fixed ? "pr-3" : ""}`}>
                          {word(s)}
                          {!fixed && (
                            <button
                              aria-label={`Remove the step ${word(s)}`}
                              onClick={() =>
                                inStep
                                  ? setConfirm({
                                      title: `Remove the step “${word(s)}”?`,
                                      body: `${inStep} ${inStep === 1 ? "is" : "are"} in this step now. They stay there, shown on your owner page and in staff mode, and you can still move them on.`,
                                      label: "Remove the step",
                                      run: () => try_(() => onRulesChange(removeStep(rules, name, s))),
                                    })
                                  : try_(() => onRulesChange(removeStep(rules, name, s)))
                              }
                              className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <div className="mt-1.5">
                  <AddInput label="Add a step" hint="e.g. Out for delivery" busy={busy} onAdd={(t) => try_(() => onRulesChange(addStep(rules, name, t)))} />
                </div>
              </div>
            )}

            {screens.length > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Lock className="h-3 w-3" aria-hidden /> Can&apos;t be removed while the app&apos;s screens use it.
              </p>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: `Remove ${fieldLabel(name).toLowerCase()}?`,
                    body: n
                      ? `${n} saved ${n === 1 ? "item is" : "items are"} kept for 90 days in case you bring it back, then deleted.`
                      : "Nothing is saved in it yet.",
                    label: "Remove",
                    run: () => {
                      const next = { ...rules };
                      delete next[name];
                      onRulesChange(next);
                    },
                  })
                }
                className="text-xs text-muted underline underline-offset-2 hover:text-red-300 disabled:opacity-50"
              >
                Remove {fieldLabel(name).toLowerCase()}
              </button>
            )}
          </div>
        );
      })}
      <AddInput label="Add something new (the AI builds the screens)" hint="e.g. reviews with a star rating" busy={busy} onAdd={(t) => onAskData(collectionRequest(t))} />
      {error && (
        <p role="alert" className="text-xs text-amber-200">
          {error}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Appmaker looks after the database connection, staff mode, PINs and who can see what. They can&apos;t be changed here or by the AI, so the
        business area always works. New fields and kinds of data go through the AI <Sparkles className="inline h-3 w-3" aria-hidden /> so the app&apos;s forms change with them.
      </p>
      {busy && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Working on the app…
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
