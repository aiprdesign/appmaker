"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewHtml } from "@/lib/preview";
import type { FileMap } from "@/lib/types";

const PREFIX = (id: string) => `webapp:${id}:`;
const MAX_KEY = 200;
const MAX_VALUE = 200_000;

function readStorage(id: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX(id))) out[k.slice(PREFIX(id).length)] = localStorage.getItem(k) ?? "";
    }
  } catch {}
  return out;
}

/**
 * The customer's app on the web. The app's own code runs in a sandboxed frame (it can't reach this site
 * or anyone's account); this page keeps what it saves and makes it installable to the Home Screen.
 */
const urlKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** This phone's web push subscription for order updates, if the customer turned them on. */
async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  const reg = await navigator.serviceWorker.getRegistration("/owner-sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function WebAppShell({ id, name, files, vapidKey }: { id: string; name: string; files: FileMap; vapidKey: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [install, setInstall] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [hint, setHint] = useState<"" | "ios" | "android">("");
  // The app asked to send order updates: the customer answers here (a tap on this page is what lets the browser ask).
  const [asking, setAsking] = useState<null | { reply: (ok: boolean) => void; needsInstall: boolean }>(null);
  const [askError, setAskError] = useState("");

  const platform = useMemo(() => (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "android" : "ios"), []);

  useEffect(() => {
    const t = setTimeout(() => {
      setHtml(buildPreviewHtml(files, window.location.origin, platform, undefined, { storage: readStorage(id) }));
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(`${PREFIX(id)}__install-dismissed`) === "1";
      } catch {}
      if (!installed() && !dismissed && /iPhone|iPad|iPod/.test(navigator.userAgent)) setHint("ios");
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as unknown as { prompt: () => Promise<void> });
      setHint("android");
    };
    const answer = (msgId: unknown, value: unknown) => frame.current?.contentWindow?.postMessage({ source: "appmaker-host", id: msgId, value }, "*");
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "appmaker-preview") return;
      const msgId = e.data.id;
      if (e.data.type === "push-state") {
        void currentSubscription().then((s) => answer(msgId, !!s), () => answer(msgId, false));
        return;
      }
      if (e.data.type === "push-token") {
        void currentSubscription().then(
          (s) => answer(msgId, s ? "web:" + JSON.stringify({ s: s.toJSON(), u: `/a/${id}` }) : ""),
          () => answer(msgId, ""),
        );
        return;
      }
      if (e.data.type === "push-ask") {
        if (!vapidKey || (!pushSupported() && !/iPhone|iPad|iPod/.test(navigator.userAgent)) || Notification?.permission === "denied") return answer(msgId, false);
        setAskError("");
        setAsking({ reply: (ok) => answer(msgId, ok), needsInstall: !pushSupported() || (/iPhone|iPad|iPod/.test(navigator.userAgent) && !installed()) });
        return;
      }
      if (e.data.type !== "storage") return;
      const key = String(e.data.key ?? "");
      if (!key || key.length > MAX_KEY) return;
      try {
        if (e.data.value === null) localStorage.removeItem(PREFIX(id) + key);
        else if (typeof e.data.value === "string" && e.data.value.length <= MAX_VALUE) localStorage.setItem(PREFIX(id) + key, e.data.value);
      } catch {}
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("message", onMessage);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("message", onMessage);
    };
  }, [id, files, platform, vapidKey]);

  const turnOn = async () => {
    if (!asking) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are off for this app. You can turn them on later in your phone's settings.");
      const reg = await navigator.serviceWorker.register("/owner-sw.js");
      await navigator.serviceWorker.ready;
      if (!(await reg.pushManager.getSubscription())) await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(vapidKey) });
      asking.reply(true);
      setAsking(null);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    }
  };
  const notNow = () => {
    asking?.reply(false);
    setAsking(null);
  };

  const dismiss = () => {
    setHint("");
    try {
      localStorage.setItem(`${PREFIX(id)}__install-dismissed`, "1");
    } catch {}
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white text-black">
      {hint && (
        <div role="region" aria-label={`Install ${name}`} className="flex items-center gap-3 border-b border-black/10 bg-white px-4 py-2 text-sm" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
          <p className="min-w-0 flex-1">
            {hint === "android" ? (
              <>Install {name} on your phone.</>
            ) : (
              <>
                Install {name}: tap <span aria-label="Share">Share</span>, then <strong>Add to Home Screen</strong>.
              </>
            )}
          </p>
          {install && (
            <button onClick={() => void install.prompt().finally(dismiss)} className="min-h-9 rounded-full bg-black px-4 font-medium text-white">
              Install
            </button>
          )}
          <button onClick={dismiss} aria-label="Not now" className="min-h-9 px-2 text-black/60">
            ✕
          </button>
        </div>
      )}
      {asking && (
        <div role="dialog" aria-modal="true" aria-labelledby="updates-title" className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-black shadow-xl" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
            <h2 id="updates-title" className="text-lg font-semibold">
              Get updates on your order?
            </h2>
            {asking.needsInstall ? (
              <p className="mt-1 text-sm text-black/70">
                On iPhone, add {name} to your Home Screen first (Share → <strong>Add to Home Screen</strong>), open it from there, and you&apos;ll be asked again. Your order still shows here live.
              </p>
            ) : (
              <p className="mt-1 text-sm text-black/70">We&apos;ll tell you when it&apos;s being made and when it&apos;s ready, even when the app is closed.</p>
            )}
            {askError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {askError}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={notNow} className="min-h-11 flex-1 rounded-full border border-black/15 font-medium">
                Not now
              </button>
              {!asking.needsInstall && (
                <button onClick={() => void turnOn()} className="min-h-11 flex-1 rounded-full bg-black font-medium text-white">
                  Turn on updates
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {html && <iframe ref={frame} title={name} srcDoc={html} sandbox="allow-scripts allow-modals allow-forms allow-popups" className="w-full flex-1 border-0" />}
    </div>
  );
}
