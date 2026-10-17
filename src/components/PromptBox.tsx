"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Globe, KeyRound, LayoutTemplate, Loader2, Sparkles } from "lucide-react";
import { createProject, emptyListing, saveProject, withVersion } from "@/lib/storage";
import { matchReadyPreset, readyProjectFromSite, readyWelcome } from "@/lib/ready-app";
import { appTitle } from "@/lib/title";
import { BRIEF_SKIP_KEY, briefPrompt, type BriefAnswers } from "@/lib/brief";
import { AppBrief } from "./AppBrief";
import { BUSINESS_TEMPLATES, TEMPLATES, templateSlug } from "@/lib/templates";
import type { SiteSummary } from "@/lib/types";
import Link from "next/link";
import { getProvider, modelLabel } from "@/lib/ai/providers";
import { AiSettingsDialog, ModelButton, useAiReady, useAiStatus } from "./AiSettings";
import { SiteCard } from "./SiteCard";
import { defaultWording, rememberWording, WordingControl } from "./WordingControl";
import { DEFAULT_WORDING, type Wording } from "@/lib/claims";
import { useFeatures } from "@/lib/use-features";
import { redesignPrompt } from "@/lib/website";

/** A link typed into the prompt: an explicit URL, a www. host, or a common TLD (not "Node.js"). */
const URL_IN_TEXT =
  /(?:https?:\/\/[^\s]+|\bwww\.[a-z0-9-]+\.[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|ai|shop|store|biz|info|me|us|uk|ca|au|de|fr|in|nl|es|it|nz|ie)\b(?:\/[^\s]*)?)/i;

/** The whole prompt is just a website address (nothing else to build from). */
export function onlyUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const m = URL_IN_TEXT.exec(t);
  return m && m.index === 0 && m[0].length === t.length ? t : null;
}

const MAX_PROMPT = 8000;

/** Examples that rotate in the empty prompt box. */
const IDEAS = [
  "a habit tracker with streaks and weekly stats",
  "a booking app for my hair salon",
  "a menu and loyalty card for my café",
  "a workout timer with guided routines",
  "a class timetable for my yoga studio",
  "a shared grocery list for my family",
  "a plant watering reminder",
];

export type StartMode = "prompt" | "url";

/** Opens the prompt box at the top of the page in Prompt to App or URL to App. */
export function StartButton({ mode, className, children }: { mode: StartMode; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("appmaker:mode", { detail: mode }))}>
      {children}
    </button>
  );
}

export function PromptBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  // "Redesign website": the same site import, but it makes a new website instead of an app.
  const [redesign, setRedesign] = useState(false);
  const [url, setUrl] = useState("");
  const [site, setSite] = useState<SiteSummary | null>(null);
  // Screenshot parts of the site (redesigns of sites with few pictures), kept with the project.
  const [siteAssets, setSiteAssets] = useState<Record<string, string> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [idea, setIdea] = useState(0);
  // Rotate the example while the box is empty (not with reduced motion).
  useEffect(() => {
    if (value || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdea((i) => (i + 1) % IDEAS.length), 3500);
    return () => clearInterval(t);
  }, [value]);
  const aiReady = useAiReady();
  const aiStatus = useAiStatus();
  const features = useFeatures();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wording, setWording] = useState<Wording>(DEFAULT_WORDING);
  // The last choice is remembered in this browser (readable after mount).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setWording(defaultWording()), []);

  // Template cards elsewhere on the page fill in the prompt for review
  // instead of starting a (paid) build straight away.
  useEffect(() => {
    const onTemplate = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setValue(text);
      document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        ref.current?.focus();
        // Business templates have [blanks]: select the first one, ready to type over.
        const blank = /\[[^\]]*\]/.exec(text);
        if (blank) ref.current?.setSelectionRange(blank.index, blank.index + blank[0].length);
      }, 300);
    };
    window.addEventListener("appmaker:template", onTemplate);
    return () => window.removeEventListener("appmaker:template", onTemplate);
  }, []);

  /** Switches between Prompt to App and URL to App, e.g. from the cards further down the page. */
  const chooseMode = useCallback((mode: StartMode) => {
    setShowUrl(mode === "url");
    setImportError("");
    if (mode === "prompt") setSite(null);
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      if (mode === "prompt") ref.current?.focus();
      else (document.querySelector('input[aria-label="Website address"]') as HTMLInputElement | null)?.focus();
    }, 300);
  }, []);
  useEffect(() => {
    const onMode = (e: Event) => chooseMode((e as CustomEvent<StartMode>).detail);
    window.addEventListener("appmaker:mode", onMode);
    return () => window.removeEventListener("appmaker:mode", onMode);
  }, [chooseMode]);

  const detected = !site && !showUrl && features.websiteImport ? URL_IN_TEXT.exec(value)?.[0] : undefined;
  const bareUrl = detected ? onlyUrl(value) : null;
  const tooLong = value.length > MAX_PROMPT;

  const importSite = async (address: string) => {
    if (!address.trim() || importing) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: address, ...(redesign ? { kind: "website" } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't read that website.");
      setSite(body.site);
      setSiteAssets(body.assets && typeof body.assets === "object" ? body.assets : null);
      setShowUrl(false);
      setUrl("");
    } catch (e) {
      setShowUrl(true);
      setUrl(address);
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // Shareable links: /?url=theirsite.com reads that site straight away; /?mode=url opens URL to App.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    const params = new URLSearchParams(window.location.search);
    // /?idea=… fills in the prompt (from My apps' quick starts) without building yet.
    const idea = params.get("idea")?.trim().slice(0, 500);
    if (idea) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(idea);
      requestAnimationFrame(() => ref.current?.focus());
      return;
    }
    const address = params.get("url")?.trim().slice(0, 500);
    if (!address && params.get("mode") !== "url") return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setShowUrl(true);
    if (address) importSite(address);
    // Runs once, on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A website address typed or pasted into Prompt to App belongs in URL to App: switch and read the site. */
  const switchToUrl = (address: string) => {
    setValue("");
    setShowUrl(true);
    setUrl(address);
    importSite(address);
  };

  // URL to App for a business a ready-made app fits (pizza place, salon, garage…): that app, filled in from the
  // website, with orders and the business area built in. Sites that don't need them get a custom AI build.
  const [customApp, setCustomApp] = useState(false);
  const readyMatch = site && !redesign ? matchReadyPreset(site) : null;
  const readyTemplate = readyMatch ? BUSINESS_TEMPLATES.find((t) => templateSlug(t) === readyMatch) : undefined;
  const useReady = !!(site && readyTemplate && !customApp && !value.trim());
  const openReady = () => {
    if (!site || !readyMatch || !readyTemplate) return;
    setBusy(true);
    const r = readyProjectFromSite(readyMatch, readyTemplate, site);
    const found = [r.ready.info.phone && "phone", r.ready.info.address && "address", r.ready.info.hours && "hours", !r.examples && "your " + readyTemplate.title.toLowerCase().split(/[ /&]/)[0] + " items and prices", r.photos.length && "photos"].filter(Boolean);
    const project = createProject(readyTemplate.prompt, site, wording, {
      name: r.name,
      files: r.files,
      design: r.design,
      listing: r.listing,
      ready: r.ready,
      messages: [readyWelcome(r.name, readyTemplate.title, found as string[], r.examples)],
    });
    saveProject(withVersion(project, "Ready-made app from your website").project);
    router.push(`/build/${project.id}?details=1`);
  };

  const build = (text: string, answers: BriefAnswers | null = null) => {
    setBusy(true);
    setBrief(false);
    // Named straight away from the website or the idea (or the business name from the brief).
    const name = answers?.business?.trim() ? appTitle(answers.business, null) : appTitle(text, site);
    const full = answers ? briefPrompt(text, answers) : text;
    const project = createProject(full, site ?? undefined, wording, {
      name,
      listing: emptyListing(name),
      ...(redesign ? { kind: "website" as const, ...(siteAssets ? { siteAssets } : {}) } : {}),
    });
    router.push(`/build/${project.id}?auto=1`);
  };

  const start = () => {
    if (bareUrl) return switchToUrl(bareUrl);
    const text = redesign
      ? site
        ? [redesignPrompt(site), value.trim()].filter(Boolean).join("\n\n")
        : ""
      : value.trim() || (site ? `Turn ${site.siteName} (${site.url}) into a mobile app for its customers.` : "");
    if (redesign && !site) {
      if (url.trim()) importSite(url);
      return;
    }
    if (!text || busy || importing || tooLong) return;
    if (useReady) return openReady();
    // The AI reads the idea first and asks what it needs to know (unless turned off);
    // a clear idea goes straight to building.
    let skip = false;
    try {
      skip = localStorage.getItem(BRIEF_SKIP_KEY) === "1";
    } catch {
      // Ask.
    }
    if (!site && !brief && !skip) return setBrief(true);
    build(text);
  };

  return (
    <div id="start" className="mx-auto w-full max-w-2xl">
      <div role="tablist" aria-label="How do you want to start?" className="mb-3 flex justify-center gap-1">
        {[
          { key: "prompt", label: "Prompt to App", icon: Sparkles },
          ...(features.websiteImport
            ? [
                { key: "url", label: "URL to App", icon: Globe },
                { key: "redesign", label: "Redesign website", icon: LayoutTemplate },
              ]
            : []),
        ].map((t) => {
          const selected = (redesign ? "redesign" : showUrl || site ? "url" : "prompt") === t.key;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setRedesign(t.key === "redesign");
                setShowUrl(t.key !== "prompt" && !site);
                setImportError("");
                if (t.key === "prompt") {
                  setSite(null);
                  setTimeout(() => ref.current?.focus(), 0);
                }
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm transition ${
                selected ? "bg-white font-medium text-black" : "text-muted hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      <div className="hero-halo">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="gradient-border gradient-border-live hero-glow rounded-2xl p-3 shadow-2xl shadow-brand-900/30 focus-within:ring-2 focus-within:ring-brand-400/70"
      >
        {site && (
          <div className="mb-2">
            <SiteCard site={site} onRemove={() => setSite(null)} />
            {readyTemplate && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-xs">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                <p className="min-w-0 flex-1 text-muted">
                  {useReady ? (
                    <>
                      <span className="font-medium text-foreground">Looks like a {readyTemplate.title.toLowerCase()} business.</span> You&apos;ll get the ready-made app, filled in from
                      your website, with orders and your business area built in. Ready in a second, no AI credits.{" "}
                      <button type="button" onClick={() => setCustomApp(true)} className="underline underline-offset-2 hover:text-foreground">
                        Build a custom app with AI instead
                      </button>
                    </>
                  ) : value.trim() && !customApp ? (
                    <>Your description builds a custom app with AI. Clear it to use the ready-made {readyTemplate.title.toLowerCase()} app instead.</>
                  ) : (
                    <>
                      Building a custom app with AI.{" "}
                      <button type="button" onClick={() => setCustomApp(false)} className="underline underline-offset-2 hover:text-foreground">
                        Use the ready-made {readyTemplate.title.toLowerCase()} app
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
        {showUrl && !site && (
          <div className="mb-2 px-1">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2 py-1.5 focus-within:border-brand-500/60">
              <Globe className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    importSite(url);
                  }
                }}
                placeholder="yourwebsite.com"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
                aria-label="Website address"
              />
              <button
                type="button"
                onClick={() => importSite(url)}
                disabled={!url.trim() || importing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-black disabled:opacity-40"
              >
                {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {importing ? "Reading site…" : "Import"}
              </button>
            </div>
            {importError ? (
              <p className="mt-1.5 px-1 text-xs text-rose-400">{importError}</p>
            ) : (
              <p className="mt-1.5 px-1 text-xs text-muted">
                {redesign
                  ? "Appmaker reads your site's pages, photos, brand colours and contact details, then designs a modern new website you can download and upload to any host."
                  : "Appmaker reads your site's pages, brand colours and content, then builds an app for your customers."}
              </p>
            )}
          </div>
        )}

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setBrief(false);
          }}
          onPaste={(e) => {
            // Pasting just a link into the empty box: that's URL to App.
            const address = features.websiteImport && !site && !showUrl && !value.trim() ? onlyUrl(e.clipboardData.getData("text")) : null;
            if (address) {
              e.preventDefault();
              switchToUrl(address);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={3}
          placeholder={
            site
              ? redesign
                ? `Anything to change in the ${site.siteName} redesign? (optional — press Enter to start)`
                : `What should the ${site.siteName} app do? (optional — press Enter to let AI decide)`
              : showUrl
                ? "Optional: what should the app do? e.g. bookings, the menu, a loyalty card…"
                : `Describe your app idea — e.g. ${IDEAS[idea]}…`
          }
          className="w-full resize-none bg-transparent px-2 py-1 text-base text-foreground outline-none placeholder:text-muted/70"
          aria-label="Describe your app"
        />

        {/\[[^\]\n]{1,40}\]/.test(value) && (
          <p className="mb-1 px-2 text-xs text-amber-200/90">
            Replace the [bracketed] parts with your business&apos;s details. Anything left in brackets is left out of the app, not made up.
          </p>
        )}

        {bareUrl && (
          <p role="status" className="mb-1 px-2 text-xs text-brand-200">
            That&apos;s a website address. Press Enter to use <strong>URL to App</strong>, which reads the site and builds its app, or describe what the app should do.
          </p>
        )}

        {detected && !bareUrl && (
          <button
            type="button"
            onClick={() => importSite(detected)}
            disabled={importing}
            className="mb-1 ml-1 inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-xs text-brand-200 hover:bg-brand-500/20"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            {importing ? "Reading site…" : `Use content from ${detected.replace(/^https?:\/\//, "").split("/")[0]}`}
          </button>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            <ModelButton />
            <WordingControl
              value={wording}
              onChange={(w) => {
                setWording(w);
                rememberWording(w);
              }}
            />
            <span className="hidden items-center gap-1.5 px-2 text-xs text-muted md:flex">
              <Sparkles className="h-3.5 w-3.5 text-brand-400" /> iOS + Android
            </span>
          </div>
          {value.length > MAX_PROMPT * 0.8 && (
            <span className={`ml-auto text-[11px] ${tooLong ? "text-rose-400" : "text-muted"}`}>
              {value.length.toLocaleString()}/{MAX_PROMPT.toLocaleString()}
            </span>
          )}
          <button
            type="submit"
            disabled={(!value.trim() && !site) || busy || importing || tooLong}
            data-ready={(!!value.trim() || !!site) && !busy && !importing && !tooLong}
            className="send-live grid h-9 w-9 place-items-center rounded-xl text-black disabled:opacity-40"
            aria-label="Build app"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
      </div>
      {brief && <AppBrief prompt={value.trim()} onBuild={(answers) => build(value.trim(), answers)} onCancel={() => setBrief(false)} />}
      {aiReady === false && (
        <p className="mt-3 text-center text-xs text-amber-200/90">
          Demo mode: no AI key is set up yet, so you&apos;ll get a sample app.{" "}
          <button type="button" onClick={() => setSettingsOpen(true)} className="min-h-6 font-medium text-amber-100 underline underline-offset-2">
            Add an API key
          </button>{" "}
          to build anything you describe.
        </p>
      )}
      {aiStatus && aiStatus.source !== "demo" && (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-muted" data-testid="ai-status">
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="text-emerald-300">{aiStatus.source === "site" ? "Native AI connected" : "Your AI key connected"}</span>
          <span aria-hidden="true">·</span>
          <span className="text-foreground/80">
            {getProvider(aiStatus.provider)?.name ?? aiStatus.provider} · {modelLabel(aiStatus.provider, aiStatus.model)}
          </span>
          <Link href="/status" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
            Status
          </Link>
        </p>
      )}
      {settingsOpen && <AiSettingsDialog onClose={() => setSettingsOpen(false)} />}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TEMPLATES.slice(0, 5).map((t) => (
          <button
            key={t.title}
            onClick={() => {
              setValue(t.prompt);
              ref.current?.focus();
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted transition hover:border-white/20 hover:text-foreground"
          >
            {t.emoji} {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplateButton({ prompt, children, className }: { prompt: string; children: React.ReactNode; className?: string }) {
  return (
    <button className={className} onClick={() => window.dispatchEvent(new CustomEvent("appmaker:template", { detail: prompt }))}>
      {children}
    </button>
  );
}
