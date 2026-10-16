"use client";

import { useEffect, useState } from "react";
import { Compass, Download, Globe, MoreVertical, Plus, Printer, Share, SquarePlus } from "lucide-react";
import { QrCode } from "@/components/QrCode";

/** One step: a number, a picture of the button to look for, and a few words. */
function Step({ n, icon, title, text }: { n: number; icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black text-sm font-semibold text-white" aria-hidden>
        {n}
      </span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-black/10 bg-black/[0.03]" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-black/70">{text}</span>
      </span>
    </li>
  );
}

/**
 * How customers add the web app to their phone, iPhone and Android side by side, with the QR code.
 * Used as a printable poster (/a/[id]/install) and inside the builder's Web app card.
 */
export function InstallGuide({ id, name, hasIcon, poster = false }: { id: string; name: string; hasIcon: boolean; poster?: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  const url = origin ? `${origin}/a/${id}` : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col items-center gap-3 text-center">
        {hasIcon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/a/${id}/icon`} alt="" width={72} height={72} className="rounded-2xl shadow" />
        )}
        <h1 className="text-3xl font-bold">Get the {name} app</h1>
        <p className="text-black/70">Free, no app store needed. Takes 10 seconds.</p>
      </header>

      <div className="flex flex-col items-center gap-2">
        {url && <QrCode value={url} size={poster ? 220 : 160} label={`QR code to open the ${name} app`} />}
        <p className="text-sm font-medium">Point your phone&apos;s camera here</p>
        {url && <p className="break-all text-xs text-black/60">{url}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-black/10 p-5" aria-labelledby="ios-steps">
          <h2 id="ios-steps" className="mb-4 text-lg font-semibold">
            iPhone & iPad
          </h2>
          <ol className="space-y-4">
            <Step n={1} icon={<Compass className="h-5 w-5 text-[#0a84ff]" />} title="Open the link in Safari" text="Scan the code, or tap the link you were sent." />
            <Step n={2} icon={<Share className="h-5 w-5 text-[#0a84ff]" />} title="Tap Share" text="The square with an arrow, at the bottom of the screen." />
            <Step n={3} icon={<SquarePlus className="h-5 w-5" />} title="Tap “Add to Home Screen”" text="Scroll down the list a little if you don't see it." />
            <Step n={4} icon={<Plus className="h-5 w-5" />} title="Tap Add" text={`${name} is now on your Home Screen. Open it from there.`} />
          </ol>
        </section>
        <section className="rounded-2xl border border-black/10 p-5" aria-labelledby="android-steps">
          <h2 id="android-steps" className="mb-4 text-lg font-semibold">
            Android
          </h2>
          <ol className="space-y-4">
            <Step n={1} icon={<Globe className="h-5 w-5 text-[#34a853]" />} title="Open the link in Chrome" text="Scan the code, or tap the link you were sent." />
            <Step n={2} icon={<Download className="h-5 w-5" />} title="Tap Install" text="At the top of the app. No button? Use the menu instead:" />
            <Step n={3} icon={<MoreVertical className="h-5 w-5" />} title="Menu ⋮ → “Install app”" text="Or “Add to Home screen”, then Install." />
            <Step n={4} icon={<Plus className="h-5 w-5" />} title="Open it from your apps" text={`${name} opens full screen, like any app.`} />
          </ol>
        </section>
      </div>

      {poster && (
        <div className="flex justify-center print:hidden">
          <button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 font-medium text-white">
            <Printer className="h-4 w-4" aria-hidden /> Print this poster
          </button>
        </div>
      )}
    </div>
  );
}
