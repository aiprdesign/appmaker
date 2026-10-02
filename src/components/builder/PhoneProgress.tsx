"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { buildProgress, friendlyFile, progressNote, type LiveGeneration } from "@/lib/progress";
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
 * The phone screen while a new app is being made: the app's name and icon as
 * soon as the AI picks them, the steps, each part as it's written, and a
 * sketch of the app that fills in as files arrive.
 */
export function PhoneBuilding({ live, startedAt }: { live: LiveGeneration | null; startedAt: number | null }) {
  const { steps, stage, files } = buildProgress(live);
  const { elapsed, now } = useElapsed(startedAt);
  const note = progressNote(live, startedAt, now);
  const name = live?.listing?.name;
  const color = live?.listing?.primaryColor && /^#[0-9a-f]{6}$/i.test(live.listing.primaryColor) ? live.listing.primaryColor : "#7c3aed";
  const blocks = Math.min(4, files.length);

  return (
    <div
      role="status"
      aria-label="Your app is being made"
      className="flex h-full flex-col bg-gradient-to-b from-violet-50 to-pink-50 px-5 pb-6 pt-14 text-neutral-800"
    >
      <div className="flex items-center gap-3">
        {name ? (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl shadow-sm" style={{ backgroundColor: color }} aria-hidden="true">
            {live?.listing?.iconEmoji ?? "✨"}
          </span>
        ) : (
          <Orb size={48} fast className="shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{name ?? "Your new app"}</p>
          <p className="text-sm text-neutral-600">
            {steps[stage]} · <span className="font-mono tabular-nums">{elapsed}</span>
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-2" aria-label="Steps">
        {steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 text-sm ${i <= stage ? "text-neutral-900" : "text-neutral-600"}`}>
            {i < stage ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : i === stage ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" />
            )}
            {label}
          </li>
        ))}
      </ol>

      {note && (
        <p className={`mt-4 rounded-xl px-3 py-2 text-xs ${note.stalled ? "bg-amber-100 text-amber-900" : "bg-white/70 text-neutral-700"}`}>{note.text}</p>
      )}

      {files.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Parts written so far">
          {files.map((f) => (
            <li
              key={f}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                live?.writing === f ? "bg-violet-600 text-white" : "bg-white text-neutral-700 shadow-sm"
              }`}
            >
              {live?.writing === f ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
              {friendlyFile(f)}
            </li>
          ))}
        </ul>
      )}

      {/* A sketch of the app that fills in as the code arrives. */}
      <div aria-hidden="true" className="mt-auto space-y-2.5 pt-6">
        <div className="h-20 rounded-2xl opacity-90 motion-safe:animate-pulse" style={{ backgroundColor: color }} />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm transition-opacity duration-700 ${i < blocks ? "opacity-100" : "opacity-30"}`}
          >
            <span className="h-8 w-8 shrink-0 rounded-xl" style={{ backgroundColor: `${color}22` }} />
            <span className="flex-1 space-y-1.5">
              <span className="block h-2.5 w-3/5 rounded-full bg-neutral-200" />
              <span className="block h-2 w-2/5 rounded-full bg-neutral-100" />
            </span>
          </div>
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
