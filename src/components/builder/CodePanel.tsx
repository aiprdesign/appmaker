"use client";

import { FileCode2 } from "lucide-react";
import type { FileMap } from "@/lib/types";

interface Props {
  files: FileMap;
  selected: string | null;
  onSelect: (path: string) => void;
  onChange: (path: string, code: string) => void;
  readOnly: boolean;
  writing: string | null;
}

export function CodePanel({ files, selected, onSelect, onChange, readOnly, writing }: Props) {
  const paths = Object.keys(files).sort((a, b) => (a === "App.js" ? -1 : b === "App.js" ? 1 : a.localeCompare(b)));
  const current = selected && files[selected] != null ? selected : paths[0];

  if (!paths.length) {
    return <div className="grid h-full place-items-center text-sm text-muted">No files yet — describe your app to get started.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="scrollbar-thin shrink-0 overflow-auto border-b border-line p-2 md:w-56 md:border-b-0 md:border-r">
        <div className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Files</div>
        <div className="flex gap-1 md:flex-col">
          {paths.map((p) => (
            <button
              key={p}
              onClick={() => onSelect(p)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs ${
                p === current ? "bg-surface-2 text-foreground" : "text-muted hover:bg-white/5"
              }`}
            >
              <FileCode2 className={`h-3.5 w-3.5 ${writing === p ? "animate-pulse text-violet-400" : ""}`} />
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="relative min-h-0 flex-1">
        <textarea
          value={files[current] ?? ""}
          onChange={(e) => onChange(current, e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          className="scrollbar-thin h-full w-full resize-none bg-[#0b0b10] p-4 font-mono text-[12.5px] leading-relaxed text-[#d8d6e6] outline-none"
          aria-label={`Source of ${current}`}
        />
        {readOnly && (
          <span className="absolute right-3 top-3 rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-300">
            AI is writing…
          </span>
        )}
      </div>
    </div>
  );
}
