"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Code2, Coins, Download, Loader2, MessageSquare, Palette, RotateCw, Rocket, ShieldCheck, Smartphone, Wand2 } from "lucide-react";
import { HistoryMenu } from "./HistoryMenu";
import { DeviceMenu } from "./DeviceMenu";
import { SyncBadge } from "@/components/AccountButton";
import { LIVE_FILE, liveModule } from "@/lib/live";
import { defaultDesign, THEME_FILE, themeModule } from "@/lib/design";
import { BOOKING_FILE, bookingModule } from "@/lib/booking";
import { BRAND_FILE, brandModule } from "@/lib/branding";
import { locked, PLAN_CHANGED, usePlan } from "@/lib/use-plan";
import { DesignPanel } from "./DesignPanel";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { Logo } from "@/components/Logo";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Preview, type PreviewError, type QualityIssue } from "@/components/Preview";
import { qualityFixRequest, reportQuality } from "@/lib/quality";
import { downloadBlob, exportProjectZip, slugify } from "@/lib/export";
import { parseGeneration, type ParsedGeneration } from "@/lib/parse";
import { getProject, saveProject, uid, withVersion } from "@/lib/storage";
import { describeIssues, isAllowedPath, validateApp, type ValidationIssue } from "@/lib/validate";
import { checkClaims, DEFAULT_WORDING, describeClaims } from "@/lib/claims";
import { cleanFiles } from "@/lib/parse";
import { checkRegulatedClaims, describeRegulated } from "@/lib/regulated";
import type { AppDesign, ChatMessage, FileMap, Project } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { CodePanel } from "./CodePanel";
import { AppIcon, PublishPanel } from "./PublishPanel";

type Tab = "preview" | "code" | "publish";

/** Automatic repair passes allowed after each request the user sends. */
const AUTO_FIX_BUDGET = 2;
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
  if (/request failed \(5\d\d\)/i.test(message)) return "Something went wrong on our side. Please try again in a moment.";
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

export function Builder({ id, autoStart }: { id: string; autoStart: boolean }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const cloud = useCloud();
  const [tab, setTab] = useState<Tab>("preview");
  const [mobileView, setMobileView] = useState<"chat" | "app">("chat");
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [generating, setGenerating] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  // Free apps show "Made with Appmaker" in their settings (only when the site takes payments).
  const plan = usePlan();
  const branded = locked(plan);
  const brandedRef = useRef(false);
  useEffect(() => {
    brandedRef.current = branded;
  }, [branded]);
  const [live, setLive] = useState<ParsedGeneration | null>(null);
  const [previewFiles, setPreviewFiles] = useState<FileMap>({});
  /** A new version is being checked (and fixed) before it's shown. */
  const [checking, setChecking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [quality, setQuality] = useState<QualityIssue[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const projectRef = useRef<Project | null>(null);
  const started = useRef(false);
  const fixBudget = useRef(AUTO_FIX_BUDGET);
  const continueBudget = useRef(CONTINUE_BUDGET);
  const runtimeWatchUntil = useRef(0);
  const demoRef = useRef(false);
  const unloading = useRef(false);

  const commit = useCallback((next: Project) => {
    projectRef.current = next;
    setProject(next);
    setSaveFailed(!saveProject(next));
  }, []);

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setQuality(null), [previewFiles, reloadKey]);

  // Debounce hand edits in the code tab into the preview.
  useEffect(() => {
    if (!project || generating) return;
    const t = setTimeout(() => setPreviewFiles(project.files), 600);
    return () => clearTimeout(t);
  }, [project, generating]);

  const send = useCallback(
    async (text: string, opts: { autoFix?: boolean; retry?: boolean } = {}) => {
      const current = projectRef.current;
      if (!current || abortRef.current) return;
      if (!opts.autoFix) {
        fixBudget.current = AUTO_FIX_BUDGET;
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
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: text,
            files: current.files,
            listing: Object.keys(current.files).length ? current.listing : undefined,
            history: current.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
            site: current.source,
            ai: aiChoiceFor(getAiSettings()),
            wording: current.wording ?? DEFAULT_WORDING,
            ...(opts.autoFix ? { auto: true } : {}),
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
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          const now = performance.now();
          if (now - lastParse > 120) {
            lastParse = now;
            const parsed = parseGeneration(raw);
            setLive(parsed);
            if (parsed.writing) setSelectedFile(parsed.writing);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") error = friendlyError((e as Error).message);
        else error = "Stopped. Any finished files were kept — use History to go back if needed.";
      }

      // The page is closing: leave `pending` in place so the request can be
      // offered again when the project is reopened.
      if (unloading.current) return;

      const streamError = /<error>([\s\S]*?)<\/error>/.exec(raw)?.[1];
      // A reply cut off at the model's length limit: the finished files are
      // kept and the rest is written in a follow-up request (below).
      const cutOff = !!streamError && /too large to finish in one pass/i.test(streamError);
      if (streamError) error = friendlyError(streamError);
      const parsed = parseGeneration(raw.replace(/<error>[\s\S]*?<\/error>/, ""));
      const base = projectRef.current ?? withUser;
      // Keep only files that finished streaming, and never accept paths
      // outside App.js / src/ (they could overwrite export config or escape
      // the project folder when the zip is extracted).
      const rejected: ValidationIssue[] = [];
      const complete: FileMap = {};
      for (const [p, code] of Object.entries(parsed.files)) {
        if (p === parsed.writing) continue;
        if (isAllowedPath(p)) complete[p] = code;
        else rejected.push({ file: p, message: "was ignored; only App.js and files under src/ are allowed" });
      }
      const files: FileMap = { ...base.files, ...complete };
      for (const p of parsed.deleted) if (isAllowedPath(p)) delete files[p];
      // Website apps always carry Appmaker's live-content file, whatever the AI wrote.
      if (base.source) files[LIVE_FILE] = liveModule(base.live?.feedUrl ?? null);
      const listing = parsed.listing ? { ...base.listing, ...parsed.listing } : base.listing;
      // Every app carries Appmaker's theme file too, written from the Design settings.
      if (Object.keys(files).length) files[THEME_FILE] = themeModule(base.design ?? defaultDesign(listing));
      // Apps with bookings always carry Appmaker's booking screen, whatever the AI wrote.
      if (base.booking) files[BOOKING_FILE] = bookingModule(base.booking.apiUrl);
      if (Object.keys(files).length) files[BRAND_FILE] = brandModule(brandedRef.current);

      const continuing = cutOff && Object.keys(parsed.files).some((p) => p !== parsed.writing && isAllowedPath(p)) && continueBudget.current > 0 && !demoRef.current;
      if (continuing) error = "";
      const reply = continuing
        ? `${parsed.plan || "Building your app."}\n\nThat was a big one, so I'm writing it in parts. Part done — continuing with the rest…`
        :
        [parsed.summary || (Object.keys(complete).length ? parsed.plan || "Updated your app." : ""), error && `⚠️ ${error}`]
          .filter(Boolean)
          .join("\n\n") || "I couldn't produce an app for that. Try describing it differently.";

      const wrote = Object.keys(complete).length > 0;
      let next: Project = { ...base, name: listing.name || base.name, files, listing, pending: undefined };
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

      const reveal = () => {
        setChecking(false);
        setPreviewFiles(files);
        setReloadKey((k) => k + 1);
        if (Object.keys(files).length) setMobileView("app");
      };

      // The three checks run on every new version before it's shown:
      // 1. quality (code that works in the preview and a real build),
      // 2. claim-safe wording (unless the user chose standard wording),
      // 3. health, medical and financial claims (always).
      // Problems go back to the AI; the app appears once it's clean.
      const wroteFiles = Object.keys(complete).length > 0;
      if (!wroteFiles || error || demoRef.current) return reveal();
      if (!opts.autoFix) reportQuality([Object.keys(current.files).length ? "build:edit" : "build:new"]);
      if (continuing) {
        reportQuality(["cutoff"]);
        continueBudget.current -= 1;
        setChecking(true);
        const missing = validateApp(files).filter((i) => /doesn't exist|is missing/.test(i.message));
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
      const issues = [...rejected, ...validateApp(files)];
      const claims = (next.wording ?? DEFAULT_WORDING) === "claim-safe" ? checkClaims(files, next.listing) : [];
      const regulated = checkRegulatedClaims(files, next.listing);
      reportQuality([
        ...(issues.length ? (["check:code"] as const) : []),
        ...(claims.length ? (["check:claims"] as const) : []),
        ...(regulated.length ? (["check:regulated"] as const) : []),
        ...((issues.length || regulated.length) && fixBudget.current === 0 ? (["unfixed:checks"] as const) : []),
      ]);
      if ((issues.length || claims.length || regulated.length) && fixBudget.current > 0) {
        fixBudget.current -= 1;
        setChecking(true);
        const parts = [
          issues.length && `Automatic quality check found ${issues.length} problem${issues.length === 1 ? "" : "s"}:\n${describeIssues(issues)}`,
          claims.length &&
            `Claim-safe wording is on. Rewrite these phrases as neutral, descriptive text (no superlatives, absolutes, speed promises or unsupported comparisons), in the app and in the listing:\n${describeClaims(claims)}`,
          regulated.length &&
            `Health, medical and financial claims check (always on). Remove or rewrite these so the app only describes tracking and information, and add the disclaimer where asked:\n${describeRegulated(regulated)}`,
        ].filter(Boolean);
        sendRef.current?.(`${parts.join("\n\n")}\n\nFix all of them.`, { autoFix: true });
        return;
      }
      reveal();
      runtimeWatchUntil.current = Date.now() + RUNTIME_WATCH_MS;
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
      send(project.prompt);
    }
  }, [project, autoStart, send]);

  /** Re-runs the last request the user made (not an automatic fix). */
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
      sendRef.current(
        `Automatic quality check: the app crashed in the preview with this error:\n\n${err.message}\n\nFind the root cause and fix it.`,
        { autoFix: true },
      );
    }
  }, []);

  // Problems the preview's quality check finds right after a generation
  // (layout, contrast, text size, overflow, small buttons) go back to the AI
  // too, once; later ones show a banner with Fix with AI.
  const onQualityIssues = useCallback((issues: QualityIssue[]) => {
    setQuality(issues.length ? issues : null);
    const justBuilt = Date.now() < runtimeWatchUntil.current;
    if (justBuilt && !demoRef.current) reportQuality(issues.length ? issues.map((i) => i.kind) : ["screen:clean"]);
    if (!issues.length) return;
    if (justBuilt && fixBudget.current > 0 && !abortRef.current) {
      runtimeWatchUntil.current = 0;
      fixBudget.current -= 1;
      sendRef.current(`Automatic quality check: ${qualityFixRequest(issues)}`, { autoFix: true });
    }
  }, []);

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

  const hasApp = Object.keys(project.files).length > 0;

  // A design change rewrites src/theme.js and shows straight away: no AI, no credits.
  const changeDesign = (design: AppDesign) => {
    const current = projectRef.current ?? project;
    const files = { ...current.files, [THEME_FILE]: themeModule(design) };
    commit({ ...current, design, files, listing: { ...current.listing, primaryColor: design.primary } });
    setPreviewFiles(files);
  };
  const shownFiles = generating && live ? { ...project.files, ...live.files } : project.files;

  const tabs: { key: Tab; label: string; icon: typeof Smartphone }[] = [
    { key: "preview", label: "Preview", icon: Smartphone },
    { key: "code", label: "Code", icon: Code2 },
    { key: "publish", label: "Publish", icon: Rocket },
  ];

  return (
    <div className="flex h-dvh flex-col">
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
        <DeviceMenu
          project={project}
          disabled={!Object.keys(project.files).length || generating || checking}
          onExpoChange={(expo) => commit({ ...(projectRef.current ?? project), expo })}
        />
        <HistoryMenu versions={project.versions ?? []} disabled={generating} onRestore={restore} />
        <button
          onClick={async () => downloadBlob(await exportProjectZip(project), `${slugify(project.listing.name)}-expo.zip`)}
          disabled={!hasApp}
          className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-white/20 disabled:opacity-40 md:flex"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <button
          onClick={() => setTab("publish")}
          disabled={!hasApp}
          aria-label="Publish"
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          <Rocket className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Publish</span>
        </button>
      </header>

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
            live={live}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            hasApp={hasApp}
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
          {tab === "preview" && (
            <div className="relative flex min-h-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_center,#15151f_0%,#07070b_70%)]">
              <div className="flex items-center justify-center gap-2 p-3">
                <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
                  {(["ios", "android"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`rounded-md px-3 py-1 font-medium ${platform === p ? "bg-surface-2 text-foreground" : "text-muted"}`}
                    >
                      {p === "ios" ? "iPhone" : "Android"}
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
                    onClick={() => setDesignOpen((o) => !o)}
                    aria-pressed={designOpen}
                    className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                      designOpen ? "border-violet-400/60 bg-violet-500/15 text-foreground" : "border-line bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    <Palette className="h-3.5 w-3.5" /> Design
                  </button>
                )}
                {generating && hasApp && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> Applying changes…
                  </span>
                )}
              </div>
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
              {quality && !previewError && !generating && !checking && (
                <div role="status" className="mx-4 mb-2 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-amber-100">
                      {quality.some((i) => i.kind === "layout") ? "The layout doesn't fill the screen" : "The quality check found something to improve"}
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-xs text-amber-100/80">
                      {quality.map((i) => (
                        <li key={i.kind}>{i.message}</li>
                      ))}
                    </ul>
                  </div>
                  {!demoMode && (
                    <button
                      onClick={() => send(`Quality check: ${qualityFixRequest(quality)}`)}
                      className="min-h-8 shrink-0 rounded-lg bg-amber-400 px-3 text-xs font-medium text-black hover:bg-amber-300"
                    >
                      Fix with AI
                    </button>
                  )}
                </div>
              )}
              <div className="relative flex min-h-0 flex-1 gap-4 px-4 pb-4">
                <div className="relative min-h-0 min-w-0 flex-1">
                <PhoneFrame platform={platform}>
                  {checking && <ChecksOverlay generating={generating} />}
                  {hasApp || Object.keys(previewFiles).length ? (
                    <Preview files={previewFiles} platform={platform} reloadKey={reloadKey} onError={onPreviewError} onQualityIssues={onQualityIssues} />
                  ) : (
                    <div className="grid h-full place-items-center bg-gradient-to-b from-violet-50 to-pink-50 p-10 text-center text-neutral-500">
                      <div>
                        {generating ? (
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-500" />
                        ) : (
                          <Wand2 className="mx-auto h-8 w-8 text-violet-500" />
                        )}
                        <p className="mt-4 text-sm">{checking ? "Running checks…" : generating ? "Designing your app…" : "Your app will appear here"}</p>
                      </div>
                    </div>
                  )}
                </PhoneFrame>
                </div>
                {designOpen && hasApp && (
                  // Beside the phone on wide screens; a sheet over the lower half on phones.
                  <div className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0">
                    <DesignPanel
                      project={project}
                      busy={generating || checking}
                      onChange={changeDesign}
                      onClose={() => setDesignOpen(false)}
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
  );
}
