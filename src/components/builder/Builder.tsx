"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Code2, Coins, Download, KeyRound, Loader2, MessageSquare, Moon, Palette, Store, Sun, RotateCw, Rocket, ShieldCheck, Smartphone, Sparkles, Wand2 } from "lucide-react";
import { HistoryMenu } from "./HistoryMenu";
import { DeviceMenu } from "./DeviceMenu";
import { SyncBadge } from "@/components/AccountButton";
import { AccessibilityMenu } from "@/components/AccessibilityMenu";
import { LIVE_FILE, liveModule } from "@/lib/live";
import { hasEntry } from "@/lib/validate";
import { autoDesign, defaultDesign, THEME_FILE, themeModule } from "@/lib/design";
import { BOOKING_FILE, bookingModule } from "@/lib/booking";
import { DATA_FILE, RULES_FILE, appRules, dataModule, type DataRules } from "@/lib/app-data";
import { STAFF_FILE, staffModule } from "@/lib/staff";
import { BRAND_FILE, brandModule } from "@/lib/branding";
import { locked, PLAN_CHANGED, usePlan } from "@/lib/use-plan";
import { DesignPanel } from "./DesignPanel";
import { ReadyDetails } from "./ReadyDetails";
import { READY_PRESETS, businessModule, readyDesign, readyDetailFiles, type ReadyInfo } from "@/lib/ready-app";
import { AppSidebar } from "./AppSidebar";
import { SitePreview } from "./SitePreview";
import { ConceptPicker, SiteColorsPanel } from "./ConceptPicker";
import { SiteContentPanel } from "./SiteContentPanel";
import { withA11yWidget } from "@/lib/site-a11y";
import { withStatement, type A11yReport, type StatementInfo } from "@/lib/site-statement";
import { polishSite, type PolishInfo } from "@/lib/site-polish";
import { withSiteFeatures, type FeatureInfo } from "@/lib/site-features";
import { addEdit, applyEdit, applyEdits, editsNote, selectedSite, type ContentEdit } from "@/lib/site-content";
import { conceptPrompt, conceptStyles, contentIssues, restoreContent, resolveSiteColors, finishSitePrompt, hasSiteEntry, isAllowedSitePath, siteZip, validateSite, type SiteConcept } from "@/lib/website";
import { applyStyle, DESIGN_STYLES, getStyle, pickStyle } from "@/lib/styles";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { useFeatures } from "@/lib/use-features";
import { Logo } from "@/components/Logo";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Preview, type PreviewError, type QualityIssue } from "@/components/Preview";
import { qualityFixRequest, reportQuality, type QualityEvent } from "@/lib/quality";
import { polishPrompt, toJpeg } from "@/lib/polish";
import { Orb } from "@/components/fx/Orb";
import { PhoneBuilding, PhoneEditing } from "./PhoneProgress";
import { EDIT_CRITIQUE_ROUNDS, MAX_CRITIQUE_ROUNDS, critiqueAgain, fixable, reviewFixRequest, reviewMessage, type Review, type ReviewAgent } from "@/lib/review";
import { earlyPreview, takeSignals, withoutOpenThought, type LiveGeneration } from "@/lib/progress";
import { captureFrame } from "@/lib/store-shots";
import { TapTest, type TapTestResult } from "./TapTest";
import { downloadBlob, exportProjectZip, slugify } from "@/lib/export";
import { parseGeneration } from "@/lib/parse";
import { getProject, saveProject, uid, withVersion } from "@/lib/storage";
import { describeIssues, isAllowedPath, validateApp, type ValidationIssue } from "@/lib/validate";
import { describeDesign, designIssues } from "@/lib/app-design";
import { checkClaims, DEFAULT_WORDING, describeClaims } from "@/lib/claims";
import { cleanFiles } from "@/lib/parse";
import { checkRegulatedClaims, describeRegulated } from "@/lib/regulated";
import type { AppDesign, ChatMessage, FileMap, Project, BuildTarget } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { CodePanel } from "./CodePanel";
import { AppIcon, PublishPanel } from "./PublishPanel";

/** Whether a project has its entry file yet: App.js for an app, index.html for a website. */
const entryOf = (p: Project) => (p.kind === "website" ? p.files["index.html"] != null : hasEntry(p.files));

type Tab = "preview" | "code" | "publish";

/** Automatic repair passes allowed after each request the user sends. */
const AUTO_FIX_BUDGET = 2;
/** Requests the content keeper may make to get the owner's content back, before restoring it itself. */
const CONTENT_FIX_BUDGET = 3;
/** Extra requests allowed to finish an app the model couldn't write in one reply. */
const CONTINUE_BUDGET = 3;
/** How long after a generation a preview crash counts as caused by it. */
const RUNTIME_WATCH_MS = 8000;

/** Turns network and API errors into something a non-developer can act on. */
export function friendlyError(message: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "The connection dropped before the app was finished. Check your internet connection and try again.";
  }
  if (/prompt must be at most/i.test(message)) return "That request is too long. Shorten it to under 8,000 characters and try again.";
  if (/too large to edit/i.test(message)) return "This app has grown too large to edit in one go. Try a smaller, more specific change.";
  // The server answered with an error page and no explanation: say which kind.
  const status = /request failed \((5\d\d)\)/i.exec(message)?.[1];
  if (status === "502" || status === "503") return `Appmaker's server is restarting or busy (error ${status}). Wait a moment and press Try again.`;
  if (status === "504") return "Appmaker's server took too long to answer (error 504). Press Try again; if it keeps happening, try a faster model in AI settings.";
  if (status) return `Appmaker's server hit a problem (error ${status}). Press Try again; if it keeps happening, the site owner can see the details in the server logs.`;
  if (/out of credits/i.test(message)) return `${message.replace(/ Buy more on the Credits page \(\/credits\)\./, "")} [Buy credits](/credits) to keep building.`;
  if (/^Sign in to keep building/i.test(message)) return `${message} [Sign in or create an account](/login).`;
  return message;
}

/** Covers the phone while a new version is checked and fixed, so only a checked app is shown. */
function ChecksOverlay({ generating }: { generating: boolean }) {
  const checks = ["Quality: code that runs on iPhone and Android", "Claim-safe wording", "Health, medical & financial claims"];
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-b from-violet-50 to-pink-50 p-8 text-neutral-700">
      <div className="w-full max-w-[260px]">
        <ShieldCheck className="mx-auto h-9 w-9 text-violet-500" />
        <p className="mt-3 text-center text-sm font-semibold">{generating ? "Fixing what the checks found…" : "Running checks…"}</p>
        <p className="mt-1 text-center text-xs text-neutral-500">Your app appears once it passes all three.</p>
        <ul className="mt-4 space-y-2 text-xs">
          {checks.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" /> {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


/** What the finishing touches (sharing previews, search details, icon…) know about the business. */
/** The business details the website's features use (quick actions, open now, contact card). */
function featureInfo(p: Project): FeatureInfo {
  const src = p.source;
  const c = src?.contact;
  return {
    siteName: src?.siteName || p.listing.name || p.name,
    ...(src?.url ? { url: src.url } : {}),
    ...(c?.phones?.[0] ? { phone: c.phones[0] } : {}),
    ...(c?.emails?.[0] ? { email: c.emails[0] } : {}),
    ...(c?.address ? { address: c.address } : {}),
    ...(c?.whatsapp ? { whatsapp: c.whatsapp } : {}),
    ...(c?.booking ? { booking: c.booking } : {}),
    ...(c?.maps ? { maps: c.maps } : {}),
    ...(c?.hours?.length ? { hours: c.hours } : {}),
    primary: p.design?.primary ?? p.listing.primaryColor,
  };
}

function polishInfo(p: Project): PolishInfo {
  const src = p.source;
  const c = src?.contact;
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const x of [...(src?.screenshots ?? []), ...(src?.localImages ?? [])]) sizes[x.path] = { width: x.width, height: x.height };
  return {
    siteName: src?.siteName || p.listing.name || p.name,
    ...(src?.url ? { url: src.url } : {}),
    ...(src?.language ? { lang: src.language.split("-")[0] } : {}),
    primary: p.design?.primary ?? p.listing.primaryColor,
    ...(src?.logo ? { logo: src.logo } : {}),
    ...(p.listing.iconEmoji ? { emoji: p.listing.iconEmoji } : {}),
    ...(src?.description ? { description: src.description } : {}),
    ...(c?.phones?.[0] ? { phone: c.phones[0] } : {}),
    ...(c?.emails?.[0] ? { email: c.emails[0] } : {}),
    ...(c?.address ? { address: c.address } : {}),
    ...(c?.social?.length ? { social: c.social } : {}),
    assetSizes: sizes,
  };
}

/** What the accessibility statement says about the business, and its latest check. */
function statementInfo(p: Project, report: A11yReport | undefined = p.a11yReport): StatementInfo {
  const c = p.source?.contact;
  return {
    siteName: p.source?.siteName || p.listing.name || p.name,
    ...(c?.emails?.[0] ? { email: c.emails[0] } : p.storePages?.email ? { email: p.storePages.email } : {}),
    ...(c?.phones?.[0] ? { phone: c.phones[0] } : {}),
    ...(report ? { report } : {}),
    ...(p.source?.language ? { lang: p.source.language } : {}),
  };
}

export function Builder({ id, autoStart, openDetails = false }: { id: string; autoStart: boolean; openDetails?: boolean }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const cloud = useCloud();
  const [tab, setTab] = useState<Tab>("preview");
  // "Android test app" in Test on a device: opens Publish at the build step with it chosen.
  const [buildRequest, setBuildRequest] = useState<{ target: BuildTarget; n: number } | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "app">("chat");
  const [platform, setPlatform] = useState<"ios" | "android" | "ipad">("ios");
  const [generating, setGenerating] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  // "Your details" for a ready-made business app: always open (it's how the owner makes the template theirs);
  // only its own close button hides it. Design opens over it and gives it back when closed.
  // (On phone-sized screens it would cover the app, so there it starts closed.)
  // The owner tapped a menu item's photo on the phone: that item's photo picker opens in Your details.
  const [photoFor, setPhotoFor] = useState<{ item: string; n: number } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches);
  void openDetails;
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  // Free apps show "Made with Appmaker" in their settings (only when the site takes payments).
  const plan = usePlan();
  const branded = locked(plan);
  const brandedRef = useRef(false);
  useEffect(() => {
    brandedRef.current = branded;
  }, [branded]);
  const [live, setLive] = useState<LiveGeneration | null>(null);
  const [previewFiles, setPreviewFiles] = useState<FileMap>({});
  /** A new version is being checked (and fixed) before it's shown. */
  const [checking, setChecking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<QualityIssue[] | null>(null);
  // The tap test runs on each new AI version, in a hidden copy of the app.
  const [tapFiles, setTapFiles] = useState<FileMap | null>(null);
  const [tapIssues, setTapIssues] = useState<QualityIssue[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Website download: packing its images, and a note when some stay linked.
  const [zipping, setZipping] = useState(false);
  const [siteNote, setSiteNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const projectRef = useRef<Project | null>(null);
  const started = useRef(false);
  const fixBudget = useRef(AUTO_FIX_BUDGET);
  // The UX and UI agents review once per request, after the first version that passes the checks.
  const critiqueRound = useRef(0);
  const critiqueScore = useRef<number | null>(null);
  const critiqueRounds = useRef(MAX_CRITIQUE_ROUNDS);
  const reviewPending = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const continueBudget = useRef(CONTINUE_BUDGET);
  const runtimeWatchUntil = useRef(0);
  // Apps already repaired automatically this session (self-healing tries each once).
  const healed = useRef(new Set<string>());
  // The content keeper checks the full site made from a chosen design (not later edits,
  // where the owner may remove a section on purpose).
  const keepContent = useRef(false);
  const contentBudget = useRef(CONTENT_FIX_BUDGET);
  const designBudget = useRef(1);
  const demoRef = useRef(false);
  const unloading = useRef(false);

  const commit = useCallback((next: Project) => {
    projectRef.current = next;
    setProject(next);
    setSaveFailed(!saveProject(next));
  }, []);

  // 70. Notes about the website go away by themselves after a while.
  useEffect(() => {
    if (!siteNote) return;
    const t = setTimeout(() => setSiteNote(null), 15_000);
    return () => clearTimeout(t);
  }, [siteNote]);

  // Closing or reloading the page would lose a build in progress: ask first,
  // and don't record the aborted request as a failure.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!abortRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onPageHide = () => {
      unloading.current = true;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    // Projects live in localStorage, which is only readable after mount.
    const load = () => {
      let p = getProject(id);
      // Apps saved before model markup was stripped (e.g. a stray
      // "</｜DSML｜ parameter>" line) are repaired when opened.
      if (p) {
        const cleaned = cleanFiles(p.files);
        if (cleaned !== p.files) {
          p = { ...p, files: cleaned };
          saveProject(p);
        }
      }
      projectRef.current = p;
      setProject(p);
      if (p) setPreviewFiles(p.files);
    };
    load();
    // On a new device the project arrives from the account a moment later.
    const onSync = () => {
      if (!projectRef.current) load();
    };
    window.addEventListener(PROJECTS_CHANGED, onSync);
    return () => window.removeEventListener(PROJECTS_CHANGED, onSync);
  }, [id]);

  // Keep the "Made with Appmaker" file in line with the plan (e.g. after buying credits).
  useEffect(() => {
    const p = projectRef.current;
    if (!plan || !p || generating || p.files[BRAND_FILE] == null) return;
    const want = brandModule(branded);
    if (p.files[BRAND_FILE] === want) return;
    const files = { ...p.files, [BRAND_FILE]: want };
    commit({ ...p, files });
    setPreviewFiles(files);
  }, [plan, branded, generating, project, commit]);

  // A new version of the app gets checked again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuality(null);
    setTapIssues([]);
  }, [previewFiles, reloadKey]);

  // The app database is on: the server always has the app's current data rules, whatever changed them
  // (the AI, "Your data", "Your details" or a hand edit in the Code tab). Checked against the server once,
  // then sent a moment after each change.
  // The business's owner page (orders, menu, staff PIN), one tap away once the app database is on.
  const [ownerUrl, setOwnerUrl] = useState("");
  const appDataId = project?.appData?.id;
  useEffect(() => {
    if (!appDataId || !project) return;
    let live = true;
    fetch(`/api/appdata?projectId=${project.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setOwnerUrl(d?.store?.ownerUrl ?? ""))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appDataId]);
  // While developing (admin: "Turn on the app database automatically"): an app that needs a database gets
  // one as soon as it has data rules and the builder is signed in, so the owner page and staff mode work at once.
  const features = useFeatures();
  const autoTried = useRef(new Set<string>());
  const needsData = !!project && !project.appData && project.kind !== "website" && !!appRules(project.files);
  useEffect(() => {
    if (!project || !needsData || generating || !cloud.user || !features.appData || !features.autoAppData || locked(plan)) return;
    if (autoTried.current.has(project.id)) return;
    autoTried.current.add(project.id);
    const projectId = project.id;
    void (async () => {
      const current = projectRef.current;
      const rules = current && appRules(current.files);
      if (!current || current.id !== projectId || !rules || current.appData) return;
      const res = await fetch("/api/appdata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, name: current.listing.name || current.name, rules }),
      }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      if (!body?.store) return; // Not now (offline, a limit): Publish still has the switch.
      const latest = projectRef.current;
      if (!latest || latest.id !== projectId || latest.appData) return;
      const latestRules = appRules(latest.files) ?? rules;
      const files = { ...latest.files, [DATA_FILE]: dataModule(body.store.apiUrl, latestRules), [STAFF_FILE]: staffModule(body.store.apiUrl) };
      syncedRules.current = JSON.stringify(rules);
      setOwnerUrl(body.store.ownerUrl ?? "");
      commit({ ...latest, appData: { id: body.store.id, apiUrl: body.store.apiUrl }, files });
      setPreviewFiles(files);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, needsData, generating, cloud.user, features.appData, features.autoAppData, plan]);

  // "Get your owner page" / "Owner page" before the database is on: straight to Publish → App database.
  const [showAppData, setShowAppData] = useState(0);
  const openAppData = () => {
    setTab("publish");
    setShowAppData((n) => n + 1);
  };
  const syncedRules = useRef<string | null>(null);
  const [rulesSync, setRulesSync] = useState<"" | "saving" | "failed">("");
  const rulesKey = project?.appData ? JSON.stringify(appRules(project.files)) : "";
  useEffect(() => {
    if (!project?.appData || generating || rulesKey === "null") return;
    const projectId = project.id;
    const send = async () => {
      if (syncedRules.current === null) {
        const res = await fetch(`/api/appdata?projectId=${projectId}`).catch(() => null);
        const body = res?.ok ? await res.json().catch(() => null) : null;
        syncedRules.current = body?.store ? JSON.stringify(body.store.rules) : "";
      }
      if (syncedRules.current === rulesKey) return;
      setRulesSync("saving");
      const res = await fetch("/api/appdata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, name: project.listing.name || project.name, rules: JSON.parse(rulesKey) }),
      }).catch(() => null);
      if (res?.ok) {
        syncedRules.current = rulesKey;
        setRulesSync("");
      } else setRulesSync("failed");
    };
    const t = setTimeout(() => void send(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesKey, generating, project?.appData?.id]);

  // Debounce hand edits in the code tab into the preview.
  useEffect(() => {
    if (!project || generating) return;
    const t = setTimeout(() => setPreviewFiles(project.files), 600);
    return () => clearTimeout(t);
  }, [project, generating]);

  const send = useCallback(
    async (text: string, opts: { autoFix?: boolean; retry?: boolean; images?: string[]; keepContent?: boolean } = {}) => {
      const current = projectRef.current;
      if (!current || abortRef.current) return;
      if (!opts.autoFix) {
        keepContent.current = !!opts.keepContent;
        contentBudget.current = CONTENT_FIX_BUDGET;
        reviewPending.current = true;
        critiqueRound.current = 0;
        critiqueScore.current = null;
        // A new app gets the full self-critique; a change to one a shorter one, so edits stay fast.
        critiqueRounds.current = hasEntry(current.files) ? EDIT_CRITIQUE_ROUNDS : MAX_CRITIQUE_ROUNDS;
        fixBudget.current = AUTO_FIX_BUDGET;
        designBudget.current = 1;
        continueBudget.current = CONTINUE_BUDGET;
      }
      runtimeWatchUntil.current = 0;
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        ...(opts.autoFix ? { kind: "auto-fix" as const } : {}),
      };
      // A retry re-runs the last request without repeating it in the chat.
      const startTime = Date.now();
      const withUser = {
        ...current,
        messages: opts.retry ? current.messages : [...current.messages, userMsg],
        pending: { prompt: text, startedAt: startTime },
      };
      commit(withUser);
      setStartedAt(startTime);
      setGenerating(true);
      setLive(null);
      setMobileView("chat");

      const controller = new AbortController();
      abortRef.current = controller;
      let raw = "";
      let error = "";
      // The connection or the AI provider failed part-way (not the user pressing Stop).
      let dropped = false;
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            // The owner's own edits on the design are kept through every change.
            prompt: current.kind === "website" && current.contentEdits?.length ? `${text}\n\n${editsNote(current.contentEdits)}` : text,
            // Until there's an App.js this is a new app, even if helper files were left behind.
            files: entryOf(current) ? current.files : {},
            listing: entryOf(current) ? current.listing : undefined,
            ...(current.kind === "website" ? { kind: "website" } : {}),
            // The review agents' notes are for the person; the fix request carries what the AI needs.
            history: current.messages.filter((m) => !m.error && m.kind !== "review").map((m) => ({ role: m.role, content: m.content })),
            site: current.kind === "website" ? selectedSite(current.source, current.excludedSections) : current.source,
            ai: aiChoiceFor(getAiSettings()),
            wording: current.wording ?? DEFAULT_WORDING,
            // The design style: the app's own, or for a new app the one Appmaker picks for it (kept as its design afterwards).
            ...(() => {
              const style = entryOf(current) ? current.design?.style : (current.design?.style ?? pickStyle(current.prompt).style.id);
              return style ? { style } : {};
            })(),
            ...(opts.autoFix ? { auto: true } : {}),
            ...(opts.images?.length ? { images: opts.images } : {}),
          }),
        });
        demoRef.current = res.headers.get("X-Appmaker-Mode") === "demo";
        setDemoMode(demoRef.current);
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let lastParse = 0;
        let thinking = false;
        let thoughts = "";
        // A new app or website shows on the phone as soon as its finished files can run, before the rest is written.
        // (An edit keeps showing the current app until it's done, so half-changed files never mix.)
        const kind = current.kind === "website" ? "website" : "app";
        const fresh = !(kind === "website" ? hasSiteEntry(current.files) : hasEntry(current.files));
        let shownEarly = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          // The server's signals (thinking, keep-alive) show it's busy; they aren't part of the reply.
          const signals = takeSignals(raw);
          raw = signals.text;
          if (signals.thinking) thinking = true;
          // What the AI says while thinking, shown live (only the recent part is kept).
          if (signals.thought) thoughts = (thoughts + signals.thought).slice(-4000);
          const now = performance.now();
          if (now - lastParse > 120) {
            lastParse = now;
            const parsed = parseGeneration(withoutOpenThought(raw));
            setLive({ ...parsed, thinking, thoughts, lastActivity: Date.now() });
            if (parsed.writing) setSelectedFile(parsed.writing);
            if (fresh) {
              const early = earlyPreview(current.files, parsed, kind);
              const key = early ? Object.keys(early).sort().join("|") : "";
              if (early && key !== shownEarly) {
                shownEarly = key;
                setPreviewFiles(early);
              }
            }
          }
        }
        raw = withoutOpenThought(raw);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          error = friendlyError((e as Error).message);
          dropped = true;
        }
        else error = "Stopped. Any finished files were kept — use History to go back if needed.";
      }

      // The page is closing: leave `pending` in place so the request can be
      // offered again when the project is reopened.
      if (unloading.current) return;

      const streamError = /<error>([\s\S]*?)<\/error>/.exec(raw)?.[1];
      // A reply cut off at the model's length limit: the finished files are
      // kept and the rest is written in a follow-up request (below).
      // A reply the provider dropped part-way (unreachable, timed out) is finished the same way,
      // so a half-written app with missing files is never shown as ready.
      const cutOff = dropped || (!!streamError && /too large to finish in one pass|couldn't reach|timed out|try again/i.test(streamError));
      if (streamError) error = friendlyError(streamError);
      const parsed = parseGeneration(raw.replace(/<error>[\s\S]*?<\/error>/, ""));
      const base = projectRef.current ?? withUser;
      // Keep only files that finished streaming, and never accept paths
      // outside App.js / src/ (they could overwrite export config or escape
      // the project folder when the zip is extracted).
      const isSite = base.kind === "website";
      const allowed = isSite ? isAllowedSitePath : isAllowedPath;
      const rejected: ValidationIssue[] = [];
      const complete: FileMap = {};
      for (const [p, code] of Object.entries(parsed.files)) {
        if (p === parsed.writing) continue;
        if (allowed(p)) complete[p] = code;
        else rejected.push({ file: p, message: isSite ? "was ignored; only website files (.html, .css, .js, sitemap.xml, robots.txt) are allowed" : "was ignored; only App.js and files under src/ are allowed" });
      }
      const files: FileMap = { ...base.files, ...complete };
      for (const p of parsed.deleted) if (allowed(p)) delete files[p];
      // Appmaker's own files are only added once there is an app to add them to:
      // a failed first build must not leave a "project" without App.js.
      const isApp = !isSite && hasEntry(files);
      // Every website carries Appmaker's accessibility widget, whatever the AI wrote.
      // In turn: the owner's own text edits, the widget's script tag, the statement, then the finishing touches.
      if (isSite && hasSiteEntry(files)) Object.assign(files, withSiteFeatures(polishSite(withStatement(withA11yWidget(applyEdits(files, base.contentEdits)), statementInfo(base)), polishInfo(base)), featureInfo(base)));
      // Website apps always carry Appmaker's live-content file, whatever the AI wrote.
      if (base.source && isApp) files[LIVE_FILE] = liveModule(base.live?.feedUrl ?? null);
      const listing = parsed.listing ? { ...base.listing, ...parsed.listing } : base.listing;
      // Every app carries Appmaker's theme file too, written from the Design settings.
      // A new app gets a look chosen for it (kept as its design, changeable in the Design tab).
      // (Older apps without a saved design keep the look they had.)
      const design =
        base.design ??
        (isSite
          ? hasSiteEntry(files)
            ? autoDesign(listing, base.prompt, !!base.source)
            : undefined
          : !isApp
            ? undefined
            : hasEntry(base.files)
              ? defaultDesign(listing)
              : autoDesign(listing, base.prompt, !!base.source));
      if (isApp && design) files[THEME_FILE] = themeModule(design);
      // Apps with bookings always carry Appmaker's booking screen, whatever the AI wrote.
      if (base.booking && isApp) files[BOOKING_FILE] = bookingModule(base.booking.apiUrl);
      // Apps with data rules always carry Appmaker's data module, written from those rules.
      const rules = isApp ? appRules(files) : null;
      if (rules) {
        files[DATA_FILE] = dataModule(base.appData?.apiUrl ?? null, rules);
        files[STAFF_FILE] = staffModule(base.appData?.apiUrl ?? null);
        // A ready-made app's tracker follows its steps, even when the AI changed them.
        const preset = base.ready && READY_PRESETS[base.ready.slug];
        if (preset) files["src/business.js"] = businessModule(preset, base.ready!.info, rules);
      }
      if (isApp) files[BRAND_FILE] = brandModule(brandedRef.current);

      const continuing = cutOff && Object.keys(parsed.files).some((p) => p !== parsed.writing && allowed(p)) && continueBudget.current > 0 && !demoRef.current;

      const reply = continuing
        ? `${parsed.plan || "Building your app."}\n\n${error && !/too large/i.test(error) ? "The AI connection dropped part-way, so I'm finishing the missing files now…" : "That was a big one, so I'm writing it in parts. Part done — continuing with the rest…"}`
        :
        [parsed.summary || (Object.keys(complete).length ? parsed.plan || "Updated your app." : ""), error && `⚠️ ${error}`]
          .filter(Boolean)
          .join("\n\n") || "I couldn't produce an app for that. Try describing it differently.";

      if (continuing) error = "";
      const wrote = Object.keys(complete).length > 0;
      let next: Project = { ...base, name: listing.name || base.name, files, listing, pending: undefined, ...(design ? { design } : {}) };
      let versionId: string | undefined;
      if (wrote) ({ project: next, versionId } = withVersion(next, opts.autoFix ? "Automatic quality fix" : text));
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: reply,
        files: Object.keys(complete),
        createdAt: Date.now(),
        ...(versionId ? { versionId } : {}),
        ...(error && !wrote ? { error: true } : {}),
      };
      commit({ ...next, messages: [...base.messages, assistantMsg] });
      // The balance changed: refresh the low-credit warning.
      window.dispatchEvent(new Event(PLAN_CHANGED));
      setLive(null);
      setGenerating(false);
      setStartedAt(null);
      setSelectedFile(files["App.js"] != null ? "App.js" : null);
      abortRef.current = null;

      const reveal = (shown: FileMap = files) => {
        setChecking(false);
        setPreviewFiles(shown);
        setReloadKey((k) => k + 1);
        if (isSite ? hasSiteEntry(shown) : hasEntry(shown)) setMobileView("app");
      };

      // The three checks run on every new version before it's shown:
      // 1. quality (code that works in the preview and a real build),
      // 2. claim-safe wording (unless the user chose standard wording),
      // 3. health, medical and financial claims (always).
      // Problems go back to the AI; the app appears once it's clean.
      const wroteFiles = Object.keys(complete).length > 0;
      // A conversation (an answer, a question back, no change to the app) gets no checks, tap test,
      // review agents or self-critique: those are only for software being handed to the person.
      if (!wroteFiles) reviewPending.current = false;
      if (!wroteFiles || error || demoRef.current) return reveal();
      if (!opts.autoFix) reportQuality([Object.keys(current.files).length ? "build:edit" : "build:new"]);
      if (continuing) {
        reportQuality(["cutoff"]);
        continueBudget.current -= 1;
        setChecking(true);
        const missing = (isSite ? validateSite(files) : validateApp(files)).filter((i) => /doesn't exist|is missing/.test(i.message));
        sendRef.current?.(
          [
            "Your previous reply was cut off before it finished. Keep every file you already wrote exactly as it is, and write only the files that are still missing or incomplete, then the <listing> and <summary>.",
            missing.length ? `Still missing:\n${describeIssues(missing)}` : "",
            `Files already written: ${Object.keys(files).join(", ")}.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
          { autoFix: true },
        );
        return;
      }
      const issues = [...rejected, ...(isSite ? validateSite(files) : validateApp(files))];
      const lostContent = isSite && keepContent.current ? contentIssues(files, selectedSite(base.source, base.excludedSections)) : [];
      // Wording checks read app code; a website's wording rules are in its AI instructions.
      const claims = !isSite && (next.wording ?? DEFAULT_WORDING) === "claim-safe" ? checkClaims(files, next.listing) : [];
      const regulated = isSite ? [] : checkRegulatedClaims(files, next.listing);
      // Generic AI design (emoji icons, filler copy, off-scale type…): one round of fixes per request.
      const looks = isSite || designBudget.current <= 0 ? [] : designIssues(files);
      reportQuality([
        ...(issues.length ? (["check:code"] as const) : []),
        ...(claims.length ? (["check:claims"] as const) : []),
        ...(regulated.length ? (["check:regulated"] as const) : []),
        ...(looks.length ? (["check:design"] as const) : []),
        ...((issues.length || regulated.length) && fixBudget.current === 0 ? (["unfixed:checks"] as const) : []),
      ]);
      const fixChecks = (issues.length || claims.length || regulated.length || looks.length) > 0 && fixBudget.current > 0;
      const fixContent = lostContent.length > 0 && contentBudget.current > 0;
      if (fixChecks || fixContent) {
        if (fixChecks) fixBudget.current -= 1;
        if (fixChecks && looks.length) designBudget.current -= 1;
        if (fixContent) contentBudget.current -= 1;
        // A new app was shown while it was written: it failed a check, so it leaves the phone until the fixed version passes.
        if (!(isSite ? hasSiteEntry(current.files) : hasEntry(current.files))) setPreviewFiles(current.files);
        setChecking(true);
        const parts = [
          issues.length && `Automatic quality check found ${issues.length} problem${issues.length === 1 ? "" : "s"}:\n${describeIssues(issues)}`,
          lostContent.length &&
            `Content keeper (checks the redesign kept the owner's content): ${lostContent.length} problem${lostContent.length === 1 ? "" : "s"}. Put the owner's content back, in the same order and with each section's images, keeping the new design. You may present it better, but keep their words and every fact (fold long text behind "Read more" instead of cutting it):\n${describeIssues(lostContent)}`,
          claims.length &&
            `Claim-safe wording is on. Rewrite these phrases as neutral, descriptive text (no superlatives, absolutes, speed promises or unsupported comparisons), in the app and in the listing:\n${describeClaims(claims)}`,
          looks.length &&
            `Design check (the app should look like a top product team made it, not generic AI design). Change these, keeping the content and features the same:\n${describeDesign(looks)}`,
          regulated.length &&
            `Health, medical and financial claims check (always on). Remove or rewrite these so the app only describes tracking and information, and add the disclaimer where asked:\n${describeRegulated(regulated)}`,
        ].filter(Boolean);
        sendRef.current?.(`${parts.join("\n\n")}\n\nFix all of them.`, { autoFix: true });
        return;
      }
      // The AI still left some of the owner's content out: Appmaker puts it back itself,
      // word for word with its pictures, in its place, so nothing is ever lost.
      if (lostContent.length) {
        const { files: kept, restored } = restoreContent(files, selectedSite(base.source, base.excludedSections));
        const p = projectRef.current;
        if (restored && p) {
          const { project: withKept, versionId: keptVersion } = withVersion({ ...p, files: kept }, "Content keeper: restored the owner's content");
          const note: ChatMessage = {
            id: uid(),
            role: "assistant",
            content: `🧩 Content keeper: the AI left out ${restored} section${restored === 1 ? "" : "s"} of your current site, so I put ${restored === 1 ? "it" : "them"} back word for word, with ${restored === 1 ? "its" : "their"} pictures, in the original place. Ask for a design touch-up if you'd like ${restored === 1 ? "it" : "them"} styled differently.`,
            createdAt: Date.now(),
            versionId: keptVersion,
          };
          commit({ ...withKept, messages: [...withKept.messages, note] });
          return reveal(kept);
        }
      }
      reveal();
      // The phone tests and review agents are for apps.
      if (isSite) return;
      runtimeWatchUntil.current = Date.now() + RUNTIME_WATCH_MS;
      setTapFiles(files);
    },
    [commit],
  );
  // Website redesign: three design concepts (home page + one inside page) first.
  const conceptsRunning = useRef(false);
  const makeConcepts = useCallback(
    async (only?: number) => {
      const current = projectRef.current;
      if (!current || conceptsRunning.current) return;
      conceptsRunning.current = true;
      const colors = resolveSiteColors(current.siteColors, current.source?.colors);
      const plan = conceptStyles(getStyle(current.design?.style) ?? pickStyle(current.prompt).style, DESIGN_STYLES);
      const start: SiteConcept[] =
        current.concepts && only != null
          ? current.concepts.map((c, i) => (i === only ? { ...c, status: "writing", error: undefined } : c))
          : plan.map(({ tier, style }) => ({ style: style.id, tier: tier.tier, files: {}, status: "writing" }));
      const intro: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "Designing three options for your home page and one inside page: Ultra-modern editorial, Modern soft & rounded, and a style made for your business. Look through them on the right and choose one; then I'll make the other pages in that design.",
        createdAt: Date.now(),
      };
      commit({
        ...current,
        concepts: start,
        messages: only == null && !current.messages.some((m) => m.role === "user") ? [...current.messages, { id: uid(), role: "user", content: current.prompt, createdAt: Date.now() }, intro] : current.messages,
      });
      setTab("preview");
      setMobileView("app");
      const update = (i: number, patch: Partial<SiteConcept>) => {
        const p = projectRef.current;
        if (!p?.concepts) return;
        commit({ ...p, concepts: p.concepts.map((c, n) => (n === i ? { ...c, ...patch } : c)) });
      };
      await Promise.all(
        start.map(async (c, i) => {
          if (c.status !== "writing") return;
          const style = getStyle(c.style)!;
          try {
            const res = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: [conceptPrompt(current.prompt, style, i + 1, c.tier, colors), editsNote(current.contentEdits)].filter(Boolean).join("\n\n"),
                files: {},
                site: selectedSite(current.source, current.excludedSections),
                ai: aiChoiceFor(getAiSettings()),
                wording: current.wording ?? DEFAULT_WORDING,
                kind: "website",
                style: style.id,
              }),
            });
            if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
            const raw = takeSignals(await res.text()).text;
            const err = /<error>([\s\S]*?)<\/error>/.exec(raw)?.[1];
            const parsed = parseGeneration(raw.replace(/<error>[\s\S]*?<\/error>/, ""));
            const files = Object.fromEntries(Object.entries(parsed.files).filter(([p]) => p !== parsed.writing && isAllowedSitePath(p)));
            if (!files["index.html"]) throw new Error(err ? friendlyError(err) : "the AI didn't write a home page");
            update(i, { status: "ready", files: withA11yWidget(applyEdits(files, projectRef.current?.contentEdits)) });
          } catch (e) {
            update(i, { status: "failed", error: (e as Error).message.slice(0, 200) });
          }
        }),
      );
      conceptsRunning.current = false;
      window.dispatchEvent(new Event(PLAN_CHANGED));
    },
    [commit],
  );
  const chooseConcept = (i: number) => {
    const p = projectRef.current;
    const c = p?.concepts?.[i];
    if (!p || !c || c.status !== "ready") return;
    const style = getStyle(c.style)!;
    const design = applyStyle(p.design ?? defaultDesign(p.listing), style, !!p.source);
    const files = withA11yWidget(c.files);
    commit({ ...p, files, design, concepts: undefined });
    setPreviewFiles(files);
    send(finishSitePrompt(style, Object.keys(c.files).filter((f) => f.endsWith(".html")), resolveSiteColors(p.siteColors, p.source?.colors)), { keepContent: true });
  };

  // Text edited right on a design: made on every page of every design, and kept
  // through later AI changes. Returns how many places changed.
  const editText = useCallback(
    (edit: ContentEdit) => {
      const p = projectRef.current;
      if (!p) return 0;
      const main = applyEdit(p.files, edit);
      let changed = main.changed;
      const concepts = p.concepts?.map((c) => {
        const r = applyEdit(c.files, edit);
        changed += r.changed;
        return { ...c, files: r.files };
      });
      if (!changed) return 0;
      const next: Project = { ...p, files: main.files, ...(concepts ? { concepts } : {}), contentEdits: addEdit(p.contentEdits, edit) };
      commit(main.changed ? withVersion(next, `Edited text: “${edit.to.slice(0, 40)}”`).project : next);
      if (main.changed) setPreviewFiles(main.files);
      return changed;
    },
    [commit],
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!project || started.current) return;
    started.current = true;
    if (autoStart && project.messages.length === 0 && project.prompt) {
      window.history.replaceState(null, "", `/build/${project.id}`);
      // A new website starts with three designs to choose from.
      if (project.kind === "website") void makeConcepts();
      else send(project.prompt);
    }
  }, [project, autoStart, send, makeConcepts]);

  /** Re-runs the last request the user made (not an automatic fix). */
  // Polish design: screenshot the screen in the preview and let the AI fix what looks off.
  const polish = async () => {
    const frame = phoneRef.current?.querySelector<HTMLIFrameElement>('iframe[title="App preview"]');
    if (!frame || polishing) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const { dataUrl, text } = await captureFrame(frame, device === "ipad" ? 1 : 1.5);
      const jpeg = await toJpeg(dataUrl);
      setPolishing(false);
      await send(polishPrompt({ scheme, device, screenText: text }), { images: [jpeg] });
    } catch (e) {
      setPolishError((e as Error).message || "Couldn't take a screenshot of the preview.");
      setPolishing(false);
    }
  };

  const retry = useCallback(() => {
    const p = projectRef.current;
    if (!p) return;
    const last = p.pending?.prompt ?? [...p.messages].reverse().find((m) => m.role === "user" && m.kind !== "auto-fix")?.content;
    if (last) send(last, { retry: true });
  }, [send]);

  /** Dismisses a request that was interrupted by closing the page. */
  const dismissPending = useCallback(() => {
    const p = projectRef.current;
    if (p) commit({ ...p, pending: undefined });
  }, [commit]);

  /** Brings back an earlier version; the current state stays in History. */
  const restore = useCallback(
    (versionId: string) => {
      const p = projectRef.current;
      const v = p?.versions?.find((x) => x.id === versionId);
      if (!p || !v || abortRef.current) return;
      const when = new Date(v.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      // The design is a setting, not part of a version: the restored code keeps today's look.
      const files: FileMap = p.design ? { ...v.files, [THEME_FILE]: themeModule(p.design) } : { ...v.files };
      if (p.booking) files[BOOKING_FILE] = bookingModule(p.booking.apiUrl);
      const restoredRules = appRules(files);
      if (restoredRules) {
        files[DATA_FILE] = dataModule(p.appData?.apiUrl ?? null, restoredRules);
        files[STAFF_FILE] = staffModule(p.appData?.apiUrl ?? null);
      }
      if (files[BRAND_FILE] != null) files[BRAND_FILE] = brandModule(brandedRef.current);
      const listing = p.design ? { ...v.listing, primaryColor: p.design.primary } : v.listing;
      const restored = withVersion({ ...p, files, listing, name: v.listing.name || p.name }, `Restored the version from ${when}`);
      const note: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `↩️ Restored the version from ${when} (“${v.label.slice(0, 60)}”). Your previous version is still in **History**.`,
        createdAt: Date.now(),
        versionId: restored.versionId,
      };
      commit({ ...restored.project, messages: [...p.messages, note] });
      setPreviewFiles(files);
      setReloadKey((k) => k + 1);
      setSelectedFile("App.js");
    },
    [commit],
  );

  const openFile = useCallback((path: string) => {
    setSelectedFile(path);
    setTab("code");
    setMobileView("app");
  }, []);

  const onPreviewError = useCallback((err: PreviewError | null) => {
    setPreviewError(err);
    if (err && Date.now() < runtimeWatchUntil.current && !demoRef.current) reportQuality(["crash"]);
    // A crash right after a generation is almost always caused by it: repair
    // it automatically instead of making the user press "Fix with AI".
    if (err && Date.now() < runtimeWatchUntil.current && fixBudget.current > 0 && !abortRef.current) {
      runtimeWatchUntil.current = 0;
      fixBudget.current -= 1;
      if (projectRef.current) healed.current.add(projectRef.current.id);
      sendRef.current(
        `Automatic quality check: the app crashed in the preview with this error:\n\n${err.message}\n\nFind the root cause and fix it.`,
        { autoFix: true },
      );
      return;
    }
    // Self-healing: any other crash (an app opened already broken, or one left
    // half-written by a failed build) is repaired automatically, once per app per
    // session, and not after the automatic repairs of a build have run out.
    const p = projectRef.current;
    if (!err || !p || abortRef.current || demoRef.current) return;
    if (healed.current.has(p.id)) return;
    healed.current.add(p.id);
    const missing = validateApp(p.files).filter((i) => /doesn't exist|is missing/.test(i.message));
    // One more check of the repaired version, but no new round of repairs.
    fixBudget.current = Math.max(fixBudget.current, 1);
    continueBudget.current = Math.max(continueBudget.current, 1);
    sendRef.current(
      [
        `Self-heal: the app crashes in the preview with this error:\n\n${err.message}`,
        missing.length ? `Files the app imports that don't exist yet (write them):\n${describeIssues(missing)}` : "",
        "Find the root cause and fix it, keeping everything that already works.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      { autoFix: true },
    );
  }, []);

  // Problems the preview's quality check finds right after a generation
  // (layout, contrast, text size, overflow, small buttons) go back to the AI
  // too, once; later ones show a banner with Fix with AI.
  const onPreviewEdit = useCallback((edit: { kind: string; item: string }) => {
    if (edit.kind !== "photo") return;
    setDesignOpen(false);
    setDetailsOpen(true);
    setPhotoFor((p) => ({ item: edit.item, n: (p?.n ?? 0) + 1 }));
  }, []);

  const onQualityIssues = useCallback((issues: QualityIssue[]) => {
    setQuality(issues.length ? issues : null);
    const justBuilt = Date.now() < runtimeWatchUntil.current;
    if (justBuilt && !demoRef.current) reportQuality(issues.length ? issues.map((i) => i.kind as QualityEvent) : ["screen:clean"]);
    if (!issues.length) return;
    if (justBuilt && fixBudget.current > 0 && !abortRef.current) {
      runtimeWatchUntil.current = 0;
      fixBudget.current -= 1;
      sendRef.current(`Automatic quality check: ${qualityFixRequest(issues)}`, { autoFix: true });
    }
  }, []);

  const onTapResult = useCallback((r: TapTestResult) => {
    setTapFiles(null);
    const issues: QualityIssue[] = [
      ...r.errors.slice(0, 1).map((e) => ({ kind: "crash" as const, message: `Tapping “${e.after || "a control"}” crashes the app: ${e.message}` })),
      ...(r.deadSave ? [{ kind: "save" as const, message: `“${r.deadSave}” doesn't save: what was typed never appeared in the app after tapping it.` }] : []),
    ];
    if (!demoRef.current) reportQuality(issues.length ? issues.map((i) => (i.kind === "crash" ? "tap:crash" : "tap:dead-save")) : ["tap:clean"]);
    setTapIssues(issues);
    if (issues.length && fixBudget.current > 0 && !abortRef.current && !demoRef.current) {
      fixBudget.current -= 1;
      sendRef.current(`Automatic tap test: ${qualityFixRequest(issues)}`, { autoFix: true });
      return;
    }
    // A working version: the UX and UI agents look at it (once per request).
    if (!issues.length && reviewPending.current && !abortRef.current && !demoRef.current) {
      reviewPending.current = false;
      void reviewRef.current();
    }
  }, []);

  // The UX agent reads the code; the UI agent also sees a screenshot of the screen; the quality critic
  // scores 10 checks. Their important findings go back to the AI; then the critic scores the fixed app
  // again (a self-critique loop) until every check passes, a round stops helping, or MAX_CRITIQUE_ROUNDS.
  const runReviews = useCallback(async () => {
    const p = projectRef.current;
    if (!p || !hasEntry(p.files)) return;
    const round = critiqueRound.current + 1;
    critiqueRound.current = round;
    setReviewing(true);
    let image: string | null = null;
    try {
      const frame = phoneRef.current?.querySelector<HTMLIFrameElement>('iframe[title="App preview"]');
      if (frame) image = await toJpeg((await captureFrame(frame, 1.5)).dataUrl);
    } catch {
      // The agents review the code alone.
    }
    const ask = async (agent: ReviewAgent): Promise<Review | null> => {
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent, files: p.files, listing: p.listing, ai: aiChoiceFor(getAiSettings()), ...(agent !== "ux" && image ? { image } : {}) }),
        });
        return res.ok ? ((await res.json()).review as Review | null) : null;
      } catch {
        return null;
      }
    };
    // The first round: all three agents. Later rounds: the critic checks the fixes.
    const agents: ReviewAgent[] = round === 1 ? ["ux", "ui", "critic"] : ["critic"];
    const reviews = (await Promise.all(agents.map(ask))).filter((r): r is Review => !!r);
    setReviewing(false);
    const current = projectRef.current;
    if (!reviews.length || !current || current.id !== p.id) return;
    const critic = reviews.find((r) => r.agent === "critic");
    const previous = critiqueScore.current;
    if (critic) {
      critic.round = round;
      if (previous !== null) critic.previous = previous;
      critiqueScore.current = critic.score ?? null;
    }
    // Fix automatically only if nothing else started meanwhile. The critic's points are fixed while
    // rounds help; the UX and UI agents' once.
    const again = critiqueAgain(critic, round, previous, critiqueRounds.current);
    const toFix = reviews.filter((r) => fixable(r).length && (r.agent !== "critic" || again));
    const fix = toFix.length > 0 && !abortRef.current;
    const notes: ChatMessage[] = reviews.map((r) => ({
      id: uid(),
      role: "assistant",
      kind: "review",
      content: reviewMessage(r),
      review: r,
      createdAt: Date.now(),
      ...(fix && toFix.includes(r) ? { fixing: true } : {}),
    }));
    commit({ ...current, messages: [...current.messages, ...notes] });
    if (fix) {
      // After this fix passes the checks and the tap test, the critic looks again.
      if (again) reviewPending.current = true;
      sendRef.current(reviewFixRequest(toFix), { autoFix: true });
    }
  }, [commit]);
  const reviewRef = useRef(runReviews);
  useEffect(() => {
    reviewRef.current = runReviews;
  }, [runReviews]);

  if (project === undefined) {
    return (
      <div className="grid h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }
  if (project === null) {
    if (cloud.enabled === null || (cloud.user && cloud.status === "syncing")) {
      return (
        <div className="grid h-screen place-items-center text-center">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your app…
          </p>
        </div>
      );
    }
    return (
      <div className="grid h-screen place-items-center text-center">
        <div className="max-w-sm px-4">
          <p className="text-muted">
            {cloud.enabled && !cloud.user
              ? "This app isn't on this device. If you saved it to your account, sign in to open it."
              : "This app isn't on this device or in your account."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {cloud.enabled && !cloud.user && (
              <Link href="/login" className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
                Sign in
              </Link>
            )}
            <Link href="/" className="inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium">
              Start a new app
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // An app exists once it has its entry file (helper files alone don't count).
  const isSite = project.kind === "website";
  const hasApp = isSite ? hasSiteEntry(project.files) : hasEntry(project.files);
  // iPad turned off in the listing: show the iPhone instead.
  const device = platform === "ipad" && project.listing.ipad === false ? "ios" : platform;

  // A design change rewrites src/theme.js and shows straight away: no AI, no credits.
  const changeDesign = (design: AppDesign) => {
    if (design.mode !== "auto") setScheme(design.mode);
    const current = projectRef.current ?? project;
    const files = { ...current.files, [THEME_FILE]: themeModule(design) };
    commit({ ...current, design, files, listing: { ...current.listing, primaryColor: design.primary } });
    setPreviewFiles(files);
  };
  // The owner edited their details: only the business file, its data rules and (for a new color) the theme change.
  const changeDetails = (info: ReadyInfo) => {
    const current = projectRef.current ?? project;
    const preset = current.ready && READY_PRESETS[current.ready.slug];
    if (!preset) return;
    const colorChanged = info.color !== current.ready!.info.color;
    const design = colorChanged ? readyDesign(info, current.prompt, current.design) : current.design;
    const files = {
      ...current.files,
      ...readyDetailFiles(preset, info, current.appData?.apiUrl ?? null, appRules(current.files)),
      ...(colorChanged && design ? { [THEME_FILE]: themeModule(design) } : {}),
    };
    const name = info.name.trim() || current.name;
    commit({
      ...current,
      name,
      ready: { ...current.ready!, info },
      files,
      ...(design ? { design } : {}),
      listing: { ...current.listing, name: name.slice(0, 30), ...(colorChanged ? { primaryColor: info.color } : {}) },
    });
    setPreviewFiles(files);
  };
  // "Your data": a step added or removed. The app's data module, staff mode and (in ready-made apps) the tracker follow at once.
  const applyRules = (rules: DataRules) => {
    const current = projectRef.current ?? project;
    const apiUrl = current.appData?.apiUrl ?? null;
    const preset = current.ready && READY_PRESETS[current.ready.slug];
    const files = {
      ...current.files,
      [RULES_FILE]: JSON.stringify(rules, null, 2),
      [DATA_FILE]: dataModule(apiUrl, rules),
      [STAFF_FILE]: staffModule(apiUrl),
      ...(preset ? { "src/business.js": businessModule(preset, current.ready!.info, rules) } : {}),
    };
    commit({ ...current, files });
    setPreviewFiles(files);
  };
  const shownFiles = generating && live ? { ...project.files, ...live.files } : project.files;

  const tabs: { key: Tab; label: string; icon: typeof Smartphone }[] = [
    { key: "preview", label: "Preview", icon: Smartphone },
    { key: "code", label: "Code", icon: Code2 },
    ...(isSite ? [] : [{ key: "publish" as Tab, label: "Publish", icon: Rocket }]),
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
    <AppSidebar
      currentId={project.id}
      busy={generating || checking}
      onRenameCurrent={(name) => {
        const p = projectRef.current ?? project;
        commit({ ...p, name, listing: { ...p.listing, name } });
      }}
    />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:gap-3">
        <Logo href="/projects" compact />
        <span className="hidden text-line sm:inline">/</span>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <AppIcon listing={project.listing} icon={project.icon} size={22} />
          <span className="truncate text-sm font-medium">{project.name}</span>
          {demoMode && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300" title="No AI key is set up yet, so you get sample apps. The site owner can add one in the server settings.">
              Demo mode
            </span>
          )}
        </div>
        <nav className="mx-auto flex rounded-lg border border-line bg-surface p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              aria-label={t.label}
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setMobileView("app");
              }}
              className={`flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium sm:px-3 ${
                tab === t.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        <span className="hidden sm:contents">
          <SyncBadge />
        </span>
        <AccessibilityMenu inline />
        {!isSite && <DeviceMenu
          project={project}
          disabled={!Object.keys(project.files).length || generating || checking}
          onExpoChange={(expo) => commit({ ...(projectRef.current ?? project), expo })}
          onAndroidTestApp={() => {
            setBuildRequest((r) => ({ target: "android-apk", n: (r?.n ?? 0) + 1 }));
            setTab("publish");
            setMobileView("app");
          }}
        />}
        <HistoryMenu versions={project.versions ?? []} disabled={generating} onRestore={restore} />
        {isSite ? (
          <button
            onClick={async () => {
              setZipping(true);
              try {
                const { blob, linked } = await siteZip(project.files, fetch, project.siteAssets);
                downloadBlob(blob, `${slugify(project.listing.name || project.name)}-website-${new Date().toISOString().slice(0, 10)}.zip`);
                if (linked) setSiteNote(`${linked} image${linked === 1 ? "" : "s"} couldn't be saved into the ZIP (that website doesn't allow it), so ${linked === 1 ? "it stays" : "they stay"} linked to your current site. The ZIP's README explains.`);
              } finally {
                setZipping(false);
              }
            }}
            disabled={!hasApp || generating || zipping}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{" "}
            <span className="hidden sm:inline">{zipping ? "Packing images…" : "Download website"}</span>
          </button>
        ) : (
        <>
        <button
          onClick={async () => downloadBlob(await exportProjectZip(project), `${slugify(project.listing.name)}-expo.zip`)}
          disabled={!hasApp}
          className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-white/20 disabled:opacity-40 lg:flex"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        {/* Hidden while Publish is open: one Publish button on screen at a time. */}
        {tab !== "publish" && (
        <button
          onClick={() => setTab("publish")}
          disabled={!hasApp}
          aria-label="Publish"
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          <Rocket className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Publish</span>
        </button>
        )}
        </>
        )}
      </header>

      {siteNote && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-white/5 px-4 py-2 text-xs text-muted">
          {siteNote}
          <button onClick={() => setSiteNote(null)} className="ml-auto underline underline-offset-2">
            OK
          </button>
        </div>
      )}
      {saveFailed && (
        <div role="alert" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Your browser&apos;s storage is full, so recent changes may not be saved. Export the project to keep a copy, or delete old apps in My apps.
        </div>
      )}

      <div className="flex border-b border-line lg:hidden">
        {(["chat", "app"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
              mobileView === v ? "border-b-2 border-violet-500 text-foreground" : "text-muted"
            }`}
          >
            {v === "chat" ? <MessageSquare className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
            {v === "chat" ? "Chat" : "App"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${mobileView === "chat" ? "flex" : "hidden"} min-h-0 w-full flex-col border-line lg:flex lg:w-[400px] lg:shrink-0 lg:border-r`}
        >
          {isSite && project.source && (project.concepts || hasApp) && (
            <SiteContentPanel
              key={(project.excludedSections ?? []).join("|")}
              site={project.source}
              excluded={project.excludedSections ?? []}
              busy={generating || checking || !!project.concepts?.some((c) => c.status === "writing")}
              applyLabel={hasApp ? "Update the website" : "Redo the 3 designs with this content"}
              onApply={(excluded) => {
                const p = projectRef.current ?? project;
                const before = new Set(p.excludedSections ?? []);
                commit({ ...p, excludedSections: excluded });
                if (!hasApp) return void makeConcepts();
                const name = (key: string) => {
                  const [url, i] = [key.slice(0, key.lastIndexOf("#")), Number(key.slice(key.lastIndexOf("#") + 1))];
                  const sec = p.source?.pages.find((pg) => pg.url === url)?.sections?.[i];
                  return sec ? `“${sec.heading || sec.text.slice(0, 60)}” (from ${url})` : key;
                };
                const removed = excluded.filter((k) => !before.has(k)).map(name);
                const added = [...before].filter((k) => !excluded.includes(k)).map(name);
                send(
                  [
                    removed.length && `Leave these sections of the current site out of the website, and remove them where they appear:\n${removed.map((r) => `- ${r}`).join("\n")}`,
                    added.length && `Add these sections of the current site back, word for word with their pictures, in their place:\n${added.map((r) => `- ${r}`).join("\n")}`,
                    "Keep everything else as it is.",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                  { keepContent: true },
                );
              }}
            />
          )}
          {isSite && (project.concepts || hasApp) && (
            <SiteColorsPanel
              key={JSON.stringify(project.siteColors ?? null)}
              colors={resolveSiteColors(project.siteColors, project.source?.colors)}
              brand={project.source?.colors ?? []}
              busy={generating || checking || !!project.concepts?.some((c) => c.status === "writing")}
              applyLabel={hasApp ? "Recolor the website" : "Redo the 3 designs with these colors"}
              onApply={(siteColors) => {
                commit({ ...(projectRef.current ?? project), siteColors });
                if (!hasApp) return void makeConcepts();
                send(
                  siteColors.mode === "auto"
                    ? "Recolor the whole website with the most beautiful palette for this business and design, keeping readable contrast. Keep the layout and content the same."
                    : `Recolor the whole website around these colors: main ${siteColors.primary}${siteColors.accent ? `, accent ${siteColors.accent}` : ""}. Keep text readable (WCAG AA contrast), and keep the layout and content the same.`,
                );
              }}
            />
          )}
          {plan?.enabled && plan.plan !== "guest" && typeof plan.balance === "number" && plan.balance <= 3 && (
            <div role="status" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
              <Coins className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{plan.balance === 0 ? "You're out of credits." : `${plan.balance} credit${plan.balance === 1 ? "" : "s"} left.`}</span>
              <Link href="/credits" className="inline-flex min-h-8 items-center rounded-lg bg-white px-2.5 font-medium text-black">
                Buy credits
              </Link>
            </div>
          )}
          <ChatPanel
            source={project.source}
            messages={project.messages}
            generating={generating}
            reviewing={reviewing}
            live={live}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            hasApp={hasApp}
            website={isSite}
            startedAt={startedAt}
            interrupted={!generating ? (project.pending ?? null) : null}
            onRetry={retry}
            onDismissInterrupted={dismissPending}
            onOpenFile={openFile}
            onRestore={restore}
            latestVersionId={project.versions?.at(-1)?.id}
            demoMode={demoMode}
            wording={project.wording ?? DEFAULT_WORDING}
            onWordingChange={(wording) => commit({ ...(projectRef.current ?? project), wording })}
            prompt={project.prompt}
            onFeedback={(id, value) => {
              const p = projectRef.current ?? project;
              commit({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, feedback: value } : m)) });
            }}
          />
        </aside>

        <main className={`${mobileView === "app" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>
          {tab === "preview" && isSite && (
            <div className="stage relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
              {(generating || checking) && (
                <span role="status" aria-label={generating ? "Building your website" : "Checking your website"} className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 py-1 pl-1.5 pr-3 text-xs font-medium text-violet-100">
                  <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-violet-300/25 border-t-violet-300 border-r-pink-400" />
                  {generating ? (live?.writing ? `Writing ${live.writing}…` : "Redesigning your website…") : "Checking…"}
                </span>
              )}
              {project.concepts && !hasApp ? (
                <ConceptPicker
                  concepts={project.concepts}
                  assets={project.siteAssets}
                  onEdit={editText}
                  busy={generating || project.concepts.some((c) => c.status === "writing")}
                  onChoose={chooseConcept}
                  onRetry={(i) => void makeConcepts(i)}
                />
              ) : hasSiteEntry(previewFiles) ? (
                <SitePreview
                  files={previewFiles}
                  assets={project.siteAssets}
                  onEdit={generating || checking ? undefined : editText}
                  report={project.a11yReport}
                  onReport={generating ? undefined : (report) => {
                    const p = projectRef.current ?? project;
                    // The statement says what this check found.
                    const files = withStatement(p.files, statementInfo(p, report));
                    commit({ ...p, a11yReport: report, files });
                    setPreviewFiles(files);
                  }}
                  onFix={generating || checking ? undefined : (request) => send(request)} />
              ) : (
                <div className="grid flex-1 place-items-center text-center text-sm text-muted">
                  <div>
                    <Wand2 className="mx-auto h-8 w-8 text-violet-400" />
                    <p className="mt-4">{generating ? "Your new website appears here as soon as it's written." : "Your redesigned website will appear here"}</p>
                    {generating && live && Object.keys(live.files).length > 0 && (
                      <p className="mt-2 text-xs">Pages so far: {Object.keys(live.files).join(", ")}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "preview" && !isSite && (
            <div className="stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-center gap-2 p-3">
                {(generating || checking) && (
                  <span role="status" aria-label={generating ? "Building your app" : "Checking your app"} className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 py-1 pl-1.5 pr-3 text-xs font-medium text-violet-100">
                    <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-violet-300/25 border-t-violet-300 border-r-pink-400" />
                    {generating ? "Building…" : "Checking…"}
                  </span>
                )}
                <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
                  {(["ios", "android", ...(project.listing.ipad === false ? [] : (["ipad"] as const))] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      aria-pressed={device === p}
                      className={`rounded-md px-3 py-1 font-medium ${device === p ? "bg-surface-2 text-foreground" : "text-muted"}`}
                    >
                      {p === "ios" ? "iPhone" : p === "android" ? "Android" : "iPad"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-foreground"
                  aria-label="Reload preview"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                {hasApp && (
                  <button
                    onClick={() => setScheme((m) => (m === "dark" ? "light" : "dark"))}
                    aria-pressed={scheme === "dark"}
                    aria-label="Preview in dark mode"
                    title={scheme === "dark" ? "Showing dark mode. Show light mode" : "Show dark mode"}
                    className={`grid h-7 w-7 place-items-center rounded-lg border ${scheme === "dark" ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line bg-surface text-muted hover:text-foreground"}`}
                  >
                    {scheme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  </button>
                )}
                {hasApp && project.ready && (
                  <button
                    onClick={() => {
                      setDetailsOpen(designOpen ? true : (o) => !o);
                      setDesignOpen(false);
                    }}
                    aria-pressed={detailsOpen && !designOpen}
                    className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                      detailsOpen && !designOpen ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    <Store className="h-3.5 w-3.5" /> Your details
                  </button>
                )}
                {hasApp && project.files[RULES_FILE] != null &&
                  (project.appData && ownerUrl ? (
                    <a
                      href={ownerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Where the business manages orders, the menu and the staff PIN"
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Owner page<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <button
                      onClick={openAppData}
                      title="The owner page comes with the app database: turn it on in Publish → Optional extras"
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-muted hover:text-foreground"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Owner page
                    </button>
                  ))}
                {hasApp && (
                  <button
                    onClick={() => setDesignOpen((o) => !o)}
                    aria-pressed={designOpen}
                    className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                      designOpen ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    <Palette className="h-3.5 w-3.5" /> Design
                  </button>
                )}
                {hasApp && !demoMode && (
                  <button
                    onClick={polish}
                    disabled={generating || polishing}
                    aria-label="Polish design"
                    title="The AI looks at this screen and fixes alignment, spacing and other visual details (1 credit)"
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
                  >
                    {polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Polish design</span>
                  </button>
                )}
                {generating && hasApp && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> Applying changes…
                  </span>
                )}
              </div>
              {polishError && !generating && (
                <div role="alert" className="mx-4 mb-2 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-[#1a0d12] p-3 text-sm text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div className="min-w-0 flex-1">{polishError}</div>
                  <button onClick={() => setPolishError(null)} className="min-h-8 shrink-0 rounded-lg px-2 text-xs text-rose-200 hover:text-white">
                    Dismiss
                  </button>
                </div>
              )}
              {previewError && !generating && (
                <div role="alert" className="mx-4 mb-2 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-[#1a0d12] p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-rose-200">The app hit an error</div>
                    <div className="mt-0.5 line-clamp-2 font-mono text-xs text-rose-300/80">{previewError.message}</div>
                    {demoMode && <div className="mt-1 text-xs text-rose-200/80">Automatic fixing needs an AI key — add one in AI settings, or undo the change in History.</div>}
                  </div>
                  {!demoMode && (
                    <button
                      onClick={() =>
                        send(`The app crashes in the preview with this error:\n\n${previewError.message}\n\nPlease find the cause and fix it.`)
                      }
                      className="min-h-8 shrink-0 rounded-lg bg-rose-500 px-3 text-xs font-medium text-white hover:bg-rose-400"
                    >
                      Fix with AI
                    </button>
                  )}
                </div>
              )}
              {tapFiles && !generating && <TapTest files={tapFiles} platform={device} onResult={onTapResult} />}
              {(quality || tapIssues.length > 0) && !previewError && !generating && !checking && (
                <div role="status" className="mx-4 mb-2 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-amber-100">
                      {(quality ?? []).some((i) => i.kind === "layout") ? "The layout doesn't fill the screen" : "The quality check found something to improve"}
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-xs text-amber-100/80">
                      {[...(quality ?? []), ...tapIssues].map((i) => (
                        <li key={i.kind}>{i.message}</li>
                      ))}
                    </ul>
                  </div>
                  {!demoMode && (
                    <button
                      onClick={() => send(`Quality check: ${qualityFixRequest([...(quality ?? []), ...tapIssues])}`)}
                      className="min-h-8 shrink-0 rounded-lg bg-amber-400 px-3 text-xs font-medium text-black hover:bg-amber-300"
                    >
                      Fix with AI
                    </button>
                  )}
                </div>
              )}
              <div className="relative flex min-h-0 flex-1 gap-4 px-4 pb-4">
                <div ref={phoneRef} className="relative isolate min-h-0 min-w-0 flex-1">
                {/* A soft glow behind the device. */}
                <Orb size="min(70%, 520px)" soft className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" />
                <PhoneFrame platform={device}>
                  {checking && <ChecksOverlay generating={generating} />}
                  {generating && hasApp && !checking && <PhoneEditing live={live} />}
                  {hasApp || hasEntry(previewFiles) ? (
                    <Preview
                      files={previewFiles}
                      platform={device}
                      reloadKey={reloadKey}
                      onError={onPreviewError}
                      onQualityIssues={onQualityIssues}
                      scheme={scheme}
                      onEdit={project.ready && !generating ? onPreviewEdit : undefined}
                    />
                  ) : generating && !checking ? (
                    <PhoneBuilding live={live} startedAt={startedAt} source={project.source} design={project.design} prompt={project.prompt} />
                  ) : (
                    <div className="grid h-full place-items-center bg-gradient-to-b from-violet-50 to-pink-50 p-10 text-center text-neutral-600">
                      <div>
                        <Wand2 className="mx-auto h-8 w-8 text-violet-600" />
                        <p className="mt-4 text-sm">{checking ? "Running checks…" : "Your app will appear here"}</p>
                      </div>
                    </div>
                  )}
                </PhoneFrame>
                </div>
                {detailsOpen && !designOpen && hasApp && project.ready && (
                  <div className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0">
                    <ReadyDetails
                      slug={project.ready.slug}
                      info={project.ready.info}
                      onChange={changeDetails}
                      onClose={() => setDetailsOpen(false)}
                      ownerUrl={project.appData ? ownerUrl : ""}
                      onOpenPublish={openAppData}
                      photoFor={photoFor}
                      sitePhotos={project.source?.images ?? []}
                    />
                  </div>
                )}
                {designOpen && hasApp && (
                  // Beside the phone on wide screens; a sheet over the lower half on phones.
                  <div className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0">
                    <DesignPanel
                      project={project}
                      busy={generating || checking}
                      onChange={changeDesign}
                      onClose={() => setDesignOpen(false)}
                      onRestyle={(style) => {
                        setDesignOpen(false);
                        send(
                          `Restyle the app in the ${style.name} design style: ${style.direction} Keep every feature, screen and piece of content, and keep reading colors and type from src/theme.js; change the layout, composition and typography to match the style.`,
                        );
                      }}
                      onMakeCustomizable={() => {
                        setDesignOpen(false);
                        send(
                          `Make this app's design customizable: move every color, corner radius, font weight and card style into imports from src/theme.js (colors, radius, font, card, mode), as the design rules describe. Keep the layout, content and behavior exactly the same.`,
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "code" && (
            <CodePanel
              files={shownFiles}
              selected={selectedFile}
              onSelect={setSelectedFile}
              readOnly={generating}
              writing={live?.writing ?? null}
              onChange={(path, code) => commit({ ...project, files: { ...project.files, [path]: code } })}
            />
          )}

          {tab === "publish" && (
            <PublishPanel
              project={project}
              buildRequest={buildRequest}
              hasPreviewError={!!previewError}
              onChange={(listing) => commit({ ...project, listing, name: listing.name || project.name })}
              onExpoChange={(expo) => commit({ ...(projectRef.current ?? project), expo })}
              onIconChange={(icon) => commit({ ...(projectRef.current ?? project), icon })}
              onStorePagesChange={({ listing, storePages }) => commit({ ...(projectRef.current ?? project), listing, storePages })}
              onLiveChange={(live, files) => {
                commit({ ...(projectRef.current ?? project), live, files });
                setPreviewFiles(files);
              }}
              onBookingChange={(booking, files) => {
                commit({ ...(projectRef.current ?? project), booking, files });
                setPreviewFiles(files);
              }}
              onAndroidPushChange={(androidPush) => commit({ ...(projectRef.current ?? project), androidPush })}
              onAppDataChange={(appData, files) => {
                // Turning it on or off sends the rules itself.
                syncedRules.current = appData ? JSON.stringify(appRules(files)) : null;
                commit({ ...(projectRef.current ?? project), appData, files });
                setPreviewFiles(files);
              }}
              onRulesChange={applyRules}
              onAskData={(request) => {
                setTab("preview");
                send(request);
              }}
              rulesSync={rulesSync}
              showAppData={showAppData}
              onAddAppData={() => {
                setTab("preview");
                send(
                  "Use Appmaker app data for what this business's customers send and see: write src/data-rules.json as the app data rules describe (for example orders or requests as an inbox, the menu, services or offers as public with seed items from the app's content, reviews as shared), and change the screens to use useCollection from src/appdata.js. Add a screen where customers see what they sent and its status. Keep everything else the same.",
                );
              }}
              busy={generating || checking}
              onAddBookingScreen={() => {
                setTab("preview");
                send(
                  "Add a Book tab to the app's tab bar that shows Appmaker's booking screen (src/booking.js) as that tab's whole screen, as the booking rules describe. Point every Book button (for example a quick action on the home screen) to this tab, and replace any other booking form or booking link with it. Keep everything else the same.",
                );
              }}
            />
          )}
        </main>
      </div>
    </div>
    </div>
  );
}
