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
/** Runs axe-core (WCAG 2.2 AA rules) in the page once it has settled, and reports what it finds. */
const auditScript = (src: string) => `<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    var s = document.createElement("script");
    s.src = ${JSON.stringify(src)};
    s.onload = function () {
      window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, exclude: [[".a11y-ui"]] }).then(function (r) {
        parent.postMessage({ type: "appmaker:site-a11y", violations: r.violations.map(function (v) {
          return { id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, sample: v.nodes.slice(0, 2).map(function (n) { return String(n.target[0]).slice(0, 80); }) };
        }) }, "*");
      });
    };
    document.head.appendChild(s);
  }, 900);
});
</script>`;

/** Screenshot parts (images/shot-….jpg) put in place as data URLs: they exist only in the browser. */
function withAssets(code: string, assets: Record<string, string>): string {
  let out = code;
  for (const [path, dataUrl] of Object.entries(assets)) {
    if (!/^images\/shot-(hero|\d)\.jpg$/.test(path) || !dataUrl.startsWith("data:image/")) continue;
    out = out.replace(new RegExp(`(?:\\.\\.?/)?${path.replace(/[.-]/g, "\\$&")}`, "g"), dataUrl);
  }
  return out;
}

export function previewDocument(files: FileMap, page: string, audit?: string, assets: Record<string, string> = {}): string {
  let html = files[page] ?? files["index.html"] ?? "";
  html = html.replace(/<link[^>]*href=["']\.?\/?([a-z0-9_\/-]+\.css)["'][^>]*>/gi, (tag, path: string) =>
    files[path] != null ? `<style>${files[path].replace(/<\/style/gi, "<\\/style")}</style>` : tag,
  );
  html = html.replace(/<script([^>]*)\ssrc=["']\.?\/?([a-z0-9_\/-]+\.js)["']([^>]*)><\/script>/gi, (tag, a: string, path: string, b: string) =>
    files[path] != null ? `<script${a}${b}>${files[path].replace(/<\/script/gi, "<\\/script")}</script>` : tag,
  );
  html = withAssets(html, assets);
  const tail = NAV_SCRIPT + (audit ? auditScript(audit) : "");
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tail}</body>`) : html + tail;
}

/** The redesigned website, page by page, at desktop, tablet or phone width. */
export interface SiteA11yIssue {
  id: string;
  impact: string | null;
  help: string;
  count: number;
  sample: string[];
}

/** The audit's findings as a request the AI can act on. */
export function a11yFixRequest(page: string, issues: SiteA11yIssue[]): string {
  return `Accessibility check (axe-core, WCAG 2.2 AA) on ${page} found:\n${issues
    .map((i) => `- ${i.help} (${i.id}, ${i.impact ?? "minor"}, ${i.count} place${i.count === 1 ? "" : "s"}${i.sample.length ? `, e.g. ${i.sample.join(", ")}` : ""})`)
    .join("\n")}\nFix these on every page where they occur, keeping the design and content the same.`;
}

export function SitePreview({ files, onFix, assets }: { files: FileMap; onFix?: (request: string) => void; assets?: Record<string, string> }) {
  const [audit, setAudit] = useState<{ page: string; issues: SiteA11yIssue[] } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
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
  const auditSrc = typeof window === "undefined" ? undefined : `${window.location.origin}/preview/axe.min.js`;
  const doc = useMemo(() => previewDocument(files, current, auditSrc, assets), [files, current, auditSrc, assets]);

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
      if (e.data.type === "appmaker:site-a11y" && Array.isArray(e.data.violations)) {
        const issues = (e.data.violations as SiteA11yIssue[])
          .filter((v) => v && typeof v.id === "string" && typeof v.help === "string")
          .map((v) => ({ id: v.id.slice(0, 60), impact: typeof v.impact === "string" ? v.impact : null, help: v.help.slice(0, 200), count: Number(v.count) || 1, sample: (Array.isArray(v.sample) ? v.sample : []).map(String).slice(0, 2) }));
        setAudit({ page: current, issues });
      }
      if (e.data.type === "appmaker:site-link" && typeof e.data.href === "string") {
        setNote(`On the live site this opens ${e.data.href.replace(/^(tel|mailto|sms):/i, "")} (calls and emails don't open from the preview).`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [files, current]);

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
      {audit && audit.page === current && (
        <div className="mx-auto w-full max-w-3xl">
          {audit.issues.length === 0 ? (
            <p role="status" className="text-center text-xs text-emerald-300">
              ✓ Accessibility: no WCAG 2.2 AA problems found on {current} by the automatic check.
            </p>
          ) : (
            <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues} className="underline underline-offset-2">
                  Accessibility: {audit.issues.length} WCAG 2.2 AA problem{audit.issues.length === 1 ? "" : "s"} on {current}
                </button>
                {onFix && (
                  <button onClick={() => onFix(a11yFixRequest(current, audit.issues))} className="ml-auto min-h-8 rounded-lg bg-amber-400 px-3 font-medium text-black hover:bg-amber-300">
                    Fix with AI
                  </button>
                )}
              </div>
              {showIssues && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {audit.issues.map((i) => (
                    <li key={i.id}>
                      {i.help} <span className="text-amber-200/70">({i.count})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
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
