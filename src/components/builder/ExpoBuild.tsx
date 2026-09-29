"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Apple,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  ExternalLink,
  FileKey2,
  Loader2,
  LogOut,
  RefreshCw,
  Rocket,
  Smartphone,
  Store,
} from "lucide-react";
import type { BuildTarget, CloudBuild, ExpoState, Project } from "@/lib/types";
import { slugify } from "@/lib/expo-project";
import {
  buildPageUrl,
  checkAvailable,
  connectExpo,
  EasRequestError,
  type EasServerInfo,
  fetchBuilds,
  isActive,
  linkToExpo,
  saveExpoSettings,
  startCloudBuild,
  useExpoSettings,
} from "@/lib/eas/client";

interface Props {
  project: Project;
  onExpoChange: (expo: ExpoState) => void;
  /** Downloads the Expo project zip (used for the one-time Apple setup). */
  onDownload: (project: Project) => Promise<void>;
  hasPreviewError: boolean;
}

const NO_EXPO: ExpoState = {};

const TARGETS: { id: BuildTarget; title: string; detail: string; icon: typeof Apple }[] = [
  { id: "ios", title: "iPhone — App Store", detail: "Build for TestFlight and the App Store", icon: Apple },
  { id: "android-apk", title: "Android — test app", detail: "An .apk you can install on your phone", icon: Smartphone },
  { id: "android", title: "Android — Google Play", detail: "An .aab to upload to Play Console", icon: Store },
];

const TARGET_LABEL: Record<BuildTarget, string> = {
  ios: "App Store build",
  android: "Google Play build",
  "android-apk": "Android test app",
};

/** Links inside sentences, with a 24px-tall tap area. */
const inlineLink = "inline-block py-1 text-violet-300 underline underline-offset-2 hover:text-violet-200";

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/60";

function statusText(b: CloudBuild): { label: string; tone: "busy" | "ok" | "bad" | "muted" } {
  switch (b.status) {
    case "NEW":
    case "IN_QUEUE":
      return {
        label: b.queuePosition ? `In queue (#${b.queuePosition}${b.waitSeconds ? `, ~${Math.max(1, Math.round(b.waitSeconds / 60))} min` : ""})` : "In queue",
        tone: "busy",
      };
    case "IN_PROGRESS":
      return { label: "Building…", tone: "busy" };
    case "FINISHED":
      return { label: "Ready", tone: "ok" };
    case "ERRORED":
      return { label: "Failed", tone: "bad" };
    case "CANCELED":
    case "PENDING_CANCEL":
      return { label: "Canceled", tone: "muted" };
    default:
      return { label: b.status.toLowerCase(), tone: "muted" };
  }
}

function submissionText(s: NonNullable<CloudBuild["submission"]>): { label: string; tone: "busy" | "ok" | "bad" } {
  switch (s.status) {
    case "AWAITING_BUILD":
      return { label: "Will upload to App Store Connect when the build finishes", tone: "busy" };
    case "IN_QUEUE":
    case "IN_PROGRESS":
      return { label: "Uploading to App Store Connect…", tone: "busy" };
    case "FINISHED":
      return {
        label: "Uploaded to App Store Connect. It shows up in TestFlight once Apple has processed it (usually 5–30 minutes).",
        tone: "ok",
      };
    default:
      return { label: `Upload to App Store Connect failed${s.error ? `: ${s.error}` : ""}`, tone: "bad" };
  }
}

function CopyLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-[#0b0b10] px-3 py-2 text-left font-mono text-xs text-[#d8d6e6] hover:border-white/20"
      aria-label={`Copy command: ${cmd}`}
    >
      <span className="break-all">$ {cmd}</span>
      <span className="shrink-0 text-[11px] text-muted">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative pl-9">
      <span
        className={`absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
          done ? "bg-emerald-500/20 text-emerald-300" : "bg-surface-2 text-foreground/80"
        }`}
        aria-hidden="true"
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2">{children}</div>
    </li>
  );
}

export function ExpoBuild({ project, onExpoChange, onDownload, hasPreviewError }: Props) {
  const settings = useExpoSettings();
  const expo = project.expo ?? NO_EXPO;
  const [server, setServer] = useState<EasServerInfo | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [target, setTarget] = useState<BuildTarget>("ios");
  const [submit, setSubmit] = useState(true);
  const [phase, setPhase] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ message: string; code?: string } | null>(null);
  const [appleOpen, setAppleOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const expoRef = useRef(expo);
  useEffect(() => {
    expoRef.current = expo;
  }, [expo]);

  useEffect(() => {
    checkAvailable().then(setServer);
  }, []);

  const available = server?.available ?? null;
  /** The user's own Expo token; without one, hosted servers use the site's account. */
  const token = settings.token;
  const hosted = !token && !!server?.hosted;
  const canUseExpo = !!token || hosted;
  const builds = expo.builds ?? [];
  const ascKey = settings.ascKey;
  const teamKey = !!ascKey?.p8 && !!ascKey.keyId && !!ascKey.issuerId;
  const canUpload = !!expo.ascAppId && !!ascKey?.p8 && !!ascKey.keyId;
  const signing = settings.appleSigning && settings.appleSigning.issuerId === ascKey?.issuerId ? settings.appleSigning : undefined;
  const hasCode = Object.keys(project.files).length > 0;

  const connect = async () => {
    const t = tokenDraft.trim();
    if (!t) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const who = await connectExpo(t);
      saveExpoSettings({ ...settings, token: t, accountName: who.name });
      setTokenDraft("");
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Couldn't connect to Expo.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    saveExpoSettings({ ...settings, token: undefined, accountName: undefined });
  };

  const mergeBuilds = useCallback(
    (updates: CloudBuild[]) => {
      const current = expoRef.current;
      const byId = new Map((current.builds ?? []).map((b) => [b.id, b]));
      for (const u of updates) byId.set(u.id, { ...byId.get(u.id), ...u });
      const list = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      onExpoChange({ ...current, builds: list });
    },
    [onExpoChange],
  );

  const refresh = useCallback(async () => {
    const ids = (expoRef.current.builds ?? []).filter(isActive).map((b) => b.id);
    if (!canUseExpo || !ids.length) return;
    setRefreshing(true);
    try {
      mergeBuilds(await fetchBuilds(token, ids));
    } catch {
      // Keep the last known status; the next poll tries again.
    } finally {
      setRefreshing(false);
    }
  }, [token, canUseExpo, mergeBuilds]);

  const activeCount = builds.filter(isActive).length;
  useEffect(() => {
    if (!canUseExpo || !activeCount) return;
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [canUseExpo, activeCount, refresh]);

  /** Links the app to Expo once, on whichever account builds run on now. */
  const ensureLink = async () => {
    const current = expoRef.current.link;
    if (current && !!current.hosted === hosted) return current;
    setPhase(hosted ? "Setting up your app for building…" : "Creating the app on your Expo account…");
    const link = await linkToExpo(token, project);
    onExpoChange({ ...expoRef.current, link });
    expoRef.current = { ...expoRef.current, link };
    return link;
  };

  const build = async () => {
    if (!canUseExpo) return;
    setBuildError(null);
    try {
      const link = await ensureLink();
      setPhase(
        target === "ios" && teamKey
          ? "Preparing Apple signing and sending your app to Expo… this takes a minute or two."
          : "Sending your app to Expo… this takes a minute or two.",
      );
      const result = await startCloudBuild({
        token,
        project,
        link,
        target,
        submit: target === "ios" && submit && canUpload,
        ascAppId: expo.ascAppId,
        ascKey,
        signing,
      });
      // Keep the certificate Appmaker made: Apple allows only a few per team.
      if (result.signing) saveExpoSettings({ ...settings, appleSigning: result.signing });
      mergeBuilds(result.builds);
    } catch (e) {
      if (e instanceof EasRequestError && e.signing) saveExpoSettings({ ...settings, appleSigning: e.signing });
      const err = e instanceof EasRequestError ? { message: e.message, code: e.code } : { message: "The build couldn't start." };
      setBuildError(err);
      if (err.code === "ios-credentials" || err.code === "apple") setAppleOpen(true);
    } finally {
      setPhase(null);
    }
  };

  const downloadForSetup = async () => {
    setBuildError(null);
    try {
      if (token) await ensureLink();
      await onDownload({ ...project, expo: expoRef.current });
    } catch (e) {
      setBuildError({ message: e instanceof Error ? e.message : "Couldn't prepare the project." });
    } finally {
      setPhase(null);
    }
  };

  const readKeyFile = async (file: File | undefined) => {
    setKeyError(null);
    if (!file) return;
    const text = (await file.text()).trim();
    if (!/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/.test(text)) {
      setKeyError("That isn't an App Store Connect key. Choose the AuthKey_XXXXXXXXXX.p8 file.");
      return;
    }
    const fromName = /AuthKey_([A-Z0-9]+)\.p8$/.exec(file.name)?.[1];
    saveExpoSettings({
      ...settings,
      ascKey: { keyId: settings.ascKey?.keyId || fromName || "", issuerId: settings.ascKey?.issuerId ?? "", p8: text, fileName: file.name },
    });
  };

  const setKeyField = (field: "keyId" | "issuerId", value: string) =>
    saveExpoSettings({ ...settings, ascKey: { keyId: "", issuerId: "", p8: "", ...settings.ascKey, [field]: value.trim() } });

  const slug = slugify(project.listing.name);
  const busy = phase != null;
  const blockers = [
    !hasCode && "Generate the app first.",
    !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(project.listing.bundleId) && "Set a valid bundle ID in the store listing.",
    /^com\.appmaker\./.test(project.listing.bundleId) && "Change the bundle ID to your own (e.g. com.yourname.app) — it can't be changed after the first store build.",
    target === "ios" && hosted && !teamKey && "Add your App Store Connect API key in Apple setup — Appmaker uses it to sign the app.",
  ].filter(Boolean) as string[];

  const tokenForm = (
    <div className="space-y-2">
      <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted">
        <li>
          Sign in (or sign up free) at{" "}
          <a href="https://expo.dev/login" target="_blank" rel="noreferrer" className={inlineLink}>
            expo.dev
          </a>
          .
        </li>
        <li>Click your account name or picture, then open the account&apos;s Settings.</li>
        <li>
          Choose <strong className="text-foreground/90">Access tokens</strong> → Create token, name it “Appmaker” and copy it. The address
          is <code className="font-mono text-foreground/90">expo.dev/accounts/your-username/settings/access-tokens</code>.
        </li>
        <li>
          Paste it here — it stays in this browser.{" "}
          <a href="https://docs.expo.dev/accounts/programmatic-access/" target="_blank" rel="noreferrer" className={inlineLink}>
            Expo&apos;s guide
          </a>
        </li>
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          className={input}
          placeholder="Expo access token"
          aria-label="Expo access token"
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={!tokenDraft.trim() || connecting}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
        >
          {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Connect
        </button>
      </form>
      {connectError && (
        <p role="alert" className="text-xs text-rose-300">
          {connectError}
        </p>
      )}
    </div>
  );

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="expo-build-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="expo-build-title" className="flex items-center gap-2 font-semibold">
            <Rocket className="h-4 w-4 text-violet-400" /> Build &amp; upload with Expo
          </h2>
          <p className="mt-1 text-xs text-muted">
            {server?.hosted
              ? "Appmaker builds the real iPhone and Android apps on Expo's servers — no Mac, Xcode or Expo account needed."
              : "Expo builds the real iPhone and Android apps on its servers — no Mac or Xcode needed. The free Expo plan includes a limited number of builds each month."}
          </p>
        </div>
      </div>

      {server?.off && (
        <div role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
          Cloud builds are turned off on this site. Use “Build it yourself” below to build from the downloaded project.
        </div>
      )}
      {available === false && !server?.off && (
        <div role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
          Cloud builds aren&apos;t enabled on this server (the EAS CLI isn&apos;t installed). Run Appmaker on a server such as Railway
          with <code className="font-mono">npm install</code>, or use “Build it yourself” below.
        </div>
      )}

      <ol className="mt-5 space-y-6">
        {token ? (
          <Step n={1} title="Connect your Expo account" done>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-foreground/90">
                Connected as <strong>{settings.accountName ?? "your Expo account"}</strong>
              </span>
              <button onClick={disconnect} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" /> {server?.hosted ? "Use Appmaker's builds instead" : "Disconnect"}
              </button>
            </div>
          </Step>
        ) : hosted ? (
          <Step n={1} title="Expo builds are included" done>
            <p className="text-xs text-muted">Builds run on Appmaker&apos;s Expo account — you don&apos;t need one.</p>
            <details className="mt-2 text-xs">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-muted hover:text-foreground">
                Use my own Expo account instead (optional)
              </summary>
              <div className="mt-2">{tokenForm}</div>
            </details>
          </Step>
        ) : (
          <Step n={1} title="Connect your Expo account">
            {tokenForm}
          </Step>
        )}

        <Step n={2} title="Choose what to build">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Build type">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={target === t.id}
                onClick={() => setTarget(t.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  target === t.id ? "border-violet-500/70 bg-violet-500/10" : "border-line hover:border-white/20"
                }`}
              >
                <t.icon className="h-4 w-4" />
                <div className="mt-2 text-sm font-medium">{t.title}</div>
                <div className="mt-0.5 text-[11px] text-muted">{t.detail}</div>
              </button>
            ))}
          </div>

          {target === "ios" && (
            <div className="mt-4 rounded-xl border border-line">
              <button
                onClick={() => setAppleOpen((o) => !o)}
                aria-expanded={appleOpen}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm"
              >
                <span className="flex items-center gap-2">
                  <Apple className="h-4 w-4" /> Apple setup
                  <span className="text-xs text-muted">
                    {teamKey ? (canUpload ? "· ready, uploads on" : "· ready") : hosted ? "· needed for iPhone builds" : "· needed once"}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted transition ${appleOpen ? "rotate-180" : ""}`} />
              </button>
              {appleOpen && (
                <ol className="space-y-4 border-t border-line p-3 text-xs text-muted">
                  <li>
                    <div className="font-medium text-foreground/90">a. Apple Developer Program</div>
                    You need a paid membership ($99/year) —{" "}
                    <a href="https://developer.apple.com/programs/enroll/" target="_blank" rel="noreferrer" className={inlineLink}>
                      enroll here
                    </a>
                    . Approval can take a day or two.
                  </li>
                  <li>
                    <div className="font-medium text-foreground/90">
                      b. App Store Connect API key {hosted ? "(required)" : "(recommended)"}
                    </div>
                    <p>
                      Appmaker uses it to create your app&apos;s signing certificate and provisioning profile and to upload builds — no
                      Apple sign-in or command line needed. In{" "}
                      <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noreferrer" className={inlineLink}>
                        App Store Connect → Users and Access → Integrations
                      </a>
                      , create a <strong className="text-foreground/90">Team key</strong> with <strong className="text-foreground/90">Admin</strong>{" "}
                      access and download the .p8 file (Apple lets you download it once). The Issuer ID is shown above the list of keys. The key
                      stays in this browser and works for all your apps.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-foreground/90">Key ID</span>
                        <input
                          className={`${input} font-mono`}
                          placeholder="2X9R4HXF34"
                          value={ascKey?.keyId ?? ""}
                          onChange={(e) => setKeyField("keyId", e.target.value.toUpperCase())}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-foreground/90">Issuer ID</span>
                        <input
                          className={`${input} font-mono`}
                          placeholder="57246542-96fe-1a63-e053-0824d011072a"
                          value={ascKey?.issuerId ?? ""}
                          onChange={(e) => setKeyField("issuerId", e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-foreground hover:border-white/20">
                      <FileKey2 className="h-3.5 w-3.5" />
                      {ascKey?.p8 ? `Key file: ${ascKey.fileName ?? "added"} — replace` : "Choose .p8 key file"}
                      <input type="file" accept=".p8" className="sr-only" onChange={(e) => readKeyFile(e.target.files?.[0])} />
                    </label>
                    {keyError && (
                      <p role="alert" className="mt-1 text-rose-300">
                        {keyError}
                      </p>
                    )}
                    {signing && (
                      <p className="mt-2 flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Signing certificate created by Appmaker
                        {signing.expires ? ` · valid until ${new Date(signing.expires).toLocaleDateString()}` : ""}
                      </p>
                    )}
                  </li>
                  <li>
                    <div className="font-medium text-foreground/90">c. Automatic upload to App Store Connect (optional)</div>
                    <p>
                      In{" "}
                      <a href="https://appstoreconnect.apple.com/apps" target="_blank" rel="noreferrer" className={inlineLink}>
                        App Store Connect
                      </a>{" "}
                      create the app (Apps → + → New App) with bundle ID{" "}
                      <code className="font-mono text-foreground/90">{project.listing.bundleId}</code>, then copy its Apple ID from App
                      Information.{teamKey ? "" : " Your first build registers the bundle ID, so it appears in the list."}
                    </p>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-foreground/90">App Store Connect Apple ID</span>
                      <input
                        className={`${input} font-mono`}
                        inputMode="numeric"
                        placeholder="6741234567"
                        value={expo.ascAppId ?? ""}
                        onChange={(e) => onExpoChange({ ...expo, ascAppId: e.target.value.replace(/\D/g, "") || undefined })}
                      />
                    </label>
                  </li>
                  {!hosted && !teamKey && (
                    <li>
                      <details>
                        <summary className="inline-flex min-h-8 cursor-pointer items-center font-medium text-foreground/90">
                          No API key? Set up signing from the command line instead
                        </summary>
                        <p className="mt-1">
                          On any computer with Node.js (Windows is fine), download the project, unzip it and run this in its folder. Sign in
                          to Expo and Apple when asked and accept the defaults.
                        </p>
                        <div className="mt-2 space-y-2">
                          <button
                            onClick={downloadForSetup}
                            disabled={busy || !hasCode}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-foreground hover:border-white/20 disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" /> Download project{token && !expo.link ? " (links it to Expo)" : ""}
                          </button>
                          <CopyLine
                            cmd={`cd ${slug} && npm install && npx eas-cli@latest credentials:configure-build --platform ios --profile production`}
                          />
                        </div>
                      </details>
                    </li>
                  )}
                </ol>
              )}
            </div>
          )}

          {target === "ios" && (
            <label className={`mt-3 flex items-center gap-2.5 text-xs ${canUpload ? "text-foreground/90" : "text-muted"}`}>
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-violet-500"
                checked={submit && canUpload}
                disabled={!canUpload}
                onChange={(e) => setSubmit(e.target.checked)}
              />
              <span>
                Upload to App Store Connect when the build finishes (for TestFlight and App Store review)
                {!canUpload && <span className="block text-[11px]">Add the Apple ID and API key in Apple setup to turn this on.</span>}
              </span>
            </label>
          )}
          {target === "android" && (
            <p className="mt-3 text-xs text-muted">
              Google requires the first upload of a new app to be done by hand in Play Console. Download the .aab when it&apos;s ready
              and upload it there.
            </p>
          )}
        </Step>

        <Step n={3} title="Build">
          {blockers.length > 0 && (
            <ul className="mb-3 space-y-1 text-xs text-amber-200/90">
              {blockers.map((b) => (
                <li key={b} className="flex gap-1.5">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          )}
          {hasPreviewError && <p className="mb-3 text-xs text-amber-200/90">The preview shows an error — fix it first so the build doesn&apos;t crash.</p>}
          <button
            onClick={build}
            disabled={!canUseExpo || busy || blockers.length > 0 || available === false}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {target === "ios" ? (submit && canUpload ? "Build & upload to App Store Connect" : "Build for iPhone") : target === "android" ? "Build for Google Play" : "Build Android test app"}
          </button>
          {!canUseExpo && available !== false && <p className="mt-2 text-xs text-muted">Connect Expo to start a build.</p>}
          {phase && (
            <p role="status" className="mt-2 text-xs text-muted">
              {phase}
            </p>
          )}
          {buildError && (
            <div role="alert" className="mt-3 whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
              {buildError.message}
              {buildError.code === "auth" && (
                <button onClick={disconnect} className="mt-2 block underline underline-offset-2">
                  Connect a new token
                </button>
              )}
            </div>
          )}
        </Step>
      </ol>

      {builds.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Builds</h3>
            {activeCount > 0 && token && (
              <button onClick={refresh} disabled={refreshing} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:text-foreground">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-3" aria-label="Builds">
            {builds.map((b) => {
              const s = statusText(b);
              const sub = b.submission && submissionText(b.submission);
              return (
                <li key={b.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{TARGET_LABEL[b.target]}</div>
                      <div className="text-[11px] text-muted">
                        {new Date(b.createdAt).toLocaleString()}
                        {b.appVersion && ` · v${b.appVersion}${b.buildNumber ? ` (${b.buildNumber})` : ""}`}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        s.tone === "ok"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : s.tone === "bad"
                            ? "bg-rose-500/15 text-rose-300"
                            : s.tone === "busy"
                              ? "bg-violet-500/15 text-violet-200"
                              : "bg-surface-2 text-muted"
                      }`}
                    >
                      {s.tone === "busy" && <Loader2 className="h-3 w-3 animate-spin" />}
                      {s.label}
                    </span>
                  </div>
                  {b.error && <p className="mt-2 text-xs text-rose-300">{b.error}</p>}
                  {sub && (
                    <p className={`mt-2 text-xs ${sub.tone === "ok" ? "text-emerald-300" : sub.tone === "bad" ? "text-rose-300" : "text-muted"}`}>{sub.label}</p>
                  )}
                  {b.status === "FINISHED" && b.target === "android-apk" && (
                    <p className="mt-2 text-xs text-muted">
                      {expo.link?.hosted
                        ? "Open the download link on your Android phone to install it (allow installs from your browser when asked)."
                        : "Open the Expo page on your Android phone to install it — it shows a QR code and install link."}
                    </p>
                  )}
                  {b.status === "FINISHED" && b.target === "ios" && !b.submission && (
                    <p className="mt-2 text-xs text-muted">
                      To send it to Apple, turn on automatic upload (Apple setup, step c) and build again — or upload the .ipa with
                      Apple&apos;s Transporter app on a Mac.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.status === "FINISHED" && b.artifactUrl && (
                      <a
                        href={b.artifactUrl}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black"
                      >
                        <Download className="h-3.5 w-3.5" /> Download {b.target === "ios" ? ".ipa" : b.target === "android" ? ".aab" : ".apk"}
                      </a>
                    )}
                    {expo.link && !expo.link.hosted && (
                      <a
                        href={buildPageUrl(expo.link, b.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-muted hover:border-white/20 hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View on expo.dev
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {builds.some((b) => b.submission?.status === "FINISHED") && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100/90">
              <div className="font-medium">Last steps in App Store Connect</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Add screenshots and paste the description, keywords and URLs from this page.</li>
                <li>Fill in App Privacy and the age rating.</li>
                <li>Pick this build under “Build” and press “Add for Review”. Apple usually replies in 1–3 days.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
