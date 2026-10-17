"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Monitor, PencilLine, Smartphone, Tablet } from "lucide-react";
import type { FileMap } from "@/lib/types";
import type { A11yReport } from "@/lib/site-statement";
import type { ContentEdit } from "@/lib/site-content";
import { SiteA11yReport } from "./SiteA11yReport";
import { SITE_ASSET_PATH } from "@/lib/site-details";

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

/** Screenshot parts and saved photos (images/shot-…, images/site-…) put in place as data URLs: they exist only in the browser. */
function withAssets(code: string, assets: Record<string, string>): string {
  let out = code;
  for (const [path, dataUrl] of Object.entries(assets)) {
    if (!SITE_ASSET_PATH.test(path) || !dataUrl.startsWith("data:image/")) continue;
    out = out.replace(new RegExp(`(?:\\.\\.?/)?${path.replace(/[.-]/g, "\\$&")}`, "g"), dataUrl);
  }
  return out;
}

const PLAYER = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/|www\.instagram\.com\/(p|reel)\/[\w-]+\/embed|www\.tiktok\.com\/embed\/)/i;
const attr = (attrs: string, name: string) => new RegExp(`\\s${name}=["']([^"']*)["']`, "i").exec(` ${attrs}`)?.[1];

/**
 * Video players can't run inside the preview's sandbox: official players become
 * the built-in still-and-play card (from a11y.js), which says the video plays on
 * the live site. The downloaded site keeps the real players.
 */
function previewVideos(html: string): string {
  const out = html.replace(/<iframe\b([^>]*)>\s*<\/iframe>/gi, (tag, attrs: string) => {
    const src = attr(attrs, "src") ?? "";
    if (!PLAYER.test(src)) return tag;
    const esc = (t: string) => t.replace(/"/g, "&quot;");
    return `<div data-video="${esc(src)}" data-title="${esc(attr(attrs, "title") ?? "Video")}" class="${esc(attr(attrs, "class") ?? "")}"></div>`;
  });
  return /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => `${h}<script>window.__appmakerPreview=1</script>`) : `<script>window.__appmakerPreview=1</script>${out}`;
}

/**
 * Edit mode: click a piece of text (an element with only text in it) to change it;
 * Enter or clicking away saves, Esc cancels. Each change goes to Appmaker, which
 * applies it to every page of every design.
 */
const EDIT_SCRIPT = `<script>
(function () {
  var TEXT = "h1,h2,h3,h4,h5,h6,p,li,a,button,span,small,strong,em,figcaption,blockquote,td,th,dt,dd,label,summary";
  var css = document.createElement("style");
  css.textContent = "[data-am-editable]:hover{outline:2px dashed #8b5cf6;outline-offset:3px;cursor:text}[contenteditable=true]{outline:2px solid #8b5cf6!important;outline-offset:3px;background:rgba(139,92,246,.08)}";
  document.head.appendChild(css);
  function editable(el) { return el && el.matches && el.matches(TEXT) && !el.closest(".a11y-ui, .am-video, .am-marquee-toggle") && el.children.length === 0 && el.textContent.trim().length > 0; }
  document.addEventListener("mouseover", function (e) { if (editable(e.target)) e.target.setAttribute("data-am-editable", ""); }, true);
  document.addEventListener("mouseout", function (e) { if (e.target.removeAttribute) e.target.removeAttribute("data-am-editable"); }, true);
  document.addEventListener("click", function (e) {
    var el = e.target;
    if (el.isContentEditable) { e.stopImmediatePropagation(); return; }
    if (!editable(el)) { if (el.closest && el.closest("a,button")) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    var before = el.textContent;
    el.removeAttribute("data-am-editable");
    el.contentEditable = "true";
    el.focus();
    var cancelled = false;
    function key(k) {
      if (k.key === "Enter" && !k.shiftKey) { k.preventDefault(); el.blur(); }
      if (k.key === "Escape") { cancelled = true; el.textContent = before; el.blur(); }
    }
    el.addEventListener("keydown", key);
    el.addEventListener("blur", function () {
      el.removeEventListener("keydown", key);
      el.contentEditable = "false";
      var after = el.textContent.replace(/\\s+/g, " ").trim();
      if (!cancelled && after && after !== before.replace(/\\s+/g, " ").trim()) parent.postMessage({ type: "appmaker:site-edit", from: before.replace(/\\s+/g, " ").trim(), to: after, scrollY: window.scrollY }, "*");
    }, { once: true });
  }, true);
})();
</script>`;

export function previewDocument(files: FileMap, page: string, audit?: string, assets: Record<string, string> = {}, editing = false, scrollY = 0): string {
  let html = files[page] ?? files["index.html"] ?? "";
  html = html.replace(/<link[^>]*href=["']\.?\/?([a-z0-9_\/-]+\.css)["'][^>]*>/gi, (tag, path: string) =>
    files[path] != null ? `<style>${files[path].replace(/<\/style/gi, "<\\/style")}</style>` : tag,
  );
  html = html.replace(/<script([^>]*)\ssrc=["']\.?\/?([a-z0-9_\/-]+\.js)["']([^>]*)><\/script>/gi, (tag, a: string, path: string, b: string) =>
    files[path] != null ? `<script${a}${b}>${files[path].replace(/<\/script/gi, "<\\/script")}</script>` : tag,
  );
  // The site's search index is loaded when someone searches; the preview has it inline.
  if (files["search.js"] != null && /APPMAKER_SITE/.test(html)) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `<script>${files["search.js"].replace(/<\/script/gi, "<\\/script")}</script></body>`);
  html = withAssets(html, assets);
  html = previewVideos(html);
  // The edit script comes first, so its click handler runs before the link handler.
  const back = scrollY > 0 ? `<script>addEventListener("load",function(){scrollTo(0,${Math.round(scrollY)})})</script>` : "";
  const tail = (editing ? EDIT_SCRIPT : "") + NAV_SCRIPT + back + (audit ? auditScript(audit) : "");
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

export function SitePreview({
  files,
  onFix,
  assets,
  report,
  onReport,
  onEdit,
}: {
  files: FileMap;
  onFix?: (request: string) => void;
  assets?: Record<string, string>;
  /** The latest site-wide WCAG 2.2 check, and where a new one goes (the finished site only). */
  report?: A11yReport;
  onReport?: (report: A11yReport) => void;
  /** Text edited on the design; returns how many places changed (across every design). */
  onEdit?: (edit: ContentEdit) => number;
}) {
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
  const [editing, setEditing] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const doc = useMemo(
    () => previewDocument(files, current, editing ? undefined : auditSrc, assets, editing && !!onEdit, scrollY),
    [files, current, auditSrc, assets, editing, onEdit, scrollY],
  );

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
      if (e.data.type === "appmaker:site-edit" && onEdit && typeof e.data.from === "string" && typeof e.data.to === "string") {
        const edit = { from: e.data.from.slice(0, 2000), to: e.data.to.slice(0, 2000) };
        setScrollY(Number(e.data.scrollY) || 0);
        const changed = onEdit(edit);
        setNote(
          changed
            ? `Changed in ${changed} place${changed === 1 ? "" : "s"}, on every design. Later AI changes keep your words.`
            : "That text is split up in the page's code, so it couldn't be changed here. Ask the AI in the chat to change it.",
        );
      }
      if (e.data.type === "appmaker:site-link" && typeof e.data.href === "string") {
        setNote(`On the live site this opens ${e.data.href.replace(/^(tel|mailto|sms):/i, "")} (calls and emails don't open from the preview).`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [files, current, onEdit]);

  const width = WIDTHS[viewport];
  const scale = Math.min(1, (boxWidth - 8) / width);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <div className="flex rounded-full border border-line p-0.5 text-xs" role="radiogroup" aria-label="Screen size">
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
              aria-label={label}
              title={`${label} · ${WIDTHS[v]}px`}
              className={`grid h-8 w-9 place-items-center rounded-full ${viewport === v ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          ))}
        </div>
        <select
            value={current}
            onChange={(e) => setPage(e.target.value)}
            className="min-h-9 max-w-48 rounded-full border border-line bg-transparent px-3 text-xs text-foreground"
            aria-label="Page"
          >
            {pages.map((p) => {
              // The page's own title (before the " · Business" part), then its file name.
              const title = /<title>([^<]*)<\/title>/i.exec(files[p] ?? "")?.[1]?.split(/\s[·|–—-]\s/)[0]?.trim();
              return (
                <option key={p} value={p}>
                  {title || p}
                </option>
              );
            })}
          </select>
        <button
          onClick={() => {
            // The page on its own, full size, in a new tab (pictures and styles included).
            const url = URL.createObjectURL(new Blob([previewDocument(files, current, undefined, assets)], { type: "text/html" }));
            window.open(url, "_blank", "noopener");
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }}
          aria-label="Open full size"
          title="Open full size"
          className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </button>
        {onEdit && (
          <button
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs ${editing ? "border-foreground bg-foreground text-background" : "border-line text-muted hover:text-foreground"}`}
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden /> {editing ? "Done editing" : "Edit text"}
          </button>
        )}
        {onReport && <SiteA11yReport files={files} assets={assets} auditSrc={auditSrc} report={report} onReport={onReport} onFix={onFix} />}
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
      {editing && (
        <p role="status" className="mx-auto rounded-lg bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100">
          Click any text on the page to change it. Enter saves, Esc cancels. Each change is made on every design and every page where that text appears.
        </p>
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
