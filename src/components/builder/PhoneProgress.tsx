"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Image as ImageIcon, Loader2, Palette, Shapes, Sparkles } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { buildingParts, buildProgress, friendlyFile, kebabIcon, progressNote, type LiveGeneration } from "@/lib/progress";
import { autoDesign, PALETTES, rotateHue } from "@/lib/design";
import type { AppDesign, SiteSummary } from "@/lib/types";
import { Orb } from "@/components/fx/Orb";

function useElapsed(startedAt: number | null): { elapsed: string; now: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return { elapsed: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, now };
}

/**
 * The phone screen while a new app is being made: a small version of the app
 * that fills in as the AI writes it, with its name, icon and colors, the
 * photos and icons it uses, and a feed of what was just added.
 */
export function PhoneBuilding({
  live,
  startedAt,
  source,
  design,
  prompt = "",
}: {
  live: LiveGeneration | null;
  startedAt: number | null;
  source?: SiteSummary;
  design?: AppDesign;
  prompt?: string;
}) {
  const { steps, stage, files } = buildProgress(live);
  const { elapsed, now } = useElapsed(startedAt);
  const note = progressNote(live, startedAt, now);
  const parts = buildingParts(live, {
    source,
    design,
    palettes: PALETTES,
    autoColors: (primaryColor) => autoDesign({ primaryColor }, prompt, !!source),
  });
  const name = live?.listing?.name;
  const primary = parts.colors?.primary ?? "#7c3aed";
  const accent = parts.colors?.accent ?? rotateHue(primary, 35);
  const [hero, ...photos] = parts.images;
  const actions = parts.icons.slice(0, 4);
  const tabs = parts.icons.slice(4, 8).length === 4 ? parts.icons.slice(4, 8) : parts.icons.slice(0, 4);
  const rows = 4;

  return (
    <div role="status" aria-label="Your app is being made" className="flex h-full flex-col overflow-hidden bg-neutral-50 text-neutral-800">
      {/* The app's header, in its colors as soon as they're picked. */}
      <div
        className="px-4 pb-4 pt-12 text-white transition-[background] duration-700"
        style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
      >
        <div className="flex items-center gap-3">
          {name ? (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl backdrop-blur build-pop" aria-hidden="true">
              {live?.listing?.iconEmoji ?? "✨"}
            </span>
          ) : (
            <Orb size={44} fast className="shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name ?? "Your new app"}</p>
            <p className="text-xs text-white/85">
              {steps[stage]} · <span className="font-mono tabular-nums">{elapsed}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1" aria-label={`Step ${stage + 1} of ${steps.length}: ${steps[stage]}`}>
          {steps.map((label, i) => (
            <span key={label} className={`h-1 flex-1 rounded-full ${i < stage ? "bg-white" : i === stage ? "bg-white/70 motion-safe:animate-pulse" : "bg-white/25"}`} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 pt-3">
        {/* The hero photo, or a gradient until there is one. */}
        <div className="relative h-28 overflow-hidden rounded-2xl" style={{ background: `linear-gradient(135deg, ${primary}33, ${accent}33)` }}>
          {hero && (
            // eslint-disable-next-line @next/next/no-img-element -- photos from the app's own code or website, any host
            <img key={hero} src={hero} alt="" referrerPolicy="no-referrer" className="build-pop h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
          {parts.imagesFromSite && <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">From your website</span>}
        </div>

        {/* Quick actions: the app's icons as they're added. */}
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={actions[i] ?? i} className="grid aspect-square place-items-center rounded-2xl bg-white shadow-sm">
              {actions[i] ? (
                <span className="build-pop grid h-9 w-9 place-items-center rounded-xl" style={{ backgroundColor: `${primary}1f`, color: primary }}>
                  <DynamicIcon name={kebabIcon(actions[i]) as IconName} size={20} fallback={() => <Sparkles size={20} />} />
                </span>
              ) : (
                <span className="h-9 w-9 rounded-xl bg-neutral-100" />
              )}
            </div>
          ))}
        </div>

        {/* Cards fill in as screens are written; photos join them. */}
        <div className="space-y-2">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm transition-opacity duration-700 ${i < files.length ? "opacity-100" : "opacity-40"}`}>
              {photos[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- see above
                <img key={photos[i]} src={photos[i]} alt="" referrerPolicy="no-referrer" className="build-pop h-10 w-10 shrink-0 rounded-xl object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded-xl" style={{ backgroundColor: `${accent}22` }} />
              )}
              <span className="flex-1 space-y-1.5">
                <span className="block h-2.5 w-3/5 rounded-full bg-neutral-200" />
                <span className="block h-2 w-2/5 rounded-full bg-neutral-100" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* What was just added. */}
      <div className="px-4 pt-2">
        {note && <p className={`mb-2 rounded-xl px-3 py-2 text-xs ${note.stalled ? "bg-amber-100 text-amber-900" : "bg-white text-neutral-700 shadow-sm"}`}>{note.text}</p>}
        <ul aria-label="Just added" className="space-y-1">
          {parts.events.map((e) => (
            <li key={e.key} className="build-pop flex items-center gap-2 text-xs text-neutral-700">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${primary}1f`, color: primary }}>
                {e.kind === "photo" ? <ImageIcon size={12} /> : e.kind === "icon" ? <Shapes size={12} /> : e.kind === "color" ? <Palette size={12} /> : <CheckCircle2 size={12} />}
              </span>
              <span className="truncate">{e.text}</span>
              {e.kind === "color" && parts.colors && (
                <span className="ml-auto flex shrink-0 gap-1" aria-hidden="true">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: parts.colors.primary }} />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
                </span>
              )}
            </li>
          ))}
          {live?.writing && (
            <li className="flex items-center gap-2 text-xs text-neutral-600">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin p-0.5" style={{ color: primary }} />
              <span className="truncate">Writing {friendlyFile(live.writing).toLowerCase()}…</span>
            </li>
          )}
        </ul>
      </div>

      {/* The tab bar, with the app's icons. */}
      <div className="mt-2 flex justify-around border-t border-neutral-200 bg-white px-4 pb-6 pt-2.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={tabs[i] ?? i} className="grid h-6 w-6 place-items-center" style={{ color: i === 0 ? primary : "#a3a3a3" }}>
            {tabs[i] ? (
              <DynamicIcon className="build-pop" name={kebabIcon(tabs[i]) as IconName} size={22} fallback={() => <Circle size={20} />} />
            ) : (
              <span className="h-5 w-5 rounded-md bg-neutral-200" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** While an existing app is being changed: a small live note over the bottom of the phone. */
export function PhoneEditing({ live }: { live: LiveGeneration | null }) {
  const { steps, stage } = buildProgress(live);
  const label = live?.writing ? `Updating ${friendlyFile(live.writing)}` : steps[stage];
  return (
    <div role="status" className="pointer-events-none absolute inset-x-3 bottom-8 z-10 flex justify-center">
      <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-neutral-900/90 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="truncate">{label}…</span>
      </span>
    </div>
  );
}
