"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { buildPreviewHtml } from "@/lib/preview";
import type { FileMap } from "@/lib/types";

export interface QualityIssue {
  kind: "layout" | "contrast" | "text-size" | "overflow" | "touch" | "label" | "crash" | "save";
  message: string;
}

export interface PreviewError {
  message: string;
  stack: string;
}

interface Props {
  files: FileMap;
  platform: "ios" | "android" | "ipad";
  /** Bump to force a fresh reload of the app. */
  reloadKey: number;
  onError?: (err: PreviewError | null) => void;
  /** Problems the preview's quality check found on the first screen (layout, contrast, text size, overflow, small buttons). */
  onQualityIssues?: (issues: QualityIssue[]) => void;
  /** Show the app in light or dark mode (apps in "auto" follow this, like a phone's setting). */
  scheme?: "light" | "dark";
  /** Edit in place (ready-made apps): the app asks the builder to, say, add a photo to a menu item. */
  onEdit?: (edit: { kind: string; item: string }) => void;
}

const noopSubscribe = () => () => {};

export function Preview({ files, platform, reloadKey, onError, onQualityIssues, scheme, onEdit }: Props) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  const frame = useRef<HTMLIFrameElement>(null);
  const editable = !!onEdit;
  const html = useMemo(
    () => (origin && Object.keys(files).length ? buildPreviewHtml(files, origin, platform, scheme, { edit: editable }) : ""),
    [files, origin, platform, scheme, editable],
  );

  useEffect(() => {
    onError?.(null);
    const handler = (e: MessageEvent) => {
      // Only trust messages from our own preview frame.
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "appmaker-preview") return;
      if (e.data.type === "error") onError?.({ message: e.data.message, stack: e.data.stack });
      if (e.data.type === "edit" && typeof e.data.kind === "string" && typeof e.data.item === "string") onEdit?.({ kind: e.data.kind, item: e.data.item });
      if (e.data.type === "quality" && Array.isArray(e.data.issues)) {
        const kinds = ["layout", "contrast", "text-size", "overflow", "touch", "label"];
        const issues = (e.data.issues as { kind?: unknown; message?: unknown }[])
          .filter((i) => typeof i?.message === "string" && kinds.includes(i.kind as string))
          .slice(0, 5)
          .map((i) => ({ kind: i.kind as QualityIssue["kind"], message: (i.message as string).slice(0, 300) }));
        onQualityIssues?.(issues);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [html, reloadKey, onError, onQualityIssues, onEdit]);

  if (!html) return <div className="h-full w-full bg-white" />;
  return (
    <iframe
      key={reloadKey}
      ref={frame}
      title="App preview"
      srcDoc={html}
      sandbox="allow-scripts allow-modals"
      className="h-full w-full border-0 bg-white"
    />
  );
}
