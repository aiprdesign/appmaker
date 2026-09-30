"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Accessibility, Check, X } from "lucide-react";
import { A11Y_KEY } from "@/lib/a11y";

type Settings = { text: "normal" | "large" | "larger"; contrast: boolean; motion: boolean; links: boolean; spacing: boolean };
const DEFAULTS: Settings = { text: "normal", contrast: false, motion: false, links: false, spacing: false };

function apply(s: Settings) {
  const c = document.documentElement.classList;
  c.toggle("a11y-text-lg", s.text === "large");
  c.toggle("a11y-text-xl", s.text === "larger");
  c.toggle("a11y-contrast", s.contrast);
  c.toggle("a11y-motion", s.motion);
  c.toggle("a11y-links", s.links);
  c.toggle("a11y-spacing", s.spacing);
}

/**
 * The accessibility menu: bigger text, higher contrast, less motion,
 * underlined links and wider text spacing. A floating button on every page
 * (in the builder it sits in the header instead, via `inline`).
 */
export function AccessibilityMenu({ inline = false }: { inline?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setS({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(A11Y_KEY) || "{}") });
    } catch {
      // Defaults.
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, input")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  // The builder has its own button in the header.
  if (!inline && pathname?.startsWith("/build/")) return null;

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    apply(next);
    try {
      localStorage.setItem(A11Y_KEY, JSON.stringify(next));
    } catch {
      // Applies for this visit only.
    }
  };
  const toggle = (key: "contrast" | "motion" | "links" | "spacing", label: string, hint: string) => (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 hover:bg-white/5">
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" checked={s[key]} onChange={(e) => update({ [key]: e.target.checked })} className="h-5 w-5 shrink-0 accent-violet-500" />
    </label>
  );

  return (
    <div className={inline ? "relative" : "fixed bottom-4 left-4 z-50"}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Accessibility settings"
        title="Accessibility settings"
        className={
          inline
            ? "grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
            : "grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-foreground shadow-xl hover:border-white/30"
        }
      >
        <Accessibility className={inline ? "h-4 w-4" : "h-6 w-6"} />
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Accessibility settings"
          className={`absolute z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-3 shadow-2xl ${inline ? "right-0 top-10" : "bottom-14 left-0"}`}
        >
          <div className="flex items-center justify-between px-2 pb-2">
            <h2 className="font-semibold">Accessibility</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close accessibility settings"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <fieldset className="px-2 pb-2">
            <legend className="text-sm text-foreground">Text size</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Text size">
              {(["normal", "large", "larger"] as const).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={s.text === t}
                  onClick={() => update({ text: t })}
                  className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border text-sm capitalize ${s.text === t ? "border-violet-400/60 bg-violet-500/15" : "border-line text-muted hover:text-foreground"}`}
                >
                  {s.text === t && <Check className="h-3.5 w-3.5" />}
                  {t === "normal" ? "Normal" : t === "large" ? "Large" : "Larger"}
                </button>
              ))}
            </div>
          </fieldset>
          {toggle("contrast", "Higher contrast", "Brighter text and borders")}
          {toggle("motion", "Reduce motion", "Stop animations")}
          {toggle("links", "Underline links", "Make links easy to spot")}
          {toggle("spacing", "Text spacing", "More space between letters and lines")}
          <div className="mt-2 flex items-center justify-between border-t border-line px-2 pt-2 text-xs">
            <button onClick={() => update(DEFAULTS)} className="inline-flex min-h-9 items-center text-muted underline underline-offset-2 hover:text-foreground">
              Reset
            </button>
            <Link href="/accessibility" className="inline-flex min-h-9 items-center text-muted underline underline-offset-2 hover:text-foreground">
              Accessibility statement
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
