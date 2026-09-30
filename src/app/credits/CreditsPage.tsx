"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Coins, Loader2, Lock, Sparkles } from "lucide-react";
import { formatPrice, type CreditPack, type Plan } from "@/lib/credits";
import { PlanCards } from "@/components/PlanCards";
import { PLAN_CHANGED } from "@/lib/use-plan";

interface CreditsInfo {
  enabled: boolean;
  currency: string;
  packs: CreditPack[];
  costs: { generate: number; build: number; phonePreview: number };
  freeCredits: number;
  guestBuilds: number;
  mode: "test" | "live" | null;
  signedIn?: boolean;
  plan?: Plan;
  balance?: number;
  history?: { delta: number; reason: string; at: string }[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data as T;
}

/** Balance, credit packs (Stripe Checkout), what things cost, and recent activity. */
export function CreditsPage() {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmed = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/credits", { cache: "no-store" });
    setInfo(await res.json());
  }, []);

  useEffect(() => {
    // Back from Stripe: confirm the payment so the credits show up straight away.
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    if (params.get("canceled")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage({ ok: false, text: "Payment canceled. You weren't charged." });
    }
    if (session && !confirmed.current) {
      confirmed.current = true;
      post<{ added: boolean; balance: number }>("/api/credits/confirm", { sessionId: session })
        .then(() => {
          setMessage({ ok: true, text: "Payment received. Your credits are ready, and the paid features are unlocked. Thank you!" });
          window.dispatchEvent(new Event(PLAN_CHANGED));
        })
        .catch((e) => setMessage({ ok: false, text: e.message }))
        .finally(() => void load());
      window.history.replaceState(null, "", "/credits");
    } else void load();
  }, [load]);

  const buy = async (pack: CreditPack) => {
    setBuying(pack.id);
    setMessage(null);
    try {
      const { url } = await post<{ url: string }>("/api/credits/checkout", { pack: pack.id });
      window.location.assign(url);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't start the payment." });
      setBuying(null);
    }
  };

  if (!info) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted" aria-label="Loading" />;

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <Coins className="h-7 w-7 text-amber-300" /> Credits
      </h1>
      {!info.enabled ? (
        <p className="mt-4 rounded-2xl border border-line bg-surface p-5 text-muted">
          Everything is free on this site right now — no credits needed.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-2">
            Start building
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted">Credits pay for AI building and cloud builds. They never expire, and there&apos;s no subscription.</p>
          {message && (
            <p
              role={message.ok ? "status" : "alert"}
              className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-100"}`}
            >
              {message.ok && <CheckCircle2 className="h-4 w-4 shrink-0" />} {message.text}
            </p>
          )}
          {info.mode === "test" && (
            <p className="mt-3 text-xs text-amber-200">Test mode: use Stripe&apos;s test card 4242 4242 4242 4242. No real money is charged.</p>
          )}

          {!info.signedIn ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
              <Lock className="mx-auto h-6 w-6 text-muted" />
              <p className="mt-2">Sign in to see your credits and buy more.</p>
              <p className="mt-1 text-sm text-muted">Free accounts get {info.freeCredits} credits every month.</p>
              <Link href="/login" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-black">
                Sign in or create an account
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-end gap-3 rounded-2xl border border-line bg-surface p-6">
                <div>
                  <div className="text-sm text-muted">Your balance</div>
                  <div className="text-5xl font-semibold tabular-nums tracking-tight" data-testid="credit-balance">
                    {info.balance?.toLocaleString()}
                  </div>
                </div>
                <span className="mb-2 text-muted">credits</span>
                <div className="mb-1 ml-auto text-right text-sm">
                  {info.plan === "paid" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Paid plan
                    </span>
                  ) : (
                    <span className="text-muted">
                      Free plan: {info.freeCredits} credits a month.
                      <br />
                      Any pack unlocks store builds, live website updates and more.
                    </span>
                  )}
                </div>
              </div>

              <h2 className="mt-10 text-xl font-semibold">Buy credits</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {info.packs.map((pack) => (
                  <div key={pack.id} className={`lift flex flex-col rounded-2xl p-5 ${pack.badge ? "gradient-border" : "border border-line bg-surface"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{pack.name}</h3>
                      {pack.badge && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">{pack.badge}</span>}
                    </div>
                    <div className="mt-3 text-3xl font-semibold tabular-nums">{pack.credits.toLocaleString()}</div>
                    <div className="text-sm text-muted">credits</div>
                    <div className="mt-3 text-lg font-medium">{formatPrice(pack.price, info.currency)}</div>
                    <div className="text-xs text-muted">{formatPrice(Math.round(pack.price / pack.credits), info.currency)} per credit</div>
                    <button
                      onClick={() => buy(pack)}
                      disabled={!!buying}
                      className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-60"
                      aria-label={`Buy ${pack.credits} credits for ${formatPrice(pack.price, info.currency)}`}
                    >
                      {buying === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Buy
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <Lock className="h-3.5 w-3.5" /> Secure payment by Stripe. Card details never touch this site.
              </p>
            </>
          )}

          <h2 className="mt-10 text-xl font-semibold">Plans</h2>
          <PlanCards info={{ ...info, plan: info.signedIn ? info.plan : "guest" }} />

          <h2 className="mt-10 text-xl font-semibold">What uses credits</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            <li className="flex justify-between p-4">
              <span>An AI build or change</span>
              <span className="tabular-nums text-muted">{info.costs.generate} credit</span>
            </li>
            <li className="flex justify-between p-4">
              <span>An App Store or Google Play cloud build</span>
              <span className="tabular-nums text-muted">{info.costs.build} credits</span>
            </li>
            <li className="flex justify-between p-4">
              <span>A phone preview (Expo Go QR code)</span>
              <span className="tabular-nums text-muted">{info.costs.phonePreview} credit</span>
            </li>
            <li className="flex justify-between p-4">
              <span>Automatic quality fixes, editing code by hand, downloads, store pages</span>
              <span className="text-emerald-300">Free</span>
            </li>
          </ul>

          {info.history && info.history.length > 0 && (
            <>
              <h2 className="mt-10 text-xl font-semibold">Recent activity</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
                {info.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate">{h.reason}</div>
                      <div className="text-xs text-muted">{new Date(h.at).toLocaleString()}</div>
                    </div>
                    <span className={`shrink-0 tabular-nums font-medium ${h.delta > 0 ? "text-emerald-300" : "text-muted"}`}>
                      {h.delta > 0 ? "+" : ""}
                      {h.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
