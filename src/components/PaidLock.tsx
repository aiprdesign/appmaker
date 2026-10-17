import Link from "next/link";
import { Lock } from "lucide-react";

/** Shown in place of a paid feature's controls for free accounts. */
export function PaidLock({ feature, signedIn = true }: { feature: string; signedIn?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 text-sm">
      <Lock className="h-4 w-4 shrink-0 text-brand-300" />
      <p className="min-w-0 flex-1 text-brand-100/90">
        {signedIn
          ? `${feature} are part of the paid plan. Buy any credit pack to unlock them for good. No subscription.`
          : `Sign in to use ${feature.toLowerCase()}.`}
      </p>
      <Link href={signedIn ? "/credits" : "/login"} className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-medium text-black">
        {signedIn ? "See credit packs" : "Sign in"}
      </Link>
    </div>
  );
}
