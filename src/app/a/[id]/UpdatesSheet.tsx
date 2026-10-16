"use client";

import { useEffect, useRef } from "react";
import { BellRing, Share, SquarePlus } from "lucide-react";
import { inkOn } from "@/lib/ink";

/**
 * "Get a ping when it's ready?": asked right after a customer's first order. Shows exactly what they'll
 * get (a sample notification), and on iPhone in Safari, how to add the app first (Apple only allows
 * notifications from the Home Screen app).
 */
export function UpdatesSheet({
  id,
  name,
  hasIcon,
  color,
  needsInstall,
  busy,
  error,
  onTurnOn,
  onClose,
}: {
  id: string;
  name: string;
  hasIcon: boolean;
  color: string;
  needsInstall: boolean;
  busy: boolean;
  error: string;
  onTurnOn: () => void;
  onClose: () => void;
}) {
  const primary = useRef<HTMLButtonElement>(null);
  const brand = /^#[0-9a-f]{6}$/i.test(color) ? color : "#111111";
  const ink = inkOn(brand);

  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const badge = hasIcon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/a/${id}/icon`} alt="" width={20} height={20} className="rounded-[22%]" />
  ) : (
    <span className="grid h-5 w-5 place-items-center rounded-[22%] text-[11px] font-bold" style={{ background: brand, color: ink }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );

  return (
    <div className="sheet-backdrop fixed inset-0 z-10 flex items-end justify-center bg-black/45 p-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="updates-title"
        aria-describedby="updates-text"
        className="sheet-up w-full max-w-md rounded-[28px] bg-white p-5 text-black shadow-2xl"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center">
          <span className="bell-ring grid h-16 w-16 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${brand} 14%, white)` }} aria-hidden>
            <BellRing className="h-8 w-8" style={{ color: brand }} />
          </span>
        </div>
        <h2 id="updates-title" className="mt-3 text-center text-xl font-bold">
          {needsInstall ? "One step for live updates" : "Get a ping when it's ready?"}
        </h2>

        {needsInstall ? (
          <>
            <p id="updates-text" className="mt-1 text-center text-sm text-black/65">
              iPhone sends updates from the Home Screen app. Your order still updates live right here.
            </p>
            <ol className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-3 rounded-2xl bg-black/[0.04] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: brand, color: ink }}>
                  1
                </span>
                Tap <Share className="h-4 w-4 text-[#0a84ff]" aria-label="Share" /> at the bottom of Safari
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-black/[0.04] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: brand, color: ink }}>
                  2
                </span>
                <span>
                  Tap <SquarePlus className="inline h-4 w-4" aria-hidden /> <strong>Add to Home Screen</strong>
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-black/[0.04] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: brand, color: ink }}>
                  3
                </span>
                Open {name} from there: we&apos;ll ask again
              </li>
            </ol>
          </>
        ) : (
          <>
            <p id="updates-text" className="mt-1 text-center text-sm text-black/65">
              We&apos;ll let you know when it&apos;s being made and when it&apos;s ready, even with the app closed. Nothing else.
            </p>
            {/* What they'll get: a lock-screen notification. */}
            <div aria-hidden className="notif-in mt-4 rounded-2xl bg-neutral-100 p-3 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-black/50">
                {badge}
                {name}
                <span className="ml-auto normal-case tracking-normal">now</span>
              </div>
              <p className="mt-1 text-sm font-semibold">Your order is ready</p>
              <p className="text-sm text-black/70">Come and collect it whenever suits you.</p>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {needsInstall ? (
            <button ref={primary} onClick={onClose} className="min-h-12 rounded-full font-semibold outline-none focus-visible:ring-4 focus-visible:ring-black/15" style={{ background: brand, color: ink }}>
              Got it
            </button>
          ) : (
            <>
              <button ref={primary} onClick={onTurnOn} disabled={busy} className="min-h-12 rounded-full font-semibold outline-none focus-visible:ring-4 focus-visible:ring-black/15 disabled:opacity-60" style={{ background: brand, color: ink }}>
                {busy ? "Turning on…" : "Turn on updates"}
              </button>
              <button onClick={onClose} className="min-h-11 rounded-full font-medium text-black/60">
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
