"use client";

import { Check, Moon, Palette, RotateCcw, Sparkles, Sun, Wand2, X } from "lucide-react";
import { contrast, defaultDesign, FONT_FAMILIES, PALETTES, themeFor, usesTheme, type Theme } from "@/lib/design";
import { applyStyle, DESIGN_STYLES, getStyle, pickStyle, STYLE_CATEGORIES, type DesignStyle } from "@/lib/styles";
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

const cssFont = (t: Theme) => (t.headingFamily ? FONT_FAMILIES[t.headingFamily].default : undefined);

/** A tiny sample of a style: its background, a card with a heading and a label, and a button. */
function StyleSample({ theme, id }: { theme: Theme; id: string }) {
  // Glass shows over color, so the sample puts real color behind it.
  const glassBg = `linear-gradient(135deg, ${theme.gradient[0]}aa, ${theme.gradient[1]}88)`;
  const hero = id === "aurora";
  if (id === "bento") {
    const tile = { borderRadius: Math.min(theme.radius.lg, 14), padding: 6 } as const;
    return (
      <div aria-hidden="true" className="grid h-[92px] grid-cols-3 grid-rows-2 gap-1 p-2" style={{ background: theme.colors.background }}>
        <div className="col-span-2 row-span-2 flex flex-col justify-end" style={{ ...tile, background: theme.colors.primary, color: theme.colors.onPrimary }}>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>120</div>
          <div style={{ fontSize: 8, fontWeight: 600 }}>kg record</div>
        </div>
        <div style={{ ...tile, background: theme.colors.primarySoft }} />
        <div style={{ ...tile, background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` }} />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="h-[92px] overflow-hidden p-2" style={{ background: theme.glass && !hero ? glassBg : theme.colors.background }}>
      <div
        className="p-2"
        style={{
          ...(hero ? { color: theme.onGradient } : {}),
          background: hero ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` : ((theme.card.backgroundColor as string) ?? theme.colors.surface),
          backdropFilter: theme.glass ? "blur(8px)" : undefined,
          borderRadius: Math.min(theme.radius.lg, 16),
          boxShadow: theme.card.boxShadow as string | undefined,
          border: theme.card.borderWidth ? `${theme.card.borderWidth as number}px solid ${theme.card.borderColor as string}` : undefined,
        }}
      >
        <div
          style={{
            color: hero ? theme.onGradient : theme.colors.muted,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: theme.labelCaps ? 1 : 0,
            textTransform: theme.labelCaps ? "uppercase" : undefined,
          }}
        >
          Today
        </div>
        <div style={{ color: hero ? theme.onGradient : theme.colors.text, fontFamily: cssFont(theme), fontWeight: Number(theme.font.heading), fontSize: 15, letterSpacing: theme.headingTracking, lineHeight: 1.2 }}>
          Aa Good morning
        </div>
        <div
          className="mt-1.5 inline-block px-2 py-0.5"
          style={{
            background: hero ? "rgba(255,255,255,0.25)" : theme.glass ? `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` : theme.colors.primary,
            color: hero || theme.glass ? theme.onGradient : theme.colors.onPrimary,
            borderRadius: Math.min(theme.radius.md, 999),
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          Start
        </div>
      </div>
    </div>
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
  onRestyle,
  onClose,
  busy,
}: {
  project: Project;
  onChange: (design: AppDesign) => void;
  onMakeCustomizable: () => void;
  /** Asks the AI to rework the layouts in a style (the theme changes instantly; layouts need the AI). */
  onRestyle: (style: DesignStyle) => void;
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
  const current = getStyle(design.style);
  const picked = pickStyle(project.prompt ?? "");
  const chooseStyle = (style: DesignStyle) => onChange(applyStyle(design, style, !!project.source));
  // A scheme sets the brand color and the accent its gradient runs to; a single color gets a matching accent.
  const swatch = (color: string, name: string, accent?: string) => {
    const selected = design.primary.toLowerCase() === color.toLowerCase();
    return (
      <button
        key={color}
        onClick={() => set({ primary: color, accent })}
        aria-label={name}
        aria-pressed={selected}
        title={name}
        className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background ${selected ? "ring-2 ring-white" : "hover:ring-2 hover:ring-white/40"}`}
        style={{ background: accent ? `linear-gradient(135deg, ${color}, ${accent})` : color }}
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Style</span>
            {current && <span className="truncate text-[11px] text-muted">{current.name}</span>}
          </div>
          <p className="mb-2 text-[11px] text-muted">
            Auto-picked for this app: <span className="font-medium text-foreground">{picked.style.name}</span>, {picked.why}.
          </p>
          <div className="space-y-3">
            {STYLE_CATEGORIES.map((c) => (
              <div key={c.id} role="group" aria-label={c.name}>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted/80">{c.name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {DESIGN_STYLES.filter((x) => x.category === c.id).map((x) => {
                    const selected = design.style === x.id;
                    return (
                      <button
                        key={x.id}
                        onClick={() => chooseStyle(x)}
                        aria-pressed={selected}
                        aria-label={`${x.name} style: ${x.blurb}`}
                        className={`overflow-hidden rounded-xl border text-left transition ${selected ? "border-violet-400 ring-2 ring-violet-400/40" : "border-line hover:border-white/25"}`}
                      >
                        <StyleSample id={x.id} theme={themeFor(applyStyle(design, x, !!project.source), x.look.mode === "dark" ? "dark" : "light")} />
                        <div className="bg-surface px-2 py-1.5">
                          <div className="flex items-center gap-1 text-xs font-medium">
                            {selected && <Check className="h-3 w-3 text-violet-300" />}
                            {x.name}
                            {picked.style.id === x.id && <span className="ml-auto rounded-full bg-violet-500/15 px-1.5 text-[9px] font-medium text-violet-200">Auto</span>}
                          </div>
                          <div className="line-clamp-2 text-[10px] leading-tight text-muted">{x.blurb}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {current && themed && (
            <div className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs text-muted">
              Colors, cards and type change straight away. To rework the layouts too (like {current.name}&apos;s{" "}
              {current.id === "bento" ? "tile grid" : current.id === "editorial" ? "magazine layout" : "composition"}), let the AI restyle them.
              <button
                onClick={() => onRestyle(current)}
                disabled={busy}
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-50"
              >
                <Wand2 className="h-3.5 w-3.5" /> Restyle layouts as {current.name}
              </button>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Color scheme</div>
          <div className="flex flex-wrap gap-2">{PALETTES.map((p) => swatch(p.primary, p.name, p.accent))}</div>
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
              onChange={(e) => set({ primary: e.target.value, accent: undefined })}
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
            { value: "auto", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        {design.mode === "auto" && (
          <p className="-mt-3 text-[11px] text-muted">Follows the phone&apos;s light or dark setting. Use the sun/moon button to preview both.</p>
        )}
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
            { value: "glass", label: "Glass" },
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
        <div
          aria-hidden="true"
          className="space-y-2 p-3"
          style={{ background: `linear-gradient(160deg, ${theme.backgroundGradient[0]}, ${theme.backgroundGradient[1]})`, borderRadius: theme.radius.lg }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              color: theme.onGradient,
              borderRadius: theme.radius.lg,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: Number(theme.font.heading),
            }}
          >
            Gradient header
          </div>
          <div
            style={{
              background: (theme.card.backgroundColor as string) ?? theme.colors.surface,
              borderRadius: theme.radius.lg,
              padding: 12,
              boxShadow: theme.card.boxShadow as string | undefined,
              border: theme.card.borderWidth ? `1px solid ${theme.card.borderColor as string}` : undefined,
              backdropFilter: theme.glass ? "blur(12px)" : undefined,
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
