import { SiteHeader } from "@/components/SiteHeader";
import { PageAura } from "@/components/fx/PageAura";
import { Orb } from "@/components/fx/Orb";
import { Check } from "lucide-react";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in — Appmaker" };

const POINTS = [
  "Your apps saved to your account, on every device",
  "Free to start, no card needed",
  "Test on your phone and publish to the App Store and Google Play",
  "Sign in with Face ID or your fingerprint",
];

export default function LoginPage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <PageAura />
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-12 px-4 py-12 md:grid-cols-2 md:py-20">
        {/* Why sign in: beside the form on wide screens, under it on phones. */}
        <section aria-label="Why create an account" className="order-2 md:order-1 md:pt-6">
          <Orb size={88} className="hidden md:block" />
          <h2 className="mt-8 hidden text-3xl font-semibold tracking-tight md:block">
            Build it once. <span className="text-gradient">Keep it everywhere.</span>
          </h2>
          <ul className="space-y-3 text-sm md:mt-6">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-foreground/90">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-300">
                  <Check className="h-3 w-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </section>
        <div className="order-1 w-full rounded-3xl border border-line bg-surface/80 p-6 shadow-[0_30px_80px_-40px_rgba(139,92,246,0.5)] backdrop-blur md:order-2 md:p-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
