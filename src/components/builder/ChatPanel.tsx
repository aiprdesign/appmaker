"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CheckCircle2, FileCode2, Loader2, Square, Wrench } from "lucide-react";
import type { ChatMessage, SiteSummary } from "@/lib/types";
import { SiteCard } from "@/components/SiteCard";
import type { ParsedGeneration } from "@/lib/parse";
import { EDIT_SUGGESTIONS } from "@/lib/templates";
import { Markdown } from "./Markdown";

interface Props {
  /** Website the app is based on, shown above the conversation. */
  source?: SiteSummary;
  messages: ChatMessage[];
  generating: boolean;
  live: ParsedGeneration | null;
  onSend: (text: string) => void;
  onStop: () => void;
  hasApp: boolean;
}

export function ChatPanel({ source, messages, generating, live, onSend, onStop, hasApp }: Props) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const liveFileCount = live ? Object.keys(live.files).length : 0;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, live?.plan, liveFileCount]);

  const submit = () => {
    const text = draft.trim();
    if (!text || generating) return;
    setDraft("");
    onSend(text);
  };

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
            <div key={m.id} className="ml-8 rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-3 text-sm">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="text-sm leading-relaxed text-foreground/90">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] text-white">
                  ◆
                </span>
                Appmaker
              </div>
              <Markdown text={m.content} />
              {m.files && m.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.files.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-muted"
                    >
                      <FileCode2 className="h-3 w-3" />
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {generating && (
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <span className="shimmer">{live?.plan ? "Building your app" : "Thinking through your app"}</span>
            </div>
            {live?.plan && <p className="mt-2 text-muted">{live.plan}</p>}
            {live && Object.keys(live.files).length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {Object.keys(live.files).map((f) => (
                  <li key={f} className="flex items-center gap-2 font-mono text-xs text-muted">
                    {live.writing === f ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {hasApp && !generating && (
          <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {EDIT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:border-white/20 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-line bg-surface focus-within:border-violet-500/60">
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
            placeholder={hasApp ? "Ask for a change…" : "Describe your app…"}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted/70"
          />
          <div className="flex justify-end p-2 pt-0">
            {generating ? (
              <button
                onClick={onStop}
                className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-foreground hover:bg-white/10"
                aria-label="Stop"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!draft.trim()}
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
  );
}
