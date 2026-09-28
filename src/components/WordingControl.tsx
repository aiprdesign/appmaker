"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, Type } from "lucide-react";
import { DEFAULT_WORDING, type Wording } from "@/lib/claims";

const KEY = "appmaker.wording.v1";

/** The wording new apps start with (the last choice made on the home page). */
export function defaultWording(): Wording {
  try {
    return window.localStorage.getItem(KEY) === "standard" ? "standard" : DEFAULT_WORDING;
  } catch {
    return DEFAULT_WORDING;
  }
}

export function rememberWording(w: Wording) {
  try {
    window.localStorage.setItem(KEY, w);
  } catch {
    // Not remembered; claim-safe stays the default.
  }
}

const OPTIONS: { value: Wording; label: string; detail: string }[] = [
  {
    value: "claim-safe",
    label: "Claim-safe",
    detail: 'Descriptive text only. Removes "best", "#1", "leading", "100%", "guaranteed", "never", "always", "in seconds", "10x faster" and unsupported "faster"/"better".',
  },
  { value: "standard", label: "Standard", detail: "No wording rules. You're responsible for any claims in the app and listing." },
];

/** Compact "Wording" control shown next to the AI model button. */
export function WordingControl({ value, onChange }: { value: Wording; onChange: (w: Wording) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const safe = value === "claim-safe";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Wording: ${safe ? "Claim-safe" : "Standard"}`}
        title="Wording"
        className={`inline-flex min-h-7 items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${safe ? "text-emerald-300" : "text-muted"} hover:bg-white/5`}
      >
        {safe ? <ShieldCheck className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{safe ? "Claim-safe" : "Standard wording"}</span>
      </button>
      {open && (
        <div role="radiogroup" aria-label="Wording" className="absolute bottom-9 left-0 z-40 w-72 rounded-xl border border-line bg-surface p-2 text-left shadow-xl">
          <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Wording</div>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-2 hover:bg-white/5"
            >
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">{value === o.value && <Check className="h-4 w-4 text-emerald-400" />}</span>
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {o.label}
                  {o.value === DEFAULT_WORDING && <span className="ml-1.5 text-[11px] font-normal text-muted">(default)</span>}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{o.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
