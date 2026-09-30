"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { creditsInApps, DEFAULT_PACKS, DEFAULT_PRICES, formatPrice, type CreditPack, type Plan, type Prices } from "@/lib/credits";
import { useFeatures } from "@/lib/use-features";

interface Info {
  enabled: boolean;
  currency: string;
  packs: CreditPack[];
  freeCredits: number;
  guestBuilds: number;
  prices?: Prices;
  plan?: Plan;
}

const FALLBACK: Info = { enabled: true, currency: "usd", packs: DEFAULT_PACKS, freeCredits: 10, guestBuilds: 1 };

/**
 * The three ways to use Appmaker, all credit based (no subscriptions): try it
 * without an account, a free account with monthly credits, and the paid plan,
 * which any credit pack unlocks for good. Numbers come from the site's settings.
 */
export function PlanCards({ info: given }: { info?: Info }) {
  const features = useFeatures();
  const [fetched, setFetched] = useState<Info | null>(null);
  useEffect(() => {
    if (given) return;
    let live = true;
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .then((d) => live && setFetched({ ...FALLBACK, ...d }))
      .catch(() => live && setFetched(FALLBACK));
    return () => {
      live = false;
    };
  }, [given]);
  const info = given ?? fetched ?? FALLBACK;

  if (!info.enabled) {
    return (
      <div className="gradient-border mx-auto mt-12 max-w-md rounded-2xl p-6 text-center">
        <h3 className="text-xl font-semibold">Free while we&apos;re in beta</h3>
        <p className="mt-2 text-sm text-muted">Every feature, no credits needed.</p>
        <Link href="/#start" className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-5 py-2.5 text-sm font-medium text-white">
          Get Started for Free
        </Link>
      </div>
    );
  }

  const cheapest = [...info.packs].sort((a, b) => a.price - b.price)[0];
  const cards = [
    {
      key: "guest" as const,
      name: "Try it",
      price: "Free",
      note: "no account needed",
      blurb: "See your idea as a real app in a minute.",
      items: [
        info.guestBuilds === 1 ? "1 free AI build a day" : `${info.guestBuilds} AI builds a day`,
        "Live iPhone & Android preview",
        "Download the Expo project",
      ],
      cta: "Try for Free!",
      href: "/#start",
    },
    {
      key: "free" as const,
      name: "Free account",
      price: "$0",
      note: "forever",
      blurb: "Keep building and test on your phone.",
      items: [
        `${info.freeCredits} credits every month (${creditsInApps(info.freeCredits, info.prices ?? DEFAULT_PRICES)})`,
        "Apps saved to your account, on any device",
        "Test on your phone with Expo Go",
        "Design settings, support page & privacy policy",
        "Made with Appmaker line in your apps",
      ],
      cta: "Get Started for Free",
      href: info.plan && info.plan !== "guest" ? "/#start" : "/login",
    },
    {
      key: "paid" as const,
      name: "Paid",
      price: cheapest ? `from ${formatPrice(cheapest.price, info.currency)}` : "Credit packs",
      note: "one-time, no subscription",
      blurb: "Buy any credit pack and ship to the stores.",
      items: [
        cheapest
          ? `${cheapest.credits} credits for ${formatPrice(cheapest.price, info.currency)} (${creditsInApps(cheapest.credits, info.prices ?? DEFAULT_PRICES)})`
          : "Credit packs of any size",
        "Credits never expire",
        "App Store & Google Play builds",
        ...(features.bookings ? ["Bookings in your apps"] : []),
        "Live updates from your website",
        "No Made with Appmaker line",
        "Unlocked for good with your first pack",
      ],
      cta: "See credit packs",
      href: "/credits",
      highlight: true,
    },
  ];

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-3">
      {cards.map((c) => {
        const current = info.plan === c.key && c.key !== "guest";
        return (
          <div
            key={c.key}
            className={`lift flex flex-col rounded-2xl p-6 ${c.highlight ? "gradient-border gradient-border-live" : "border border-line bg-surface"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{c.name}</h3>
              {current ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Your plan</span>
              ) : c.highlight ? (
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">No subscription</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">{c.blurb}</p>
            <div className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-3xl font-semibold">{c.price}</span>
              <span className="text-sm text-muted">{c.note}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {c.items.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  {c.key === "free" && f.startsWith("Made with") ? (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  )}
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={c.href}
              className={`mt-8 rounded-xl py-2.5 text-center text-sm font-medium ${
                c.highlight ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white" : "border border-line bg-surface-2 hover:border-white/20"
              }`}
            >
              {c.cta}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
