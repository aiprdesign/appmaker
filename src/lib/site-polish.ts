import type { FileMap } from "./types";

/**
 * Finishing touches for every redesigned website, applied by Appmaker after the
 * AI writes (so they're always there, whatever the AI forgot). Each is small,
 * safe to run again (it only adds what's missing), and numbered for review.
 */

export interface PolishInfo {
  siteName: string;
  /** The current site's address (its origin is used for the sitemap, as the new site usually replaces it there). */
  url?: string;
  lang?: string;
  /** Brand colour, #rrggbb. */
  primary?: string;
  /** The business's logo (https). */
  logo?: string;
  /** An emoji for the site icon when there's no logo. */
  emoji?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  social?: string[];
  /** Sizes of pictures kept with the project (images/…), to reserve their space. */
  assetSizes?: Record<string, { width: number; height: number }>;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const has = (html: string, re: RegExp) => re.test(html);
const HEX = /^#[0-9a-f]{6}$/i;

/** Puts tags at the end of <head> (or the start of the page when it has none). */
function intoHead(html: string, tags: string[]): string {
  if (!tags.length) return html;
  const block = tags.join("\n");
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${block}\n</head>`) : `${block}\n${html}`;
}

const metaContent = (html: string, attr: "name" | "property", key: string) =>
  new RegExp(`<meta\\s+[^>]*${attr}=["']${key.replace(/:/g, "\\:")}["'][^>]*>`, "i").exec(html)?.[0]?.match(/content=["']([^"']*)["']/i)?.[1];

function origin(url?: string): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/** The site icon: the logo, else the emoji (or first letter) drawn as an SVG. */
function iconHref(info: PolishInfo): string {
  if (info.logo && /^https:\/\//.test(info.logo)) return info.logo;
  const glyph = info.emoji || (info.siteName.trim()[0] ?? "•").toUpperCase();
  const bg = info.primary && HEX.test(info.primary) ? info.primary : "#111827";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${bg}'/><text x='32' y='44' font-size='${info.emoji ? 38 : 34}' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' fill='#fff'>${esc(glyph)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** One page's finishing touches (1–17). */
export function polishPage(path: string, html: string, info: PolishInfo, pages: string[]): string {
  let out = html;
  const head: string[] = [];
  // 1. Character set.
  if (!has(out, /<meta\s+charset=/i)) head.unshift('<meta charset="utf-8">');
  // 2. Language of the page, for screen readers and translation.
  if (/<html(?![^>]*\slang=)/i.test(out)) out = out.replace(/<html/i, `<html lang="${esc(info.lang || "en")}"`);
  // 3. Phone-friendly viewport.
  if (!has(out, /<meta\s+name=["']viewport["']/i)) head.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  // 4. Browser bar colour in the brand colour.
  if (info.primary && HEX.test(info.primary) && !has(out, /<meta\s+name=["']theme-color["']/i)) head.push(`<meta name="theme-color" content="${info.primary}">`);
  // 5. Light colour scheme declared (stops forced dark modes breaking the design).
  if (!has(out, /<meta\s+name=["']color-scheme["']/i)) head.push('<meta name="color-scheme" content="light">');
  // 6. A site icon for tabs and bookmarks.
  if (!has(out, /<link\s+[^>]*rel=["'](?:shortcut )?icon["']/i)) head.push(`<link rel="icon" href="${esc(iconHref(info))}">`);
  // 7–11. Sharing previews (Facebook, LinkedIn, WhatsApp, X…).
  const title = /<title>([^<]*)<\/title>/i.exec(out)?.[1]?.trim();
  const description = metaContent(out, "name", "description");
  if (title && !metaContent(out, "property", "og:title")) head.push(`<meta property="og:title" content="${esc(title)}">`);
  if (description && !metaContent(out, "property", "og:description")) head.push(`<meta property="og:description" content="${esc(description)}">`);
  const firstImage = /<img[^>]*\ssrc=["'](https:\/\/[^"']+)["']/i.exec(out)?.[1] ?? (info.logo && /^https:\/\//.test(info.logo) ? info.logo : undefined);
  if (firstImage && !metaContent(out, "property", "og:image")) head.push(`<meta property="og:image" content="${esc(firstImage)}">`);
  if (!metaContent(out, "property", "og:type")) head.push('<meta property="og:type" content="website">');
  if (info.siteName && !metaContent(out, "property", "og:site_name")) head.push(`<meta property="og:site_name" content="${esc(info.siteName)}">`);
  if (!metaContent(out, "name", "twitter:card")) head.push(`<meta name="twitter:card" content="${firstImage ? "summary_large_image" : "summary"}">`);
  // 31. Referrer policy: other sites see where visitors came from, not the full page address.
  if (!has(out, /<meta\s+name=["']referrer["']/i)) head.push('<meta name="referrer" content="strict-origin-when-cross-origin">');
  // 32. Home-screen icon on iPhone and iPad (the logo).
  if (info.logo && /^https:\/\//.test(info.logo) && !has(out, /rel=["']apple-touch-icon["']/i)) head.push(`<link rel="apple-touch-icon" href="${esc(info.logo)}">`);
  // 33 + 35. The page's address for sharing and search (the new site usually replaces the old one at the same address).
  const site = origin(info.url);
  const pageUrl = site ? `${site}/${path === "index.html" ? "" : path}` : null;
  if (pageUrl && path !== "404.html") {
    if (!metaContent(out, "property", "og:url")) head.push(`<meta property="og:url" content="${esc(pageUrl)}">`);
    if (!has(out, /<link\s+[^>]*rel=["']canonical["']/i)) head.push(`<link rel="canonical" href="${esc(pageUrl)}">`);
  }
  // 34. A description of the sharing image.
  const firstAlt = /<img[^>]*\ssrc=["']https:\/\/[^"']+["'][^>]*\salt=["']([^"']+)["']/i.exec(out)?.[1] ?? /<img[^>]*\salt=["']([^"']+)["'][^>]*\ssrc=["']https:\/\//i.exec(out)?.[1];
  if (firstAlt && !metaContent(out, "property", "og:image:alt")) head.push(`<meta property="og:image:alt" content="${esc(firstAlt)}">`);
  // 45. Printing: no menus or widgets, link addresses shown, no dark backgrounds.
  if (!has(out, /data-appmaker-print/i)) {
    head.push(
      '<style data-appmaker-print media="print">nav,.a11y-ui,.am-marquee-toggle,[data-video] .am-video-play::after{display:none!important}body{background:#fff!important;color:#000!important}main a[href^="http"]::after{content:" (" attr(href) ")";font-size:.85em}</style>',
    );
  }
  // 12. The web app manifest (add to home screen).
  if (!has(out, /<link\s+[^>]*rel=["']manifest["']/i)) head.push(`<link rel="manifest" href="${path.includes("/") ? "../" : ""}site.webmanifest">`);
  out = intoHead(out, head.filter((t) => !t.startsWith("<meta charset")));
  if (head[0]?.startsWith("<meta charset")) out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => `${h}\n<meta charset="utf-8">`) : `<meta charset="utf-8">\n${out}`;

  // 13–14. Pictures: the first loads at once, the rest only when near; all decode off the main thread.
  let index = 0;
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    let t = tag;
    if (index++ > 0 && !/\sloading=/i.test(t)) t = t.replace(/<img/i, '<img loading="lazy"');
    if (!/\sdecoding=/i.test(t)) t = t.replace(/<img/i, '<img decoding="async"');
    // 15. Pictures kept with the project get their size, so the page doesn't jump while loading.
    const src = /\ssrc=["']([^"']+)["']/i.exec(t)?.[1]?.replace(/^\.\.?\//, "");
    const size = src ? info.assetSizes?.[src] : undefined;
    if (size && !/\swidth=/i.test(t) && !/\sheight=/i.test(t)) t = t.replace(/<img/i, `<img width="${size.width}" height="${size.height}"`);
    return t;
  });
  // 16. Links that open a new tab: safe (noopener) and announced to screen readers.
  out = out.replace(/<a\b([^>]*\starget=["']_blank["'][^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) => {
    let a = attrs;
    if (!/\srel=/i.test(a)) a += ' rel="noopener noreferrer"';
    else if (!/noopener/i.test(a)) a = a.replace(/\srel=(["'])([^"']*)\1/i, (_m, q: string, v: string) => ` rel=${q}${v} noopener${q}`);
    const announced = /new (tab|window)/i.test(inner) || /\saria-label=/i.test(a);
    return `<a${a}>${inner}${announced ? "" : '<span class="sr-only"> (opens in a new tab)</span>'}</a>`;
  });
  // 61. Zooming is never blocked (WCAG 1.4.4): no user-scalable=no or maximum-scale below 5.
  out = out.replace(/(<meta\s+name=["']viewport["']\s+content=["'])([^"']*)(["'])/i, (_m, a: string, c: string, b: string) => {
    const kept = c
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && !/^user-scalable\s*=\s*(no|0)$/i.test(x) && !/^maximum-scale\s*=\s*[0-4](\.\d+)?$/i.test(x));
    return `${a}${kept.join(", ")}${b}`;
  });
  // 36. Email links without stray spaces.
  out = out.replace(/href=(["'])mailto:\s*([^"']*?)\s*\1/gi, (_m, q: string, e: string) => `href=${q}mailto:${e.trim()}${q}`);
  // 37–38. Embedded players load when near, and send only the site's address.
  out = out.replace(/<iframe\b[^>]*>/gi, (tag) => {
    let t = tag;
    if (!/\sloading=/i.test(t)) t = t.replace(/<iframe/i, '<iframe loading="lazy"');
    if (!/\sreferrerpolicy=/i.test(t)) t = t.replace(/<iframe/i, '<iframe referrerpolicy="strict-origin-when-cross-origin"');
    return t;
  });
  // 39–40. Videos play inline on phones, load only their first frame, and never autoplay with sound.
  out = out.replace(/<video\b[^>]*>/gi, (tag) => {
    let t = tag;
    if (!/\splaysinline\b/i.test(t)) t = t.replace(/<video/i, "<video playsinline");
    if (!/\spreload=/i.test(t)) t = t.replace(/<video/i, '<video preload="metadata"');
    if (/\sautoplay\b/i.test(t) && !/\smuted\b/i.test(t)) t = t.replace(/<video/i, "<video muted");
    return t;
  });
  // 41. Table column headings are announced with their cells.
  out = out.replace(/<thead\b[\s\S]*?<\/thead>/gi, (thead) => thead.replace(/<th(?![^>]*\sscope=)(\s|>)/gi, '<th scope="col"$1'));
  // 42. Form fields that browsers can fill in for you.
  out = out.replace(/<input\b[^>]*>/gi, (tag) => {
    if (/\sautocomplete=/i.test(tag)) return tag;
    const type = /\stype=["']?(\w+)/i.exec(tag)?.[1]?.toLowerCase();
    const name = /\s(?:name|id)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const auto = type === "email" ? "email" : type === "tel" ? "tel" : /^(full-?)?name$|^your-?name$/.test(name) ? "name" : null;
    return auto ? tag.replace(/<input/i, `<input autocomplete="${auto}"`) : tag;
  });
  // 43. Links to PDF files say so (people expect a page).
  out = out.replace(/<a\b([^>]*\shref=["'][^"']+\.pdf(?:[?#][^"']*)?["'][^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) =>
    /pdf/i.test(inner.replace(/<[^>]+>/g, "")) || /\saria-label=/i.test(attrs) ? whole : `<a${attrs}>${inner}<span class="sr-only"> (PDF)</span></a>`,
  );
  // 44. The copyright year in the footer is this year.
  const year = new Date().getFullYear();
  out = out.replace(/<footer\b[\s\S]*?<\/footer>/gi, (footer) => footer.replace(/(©|&copy;|Copyright)\s*(20\d\d)(?!\s*[–-]\s*20\d\d)/gi, (m, sign: string, y: string) => (Number(y) < year ? `${sign} ${y}–${year}` : m)));
  // 17. Phone links dial cleanly (no spaces, dashes or brackets in the number).
  out = out.replace(/href=(["'])tel:([^"']+)\1/gi, (_m, q: string, n: string) => `href=${q}tel:${n.replace(/[^\d+]/g, "")}${q}`);
  // 18. Website links missing https:// work instead of pointing to a missing page.
  out = out.replace(/href=(["'])(www\.[^"'\s]+)\1/gi, (_m, q: string, u: string) => `href=${q}https://${u}${q}`);
  // 19. The business's details for search engines (home page only).
  if (path === "index.html" && !/application\/ld\+json/i.test(out)) {
    const data: Record<string, unknown> = { "@context": "https://schema.org", "@type": "LocalBusiness", name: info.siteName };
    const site = origin(info.url);
    if (site) data.url = `${site}/`;
    if (info.logo && /^https:\/\//.test(info.logo)) data.logo = data.image = info.logo;
    if (info.phone) data.telephone = info.phone;
    if (info.email) data.email = info.email;
    if (info.address) data.address = info.address;
    if (info.description) data.description = info.description;
    if (info.social?.length) data.sameAs = info.social.slice(0, 8);
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    out = intoHead(out, [`<script type="application/ld+json">${json}</script>`]);
  }
  void pages;
  return out;
}

/** The site's own files (20–23): sitemap, robots, a "page not found" page and the web app manifest. */
export function siteExtras(files: FileMap, info: PolishInfo): FileMap {
  const out: FileMap = {};
  const pages = Object.keys(files).filter((p) => p.endsWith(".html") && p !== "404.html");
  const site = origin(info.url);
  // 20. Sitemap (search engines find every page).
  if (files["sitemap.xml"] == null && site) {
    out["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)))
      .map((p) => `  <url><loc>${site}/${p === "index.html" ? "" : p}</loc></url>`)
      .join("\n")}\n</urlset>\n`;
  }
  // 21. robots.txt (allows everything, points to the sitemap).
  if (files["robots.txt"] == null) out["robots.txt"] = `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`;
  // 22. A friendly "page not found" page in the site's own design (most hosts show 404.html).
  const home = files["index.html"];
  const main = home ? /<main\b[^>]*>[\s\S]*<\/main>/i.exec(home) : null;
  if (files["404.html"] == null && home && main) {
    out["404.html"] = (home.slice(0, main.index) + `<main id="main"><section class="mx-auto max-w-2xl px-6 py-24 text-center space-y-6"><p class="text-sm font-semibold uppercase tracking-widest opacity-70">Error 404</p><h1 class="text-4xl font-bold tracking-tight sm:text-5xl">This page couldn&apos;t be found</h1><p class="text-lg">It may have moved when the website was updated.</p><p><a href="/" class="inline-flex min-h-11 items-center rounded-full border px-6 font-medium">Go to the home page</a></p></section></main>` + home.slice(main.index + main[0].length))
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>Page not found · ${esc(info.siteName)}</title>`)
      .replace(/<meta\s+name=["']description["'][^>]*>/i, '<meta name="description" content="This page could not be found.">')
      .replace(/\saria-current=["']page["']/gi, "")
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, "")
      .replace(/<head([^>]*)>/i, '<head$1>\n<meta name="robots" content="noindex">');
  }
  // 23. Web app manifest (name, colours and icon when saved to a phone's home screen).
  if (files["site.webmanifest"] == null) {
    const colour = info.primary && HEX.test(info.primary) ? info.primary : "#111827";
    out["site.webmanifest"] = JSON.stringify(
      { name: info.siteName, short_name: info.siteName.slice(0, 12), start_url: "/", display: "browser", background_color: "#ffffff", theme_color: colour, icons: [{ src: iconHref(info), sizes: "any", type: info.logo ? "image/png" : "image/svg+xml" }] },
      null,
      2,
    );
  }
  return out;
}

/** Every finishing touch, on every page. Running it again changes nothing. */
export function polishSite(files: FileMap, info: PolishInfo): FileMap {
  if (files["index.html"] == null) return files;
  const pages = Object.keys(files).filter((p) => p.endsWith(".html"));
  const out: FileMap = { ...files, ...siteExtras(files, info) };
  for (const p of Object.keys(out)) if (p.endsWith(".html")) out[p] = polishPage(p, out[p], info, pages);
  return out;
}
