"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewHtml } from "@/lib/preview";
import { UpdatesSheet } from "./UpdatesSheet";
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

export function WebAppShell({ id, name, files, vapidKey, hasIcon, color }: { id: string; name: string; files: FileMap; vapidKey: string; hasIcon: boolean; color: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [install, setInstall] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [hint, setHint] = useState<"" | "ios" | "android">("");
  // The app asked to send order updates: the customer answers here (a tap on this page is what lets the browser ask).
  const [asking, setAsking] = useState<null | { reply: (ok: boolean) => void; needsInstall: boolean }>(null);
  const [askError, setAskError] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [toast, setToast] = useState("");

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
    setAskBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          /iPhone|iPad|iPod/.test(navigator.userAgent)
            ? `Notifications are blocked for ${name}. To turn them on: Settings → Notifications → ${name}.`
            : "Notifications are blocked for this app. Tap the icon left of the address bar → Permissions → Notifications → Allow.",
        );
      }
      const reg = await navigator.serviceWorker.register("/owner-sw.js");
      await navigator.serviceWorker.ready;
      if (!(await reg.pushManager.getSubscription())) await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(vapidKey) });
      asking.reply(true);
      setAsking(null);
      setToast("Updates are on. We'll ping you when it's ready.");
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAskBusy(false);
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
        <UpdatesSheet id={id} name={name} hasIcon={hasIcon} color={color} needsInstall={asking.needsInstall} busy={askBusy} error={askError} onTurnOn={() => void turnOn()} onClose={notNow} />
      )}
      {toast && (
        <div role="status" className="toast-in fixed inset-x-0 top-0 z-20 flex justify-center p-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <span className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</span>
        </div>
      )}
      {html && <iframe ref={frame} title={name} srcDoc={html} sandbox="allow-scripts allow-modals allow-forms allow-popups" className="w-full flex-1 border-0" />}
    </div>
  );
}
