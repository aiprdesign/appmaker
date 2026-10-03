"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import { AUDIENCES, BRIEF_SKIP_KEY, needsBrief, STYLES, suggestFeatures, type AiBrief, type BriefAnswers } from "@/lib/brief";

/** How long to wait for the AI's questions before using Appmaker's own. */
const ASK_TIMEOUT_MS = 20_000;

/**
 * Before the first build the AI reads the idea and asks up to three
 * questions written for it (or none, and the build starts). Without an AI,
 * or if it's slow, short vague ideas get Appmaker's own three questions:
 * who it's for, must-have features and the look. Every answer is a tap;
 * "Skip" builds straight away.
 */
export function AppBrief({ prompt, onBuild, onCancel }: { prompt: string; onBuild: (answers: BriefAnswers | null) => void; onCancel: () => void }) {
  const suggestions = suggestFeatures(prompt);
  const [a, setA] = useState<BriefAnswers>({ features: suggestions.slice(0, 3) });
  const [never, setNever] = useState(false);
  // "asking": waiting for the AI; "ai": its questions; "fixed": Appmaker's own.
  const [phase, setPhase] = useState<"asking" | "ai" | "fixed">("asking");
  const [ai, setAi] = useState<AiBrief | null>(null);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const box = useRef<HTMLElement>(null);
  const build = useRef(onBuild);
  useEffect(() => {
    build.current = onBuild;
  }, [onBuild]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
    fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ prompt, ai: aiChoiceFor(getAiSettings()) }),
    })
      .then((r) => (r.ok ? r.json() : { brief: null }))
      .then(({ brief }: { brief: AiBrief | null }) => {
        if (brief && brief.questions.length > 0) {
          setAi(brief);
          // The most likely answer to one-choice questions is picked already.
          setPicks(Object.fromEntries(brief.questions.map((q, i) => [i, q.multi ? [] : [q.options[0]]])));
          setPhase("ai");
        } else if (brief) {
          // The idea is clear: nothing to ask.
          build.current(null);
        } else throw new Error("no questions");
      })
      .catch(() => {
        if (cancelled) return;
        if (needsBrief(prompt)) setPhase("fixed");
        else build.current(null);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [prompt]);

  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, [phase]);
  const remember = () => {
    if (!never) return;
    try {
      localStorage.setItem(BRIEF_SKIP_KEY, "1");
    } catch {
      // Asked again next time.
    }
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-violet-400/70 bg-violet-500/15 text-foreground" : "border-line text-muted hover:border-white/20 hover:text-foreground"}`;
  const toggleFeature = (f: string) =>
    setA((x) => ({ ...x, features: x.features.includes(f) ? x.features.filter((y) => y !== f) : [...x.features, f].slice(0, 6) }));

  return (
    <section
      ref={box}
      aria-labelledby="brief-title"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="mt-3 rounded-2xl border border-line bg-surface p-4 text-left sm:p-5"
    >
      <h2 id="brief-title" className="font-semibold">
        {phase === "asking"
          ? "Understanding your idea…"
          : phase === "ai"
            ? "A few questions for a better first version"
            : "Three quick questions for a better first version"}
      </h2>
      {phase === "asking" ? (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-violet-400" /> The AI is reading your idea to ask the right questions.
        </p>
      ) : phase === "ai" && ai?.understood ? (
        <p className="mt-1 text-sm text-foreground/90">
          {ai.understood} <span className="text-muted">Tap what fits, or skip.</span>
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-muted">Optional: tap what fits, or skip.</p>
      )}

      {phase === "ai" &&
        ai?.questions.map((q, i) => (
          <fieldset key={q.q} className="mt-4">
            <legend className="text-sm font-medium">{q.q}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => {
                const on = (picks[i] ?? []).includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      setPicks((p) => {
                        const now = p[i] ?? [];
                        const next = q.multi ? (on ? now.filter((x) => x !== o) : [...now, o]) : on ? [] : [o];
                        return { ...p, [i]: next };
                      })
                    }
                  >
                    {on && <Check className="h-3.5 w-3.5" />} {o}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      {phase === "ai" && (
        <label className="mt-4 block text-xs text-muted">
          Anything else? (optional)
          <input
            value={a.extra ?? ""}
            onChange={(e) => setA({ ...a, extra: e.target.value })}
            maxLength={300}
            placeholder="e.g. share lists with my partner"
            className="mt-1 min-h-9 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-violet-500/60"
          />
        </label>
      )}

      {phase === "fixed" && (
        <>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Who is it for?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AUDIENCES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={a.audience === x.id}
                  className={chip(a.audience === x.id)}
                  onClick={() => setA({ ...a, audience: a.audience === x.id ? undefined : x.id })}
                >
                  {a.audience === x.id && <Check className="h-3.5 w-3.5" />} {x.label}
                </button>
              ))}
            </div>
            {a.audience === "customers" && (
              <label className="mt-2 block text-xs text-muted">
                Business name (optional)
                <input
                  value={a.business ?? ""}
                  onChange={(e) => setA({ ...a, business: e.target.value })}
                  maxLength={80}
                  className="mt-1 min-h-9 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none focus:border-violet-500/60"
                />
              </label>
            )}
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Must-have features</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((f) => (
                <button key={f} type="button" aria-pressed={a.features.includes(f)} className={chip(a.features.includes(f))} onClick={() => toggleFeature(f)}>
                  {a.features.includes(f) && <Check className="h-3.5 w-3.5" />} {f}
                </button>
              ))}
            </div>
            <label className="mt-2 block text-xs text-muted">
              Anything else? (optional)
              <input
                value={a.extra ?? ""}
                onChange={(e) => setA({ ...a, extra: e.target.value })}
                maxLength={300}
                placeholder="e.g. share lists with my partner"
                className="mt-1 min-h-9 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-violet-500/60"
              />
            </label>
          </fieldset>
        </>
      )}

      {phase !== "asking" && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Look and feel</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {STYLES.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={a.style === x.id}
                className={chip(a.style === x.id)}
                onClick={() => setA({ ...a, style: a.style === x.id ? undefined : x.id })}
              >
                {a.style === x.id && <Check className="h-3.5 w-3.5" />} {x.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {phase !== "asking" && (
          <button
            type="button"
            onClick={() => {
              remember();
              onBuild(
                phase === "ai" && ai
                  ? { features: [], extra: a.extra, style: a.style, picks: ai.questions.map((q, i) => ({ q: q.q, choices: picks[i] ?? [] })) }
                  : a,
              );
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-4 text-sm font-medium text-white"
          >
            Build my app <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            remember();
            onBuild(null);
          }}
          className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-muted hover:text-foreground"
        >
          Skip, just build it
        </button>
        <label className="ml-auto flex min-h-10 items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="h-6 w-6 accent-violet-500" />
          Don&apos;t ask me again
        </label>
      </div>
    </section>
  );
}
