"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewHtml } from "@/lib/preview";
import type { FileMap } from "@/lib/types";

export interface TapTestResult {
  taps: number;
  errors: { message: string; after: string }[];
  /** The Save/Add-style button whose typed text never showed up, if any. */
  deadSave: string;
}

/**
 * A hidden copy of the app that fills in forms and taps every control, like
 * a first-time user, to find crashes and save buttons that do nothing. It
 * runs off screen with its own memory, so the visible preview isn't touched,
 * and it can't send anything to servers.
 */
export function TapTest({ files, platform, onResult }: { files: FileMap; platform: "ios" | "android" | "ipad"; onResult: (r: TapTestResult) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [origin, setOrigin] = useState("");
  const done = useRef(onResult);
  useEffect(() => {
    done.current = onResult;
  }, [onResult]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const html = useMemo(
    () => (origin ? buildPreviewHtml(files, origin, platform === "ipad" ? "ios" : platform, undefined, { test: true }) : ""),
    [files, origin, platform],
  );
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "appmaker-preview" || e.data.type !== "taptest") return;
      const r = e.data.result ?? {};
      done.current({
        taps: Number(r.taps) || 0,
        errors: Array.isArray(r.errors)
          ? r.errors
              .slice(0, 3)
              .map((x: { message?: unknown; after?: unknown }) => ({
                message: String(x?.message ?? "").slice(0, 300),
                after: String(x?.after ?? "").slice(0, 40),
              }))
          : [],
        deadSave: typeof r.deadSave === "string" ? r.deadSave.slice(0, 40) : "",
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  if (!html) return null;
  return (
    <iframe
      ref={frame}
      title="Automatic tap test"
      aria-hidden="true"
      tabIndex={-1}
      srcDoc={html}
      sandbox="allow-scripts"
      style={{ position: "fixed", left: -10000, top: 0, width: 390, height: 844, border: 0, visibility: "hidden", pointerEvents: "none" }}
    />
  );
}
