"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { createProject } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";

export function PromptBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const start = (prompt: string) => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    const project = createProject(text);
    router.push(`/build/${project.id}?auto=1`);
  };

  return (
    <div id="start" className="mx-auto w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(value);
        }}
        className="gradient-border rounded-2xl p-3 shadow-2xl shadow-violet-900/30"
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start(value);
            }
          }}
          rows={3}
          placeholder="Describe your app idea — e.g. a habit tracker with streaks and weekly stats…"
          className="w-full resize-none bg-transparent px-2 py-1 text-base text-foreground outline-none placeholder:text-muted/70"
          aria-label="Describe your app"
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" /> iOS + Android · Expo React Native
          </span>
          <button
            type="submit"
            disabled={!value.trim() || busy}
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white transition disabled:opacity-40"
            aria-label="Build app"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TEMPLATES.slice(0, 5).map((t) => (
          <button
            key={t.title}
            onClick={() => {
              setValue(t.prompt);
              ref.current?.focus();
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted transition hover:border-white/20 hover:text-foreground"
          >
            {t.emoji} {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplateButton({ prompt, children, className }: { prompt: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={() => {
        const project = createProject(prompt);
        router.push(`/build/${project.id}?auto=1`);
      }}
    >
      {children}
    </button>
  );
}
