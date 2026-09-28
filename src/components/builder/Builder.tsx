"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Code2, Download, Loader2, MessageSquare, RotateCw, Rocket, ShieldCheck, Smartphone, Wand2 } from "lucide-react";
import { HistoryMenu } from "./HistoryMenu";
import { SyncBadge } from "@/components/AccountButton";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { Logo } from "@/components/Logo";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Preview, type PreviewError } from "@/components/Preview";
import { downloadBlob, exportProjectZip, slugify } from "@/lib/export";
import { parseGeneration, type ParsedGeneration } from "@/lib/parse";
import { getProject, saveProject, uid, withVersion } from "@/lib/storage";
import { describeIssues, isAllowedPath, validateApp, type ValidationIssue } from "@/lib/validate";
import { checkClaims, DEFAULT_WORDING, describeClaims } from "@/lib/claims";
import { checkRegulatedClaims, describeRegulated } from "@/lib/regulated";
import type { ChatMessage, FileMap, Project } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { CodePanel } from "./CodePanel";
import { AppIcon, PublishPanel } from "./PublishPanel";

type Tab = "preview" | "code" | "publish";

/** Automatic repair passes allowed after each request the user sends. */
const AUTO_FIX_BUDGET = 2;
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
  const [live, setLive] = useState<ParsedGeneration | null>(null);
  const [previewFiles, setPreviewFiles] = useState<FileMap>({});
  /** A new version is being checked (and fixed) before it's shown. */
  const [checking, setChecking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const projectRef = useRef<Project | null>(null);
  const started = useRef(false);
  const fixBudget = useRef(AUTO_FIX_BUDGET);
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
      const p = getProject(id);
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
      if (!opts.autoFix) fixBudget.current = AUTO_FIX_BUDGET;
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
      const listing = parsed.listing ? { ...base.listing, ...parsed.listing } : base.listing;

      const reply =
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
      const issues = [...rejected, ...validateApp(files)];
      const claims = (next.wording ?? DEFAULT_WORDING) === "claim-safe" ? checkClaims(files, next.listing) : [];
      const regulated = checkRegulatedClaims(files, next.listing);
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
      const restored = withVersion({ ...p, files: v.files, listing: v.listing, name: v.listing.name || p.name }, `Restored the version from ${when}`);
      const note: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `↩️ Restored the version from ${when} (“${v.label.slice(0, 60)}”). Your previous version is still in **History**.`,
        createdAt: Date.now(),
        versionId: restored.versionId,
      };
      commit({ ...restored.project, messages: [...p.messages, note] });
      setPreviewFiles(v.files);
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
  const shownFiles = generating && live ? { ...project.files, ...live.files } : project.files;

  const tabs: { key: Tab; label: string; icon: typeof Smartphone }[] = [
    { key: "preview", label: "Preview", icon: Smartphone },
    { key: "code", label: "Code", icon: Code2 },
    { key: "publish", label: "Publish", icon: Rocket },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3">
        <Logo href="/projects" />
        <span className="hidden text-line sm:inline">/</span>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <AppIcon listing={project.listing} size={22} />
          <span className="truncate text-sm font-medium">{project.name}</span>
          {demoMode && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300" title="Set ANTHROPIC_API_KEY to enable AI generation">
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
              className={`flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${
                tab === t.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        <SyncBadge />
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
          className={`${mobileView === "chat" ? "flex" : "hidden"} w-full flex-col border-line lg:flex lg:w-[400px] lg:shrink-0 lg:border-r`}
        >
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
              <div className="relative min-h-0 flex-1 px-4 pb-4">
                <PhoneFrame platform={platform}>
                  {checking && <ChecksOverlay generating={generating} />}
                  {hasApp || Object.keys(previewFiles).length ? (
                    <Preview files={previewFiles} platform={platform} reloadKey={reloadKey} onError={onPreviewError} />
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
            />
          )}
        </main>
      </div>
    </div>
  );
}
