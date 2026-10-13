"use client";

import { useRef, useState } from "react";
import { BellRing, Check, CheckCircle2, ExternalLink, FileJson, KeyRound, Loader2 } from "lucide-react";
import { AndroidPushError, androidPackage, parseGoogleServices, parseServiceAccount } from "@/lib/android-push";
import { setAndroidPushKey, useExpoSettings } from "@/lib/eas/client";
import type { Project } from "@/lib/types";

/**
 * Android notifications in one place: the Firebase steps the owner does (Google
 * doesn't let anyone else create a Firebase project for them), and the two
 * files Appmaker needs: google-services.json goes into the app, the key goes
 * straight to Expo (never kept by Appmaker).
 */
export function AndroidPush({ project, onChange }: { project: Project; onChange: (push: Project["androidPush"]) => void }) {
  const expo = useExpoSettings();
  const [busy, setBusy] = useState<"" | "key">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const servicesInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const pkg = androidPackage(project.listing.bundleId);
  const push = project.androidPush;
  const linked = !!project.expo?.link;
  const ready = !!push?.googleServices && !!push.keySetAt;

  const read = (file: File | undefined) =>
    new Promise<string>((resolve, reject) => {
      if (!file) return reject(new AndroidPushError("Choose a file."));
      if (file.size > 100_000) return reject(new AndroidPushError("That file is too large."));
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new AndroidPushError("Couldn't read that file."));
      r.readAsText(file);
    });

  const addServices = async (file: File | undefined) => {
    setError("");
    setNote("");
    try {
      const g = parseGoogleServices(await read(file), pkg);
      // A different Firebase project means the earlier key no longer matches.
      onChange({ googleServices: g.json, firebaseProject: g.firebaseProject, ...(push?.firebaseProject === g.firebaseProject && push.keySetAt ? { keySetAt: push.keySetAt } : {}) });
      setNote(`google-services.json added (Firebase project "${g.firebaseProject}").`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (servicesInput.current) servicesInput.current.value = "";
    }
  };

  const addKey = async (file: File | undefined) => {
    setError("");
    setNote("");
    setBusy("key");
    try {
      const text = await read(file);
      parseServiceAccount(text, push?.firebaseProject); // clear errors before anything is sent
      await setAndroidPushKey(expo.token, project, text);
      onChange({ ...push!, keySetAt: Date.now() });
      setNote("Expo has the key. Build the Android app again to turn notifications on.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
      if (keyInput.current) keyInput.current.value = "";
    }
  };

  return (
    <section aria-labelledby="android-push-title" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
          <BellRing className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="android-push-title" className="font-semibold">
            Android notifications{" "}
            {ready && <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Set up</span>}
          </h3>
          <p className="text-sm text-muted">
            This app sends notifications (order updates, alerts for staff). On iPhone they work with your Expo build; on Android, Google needs the app registered in Firebase (free, about 10 minutes, once).
          </p>
        </div>
      </div>

      {!linked ? (
        <p className="rounded-xl border border-line bg-background/50 p-3 text-sm text-muted">Build the Android app once with Expo first (the Build step above), then come back here.</p>
      ) : (
        <ol className="space-y-3 text-sm">
          <li className="rounded-xl border border-line bg-background/50 p-3">
            <p className="font-medium">1. Create a Firebase project and add the Android app</p>
            <p className="mt-1 text-muted">
              Open the Firebase console, create a project (Google Analytics isn&apos;t needed), then <strong className="text-foreground">Add app → Android</strong> with this exact package name:
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-white/10 px-2 py-1 font-mono text-xs">{pkg}</code>
              <button onClick={() => void navigator.clipboard?.writeText(pkg).then(() => setNote("Package name copied."))} className="min-h-8 rounded-lg border border-line px-2 text-xs hover:border-white/20">
                Copy
              </button>
              <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs hover:border-white/20">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open Firebase<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </li>
          <li className="rounded-xl border border-line bg-background/50 p-3">
            <p className="flex items-center gap-1.5 font-medium">
              2. Add google-services.json {push?.googleServices && <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-label="Added" />}
            </p>
            <p className="mt-1 text-muted">Firebase offers it while adding the app (or in Project settings → Your apps). It goes inside the app; it isn&apos;t secret.</p>
            <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 hover:border-white/20">
              <FileJson className="h-4 w-4" aria-hidden /> {push?.googleServices ? "Replace google-services.json" : "Choose google-services.json"}
              <input ref={servicesInput} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void addServices(e.target.files?.[0])} />
            </label>
          </li>
          <li className="rounded-xl border border-line bg-background/50 p-3">
            <p className="flex items-center gap-1.5 font-medium">
              3. Give Expo the key that sends notifications {push?.keySetAt && <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-label="Done" />}
            </p>
            <p className="mt-1 text-muted">
              In Firebase: <strong className="text-foreground">Project settings → Service accounts → Generate new private key</strong>. Choose the file here: Appmaker sends it straight to Expo and doesn&apos;t keep it. Keep the file somewhere safe, or delete it after.
            </p>
            <label className={`mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-medium ${push?.googleServices && !busy ? "cursor-pointer bg-white text-black" : "cursor-not-allowed bg-white/40 text-black/60"}`}>
              {busy === "key" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
              {push?.keySetAt ? "Send a new key" : "Choose the key file"}
              <input ref={keyInput} type="file" accept="application/json,.json" disabled={!push?.googleServices || !!busy} className="sr-only" onChange={(e) => void addKey(e.target.files?.[0])} />
            </label>
            {!push?.googleServices && <p className="mt-1 text-xs text-muted">Add google-services.json first.</p>}
          </li>
          <li className="rounded-xl border border-line bg-background/50 p-3">
            <p className="font-medium">4. Build the Android app again</p>
            <p className="mt-1 text-muted">Notifications work from the next build. Already-installed copies need the update.</p>
          </li>
        </ol>
      )}
      {note && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-300">
          <Check className="h-4 w-4" aria-hidden /> {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-200">
          {error}
        </p>
      )}
    </section>
  );
}
