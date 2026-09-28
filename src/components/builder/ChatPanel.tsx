"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CheckCircle2, Circle, FileCode2, Loader2, RotateCcw, RotateCw, Square, Wrench, X } from "lucide-react";
import type { ChatMessage, PendingRequest, SiteSummary } from "@/lib/types";
import { ModelButton } from "@/components/AiSettings";
import { SiteCard } from "@/components/SiteCard";
import type { ParsedGeneration } from "@/lib/parse";
import { EDIT_SUGGESTIONS } from "@/lib/templates";
import { Markdown } from "./Markdown";

const MAX_PROMPT = 8000;

interface Props {
  /** Website the app is based on, shown above the conversation. */
  source?: SiteSummary;
  messages: ChatMessage[];
  generating: boolean;
  live: ParsedGeneration | null;
  onSend: (text: string) => void;
  onStop: () => void;
  hasApp: boolean;
  /** When the running request started, for the progress timer. */
  startedAt: number | null;
  /** A request that was cut off when the page closed. */
  interrupted: PendingRequest | null;
  onRetry: () => void;
  onDismissInterrupted: () => void;
  onOpenFile: (path: string) => void;
  onRestore: (versionId: string) => void;
  latestVersionId?: string;
  /** Demo mode can't apply edits, so change suggestions are hidden. */
  demoMode?: boolean;
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
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live progress for a running request: timer, stages and reassurance. */
function Progress({ live, startedAt }: { live: ParsedGeneration | null; startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = startedAt ? now - startedAt : 0;
  const files = live ? Object.keys(live.files) : [];
  const stage = !live?.plan && files.length === 0 ? 0 : files.length === 0 ? 1 : live?.listing || live?.summary ? 3 : 2;
  const steps = ["Understanding your idea", "Designing the screens", files.length ? `Writing code (${files.length} file${files.length === 1 ? "" : "s"})` : "Writing code", "Finishing touches"];

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
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
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {label}
          </li>
        ))}
      </ol>
      {live?.plan && <p className="mt-3 text-muted">{live.plan}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li key={f} className="flex items-center gap-2 font-mono text-xs text-muted">
              {live?.writing === f ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              {f}
            </li>
          ))}
        </ul>
      )}
      {ms > 20_000 && stage === 0 && (
        <p className="mt-3 text-xs text-muted">The AI plans the whole app before writing — this can take a minute. Keep this tab open.</p>
      )}
      {ms > 90_000 && stage > 0 && <p className="mt-3 text-xs text-muted">Bigger apps take 2–4 minutes. Keep this tab open — it&apos;s still working.</p>}
    </div>
  );
}

export function ChatPanel(props: Props) {
  const { source, messages, generating, live, onSend, onStop, hasApp, startedAt, interrupted, onRetry, onDismissInterrupted, onOpenFile, onRestore, latestVersionId, demoMode } = props;
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
  const chips = tailored.length ? tailored : EDIT_SUGGESTIONS;
  const lastMessage = messages.at(-1);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
        {source && <SiteCard site={source} />}
        {messages.map((m) =>
          m.kind === "auto-fix" ? (
            <details key={m.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                Quality check found a problem — fixing it automatically
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
                <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] text-white">◆</span>
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
        <div aria-live="polite" className="sr-only">
          {generating ? "Building your app…" : lastMessage?.role === "assistant" ? "Your app is ready." : ""}
        </div>
      </div>

      <div className="border-t border-line p-3">
        {hasApp && !generating && !demoMode && (
          <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {chips.map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                title={s}
                className="min-h-7 max-w-[260px] shrink-0 truncate rounded-full border border-line px-2.5 text-[11px] text-muted hover:border-white/20 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className={`rounded-xl border bg-surface focus-within:border-violet-500/60 ${tooLong ? "border-rose-500/60" : "border-line"}`}>
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
            <ModelButton />
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
                  className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white disabled:opacity-40"
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
