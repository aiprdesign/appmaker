import Link from "next/link";
import {
  Apple,
  Code2,
  Download,
  MessageSquareText,
  Palette,
  Rocket,
  ShieldCheck,
  Smartphone,
  Store,
  Wand2,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { PlanCards } from "@/components/PlanCards";
import { AccountDeletedNotice } from "@/components/AccountDeletedNotice";
import { PromptBox } from "@/components/PromptBox";
import { PhoneShot, TemplateCard } from "@/components/TemplateCard";
import { StartOptions } from "@/components/StartOptions";
import { AppMarquee } from "@/components/AppMarquee";
import { Beams } from "@/components/fx/Beams";
import { Orb } from "@/components/fx/Orb";
import { BUSINESS_TEMPLATES, TEMPLATES, templateImage } from "@/lib/templates";

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Describe it or paste a URL",
    body: "Tell Appmaker what you want in plain English, or paste your website and it reads your brand, content and contact details. No code, no drag-and-drop.",
  },
  {
    icon: Smartphone,
    title: "Watch it come alive",
    body: "A real React Native app is written live and runs instantly in an iPhone or Android preview. Chat to refine it.",
  },
  {
    icon: Rocket,
    title: "Ship to the stores",
    body: "Get an App Store–ready listing, icon and a production Expo project with one-command builds for iOS and Android.",
  },
];

const FEATURES = [
  { icon: Wand2, title: "AI app engineer", body: "Multi-screen apps with navigation, persistence and real content — not mockups." },
  { icon: Zap, title: "Instant live preview", body: "Every change runs in a device frame in under a second. Tap, type and test." },
  { icon: Code2, title: "You own the code", body: "Clean Expo + React Native source. Edit it here or take it anywhere." },
  { icon: Store, title: "Store listing studio", body: "Name, subtitle, keywords, description and category written for ASO." },
  { icon: Palette, title: "Your logo as the icon", body: "Upload your logo for a store-ready 1024×1024 icon, or generate one from your brand color and an emoji." },
  { icon: ShieldCheck, title: "Review-ready defaults", body: "Bundle IDs, privacy notes, build numbers and EAS config set up for you." },
];

/** Phones in the showcase under the hero: template titles, widest in the middle. */
const SHOWCASE = [
  { title: "Salon or barber", label: "Salon", width: 170 },
  { title: "Habit tracker", label: "Habits", width: 200 },
  { title: "Restaurant or café", label: "Restaurant", width: 236 },
  { title: "Budget planner", label: "Budget", width: 200 },
  { title: "Gym or studio", label: "Gym", width: 170 },
];

const FAQ = [
  {
    q: "Are these real native apps?",
    a: "Yes. Appmaker writes Expo React Native code — the same stack behind apps from Microsoft, Shopify and Discord. It compiles to genuine iOS and Android binaries.",
  },
  {
    q: "How do I publish to the App Store and Google Play?",
    a: "Open the Publish tab, polish your listing and icon, and build in the cloud: no Mac or Xcode needed. iPhone builds can upload straight to App Store Connect. You can also download the project and build it yourself. You'll need an Apple Developer ($99/yr) and Google Play Console ($25 one-time) account.",
  },
  {
    q: "Can I keep editing after the first version?",
    a: "Absolutely. Chat with Appmaker to add screens, change the design or fix bugs. You can also edit the code by hand in the Code tab.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. But if you do, you get clean, idiomatic source code you fully own.",
  },
  {
    q: "Who is responsible for what's in my app?",
    a: "You are. You decide what your app says and does: its text, claims, prices, images and features, and its store listing. Make sure everything is true, accurate and allowed, and follows the law and Apple's and Google's rules. Appmaker's claim-safe wording and health and money checks help, but they can't catch everything and aren't legal advice.",
  },
  {
    q: "How does pricing work?",
    a: "There are no subscriptions. Try it without an account, or create a free account for monthly credits. When you're ready to publish, buy any credit pack: credits never expire, and your first pack unlocks store builds and the other paid features for good.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[820px]" aria-hidden="true" />
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <Beams className="absolute inset-x-0 top-0 h-[720px]" />
      <SiteHeader />

      <main className="relative flex-1">
        <AccountDeletedNotice />
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center md:pt-28">
          <Link
            href="#ways"
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              New
            </span>
            URL to App: paste your website, get your app →
          </Link>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight md:text-7xl">
            Turn a prompt or a website into an <span className="text-gradient text-gradient-live">App Store app</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted md:text-lg">
            Describe your idea or paste your website. Appmaker designs and codes a native iOS &amp; Android app, lets you test it live, and
            packages it for the App Store and Google Play.
          </p>
          <div className="relative isolate mt-10">
            {/* A soft orb glowing behind the prompt box. */}
            <Orb size={560} soft className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" />
            <PromptBox />
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Apple className="h-4 w-4" /> App Store ready
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> Google Play ready
            </span>
            <span className="flex items-center gap-1.5">
              <Code2 className="h-4 w-4" /> Expo · React Native
            </span>
            <span className="flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Own your code
            </span>
          </div>
        </section>

        {/* Showcase */}
        <section aria-labelledby="showcase-title" className="relative mx-auto max-w-6xl overflow-hidden px-4 pb-16">
          <h2 id="showcase-title" className="sr-only">
            Apps made with Appmaker
          </h2>
          <div className="flex items-end justify-center gap-3 md:gap-6">
            {SHOWCASE.map((s, i) => (
              <figure
                key={s.title}
                className={`flex flex-col items-center ${i === 0 || i === SHOWCASE.length - 1 ? "hidden md:flex" : ""}`}
                style={{ width: `min(28vw, ${s.width}px)` }}
              >
                <div className="bob w-full" style={{ animationDelay: `${i * -1.3}s` }}>
                  <PhoneShot src={templateImage(s)} alt={`${s.label} app made with Appmaker`} width={s.width} className="w-full" eager={i === 2} />
                </div>
                <figcaption className="mt-3 text-xs text-muted">{s.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-muted">
            Real screens from Appmaker&apos;s app preview. Start from any of them below, or describe your own.
          </p>
        </section>

        {/* Two ways to start */}
        <StartOptions />

        {/* Moving strip of every template's app */}
        <AppMarquee />

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">From idea to store in three steps</h2>
          <div className="relative mt-12 grid gap-4 md:grid-cols-3">
            {/* A beam of light running from step to step, above the cards. */}
            <div aria-hidden="true" className="absolute inset-x-[16.6%] -top-6 hidden md:block">
              <div className="beam-link h-px" />
              {[0, 50, 100].map((x) => (
                <span
                  key={x}
                  className="absolute top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300 shadow-[0_0_10px_2px_rgba(167,139,250,0.6)]"
                  style={{ left: `${x}%` }}
                />
              ))}
            </div>
            {STEPS.map((s, i) => (
              <div key={s.title} className="lift reveal rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 text-violet-300">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-medium text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="reveal grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-surface p-6 transition-colors hover:bg-surface-2">
                <f.icon className="h-5 w-5 text-pink-300" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Business templates */}
        <section id="business" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">An app for your business</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Pick your kind of business, fill in the [bracketed] details, and get an app with your menu or services, opening hours and one-tap call,
              directions and booking. Or use URL to App above and Appmaker fills them in from your website.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {BUSINESS_TEMPLATES.map((t) => (
              <TemplateCard key={t.title} template={t} />
            ))}
          </div>
        </section>

        {/* Templates */}
        <section id="templates" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Start from a template</h2>
            <p className="mt-3 text-muted">Pick one to start from — tweak the description, then build and refine it with chat.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.title} template={t} />
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Simple pricing, no subscriptions</h2>
          <p className="mt-3 text-center text-muted">Try it free. Pay with credits only when you&apos;re ready to ship.</p>
          <PlanCards />
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Questions</h2>
          <div className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between">
                    {f.q}
                    <span className="text-muted transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div className="glow pointer-events-none absolute inset-0" />
            <Orb size={140} className="relative mx-auto mb-8" />
            <h2 className="relative text-3xl font-semibold tracking-tight md:text-5xl">Your app is one sentence away.</h2>
            <Link
              href="#start"
              className="relative mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Get Started for Free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        © {new Date().getFullYear()} Appmaker. Apple and App Store are trademarks of Apple Inc. Google Play is a trademark of Google LLC.{" "}
        <Link href="/terms" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/accessibility" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Accessibility
        </Link>{" "}
        ·{" "}
        <Link href="/status" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Status
        </Link>
      </footer>
    </div>
  );
}
