"use client";

import { useEffect, useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type { Version } from "@/lib/types";

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Header button listing saved versions of the app, newest first. */
export function HistoryMenu({ versions, disabled, onRestore }: { versions: Version[]; disabled: boolean; onRestore: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = [...versions].reverse();
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!versions.length}
        aria-expanded={open}
        aria-label="Version history"
        className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium hover:border-white/20 disabled:opacity-40"
      >
        <History className="h-3.5 w-3.5" />
        <span className="hidden md:inline">History</span>
        {versions.length > 0 && <span className="text-muted">{versions.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-80 overflow-hidden rounded-xl border border-line bg-background shadow-2xl">
          <div className="border-b border-line px-3 py-2 text-xs text-muted">Every change is saved. Restoring keeps your current version too.</div>
          <ul aria-label="Versions" className="scrollbar-thin max-h-96 overflow-y-auto p-1">
            {list.map((v, i) => (
              <li key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{v.label}</div>
                  <div className="text-[11px] text-muted">
                    {when(v.createdAt)}
                    {i === 0 && " · latest"}
                  </div>
                </div>
                {i > 0 && (
                  <button
                    onClick={() => {
                      onRestore(v.id);
                      setOpen(false);
                    }}
                    disabled={disabled}
                    className="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-xs hover:border-white/20 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
