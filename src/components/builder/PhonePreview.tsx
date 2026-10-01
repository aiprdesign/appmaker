"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { QrCode } from "@/components/QrCode";
import { checkAvailable, type EasServerInfo, linkToExpo, previewSource, publishForPhone, useExpoSettings } from "@/lib/eas/client";
import type { ExpoState, Project } from "@/lib/types";

const APP_STORE = "https://apps.apple.com/app/expo-go/id982107779";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=host.exp.exponent";

/**
 * Runs the app on the person's own phone: Appmaker publishes it with EAS
 * Update for Expo Go's SDK (the same one the store builds use) and shows a QR
 * code that opens it in Expo Go.
 */
export function PhonePreview({ project, onExpoChange, onClose }: { project: Project; onExpoChange: (expo: ExpoState) => void; onClose: () => void }) {
  const { token } = useExpoSettings();
  const [server, setServer] = useState<EasServerInfo | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const expo = project.expo ?? {};
  const preview = expo.phone;
  const upToDate = !!preview && preview.source === previewSource(project);
  const canPublish = !!server && server.available && !server.off && (server.hosted || !!token);

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    checkAvailable().then(setServer);
    closeButton.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  const publish = async (relink = false) => {
    setError(null);
    try {
      let state = expo;
      // Link once, on whichever account builds run on (the user's own, or the site's).
      // "Set up again" makes a new project, e.g. after the site's Expo account changed.
      if (relink || !state.link || !!state.link.hosted !== !token) {
        setPhase("Setting up your app with Expo…");
        state = { ...state, link: await linkToExpo(token, project) };
        onExpoChange(state);
      }
      setPhase("Publishing your app for Expo Go… this takes about a minute.");
      const phone = await publishForPhone(token, project, state.link!);
      onExpoChange({ ...state, phone });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish the preview. Try again.");
    } finally {
      setPhase(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-preview-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-background text-left shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="phone-preview-title" className="flex items-center gap-2 font-semibold">
            <Smartphone className="h-4 w-4 text-violet-300" /> Try it on your phone
          </h2>
          <button ref={closeButton} onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground/90">
            <li>
              Install the free <span className="font-medium">Expo Go</span> app from the{" "}
              <a href={APP_STORE} target="_blank" rel="noreferrer" className="inline-block py-1 underline underline-offset-2">
                App Store
              </a>{" "}
              or{" "}
              <a href={GOOGLE_PLAY} target="_blank" rel="noreferrer" className="inline-block py-1 underline underline-offset-2">
                Google Play
              </a>
              .
            </li>
            <li>iPhone: scan the code with the Camera app. Android: open Expo Go and tap “Scan QR code”.</li>
          </ol>

          {preview && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-start">
              <QrCode value={preview.url} size={176} label="QR code to open this app in Expo Go" />
              <div className="min-w-0 flex-1 space-y-2 text-xs text-muted">
                {upToDate ? (
                  <p className="flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Up to date with your latest changes.
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 text-amber-200">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> You changed the app since this code was made. Update it to see the changes.
                  </p>
                )}
                <p>Runs the real app on Expo SDK 57, the same version as your App Store and Google Play builds.</p>
                {expo.link && (
                  <p>
                    Expo project:{" "}
                    <a
                      href={`https://expo.dev/accounts/${encodeURIComponent(expo.link.owner)}/projects/${encodeURIComponent(expo.link.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-foreground underline underline-offset-2"
                    >
                      {expo.link.owner}/{expo.link.slug}
                    </a>
                    . Expo Go only opens it when signed in to the <span className="font-medium text-foreground">{expo.link.owner}</span> account or one of
                    its members.{" "}
                    {canPublish && !phase && (
                      <button onClick={() => publish(true)} className="underline underline-offset-2 hover:text-foreground">
                        Set up again
                      </button>
                    )}
                  </p>
                )}
                <a href={preview.url} className="inline-flex min-h-8 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-white/20">
                  On this phone? Open in Expo Go
                </a>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="whitespace-pre-line rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
              {error}
            </p>
          )}

          {!server ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </p>
          ) : !canPublish ? (
            <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
              {server.off || !server.available
                ? "Phone previews aren't available on this site right now. You can still try the app in Expo Snack's emulators."
                : "Connect your Expo account in the Publish tab to make a QR code for your phone."}
            </p>
          ) : phase ? (
            <p role="status" className="flex items-center gap-2 text-sm text-violet-200">
              <Loader2 className="h-4 w-4 animate-spin" /> {phase}
            </p>
          ) : (
            (!preview || !upToDate) && (
              <button
                onClick={() => publish()}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black"
              >
                {preview ? <RefreshCw className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                {preview ? "Update the QR code" : "Make a QR code for my phone"}
              </button>
            )
          )}
          {canPublish && !preview && !phase && <p className="text-center text-[11px] text-muted">Takes about a minute. The app&apos;s code is sent to Expo to run it.</p>}
        </div>
      </div>
    </div>
  );
}
