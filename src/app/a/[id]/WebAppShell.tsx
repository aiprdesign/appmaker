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
export function WebAppShell({ id, name, files }: { id: string; name: string; files: FileMap }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [install, setInstall] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [hint, setHint] = useState<"" | "ios" | "android">("");

  const platform = useMemo(() => (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "android" : "ios"), []);

  useEffect(() => {
    const t = setTimeout(() => {
      setHtml(buildPreviewHtml(files, window.location.origin, platform, undefined, { storage: readStorage(id) }));
      const installed = window.matchMedia?.("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone;
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(`${PREFIX(id)}__install-dismissed`) === "1";
      } catch {}
      if (!installed && !dismissed && /iPhone|iPad|iPod/.test(navigator.userAgent)) setHint("ios");
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as unknown as { prompt: () => Promise<void> });
      setHint("android");
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "appmaker-preview" || e.data.type !== "storage") return;
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
  }, [id, files, platform]);

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
      {html && <iframe ref={frame} title={name} srcDoc={html} sandbox="allow-scripts allow-modals allow-forms allow-popups" className="w-full flex-1 border-0" />}
    </div>
  );
}
