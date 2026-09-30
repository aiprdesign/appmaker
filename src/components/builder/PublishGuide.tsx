import { CheckCircle2, Circle, Info } from "lucide-react";
import type { Project } from "@/lib/types";

/**
 * What Apple and Google ask for besides the app itself, in plain words, with
 * what Appmaker already did. Not legal advice.
 */
export function PublishGuide({ project }: { project: Project }) {
  const l = project.listing;
  const pages = !!project.storePages;
  const items: { done: boolean; title: string; text: string }[] = [
    {
      done: !!l.privacyPolicyUrl,
      title: "Privacy policy (Apple and Google require it)",
      text: "A public page saying what information your app collects and why. Appmaker can write and host one from what your app does.",
    },
    {
      done: !!l.supportUrl,
      title: "Support page (Apple requires it)",
      text: "Where people can get help. Appmaker's support page includes your contact email and an accessibility section.",
    },
    {
      done: pages,
      title: "Terms of use (recommended)",
      text: "Apple applies its standard licence agreement if you don't add your own. Add terms if your app sells things, takes bookings or has accounts; Appmaker creates a starting version with your pages.",
    },
    {
      done: false,
      title: "App Privacy and Data safety forms",
      text: "Answered in App Store Connect and Google Play Console: what data the app collects. Use your privacy policy as the guide, and keep them consistent.",
    },
    {
      done: false,
      title: "Age rating, screenshots and your developer accounts",
      text: "An age-rating questionnaire in each store, screenshots of your app, an Apple Developer account ($99 a year) and a Google Play Console account ($25 once).",
    },
  ];
  return (
    <section aria-labelledby="guide-title" className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
      <h2 id="guide-title" className="font-semibold">
        What the stores need before you publish
      </h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((i) => (
          <li key={i.title} className="flex gap-2.5 text-sm">
            {i.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-label="Done" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="To do" />
            )}
            <span>
              <span className="font-medium">{i.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{i.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-snug text-amber-100/90">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          This guide and the pages Appmaker creates are a starting point, not legal advice. You&apos;re responsible for your app and its pages being true,
          complete and lawful where you publish. If you&apos;re unsure, have them checked by a lawyer.
        </span>
      </p>
    </section>
  );
}
