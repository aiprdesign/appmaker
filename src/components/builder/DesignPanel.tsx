"use client";

import { Check, Moon, Palette, RotateCcw, Sparkles, Sun, X } from "lucide-react";
import { contrast, defaultDesign, PALETTES, themeFor, usesTheme } from "@/lib/design";
import type { AppDesign, Project } from "@/lib/types";

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-muted">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid rounded-lg border border-line bg-surface p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-md px-2 text-xs ${value === o.value ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Change an app's look without the AI: color scheme, light or dark, corners,
 * card style and headings. Every change rewrites src/theme.js and shows in
 * the preview straight away.
 */
export function DesignPanel({
  project,
  onChange,
  onMakeCustomizable,
  onClose,
  busy,
}: {
  project: Project;
  onChange: (design: AppDesign) => void;
  onMakeCustomizable: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const design = project.design ?? defaultDesign(project.listing);
  const set = (patch: Partial<AppDesign>) => onChange({ ...design, ...patch });
  const theme = themeFor(design);
  const themed = usesTheme(project.files);
  const siteColors = (project.source?.colors ?? [])
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c) && !PALETTES.some((p) => p.primary.toLowerCase() === c.toLowerCase()))
    .slice(0, 4);
  const swatch = (color: string, name: string) => {
    const selected = design.primary.toLowerCase() === color.toLowerCase();
    return (
      <button
        key={color}
        onClick={() => set({ primary: color })}
        aria-label={name}
        aria-pressed={selected}
        title={name}
        className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background ${selected ? "ring-2 ring-white" : "hover:ring-2 hover:ring-white/40"}`}
        style={{ background: color }}
      >
        {selected && <Check className="h-4 w-4" style={{ color: contrast("#FFFFFF", color) >= 3 ? "#FFFFFF" : "#111111" }} />}
      </button>
    );
  };

  return (
    <section aria-labelledby="design-title" className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="design-title" className="flex items-center gap-2 font-semibold">
          <Palette className="h-4 w-4 text-violet-300" /> Design
        </h2>
        <button
          onClick={onClose}
          aria-label="Close design"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {!themed && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
            <p>
              This app was made before design settings, so its colors are written into each screen. Make it customizable once, then change the design here any
              time.
            </p>
            <button
              onClick={onMakeCustomizable}
              disabled={busy}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Make this app customizable
            </button>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Color scheme</div>
          <div className="flex flex-wrap gap-2">{PALETTES.map((p) => swatch(p.primary, p.name))}</div>
          {siteColors.length > 0 && (
            <>
              <div className="mb-1.5 mt-3 text-xs font-medium text-muted">From your website</div>
              <div className="flex flex-wrap gap-2">{siteColors.map((c) => swatch(c, `Website color ${c}`))}</div>
            </>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <input
              type="color"
              value={design.primary}
              onChange={(e) => set({ primary: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface"
              aria-label="Custom brand color"
            />
            Any color — text stays readable automatically
          </label>
        </div>
        <Segment
          label="Mode"
          value={design.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <Segment
          label="Corners"
          value={design.corners}
          onChange={(corners) => set({ corners })}
          options={[
            { value: "sharp", label: "Sharp" },
            { value: "rounded", label: "Rounded" },
            { value: "soft", label: "Soft" },
          ]}
        />
        <Segment
          label="Cards"
          value={design.cards}
          onChange={(cards) => set({ cards })}
          options={[
            { value: "flat", label: "Flat" },
            { value: "raised", label: "Raised" },
            { value: "outlined", label: "Outlined" },
          ]}
        />
        <Segment
          label="Headings"
          value={design.headings}
          onChange={(headings) => set({ headings })}
          options={[
            { value: "light", label: "Light" },
            { value: "regular", label: "Regular" },
            { value: "bold", label: "Bold" },
          ]}
        />
        {/* A small sample of the result, so the choices make sense before looking at the phone. */}
        <div aria-hidden="true" className="p-3" style={{ background: theme.colors.background, borderRadius: theme.radius.lg }}>
          <div
            style={{
              background: theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: 12,
              boxShadow: theme.card.boxShadow as string | undefined,
              border: design.cards === "outlined" ? `1px solid ${theme.colors.border}` : undefined,
            }}
          >
            <div style={{ color: theme.colors.text, fontWeight: Number(theme.font.heading), fontSize: 15 }}>Your app</div>
            <div style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>Cards, text and buttons</div>
            <div
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: theme.colors.primary,
                color: theme.colors.onPrimary,
                borderRadius: theme.radius.md,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {design.mode === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />} Button
            </div>
          </div>
        </div>
        <button
          onClick={() => onChange(defaultDesign(project.listing))}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to the app&apos;s brand color
        </button>
      </div>
    </section>
  );
}
