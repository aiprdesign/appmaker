"use client";

import { ArrowRight, ArrowUp, Check, Globe, Smartphone, Sparkles } from "lucide-react";
import { useFeatures } from "@/lib/use-features";
import { ConceptFlow } from "./ConceptFlow";
import { StartButton } from "./PromptBox";

const OPTIONS = [
  {
    mode: "prompt" as const,
    icon: Sparkles,
    title: "Prompt to App",
    lead: "Describe any idea in plain words.",
    example: "“A habit tracker with streaks, reminders and weekly stats”",
    points: ["Screens, features and design from one sentence", "Refine it by chatting: “add a dark mode”", "Best for new ideas, tools and personal apps"],
    cta: "Try Prompt to App",
  },
  {
    mode: "url" as const,
    icon: Globe,
    title: "URL to App",
    lead: "Paste a business website. Appmaker reads it for you.",
    example: "yourbusiness.com → your business in the App Store",
    points: [
      "Uses the site's name, brand colors, logo and photos",
      "Menu, services, prices and opening hours from its pages",
      "One-tap call, directions, WhatsApp and booking buttons",
    ],
    cta: "Try URL to App",
  },
];

/** The two ways to start, side by side; each opens the prompt box at the top in that mode. */
export function StartOptions() {
  const features = useFeatures();
  const options = OPTIONS.filter((o) => o.mode === "prompt" || features.websiteImport);
  return (
    <section id="ways" aria-labelledby="ways-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-4 pt-4">
      <ConceptFlow />
      <div className="flex flex-col items-center text-center">
        <h2 id="ways-title" className="text-3xl font-semibold tracking-tight md:text-4xl">
          {options.length > 1 ? "Two ways to make your app" : "Make your app from a prompt"}
        </h2>
        {options.length > 1 && (
          <p className="mt-3 text-muted">Start from an idea or from a website. Try both: each one gives you a real app you can test on your phone.</p>
        )}
      </div>
      <div className={`mt-10 grid gap-4 ${options.length > 1 ? "md:grid-cols-2" : "mx-auto max-w-xl"}`}>
        {options.map((o) => (
          <div key={o.mode} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2" aria-hidden="true">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg shadow-violet-900/40">
                  <o.icon className="h-8 w-8" />
                </span>
                <ArrowRight className="h-5 w-5 text-muted" />
                <span className="grid h-16 w-11 place-items-center rounded-xl border-2 border-white/20 bg-surface-2 text-violet-200">
                  <Smartphone className="h-6 w-6" />
                </span>
              </div>
              <h3 className="text-2xl font-semibold">{o.title}</h3>
            </div>
            <p className="mt-3 text-sm text-foreground/90">{o.lead}</p>
            <p className="mt-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-muted">{o.example}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
              {o.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {p}
                </li>
              ))}
            </ul>
            <StartButton
              mode={o.mode}
              className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-4 text-sm font-medium text-white"
            >
              {o.cta} <ArrowUp className="h-4 w-4" />
            </StartButton>
          </div>
        ))}
      </div>
    </section>
  );
}
