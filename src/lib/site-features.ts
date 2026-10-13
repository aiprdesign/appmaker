import type { FileMap } from "./types";
import { parseHours, type Week } from "./site-hours";
import { FEATURES_RUNTIME } from "./site-features-runtime";

/**
 * Features every redesigned website gets, from the business's real details
 * (nothing is shown when a detail isn't known):
 *  1. A Call / WhatsApp / Directions / Book bar on phones.
 *  2. An "Open now" / "Closed" badge from the opening hours.
 *  3. Share this page (the phone's share sheet, or copy the link).
 *  4. Save the business to your contacts (a vCard).
 *  5. Pictures open full size in a viewer (keyboard and screen reader friendly).
 *  6. Search the whole site (button in the footer, or press /).
 *  7. Pages open offline once visited, and the site can be installed (service worker).
 *  8. Contact forms with no server send by email, and explain mistakes in text.
 *  9. FAQ answers show in search results (FAQPage data from <details>).
 * 10. Breadcrumbs in search results for inner pages.
 * 11. The address links to the map.
 * 12. Reading time on articles.
 * The runtime is features.js; search.js holds the search index; sw.js is the service worker.
 */

export const FEATURES_FILE = "features.js";
export const SEARCH_FILE = "search.js";
export const SW_FILE = "sw.js";
export const APPMAKER_SITE_FILES = new Set([FEATURES_FILE, SEARCH_FILE, SW_FILE]);

export interface FeatureInfo {
  siteName: string;
  url?: string;
  phone?: string;
  email?: string;
  address?: string;
  whatsapp?: string;
  booking?: string;
  maps?: string;
  hours?: string[];
  /** Brand colour, #rrggbb. */
  primary?: string;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
/** JSON safe inside a <script> element and a JS file. */
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");
const httpsOnly = (u?: string) => (u && /^https:\/\//i.test(u) ? u : undefined);

function origin(url?: string): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

const isPage = (path: string) => path.endsWith(".html");
const titleOf = (html: string) => plain(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").split(/\s[·|–—-]\s/)[0];

/** The search index: each page's title, headings and text (trimmed). */
export function searchIndex(files: FileMap): { url: string; title: string; text: string }[] {
  return Object.entries(files)
    .filter(([p]) => isPage(p) && p !== "404.html")
    .sort(([a], [b]) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)))
    .slice(0, 40)
    .map(([p, html]) => {
      const main = (/<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1] ?? html).replace(/<p data-appmaker-reading[^>]*>[\s\S]*?<\/p>|<span class="sr-only">[^<]*<\/span>/gi, " ");
      return { url: p, title: titleOf(html) || p, text: plain(main).slice(0, 4000) };
    });
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The data features.js works from. */
export function featureData(info: FeatureInfo) {
  const color = /^#[0-9a-f]{6}$/i.test(info.primary ?? "") ? info.primary! : "#111111";
  const week: Week | null = info.hours?.length ? parseHours(info.hours) : null;
  const digits = (info.whatsapp ?? "").replace(/\D/g, "");
  const wa = httpsOnly(info.whatsapp) ?? (digits.length >= 7 ? `https://wa.me/${digits}` : undefined);
  const maps = httpsOnly(info.maps) ?? (info.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}` : undefined);
  return {
    name: info.siteName,
    ...(info.phone ? { phone: info.phone, tel: info.phone.replace(/[^\d+]/g, "") } : {}),
    ...(info.email ? { email: info.email } : {}),
    ...(info.address ? { address: info.address } : {}),
    ...(wa ? { whatsapp: wa } : {}),
    ...(maps ? { maps } : {}),
    ...(httpsOnly(info.booking) ? { booking: info.booking } : {}),
    ...(week ? { week } : {}),
    ...(origin(info.url) ? { site: `${origin(info.url)}/` } : {}),
    color,
    // White or near-black text on the brand colour, whichever reads better (WCAG contrast).
    ink: luminance(color) > 0.18 ? "#111111" : "#ffffff",
  };
}

/** FAQPage structured data from <details><summary>question</summary>answer</details>. */
function faqData(html: string): string | null {
  const items = [...html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)]
    .map((m) => ({ q: plain(m[1]), a: plain(m[2]) }))
    .filter((x) => x.q.length > 3 && x.a.length > 3)
    .slice(0, 30);
  if (items.length < 2) return null;
  return json({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  });
}

function breadcrumbData(path: string, html: string, files: FileMap, site: string): string | null {
  if (path === "index.html" || path === "404.html") return null;
  const list = [{ name: titleOf(files["index.html"] ?? "") || "Home", item: site }];
  const folder = path.includes("/") ? path.split("/")[0] : null;
  if (folder && files[`${folder}/index.html`] && path !== `${folder}/index.html`) list.push({ name: titleOf(files[`${folder}/index.html`]) || folder, item: `${site}${folder}/` });
  list.push({ name: titleOf(html) || path, item: site + path.replace(/(^|\/)index\.html$/, "$1") });
  return json({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: x.item })),
  });
}

function intoHead(html: string, tags: string[]): string {
  if (!tags.length) return html;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tags.join("\n")}\n</head>`) : `${tags.join("\n")}\n${html}`;
}

/** One page with its features: structured data, map link, reading time and the script. */
export function featurePage(path: string, html: string, info: FeatureInfo, files: FileMap): string {
  let out = html;
  const site = origin(info.url);
  const head: string[] = [];
  // 9. FAQ answers in search results.
  if (!/"FAQPage"/.test(out)) {
    const faq = faqData(out);
    if (faq) head.push(`<script type="application/ld+json">${faq}</script>`);
  }
  // 10. Breadcrumbs in search results.
  if (site && !/"BreadcrumbList"/.test(out)) {
    const crumbs = breadcrumbData(path, out, files, `${site}/`);
    if (crumbs) head.push(`<script type="application/ld+json">${crumbs}</script>`);
  }
  out = intoHead(out, head);
  // 11. The address, where it's written out in the page's text, links to the map.
  const data = featureData(info);
  if (info.address && data.maps && info.address.length >= 8) {
    const addr = esc(info.address);
    let linked = false;
    out = out.replace(/(<body\b[\s\S]*<\/body>)/i, (body) =>
      body.replace(/(<a\b[\s\S]*?<\/a>)|(<(script|style|title)\b[\s\S]*?<\/\3>)|(<[^>]+>)|([^<]+)/gi, (m, link, raw, _t, tag, text: string | undefined) => {
        if (link || raw || tag || !text || linked) return m;
        const at = text.indexOf(addr);
        if (at < 0) return m;
        linked = true;
        return `${text.slice(0, at)}<a href="${esc(data.maps!)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4">${addr}<span class="sr-only"> (opens the map in a new tab)</span></a>${text.slice(at + addr.length)}`;
      }),
    );
  }
  // 12. Reading time on articles (blog posts, or pages with an <article> of 400+ words).
  if (!/data-appmaker-reading/.test(out)) {
    const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(out)?.[1] ?? (/^(blog|news|journal|articles?|posts?)\//.test(path) ? /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(out)?.[1] : undefined);
    const words = article ? plain(article).split(" ").length : 0;
    if (words >= 400) {
      const min = Math.max(1, Math.round(words / 220));
      out = out.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1\n<p data-appmaker-reading class="mt-2 text-sm opacity-75">${min} min read</p>`);
    }
  }
  // The runtime, on every page.
  if (!/<script[^>]*src=["'](?:\.\.\/)?features\.js["']/i.test(out)) {
    const tag = `<script src="${path.includes("/") ? "../" : ""}${FEATURES_FILE}" defer></script>`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}\n</body>`) : `${out}\n${tag}`;
  }
  return out;
}

/** The service worker: pages and files load from the network, and from the cache when offline. */
export const SW_SCRIPT = `/* Offline support. Added by Appmaker. */
var CACHE = "appmaker-site-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || (req.mode === "navigate" ? caches.match("404.html") : undefined) || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
        });
      }),
  );
});
`;

/** Adds the features to every page, and features.js, search.js and sw.js to the site. Safe to run again. */
export function withSiteFeatures(files: FileMap, info: FeatureInfo): FileMap {
  if (files["index.html"] == null) return files;
  const out: FileMap = { ...files };
  for (const [path, code] of Object.entries(files)) if (isPage(path)) out[path] = featurePage(path, code, info, files);
  out[FEATURES_FILE] = `/* Website features. Added by Appmaker. */\nvar APPMAKER_SITE = ${json(featureData(info))};\n${FEATURES_RUNTIME}`;
  out[SEARCH_FILE] = `/* Search index. Added by Appmaker. */\nwindow.APPMAKER_SEARCH = ${json(searchIndex(files))};\n`;
  out[SW_FILE] = SW_SCRIPT;
  return out;
}


