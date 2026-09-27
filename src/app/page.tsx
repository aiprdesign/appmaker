import Link from "next/link";
import {
  Apple,
  Check,
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
import { PromptBox, TemplateButton } from "@/components/PromptBox";
import { TEMPLATES } from "@/lib/templates";

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Describe it",
    body: "Tell Appmaker what you want in plain English — screens, features, vibe. No code, no drag-and-drop.",
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
  { icon: Palette, title: "Icon generator", body: "Generate a 1024×1024 app icon from your brand color and emoji." },
  { icon: ShieldCheck, title: "Review-ready defaults", body: "Bundle IDs, privacy notes, build numbers and EAS config set up for you." },
];

const PLANS = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    blurb: "Explore ideas and prototype.",
    features: ["5 AI generations / day", "Live iOS & Android preview", "Export Expo project", "Community templates"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$25",
    period: "/ month",
    blurb: "For makers shipping real apps.",
    features: ["250 AI generations / month", "Unlimited projects", "Store listing & icon studio", "GitHub + EAS build workflow", "Priority generation"],
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Studio",
    price: "$79",
    period: "/ month",
    blurb: "For agencies and teams.",
    features: ["1,000 AI generations / month", "Team workspaces", "White-label exports", "Custom domains for web builds", "Dedicated support"],
    cta: "Contact sales",
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Are these real native apps?",
    a: "Yes. Appmaker writes Expo React Native code — the same stack behind apps from Microsoft, Shopify and Discord. It compiles to genuine iOS and Android binaries.",
  },
  {
    q: "How do I publish to the App Store and Google Play?",
    a: "Open the Publish tab, polish your listing and icon, then download the project. Run `eas build` and `eas submit` (or push to GitHub with the included workflow). You'll need an Apple Developer ($99/yr) and Google Play Console ($25 one-time) account.",
  },
  {
    q: "Can I keep editing after the first version?",
    a: "Absolutely. Chat with Appmaker to add screens, change the design or fix bugs. You can also edit the code by hand in the Code tab.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. But if you do, you get clean, idiomatic source code you fully own.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <SiteHeader />

      <main className="relative flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center md:pt-28">
          <Link
            href="#how"
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              New
            </span>
            Publish-ready Expo projects with one-command store builds →
          </Link>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight md:text-7xl">
            Turn a prompt into an <span className="text-gradient">App Store app</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted md:text-lg">
            Describe your idea. Appmaker designs and codes a native iOS &amp; Android app, lets you test it live, and
            packages it for the App Store and Google Play.
          </p>
          <div className="mt-10">
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

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">From idea to store in three steps</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-line bg-surface p-6">
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
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-surface p-6">
                <f.icon className="h-5 w-5 text-pink-300" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Templates */}
        <section id="templates" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Start from a template</h2>
            <p className="mt-3 text-muted">One click to generate. Then make it yours with chat.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {TEMPLATES.map((t) => (
              <TemplateButton
                key={t.title}
                prompt={t.prompt}
                className="group rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20"
              >
                <div
                  className="grid aspect-[4/3] place-items-center rounded-xl text-5xl"
                  style={{ background: `linear-gradient(135deg, ${t.color}55, ${t.color}10)` }}
                >
                  <span className="transition group-hover:scale-110">{t.emoji}</span>
                </div>
                <div className="mt-3 text-sm font-medium">{t.title}</div>
                <div className="text-xs text-muted">{t.category}</div>
              </TemplateButton>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Simple pricing</h2>
          <p className="mt-3 text-center text-muted">Start free. Upgrade when you&apos;re ready to ship.</p>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-2xl p-6 ${p.highlight ? "gradient-border" : "border border-line bg-surface"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.highlight && (
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-300">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold">{p.price}</span>
                  <span className="text-sm text-muted">{p.period}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="#start"
                  className={`mt-8 rounded-xl py-2.5 text-center text-sm font-medium ${
                    p.highlight
                      ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white"
                      : "border border-line bg-surface-2 hover:border-white/20"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
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
            <h2 className="relative text-3xl font-semibold tracking-tight md:text-5xl">Your app is one sentence away.</h2>
            <Link
              href="#start"
              className="relative mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Start building — it&apos;s free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        © {new Date().getFullYear()} Appmaker. Apple and App Store are trademarks of Apple Inc. Google Play is a trademark of Google LLC.
      </footer>
    </div>
  );
}
