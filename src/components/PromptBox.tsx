"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Globe, Loader2, Sparkles } from "lucide-react";
import { createProject, emptyListing } from "@/lib/storage";
import { appTitle } from "@/lib/title";
import { TEMPLATES } from "@/lib/templates";
import type { SiteSummary } from "@/lib/types";
import Link from "next/link";
import { getProvider, modelLabel } from "@/lib/ai/providers";
import { AiSettingsDialog, ModelButton, useAiReady, useAiStatus } from "./AiSettings";
import { SiteCard } from "./SiteCard";
import { defaultWording, rememberWording, WordingControl } from "./WordingControl";
import { DEFAULT_WORDING, type Wording } from "@/lib/claims";
import { useFeatures } from "@/lib/use-features";

/** A link typed into the prompt: an explicit URL, a www. host, or a common TLD (not "Node.js"). */
const URL_IN_TEXT =
  /(?:https?:\/\/[^\s]+|\bwww\.[a-z0-9-]+\.[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|ai|shop|store|biz|info|me|us|uk|ca|au|de|fr|in|nl|es|it|nz|ie)\b(?:\/[^\s]*)?)/i;

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
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [site, setSite] = useState<SiteSummary | null>(null);
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
  const tooLong = value.length > MAX_PROMPT;

  const importSite = async (address: string) => {
    if (!address.trim() || importing) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: address }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't read that website.");
      setSite(body.site);
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
    const address = params.get("url")?.trim().slice(0, 500);
    if (!address && params.get("mode") !== "url") return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowUrl(true);
    if (address) importSite(address);
    // Runs once, on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    const text = value.trim() || (site ? `Turn ${site.siteName} (${site.url}) into a mobile app for its customers.` : "");
    if (!text || busy || importing || tooLong) return;
    setBusy(true);
    // Named straight away from the website or the idea; the AI can refine it in the store listing.
    const name = appTitle(text, site);
    const project = createProject(text, site ?? undefined, wording, { name, listing: emptyListing(name) });
    router.push(`/build/${project.id}?auto=1`);
  };

  return (
    <div id="start" className="mx-auto w-full max-w-2xl">
      <div role="tablist" aria-label="How do you want to start?" className="mb-3 flex justify-center gap-1">
        {[
          { key: false, label: "Prompt to App", icon: Sparkles },
          ...(features.websiteImport ? [{ key: true, label: "URL to App", icon: Globe }] : []),
        ].map((t) => {
          const selected = (showUrl || !!site) === t.key;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setShowUrl(t.key);
                setImportError("");
                if (!t.key) {
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="gradient-border gradient-border-live rounded-2xl p-3 shadow-2xl shadow-violet-900/30 focus-within:ring-2 focus-within:ring-violet-400/70"
      >
        {site && (
          <div className="mb-2">
            <SiteCard site={site} onRemove={() => setSite(null)} />
          </div>
        )}
        {showUrl && !site && (
          <div className="mb-2 px-1">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2 py-1.5 focus-within:border-violet-500/60">
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
                Appmaker reads your site&apos;s pages, brand colours and content, then builds an app for your customers.
              </p>
            )}
          </div>
        )}

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={3}
          placeholder={
            site
              ? `What should the ${site.siteName} app do? (optional — press Enter to let AI decide)`
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

        {detected && (
          <button
            type="button"
            onClick={() => importSite(detected)}
            disabled={importing}
            className="mb-1 ml-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
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
              <Sparkles className="h-3.5 w-3.5 text-violet-400" /> iOS + Android
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
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white transition disabled:opacity-40"
            aria-label="Build app"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
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
