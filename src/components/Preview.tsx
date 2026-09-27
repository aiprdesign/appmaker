"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { buildPreviewHtml } from "@/lib/preview";
import type { FileMap } from "@/lib/types";

export interface PreviewError {
  message: string;
  stack: string;
}

interface Props {
  files: FileMap;
  platform: "ios" | "android";
  /** Bump to force a fresh reload of the app. */
  reloadKey: number;
  onError?: (err: PreviewError | null) => void;
}

const noopSubscribe = () => () => {};

export function Preview({ files, platform, reloadKey, onError }: Props) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  const html = useMemo(
    () => (origin && Object.keys(files).length ? buildPreviewHtml(files, origin, platform) : ""),
    [files, origin, platform],
  );

  useEffect(() => {
    onError?.(null);
    const handler = (e: MessageEvent) => {
      if (e.data?.source !== "appmaker-preview") return;
      if (e.data.type === "error") onError?.({ message: e.data.message, stack: e.data.stack });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [html, reloadKey, onError]);

  if (!html) return <div className="h-full w-full bg-white" />;
  return (
    <iframe
      key={reloadKey}
      title="App preview"
      srcDoc={html}
      sandbox="allow-scripts allow-forms allow-modals"
      className="h-full w-full border-0 bg-white"
    />
  );
}
