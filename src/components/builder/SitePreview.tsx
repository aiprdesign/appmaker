"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { FileMap } from "@/lib/types";

export type SiteViewport = "desktop" | "tablet" | "phone";
const WIDTHS: Record<SiteViewport, number> = { desktop: 1280, tablet: 820, phone: 390 };

/** Shown inside the preview: links between pages switch the page here instead of leaving. */
const NAV_SCRIPT = `<script>
document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
  if (!a) return;
  var href = a.getAttribute("href") || "";
  if (/^[a-z0-9_\\/-]+\\.html(#.*)?$/i.test(href)) { e.preventDefault(); parent.postMessage({ type: "appmaker:site-page", page: href.split("#")[0] }, "*"); }
  else if (href.charAt(0) === "#") { return; }
  else if (/^(tel:|mailto:|sms:)/i.test(href)) { e.preventDefault(); parent.postMessage({ type: "appmaker:site-link", href: href }, "*"); }
  else { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
}, true);
</script>`;

/** One page with the site's own stylesheet and script put inline (the preview has no server). */
export function previewDocument(files: FileMap, page: string): string {
  let html = files[page] ?? files["index.html"] ?? "";
  html = html.replace(/<link[^>]*href=["']\.?\/?([a-z0-9_\/-]+\.css)["'][^>]*>/gi, (tag, path: string) =>
    files[path] != null ? `<style>${files[path].replace(/<\/style/gi, "<\\/style")}</style>` : tag,
  );
  html = html.replace(/<script([^>]*)\ssrc=["']\.?\/?([a-z0-9_\/-]+\.js)["']([^>]*)><\/script>/gi, (tag, a: string, path: string, b: string) =>
    files[path] != null ? `<script${a}${b}>${files[path].replace(/<\/script/gi, "<\\/script")}</script>` : tag,
  );
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${NAV_SCRIPT}</body>`) : html + NAV_SCRIPT;
}

/** The redesigned website, page by page, at desktop, tablet or phone width. */
export function SitePreview({ files }: { files: FileMap }) {
  const pages = Object.keys(files)
    .filter((p) => p.endsWith(".html"))
    .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
  const [page, setPage] = useState("index.html");
  const [viewport, setViewport] = useState<SiteViewport>("desktop");
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [boxWidth, setBoxWidth] = useState(1000);
  const current = files[page] != null ? page : "index.html";
  const doc = useMemo(() => previewDocument(files, current), [files, current]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "appmaker:site-page" && typeof e.data.page === "string") {
        const target = e.data.page.replace(/^\.?\//, "");
        if (files[target] != null) setPage(target);
        else setNote(`This link goes to ${target}, which the site doesn't have yet.`);
      }
      if (e.data.type === "appmaker:site-link" && typeof e.data.href === "string") {
        setNote(`On the live site this opens ${e.data.href.replace(/^(tel|mailto|sms):/i, "")} (calls and emails don't open from the preview).`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [files]);

  const width = WIDTHS[viewport];
  const scale = Math.min(1, (boxWidth - 8) / width);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs" role="radiogroup" aria-label="Screen size">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["tablet", Tablet, "Tablet"],
              ["phone", Smartphone, "Phone"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={viewport === v}
              onClick={() => setViewport(v)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium ${viewport === v ? "bg-surface-2 text-foreground" : "text-muted"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Page
          <select
            value={current}
            onChange={(e) => setPage(e.target.value)}
            className="min-h-8 rounded-lg border border-line bg-surface px-2 text-xs text-foreground"
            aria-label="Page"
          >
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      {note && (
        <p role="status" className="mx-auto rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted">
          {note}{" "}
          <button onClick={() => setNote(null)} className="underline underline-offset-2">
            OK
          </button>
        </p>
      )}
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl">
        <div
          className="absolute left-1/2 top-0 origin-top overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-line"
          style={{ width, height: `${100 / scale}%`, transform: `translateX(-50%) scale(${scale})` }}
        >
          <iframe
            ref={frame}
            key={current}
            title="Website preview"
            srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
