"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, MessageSquare, Printer, RefreshCw, Trash2 } from "lucide-react";
import { QrCode } from "@/components/QrCode";
import { renderIcon } from "@/lib/export";
import type { Project } from "@/lib/types";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * The second way to install the app: a web link customers open and add to their Home Screen
 * (iPhone and Android), ready today while the store versions are being reviewed.
 */
export function WebApp({ project, gate = (_what, run) => void run() }: { project: Project; gate?: (what: string, run: () => void | Promise<void>) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "publish" | "remove">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "link" | "message">("");

  useEffect(() => {
    let live = true;
    fetch(`/api/webapp?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setUrl(d.url ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [project.id]);

  const publish = () => gate("Publish", publishNow);
  const publishNow = async () => {
    setBusy("publish");
    setError("");
    try {
      const icon = await toDataUrl(await renderIcon(project.listing, 512, project.icon)).catch(() => undefined);
      const res = await fetch("/api/webapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id, name: project.listing.name, color: project.listing.primaryColor, icon, files: project.files }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't publish. Try again.");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError("");
    try {
      const res = await fetch(`/api/webapp?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE", headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't take it down. Try again.");
      setUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const name = project.listing.name || "our";
  /** Ready to paste into WhatsApp, SMS, email or social posts. */
  const message = url
    ? `Get the ${name} app on your phone (free, no app store needed):\n${url}\n\niPhone: open it in Safari, tap Share, then "Add to Home Screen".\nAndroid: open it in Chrome and tap Install.\n\nAfter you order, tap "Turn on updates" to hear when it's ready.`
    : "";
  const copy = async (what: "link" | "message") => {
    if (!url) return;
    await navigator.clipboard?.writeText(what === "link" ? url : message).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="webapp-title">
      <h2 id="webapp-title" className="flex items-center gap-2 font-semibold">
        <Globe className="h-4 w-4 text-violet-300" aria-hidden /> Web app: install from the browser
      </h2>
      <p className="mt-1 text-xs text-muted">
        A second way to get your app, ready today: customers open the link and add it to their Home Screen on iPhone or Android. The store versions can follow.
      </p>
      {url ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <QrCode value={url} size={120} label={`QR code for ${url}`} />
            <div className="min-w-0 flex-1 space-y-2">
              <a href={url} target="_blank" rel="noreferrer" className="block break-all text-sm font-medium text-violet-300 underline underline-offset-2">
                {url}
              </a>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void copy("link")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm">
                  {copied === "link" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied === "link" ? "Copied" : "Copy link"}
                </button>
                <button onClick={() => void copy("message")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm">
                  {copied === "message" ? <Check className="h-4 w-4" aria-hidden /> : <MessageSquare className="h-4 w-4" aria-hidden />}{" "}
                  {copied === "message" ? "Copied" : "Copy message for customers"}
                </button>
                <a href={`${url}/install`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm">
                  <Printer className="h-4 w-4" aria-hidden /> Poster for your counter
                </a>
              </div>
            </div>
          </div>
          <details className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">How your customers install it</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">iPhone & iPad (Safari)</h3>
                <ol className="list-decimal space-y-1 pl-5 text-muted">
                  <li>Scan the QR code or tap your link.</li>
                  <li>
                    Tap <strong className="text-foreground">Share</strong> (the square with an arrow).
                  </li>
                  <li>
                    Tap <strong className="text-foreground">Add to Home Screen</strong>, then <strong className="text-foreground">Add</strong>.
                  </li>
                </ol>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Android (Chrome)</h3>
                <ol className="list-decimal space-y-1 pl-5 text-muted">
                  <li>Scan the QR code or tap your link.</li>
                  <li>
                    Tap <strong className="text-foreground">Install</strong> at the top of the app.
                  </li>
                  <li>
                    No button? Menu <strong className="text-foreground">⋮</strong> → <strong className="text-foreground">Install app</strong>.
                  </li>
                </ol>
              </div>
            </div>
            <p className="mt-3 text-muted">
              <strong className="text-foreground">Order updates:</strong> right after their first order, the app asks “Get updates on your order?”. On iPhone this works once the app is on the Home
              Screen (iOS 16.4 or later); on Android in Chrome straight away.
            </p>
            <p className="mt-3 text-xs text-muted">Tips: put the poster by the till, add the link to your website and Google profile, and send the message to regular customers. The app also shows these steps the first time someone opens it.</p>
          </details>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void publish()} disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white disabled:opacity-50">
              {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Update with the latest version
            </button>
            <button onClick={() => void remove()} disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm disabled:opacity-50">
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Take down
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => void publish()} disabled={!!busy} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />} Publish web app
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          {error}
        </p>
      )}
    </section>
  );
}
