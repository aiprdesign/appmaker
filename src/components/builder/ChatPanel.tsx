"use client";

import { buildProgress, friendlyFile, latestThoughts, progressNote, type LiveGeneration } from "@/lib/progress";
import { Feedback } from "./Feedback";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, CheckCircle2, Circle, FileCode2, Gauge, Loader2, Palette, RotateCcw, RotateCw, Route, Square, Wrench, X } from "lucide-react";
import { AGENT_NAMES, PASS_SCORE, reviewFixRequest, type Review } from "@/lib/review";
import type { ChatMessage, PendingRequest, SiteSummary } from "@/lib/types";
import { ModelButton } from "@/components/AiSettings";
import { WordingControl } from "@/components/WordingControl";
import type { Wording } from "@/lib/claims";
import { SiteCard } from "@/components/SiteCard";
import { EDIT_SUGGESTIONS, WEBSITE_EDIT_SUGGESTIONS } from "@/lib/templates";
import { Markdown } from "./Markdown";

const MAX_PROMPT = 8000;

interface Props {
  /** Website the app is based on, shown above the conversation. */
  source?: SiteSummary;
  messages: ChatMessage[];
  generating: boolean;
  live: LiveGeneration | null;
  /** The UX and UI agents are reviewing the latest version. */
  reviewing?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  hasApp: boolean;
  /** A redesigned website instead of an app: website suggestions. */
  website?: boolean;
  /** When the running request started, for the progress timer. */
  startedAt: number | null;
  /** A request that was cut off when the page closed. */
  interrupted: PendingRequest | null;
  onRetry: () => void;
  onDismissInterrupted: () => void;
  onOpenFile: (path: string) => void;
  onRestore: (versionId: string) => void;
  /** The user's first request, for "Not what I asked for". */
  prompt: string;
  onFeedback: (messageId: string, value: "up" | "down") => void;
  latestVersionId?: string;
  /** Demo mode can't apply edits, so change suggestions are hidden. */
  demoMode?: boolean;
  wording: Wording;
  onWordingChange: (w: Wording) => void;
}

/** Suggestions the AI listed at the end of its last reply ("- Add …"). */
function suggestionsFrom(messages: ChatMessage[]): string[] {
  const last = [...messages].reverse().find((m) => m.role === "assistant" && !m.error && m.files?.length);
  if (!last) return [];
  return last.content
    .split("\n")
    .map((l) => /^\s*[-*•]\s+(.*)$/.exec(l)?.[1]?.replace(/\*\*/g, "").trim())
    .filter((s): s is string => !!s && s.length > 8 && s.length < 120)
    .slice(0, 4);
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What the AI is doing right now, in its own words while it thinks, then the file it's writing. */
function AiSays({ live }: { live: LiveGeneration | null }) {
  const lines = latestThoughts(live?.thoughts ?? "");
  const now = live?.writing ? `Writing the ${friendlyFile(live.writing).toLowerCase()}…` : null;
  if (!lines.length && !now) return null;
  return (
    <div className="mt-3 rounded-xl border border-line bg-background/50 p-3">
      <p className="text-xs font-medium text-muted">What the AI is doing</p>
      <ul className="mt-1.5 space-y-1 text-xs text-foreground/90">
        {(now ? [...lines.slice(-2), now] : lines).map((l, i, all) => (
          <li key={`${i}-${l}`} className={i === all.length - 1 ? "" : "text-muted"}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live progress for a running request: timer, stages and reassurance. */
function Progress({ live, startedAt }: { live: LiveGeneration | null; startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = startedAt ? now - startedAt : 0;
  const { steps, stage, files } = buildProgress(live);
  const note = progressNote(live, startedAt, now);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
          <span className="shimmer">{steps[stage]}</span>
        </div>
        <span className="font-mono text-xs text-muted" aria-label="Time elapsed">
          {elapsed(ms)}
        </span>
      </div>
      <ol className="mt-3 space-y-1.5" aria-label="Progress">
        {steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 text-xs ${i <= stage ? "text-foreground/90" : "text-muted/60"}`}>
            {i < stage ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : i === stage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {label}
          </li>
        ))}
      </ol>
      <AiSays live={live} />
      {live?.plan && <p className="mt-3 text-muted">{live.plan}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li key={f} className="flex items-center gap-2 font-mono text-xs text-muted">
              {live?.writing === f ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              {f}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p role={note.stalled ? "alert" : undefined} className={`mt-3 text-xs ${note.stalled ? "text-amber-200" : "text-muted"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}

export function ChatPanel(props: Props) {
  const { reviewing, source, messages, generating, live, onSend, onStop, hasApp, startedAt, interrupted, onRetry, onDismissInterrupted, onOpenFile, onRestore, latestVersionId, demoMode, wording, onWordingChange, prompt, onFeedback } = props;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const liveFileCount = live ? Object.keys(live.files).length : 0;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, live?.plan, liveFileCount, generating]);

  const tooLong = draft.length > MAX_PROMPT;
  const submit = () => {
    const text = draft.trim();
    if (!text || generating || tooLong) return;
    setDraft("");
    onSend(text);
  };

  const tailored = suggestionsFrom(messages);
  const chips = tailored.length ? tailored : props.website ? WEBSITE_EDIT_SUGGESTIONS : EDIT_SUGGESTIONS;
  const lastMessage = messages.at(-1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="scrollbar-thin relative min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {source && <SiteCard site={source} />}
        {messages.map((m) =>
          m.kind === "review" && m.review ? (
            <ReviewCard key={m.id} review={m.review} fixing={m.fixing ? (generating || reviewing ? "now" : "sent") : null} canFix={!generating && !demoMode} onFix={() => onSend(reviewFixRequest([m.review!], { all: true }))} />
          ) : m.kind === "auto-fix" ? (
            <details key={m.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                {m.content.startsWith("Automatic UX and UI review") ? "UX and UI agents found things to improve — fixing them" : "Quality check found a problem — fixing it automatically"}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-amber-100/70">{m.content}</pre>
            </details>
          ) : m.role === "user" ? (
            <div key={m.id} className="ml-8 whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-3 text-sm">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="text-sm leading-relaxed text-foreground/90">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-400 text-[10px] text-black">◆</span>
                Appmaker
              </div>
              <Markdown text={m.content} />
              {m.files && m.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.files.map((f) => (
                    <button
                      key={f}
                      onClick={() => onOpenFile(f)}
                      className="inline-flex min-h-6 items-center gap-1 rounded-md border border-line bg-surface px-2 font-mono text-[11px] text-muted hover:border-white/20 hover:text-foreground"
                      title={`Open ${f} in the code view`}
                    >
                      <FileCode2 className="h-3 w-3" />
                      {f}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {m.error && m === lastMessage && !generating && (
                  <button
                    onClick={onRetry}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-white/90"
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Try again
                  </button>
                )}
                {m.versionId && m.versionId === latestVersionId && !generating && (
                  <Feedback value={m.feedback} prompt={prompt} canFix={!demoMode} onChange={(v) => onFeedback(m.id, v)} onFix={(request) => onSend(request)} />
                )}
                {m.versionId && m.versionId !== latestVersionId && !generating && (
                  <button
                    onClick={() => onRestore(m.versionId!)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:border-white/20 hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore this version
                  </button>
                )}
              </div>
            </div>
          ),
        )}

        {interrupted && (
          <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <div className="font-medium text-amber-200">Your last request was interrupted</div>
            <p className="mt-1 text-xs text-muted">The page was closed or reloaded while the app was being built: “{interrupted.prompt.slice(0, 120)}”</p>
            <div className="mt-3 flex gap-2">
              <button onClick={onRetry} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black">
                <RotateCw className="h-3.5 w-3.5" /> Run it again
              </button>
              <button onClick={onDismissInterrupted} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Dismiss
              </button>
            </div>
          </div>
        )}

        {generating && <Progress live={live} startedAt={startedAt} />}
        {reviewing && !generating && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
            <p role="status" className="flex flex-1 items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" /> The review agents and quality critic are checking your app…
            </p>
            <button onClick={onStop} className="min-h-8 shrink-0 rounded-lg px-2 text-foreground underline underline-offset-2 hover:text-white">
              Skip
            </button>
          </div>
        )}
        <div aria-live="polite" className="sr-only">
          {generating ? "Building your app…" : lastMessage?.role === "assistant" ? "Your app is ready." : ""}
        </div>
      </div>

      <div className="border-t border-line p-3">
        {hasApp && !generating && !demoMode && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chips.slice(0, 4).map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                title={s}
                className="min-h-7 max-w-full truncate rounded-full border border-line px-2.5 text-[11px] text-muted hover:border-white/20 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className={`rounded-xl border bg-surface focus-within:border-brand-500/60 ${tooLong ? "border-rose-500/60" : "border-line"}`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={hasApp ? "Ask for a change… (Shift+Enter for a new line)" : "Describe your app…"}
            aria-label="Message"
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center justify-between p-2 pt-0">
            <div className="flex items-center gap-1">
              <ModelButton />
              <WordingControl value={wording} onChange={onWordingChange} />
            </div>
            <div className="flex items-center gap-2">
              {draft.length > MAX_PROMPT * 0.8 && (
                <span className={`text-[11px] ${tooLong ? "text-rose-400" : "text-muted"}`}>
                  {draft.length.toLocaleString()}/{MAX_PROMPT.toLocaleString()}
                </span>
              )}
              {generating ? (
                <button onClick={onStop} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-foreground hover:bg-white/10" aria-label="Stop">
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim() || tooLong}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-brand-400 text-black disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SEVERITY: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-200",
  medium: "bg-amber-500/15 text-amber-200",
  low: "bg-white/5 text-muted",
};

/** What the UX or UI agent found, with a way to fix it when it wasn't fixed automatically. */
function ReviewCard({ review, fixing, canFix, onFix }: { review: Review; fixing: "now" | "sent" | null; canFix: boolean; onFix: () => void }) {
  const Icon = review.agent === "ux" ? Route : review.agent === "critic" ? Gauge : Palette;
  const toFix = review.issues.length;
  return (
    <section aria-label={`${AGENT_NAMES[review.agent]} review`} className="rounded-2xl border border-line bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {AGENT_NAMES[review.agent]}
        {review.agent === "critic" && review.round ? <span className="text-xs font-normal text-muted">· round {review.round}</span> : null}
        <span className="ml-auto text-xs font-normal text-muted">
          {review.agent === "critic" && review.score != null ? (
            <span className="font-semibold text-foreground">
              {review.previous != null && <span className="font-normal text-muted">{review.previous} → </span>}
              {review.score}/100
            </span>
          ) : review.issues.length ? (
            `${review.issues.length} thing${review.issues.length === 1 ? "" : "s"} to improve`
          ) : (
            "Looks good"
          )}
        </span>
      </div>
      {review.checks && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label="The 10 quality checks">
          {review.checks.map((c) => (
            <li key={c.name} className="text-[11px]" title={c.note || undefined}>
              <div className="flex justify-between gap-1">
                <span className="truncate text-muted">{c.name}</span>
                <span className={c.score >= PASS_SCORE ? "text-emerald-300" : c.score >= 6 ? "text-amber-200" : "text-red-300"}>{c.score}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${c.score >= PASS_SCORE ? "bg-emerald-400" : c.score >= 6 ? "bg-amber-300" : "bg-red-400"}`}
                  style={{ width: `${c.score * 10}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {review.summary && <p className="mt-2 text-xs text-muted">{review.summary}</p>}
      {review.issues.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {review.issues.map((i, n) => (
            <li key={n} className="text-xs leading-relaxed text-foreground/90">
              <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY[i.severity]}`}>{i.severity}</span>
              {i.where && <span className="font-medium">{i.where}: </span>}
              {i.problem}
            </li>
          ))}
        </ul>
      )}
      {fixing === "sent" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Wrench className="h-3.5 w-3.5" /> Sent to the AI to fix.
        </p>
      ) : fixing ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
          <Wrench className="h-3.5 w-3.5" />{" "}
          {review.agent === "critic" ? `Fixing the checks under ${PASS_SCORE}, then scoring the app again.` : "The important ones are being fixed automatically."}
        </p>
      ) : (
        toFix > 0 &&
        canFix && (
          <button onClick={onFix} className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-white/90">
            <Wrench className="h-3.5 w-3.5" /> Fix {toFix === 1 ? "it" : `these ${toFix}`}
          </button>
        )
      )}
    </section>
  );
}
