"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Compass, Download, Globe, MoreVertical, Printer, Share, ShoppingBag, Smartphone, SquarePlus } from "lucide-react";
import { QrCode } from "@/components/QrCode";
import { inkOn } from "@/lib/ink";

/** The app's icon, or its first letter on the brand color when it has none. */
function AppBadge({ id, name, hasIcon, color, size }: { id: string; name: string; hasIcon: boolean; color: string; size: number }) {
  const frame = size >= 48 ? "shadow-lg ring-4 ring-white" : "";
  if (hasIcon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/a/${id}/icon`} alt="" width={size} height={size} className={`rounded-[22%] ${frame}`} />;
  }
  return (
    <span aria-hidden className={`grid place-items-center rounded-[22%] font-bold ${frame}`} style={{ width: size, height: size, background: color, color: inkOn(color), fontSize: size * 0.45 }}>
      {name.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}

/** One step: a big number, a picture of what to look for on the phone, and a few words. */
function Step({ n, color, picture, title, text }: { n: number; color: string; picture: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: color, color: inkOn(color) }} aria-hidden>
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-semibold leading-snug">{title}</span>
        {picture}
        {text && <span className="text-sm text-black/65">{text}</span>}
      </span>
    </li>
  );
}

/** A small drawing of the button or menu row to tap, so it's easy to spot on the real phone. */
function Looks({ children, tone = "ios" }: { children: React.ReactNode; tone?: "ios" | "android" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium ${tone === "ios" ? "border-[#0a84ff]/25 bg-[#0a84ff]/[0.07] text-[#0a5fd1]" : "border-[#1a73e8]/25 bg-[#1a73e8]/[0.07] text-[#174ea6]"}`}
    >
      {children}
    </span>
  );
}

/**
 * How customers add the web app to their phone and turn on order updates, with the QR code.
 * Used as the printable poster (/a/[id]/install) for the counter, menu or window.
 */
export function InstallGuide({ id, name, hasIcon, color = "#111111", poster = false }: { id: string; name: string; hasIcon: boolean; color?: string; poster?: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  const url = origin ? `${origin}/a/${id}` : "";
  const brand = /^#[0-9a-f]{6}$/i.test(color) ? color : "#111111";
  const ink = inkOn(brand);

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
      <header className="relative px-6 pb-16 pt-8 text-center" style={{ background: `linear-gradient(135deg, ${brand}, color-mix(in srgb, ${brand} 70%, black))`, color: ink }}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">Free · no app store needed</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">Get the {name} app</h1>
        <p className="mx-auto mt-2 max-w-md opacity-90">Order, book or ask in a tap, and get a ping the moment it&apos;s ready.</p>
      </header>

      <div className="relative z-10 -mt-12 flex flex-col items-center gap-3 px-6">
        <AppBadge id={id} name={name} hasIcon={hasIcon} color={brand} size={88} />
        <div className="relative mt-2 rounded-3xl border-2 border-dashed p-3" style={{ borderColor: brand }}>
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider" style={{ background: brand, color: ink }}>
            Scan me
          </span>
          {url ? <QrCode value={url} size={poster ? 200 : 160} label={`QR code to open the ${name} app`} /> : <div style={{ width: poster ? 200 : 160, height: poster ? 200 : 160 }} />}
        </div>
        <p className="text-sm font-medium">Point your phone&apos;s camera at the code</p>
        {url && <p className="break-all text-xs text-black/50">{url}</p>}
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <section className="rounded-2xl bg-black/[0.03] p-5" aria-labelledby="ios-steps">
          <h2 id="ios-steps" className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Compass className="h-5 w-5 text-[#0a84ff]" aria-hidden /> iPhone (Safari)
          </h2>
          <ol className="space-y-4">
            <Step n={1} color={brand} title="Scan the code" text="It opens in Safari." picture={null} />
            <Step
              n={2}
              color={brand}
              title="Tap Share"
              text="At the bottom of the screen."
              picture={
                <Looks>
                  <Share className="h-4 w-4" /> Share
                </Looks>
              }
            />
            <Step
              n={3}
              color={brand}
              title="Tap “Add to Home Screen”"
              text="Scroll down a little if you don't see it."
              picture={
                <Looks>
                  <SquarePlus className="h-4 w-4" /> Add to Home Screen
                </Looks>
              }
            />
            <Step n={4} color={brand} title="Tap Add. Done!" text={`${name} is on your Home Screen.`} picture={null} />
          </ol>
        </section>
        <section className="rounded-2xl bg-black/[0.03] p-5" aria-labelledby="android-steps">
          <h2 id="android-steps" className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Globe className="h-5 w-5 text-[#34a853]" aria-hidden /> Android (Chrome)
          </h2>
          <ol className="space-y-4">
            <Step n={1} color={brand} title="Scan the code" text="It opens in Chrome." picture={null} />
            <Step
              n={2}
              color={brand}
              title="Tap Install"
              text="At the top of the app."
              picture={
                <Looks tone="android">
                  <Download className="h-4 w-4" /> Install
                </Looks>
              }
            />
            <Step
              n={3}
              color={brand}
              title="No button? Use the menu"
              text="Top right of Chrome."
              picture={
                <Looks tone="android">
                  <MoreVertical className="h-4 w-4" /> Install app
                </Looks>
              }
            />
            <Step n={4} color={brand} title="Open it from your apps. Done!" text="It opens full screen, like any app." picture={null} />
          </ol>
        </section>
      </div>

      <section className="mx-6 mb-6 grid items-center gap-5 rounded-2xl p-5 sm:grid-cols-[1fr_1.1fr]" style={{ background: `color-mix(in srgb, ${brand} 9%, white)` }} aria-labelledby="updates-steps">
        <div>
          <h2 id="updates-steps" className="flex items-center gap-2 text-lg font-bold">
            <BellRing className="h-5 w-5" style={{ color: brand }} aria-hidden /> Never miss “it&apos;s ready”
          </h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Open {name} from your Home Screen
            </li>
            <li className="flex gap-2">
              <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Place your order or booking
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Tap <strong>Turn on updates</strong>, then <strong>Allow</strong>
              </span>
            </li>
          </ol>
          <p className="mt-3 text-xs text-black/55">On iPhone, updates work in the app on your Home Screen (iOS 16.4 or later).</p>
        </div>
        {/* What it looks like: a lock-screen notification. */}
        <div aria-hidden className="rounded-2xl bg-white/80 p-3 shadow-md ring-1 ring-black/5 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-black/50">
            <AppBadge id={id} name={name} hasIcon={hasIcon} color={brand} size={20} />
            {name}
            <span className="ml-auto normal-case tracking-normal">now</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold">Your order is ready</p>
          <p className="text-sm text-black/70">Come and collect it whenever you&apos;re ready.</p>
        </div>
      </section>

      {poster && (
        <div className="flex justify-center pb-6 print:hidden">
          <button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold" style={{ background: brand, color: ink }}>
            <Printer className="h-4 w-4" aria-hidden /> Print this poster
          </button>
        </div>
      )}
    </div>
  );
}
