import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { HTMLElement, parse } from "node-html-parser";
import { isPrivateHost, isPublicAddress, makeSafeLookup } from "./net-guard";
import { cleanEmail, cleanPhone, cleanText, MAX_SITE_IMAGES, safeHttpsUrl, sanitizeContact } from "./site-details";
import type { SiteContact, SiteItem, SitePage, SiteSection, SiteSummary } from "./types";
import { channelIdFrom, feedVideos, isYoutubeChannel, MAX_VIDEOS, pageVideos, type SiteVideo } from "./site-media";

export { isPublicAddress };

/**
 * Website import: fetches a page (plus a few key pages on the same site) and
 * extracts the name, brand colors, headings and copy so the AI can build an
 * app based on a real business.
 *
 * Fetching arbitrary URLs from the server is an SSRF risk, so every
 * connection — including each redirect hop — is checked at DNS-resolution
 * time and refused if it points at a private, loopback or link-local address.
 */

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_EXTRA_PAGES = 5;
const PAGE_TEXT_CHARS = 5_000;
/** Section limits: enough to keep every section of a page, word for word. */
const MAX_SECTIONS = 30;
const SECTION_TEXT_CHARS = 2_500;
const PAGE_SECTIONS_CHARS = 9_000;
const SECTION_IMAGES = 4;

export class SiteError extends Error {}

/** Tests run the importer against a local fixture server. */
const allowPrivate = () => process.env.APPMAKER_ALLOW_PRIVATE_URLS === "1";

export function normalizeUrl(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new SiteError("Enter a website address.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SiteError("That doesn't look like a valid website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SiteError("Only http and https websites can be imported.");
  if (url.username || url.password) throw new SiteError("Website addresses with credentials aren't supported.");
  if (!allowPrivate()) {
    if (url.port && url.port !== "80" && url.port !== "443") throw new SiteError("Only websites on standard ports can be imported.");
    if (isPrivateHost(url)) {
      throw new SiteError("That address points to a private network and can't be imported.");
    }
  }
  url.hash = "";
  return url;
}

const safeLookup = makeSafeLookup(allowPrivate);

interface Fetched {
  url: URL;
  html: string;
}

function request(url: URL): Promise<{ status: number; location?: string; type: string; body: string; bytes?: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AppmakerBot/1.0; +https://appmaker.dev)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: "" });
        }
        const encoding = String(res.headers["content-encoding"] ?? "");
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            return resolve({ status, type, body: Buffer.concat(chunks).toString("utf8") });
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? "utf-8";
          let body: string;
          try {
            body = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            body = Buffer.concat(chunks).toString("utf8");
          }
          resolve({ status, type, body, bytes: Buffer.concat(chunks) });
        });
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
  });
}

async function fetchHtml(start: URL): Promise<Fetched> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await request(url);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EBLOCKED") throw new SiteError("That address points to a private network and can't be imported.");
      if (code === "ETIMEDOUT") throw new SiteError("The website took too long to respond.");
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new SiteError("That website couldn't be found. Check the address.");
      throw new SiteError("Couldn't connect to that website.");
    }
    if (res.location) {
      url = normalizeUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SiteError("That website blocks automated access. Try describing it instead.");
    if (res.status >= 400) throw new SiteError(`The website returned an error (HTTP ${res.status}).`);
    if (res.type && !/html|xml/i.test(res.type)) throw new SiteError("That link isn't a web page.");
    return { url, html: res.body };
  }
  throw new SiteError("The website redirected too many times.");
}

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

function meta(root: HTMLElement, ...names: string[]): string {
  for (const n of names) {
    const el = root.querySelector(`meta[property="${n}"]`) ?? root.querySelector(`meta[name="${n}"]`);
    const v = clean(el?.getAttribute("content"));
    if (v) return v;
  }
  return "";
}

// #rgb, #rgba, #rrggbb and #rrggbbaa (the alpha is dropped).
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;

function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length <= 5 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h.slice(0, 7);
}

/** Rough "is this a brand color" test: not near-white, near-black or gray. */
function isBrandish(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min > 40 && max > 40 && min < 235;
}

const RGB = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;
const HSL = /hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/gi;

function hslToHex(h: number, s: number, l: number): string {
  const a = (Math.min(100, s) / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Colour palettes that platforms put on every site whether it uses them or not
 * (WordPress's preset colours and gradients, with its "vivid purple"; Elementor's
 * untouched defaults). Counting them made many sites look purple.
 */
const PLATFORM_DEFAULTS = /--wp--preset--[\w-]+\s*:[^;}]*;?|\.has-[\w-]+-(?:color|background-color|gradient-background|border-color)\s*\{[^}]*\}/gi;
const BARE_VAR = /(--[\w-]+)\s*:\s*([-\d.,%\sdeg]+?)\s*(?=[;}])/gi;
const ELEMENTOR_DEFAULTS = new Set(["#6ec1e4", "#54595f", "#7a7a7a", "#61ce70"]);

/** Every hex or rgb() colour in some text, as #rrggbb. */
function colorsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HEX)) out.push(expandHex(m[0]));
  for (const m of text.matchAll(RGB)) {
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)));
    out.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
  }
  for (const m of text.matchAll(HSL)) out.push(hslToHex(((Number(m[1]) % 360) + 360) % 360, Number(m[2]), Number(m[3])));
  return out;
}

/** Selectors and variables that carry the brand: buttons, calls to action, links, the header. */
const BRAND_SELECTOR = /\b(button|btn|cta|primary|accent|brand|nav|header|hero|a:hover|link)\b/i;
const BRAND_VAR = /--[\w-]*(primary|brand|accent|main|theme|cta|secondary)[\w-]*\s*:\s*([^;}]+)/gi;

/**
 * The site's brand colours, best first. Weighted by where they appear: the
 * theme colour, the logo (SVG), colour variables named brand/primary/accent,
 * and button, call-to-action and header rules count far more than the rest.
 */
export function extractColors(root: HTMLElement, themeColor: string, extra: { css?: string; logoSvg?: string; logoColors?: string[] } = {}): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string, weight: number) => {
    if (isBrandish(hex) && !ELEMENTOR_DEFAULTS.has(hex)) counts.set(hex, (counts.get(hex) ?? 0) + weight);
  };
  const css = [...root.querySelectorAll("style").map((s) => s.text), extra.css ?? ""]
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(PLATFORM_DEFAULTS, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const weight = BRAND_SELECTOR.test(m[1]) ? 4 : 1;
    for (const c of colorsIn(m[2])) add(c, weight);
  }
  for (const m of css.matchAll(BRAND_VAR)) for (const c of colorsIn(m[2])) add(c, 6);
  // Shopify, Squarespace and Wix keep colours in variables as bare numbers:
  // "--color-accent: 18, 52, 200" or "--accent-hsl: 205.71, 57.14%, 41%".
  for (const m of css.matchAll(BARE_VAR)) {
    const [name, value] = [m[1], m[2].trim()];
    const weight = /primary|brand|accent|main|theme|cta|button|link|secondary/i.test(name) ? 6 : 1;
    const rgb = /^(\d{1,3})\s*,?\s+?(\d{1,3})\s*,?\s+?(\d{1,3})$/.exec(value) ?? /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(value);
    const hsl = /^(-?[\d.]+)(?:deg)?\s*[\s,]\s*([\d.]+)%\s*[\s,]\s*([\d.]+)%$/.exec(value);
    if (rgb) add(`#${[rgb[1], rgb[2], rgb[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("")}`, weight);
    else if (hsl) add(hslToHex(((Number(hsl[1]) % 360) + 360) % 360, Number(hsl[2]), Number(hsl[3])), weight);
  }
  // The logo picture's own colours count most of all.
  (extra.logoColors ?? []).forEach((c, i) => add(c, 14 - i * 3));
  for (const el of root.querySelectorAll("[style]")) {
    const weight = el.closest("button, a, header, nav, .btn, .button") ? 3 : 1;
    for (const c of colorsIn((el.getAttribute("style") ?? "").replace(PLATFORM_DEFAULTS, ""))) add(c, weight);
  }
  // The logo: an SVG file, or an inline SVG in the header.
  const inlineLogo = root.querySelectorAll("header svg, [class*=logo] svg, a[class*=brand] svg").map((el) => el.toString()).join("\n");
  for (const c of colorsIn(`${extra.logoSvg ?? ""}\n${inlineLogo}`)) add(c, 8);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const themeHex = colorsIn(themeColor)[0];
  return [...new Set([themeHex && isBrandish(themeHex) ? themeHex : "", ...ranked].filter(Boolean))].slice(0, 6);
}

/**
 * The main colours of a logo picture (PNG, JPG, WebP, GIF or ICO), best first:
 * opaque, non-grey pixels grouped into similar colours. One small image, decoded
 * on the server; [] when it can't be read.
 */
export async function logoImageColors(bytes: Buffer): Promise<string[]> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(bytes, { limitInputPixels: 25_000_000 })
      .resize(64, 64, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 160) continue;
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      if (!isBrandish(hex)) continue;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const t = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, { n: t.n + 1, r: t.r + r, g: t.g + g, b: t.b + b });
    }
    const total = [...buckets.values()].reduce((sum, t) => sum + t.n, 0);
    return [...buckets.values()]
      .filter((t) => t.n >= Math.max(3, total * 0.04))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((t) => `#${[t.r, t.g, t.b].map((v) => Math.round(v / t.n).toString(16).padStart(2, "0")).join("")}`);
  } catch {
    return [];
  }
}

/** A picture (the logo or the site icon) as bytes, or null. */
async function fetchSmallImage(url: URL): Promise<Buffer | null> {
  try {
    let res = await request(url);
    if (res.location && res.status >= 300 && res.status < 400) res = await request(new URL(res.location, url));
    if (res.status !== 200 || !res.bytes?.length || res.bytes.length >= MAX_BYTES || /text\/html/i.test(res.type)) return null;
    return res.bytes;
  } catch {
    return null;
  }
}

/** A small text file (a stylesheet or an SVG logo), or "" when it can't be read. */
async function fetchSmallText(url: URL): Promise<string> {
  try {
    let res = await request(url);
    // One redirect (stylesheets and logos often move to a CDN).
    if (res.location && res.status >= 300 && res.status < 400) res = await request(new URL(res.location, url));
    // Big stylesheets arrive cut at the size limit; their start still has the colours.
    if (res.status !== 200) return "";
    return res.body;
  } catch {
    return "";
  }
}

/** The site's biggest icon (apple-touch-icon first), usually the logo mark in brand colours. */
function iconUrl(root: HTMLElement, base: URL): string | undefined {
  const links = root.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"]');
  const size = (l: HTMLElement) => Number(/(\d+)/.exec(l.getAttribute("sizes") ?? "")?.[1] ?? (/apple/.test(l.getAttribute("rel") ?? "") ? 180 : 16));
  const best = links.sort((a, b) => size(b) - size(a))[0]?.getAttribute("href");
  try {
    const u = best ? new URL(best, base) : null;
    return u && /^https?:$/.test(u.protocol) && !/\.svg(\?|$)/i.test(u.pathname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Up to three of the site's own stylesheets, where most brand colours live. */
function stylesheetUrls(root: HTMLElement, base: URL): URL[] {
  return root
    .querySelectorAll('link[rel~="stylesheet"]')
    .map((l) => {
      try {
        return new URL(l.getAttribute("href") ?? "", base);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => !!u && /^https?:$/.test(u.protocol) && !/fonts\.googleapis|cdn\.jsdelivr|unpkg|cdnjs/.test(u.hostname))
    // The theme's own stylesheets first: WordPress core and plugin files hold no brand colours.
    .sort((a, b) => Number(/wp-includes|\/plugins\//.test(a.pathname)) - Number(/wp-includes|\/plugins\//.test(b.pathname)))
    .slice(0, 5);
}

/** A content picture's address (src, lazy-loading attributes or srcset), or null for logos, icons and trackers. */
function imageUrl(img: HTMLElement, base: URL): string | null {
  // A <picture>'s best <source> wins over its fallback <img>; lazy loaders keep the real
  // address in data-* attributes while src holds a tiny placeholder.
  const source = img.parentNode && (img.parentNode as HTMLElement).tagName === "PICTURE" ? (img.parentNode as HTMLElement).querySelector("source[srcset]") : null;
  const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || fromSrcset(img.getAttribute("data-srcset") ?? img.getAttribute("data-lazy-srcset"));
  const plain = img.getAttribute("src");
  const src =
    lazy ||
    fromSrcset(source?.getAttribute("srcset")) ||
    (plain && !/^data:/i.test(plain) ? plain : undefined) ||
    fromSrcset(img.getAttribute("srcset"));
  const url = absolute(src, base, true);
  if (!url || /\.(svg|gif|ico)(\?|$)/i.test(url) || JUNK_IMAGE.test(url)) return null;
  const w = Number(img.getAttribute("width")) || 0;
  const h = Number(img.getAttribute("height")) || 0;
  if ((w && w < 64) || (h && h < 64)) return null;
  return url;
}

const BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd, td, img, div, [style*=background], [data-bg], [data-background-image], [data-background], [data-image]";
/** Elements that hold other text blocks: their own text is read through those. */
const HOLDS_BLOCKS = "p, li, blockquote, h1, h2, h3, h4, h5, h6, div, section, article, ul, ol, table, figure, dl";
/** A background picture set in a style or by a lazy loader (common in page builders). */
function backgroundUrl(el: HTMLElement, base: URL): string | null {
  const attr = el.getAttribute("data-bg") || el.getAttribute("data-background-image") || el.getAttribute("data-background") || el.getAttribute("data-image") || /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(el.getAttribute("style") ?? "")?.[1];
  const url = absolute(attr?.replace(/^url\(\s*['"]?|['"]?\s*\)$/g, ""), base, true);
  return url && !/\.(svg|gif|ico)(\?|$)/i.test(url) && !JUNK_IMAGE.test(url) && !/logo/i.test(url) ? url : null;
}
const SKIP_AREAS = "nav, footer, script, style, noscript, template, form, [aria-hidden=true], .cookie, #cookie, [class*=cookie]";

/**
 * The page's sections in reading order: each heading starts one, and the
 * paragraphs, list items and pictures after it belong to it. Text is kept word
 * for word so the redesign can keep it.
 */
function extractSections(body: HTMLElement, base: URL): SiteSection[] {
  const sections: SiteSection[] = [];
  let current: SiteSection = { heading: "", text: "", images: [] };
  let budget = PAGE_SECTIONS_CHARS;
  const seenText = new Set<string>();
  const push = () => {
    if (current.heading || current.text || current.images.length) sections.push(current);
  };
  for (const el of body.querySelectorAll(BLOCKS)) {
    if (sections.length >= MAX_SECTIONS) break;
    if (el.closest(SKIP_AREAS)) continue;
    const tag = el.tagName.toLowerCase();
    const addImage = (url: string | null) => {
      if (url && current.images.length < SECTION_IMAGES && !current.images.includes(url)) current.images.push(url);
    };
    if (tag === "img") {
      const url = imageUrl(el, base);
      const label = `${url} ${el.getAttribute("alt") ?? ""} ${el.getAttribute("class") ?? ""}`;
      if (!/logo/i.test(label)) addImage(url);
      continue;
    }
    addImage(backgroundUrl(el, base));
    const heading = /^h[1-6]$/.test(tag) || el.getAttribute("role") === "heading";
    // Only the innermost text blocks (a paragraph inside a list item is read once);
    // a <div> counts only when it holds text directly (page builders often skip <p>).
    if (!heading && el.querySelector(HOLDS_BLOCKS)) continue;
    if (tag !== "div" && !heading && !/^(p|li|blockquote|figcaption|dt|dd|td|h5|h6)$/.test(tag)) continue;
    if (tag === "div" && (el.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, td, dd, figcaption, a, button") || el.querySelector("img"))) continue;
    const t = clean(el.text);
    if (!t || (tag === "div" && t.length < 25)) continue;
    if (heading && !/^h[56]$/.test(tag)) {
      if (t.length > 160) continue;
      // Pictures just before a heading with no text of their own (a section's background
      // or banner) belong to that heading's section.
      const lead = !current.heading && !current.text ? current.images : [];
      if (!lead.length) push();
      current = { heading: t, text: "", images: lead };
      continue;
    }
    if (seenText.has(t) || budget <= 0) continue;
    seenText.add(t);
    const line = (tag === "li" || tag === "dd" ? `- ${t}` : t).slice(0, Math.min(budget, SECTION_TEXT_CHARS - current.text.length));
    if (!line) continue;
    current.text = current.text ? `${current.text}\n${line}` : line;
    budget -= line.length;
  }
  push();
  return sections.slice(0, MAX_SECTIONS);
}

function extractPage(root: HTMLElement, url: URL): SitePage {
  const headings = root
    .querySelectorAll("h1, h2, h3")
    .map((h) => clean(h.text))
    .filter((h) => h && h.length < 140);
  const nav = root
    .querySelectorAll("nav a")
    .map((a) => clean(a.text))
    .filter((t) => t && t.length < 40);
  const body = root.querySelector("main") ?? root.querySelector("body") ?? root;
  const sections = extractSections(root.querySelector("body") ?? root, url);
  body.querySelectorAll("script, style, noscript, svg, iframe, template, form, [aria-hidden=true]").forEach((el) => el.remove());
  // With sections, the plain text is only a short fallback (the sections carry it all).
  const text = clean(body.structuredText).slice(0, sections.length ? 1_500 : PAGE_TEXT_CHARS);
  return {
    url: url.toString(),
    title: clean(root.querySelector("title")?.text).slice(0, 120),
    headings: [...new Set(headings)].slice(0, 25),
    navigation: [...new Set(nav)].slice(0, 20),
    text,
    ...(sections.length ? { sections } : {}),
  };
}

// ---------------------------------------------------------------------------
// Photos and contact details

const BOOKING_HOSTS =
  /(^|\.)(calendly|booksy|fresha|vagaro|opentable|resy|setmore|acuityscheduling|mindbodyonline|treatwell|schedulicity|exploretock|sevenrooms|squareup|square\.site|toasttab|ubereats|doordash|grubhub|deliveroo|zenoti|simplybook|youcanbook|appointy|glossgenius|styleseat)\./i;
const BOOKING_TEXT = /\b(book|booking|reserve|reservations?|appointments?|order online|order now|schedule)\b/i;
const SOCIAL_HOSTS = /^(www\.)?(instagram|facebook|tiktok|twitter|x|youtube|linkedin|pinterest)\.com$/i;
const MAPS_LINK = /(google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com)/i;
const JUNK_IMAGE = /(pixel|spacer|tracking|sprite|blank|placeholder|loader|lazy|1x1|gravatar|badge|payment|flag)/i;

interface Details {
  videos: SiteVideo[];
  logos: string[];
  clientLogos: { src: string; alt: string }[];
  images: string[];
  contact: Partial<SiteContact> & { phones: string[]; emails: string[]; hours: string[]; social: string[] };
  items: SiteItem[];
}

function absolute(href: string | undefined, base: URL, picture = false): string | null {
  if (!href || href.startsWith("data:")) return null;
  try {
    const u = new URL(href.trim(), base);
    // Older sites serve pictures over plain http, which https pages can't show: ask for
    // https (most hosts have it). checkImages() later fetches any that only work over http.
    // Links stay as they are (an http link is dropped, as before).
    if (picture && u.protocol === "http:") u.protocol = "https:";
    return safeHttpsUrl(u.toString());
  } catch {
    return null;
  }
}

/** The largest image in a srcset. */
function fromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const parts = srcset.split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
  return parts[parts.length - 1];
}

function readJsonLd(root: HTMLElement, add: (o: Record<string, unknown>) => void) {
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.slice(0, 20).forEach((x) => visit(x, depth + 1));
    const o = v as Record<string, unknown>;
    add(o);
    if (o["@graph"]) visit(o["@graph"], depth + 1);
  };
  for (const script of root.querySelectorAll('script[type="application/ld+json"]').slice(0, 10)) {
    try {
      visit(JSON.parse(script.text), 0);
    } catch {
      /* ignore broken structured data */
    }
  }
}

const LOGO_AREA = /(client|partner|brand|logo|trust|customer|sponsor|carousel|slider|marquee|swiper|accredit|award|featured|press|certif|member)/i;
const LOGO_HEADING = /\b(clients?|partners?|trusted by|brands?|as seen|featured (in|on)|our customers|accredit\w*|certifi\w*|(we('ve)?|who we('ve)?) work(ed)? with|sponsors?|members? of|awards?|in the press)\b/i;
const MAX_CLIENT_LOGOS = 24;

/**
 * Logos of clients, partners, press and certifications: a group of at least three
 * pictures in an area named like a logo strip, or under a heading such as
 * "Trusted by" or "Our clients". SVG files count (logos often are).
 */
function extractClientLogos(root: HTMLElement, base: URL): { src: string; alt: string }[] {
  const found = new Map<string, string>();
  const header = new Set(root.querySelectorAll("header img, nav img").map((i) => i.getAttribute("src") ?? ""));
  const groups = root.querySelectorAll("section, div, ul").filter((el) => {
    if (el.closest("header, nav, footer") && !LOGO_HEADING.test(el.querySelector("h2, h3, h4, p")?.text ?? "")) return false;
    const named = LOGO_AREA.test(`${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`);
    const heading = el.querySelector("h2, h3, h4, h5, p");
    return named || (!!heading && LOGO_HEADING.test(clean(heading.text).slice(0, 80)));
  });
  for (const group of groups) {
    const imgs = group.querySelectorAll("img");
    // A logo strip is a row of small pictures, not a gallery of photos or one big image.
    if (imgs.length < 3 || imgs.length > 60) continue;
    for (const img of imgs) {
      if (header.has(img.getAttribute("src") ?? "")) continue;
      const src = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || fromSrcset(img.getAttribute("srcset") ?? undefined);
      const url = absolute(src && !/^data:/i.test(src) ? src : undefined, base, true);
      if (!url || JUNK_IMAGE.test(url.replace(/logo/gi, "")) || /\.(gif|ico)(\?|$)/i.test(url)) continue;
      const w = Number(img.getAttribute("width")) || 0;
      if (w && w < 24) continue;
      const alt = clean(img.getAttribute("alt") || img.getAttribute("title") || "")
        .replace(/\s*(logo|icon)$/i, "")
        .slice(0, 80);
      if (!found.has(url)) found.set(url, alt);
      if (found.size >= MAX_CLIENT_LOGOS) break;
    }
    if (found.size >= MAX_CLIENT_LOGOS) break;
  }
  return found.size >= 3 ? [...found].map(([src, alt]) => ({ src, alt })) : [];
}

const IMAGE_FILE = /\.(?:jpe?g|png|webp|avif)(?:[?#][^\s"'()<>]*)?$/i;
/** Thumbnails (WordPress -150x150), icons and sprites aren't photos worth reusing. */
const NOT_A_PHOTO = /(-\d{2,3}x\d{2,3}\.\w+$)|icon|sprite|favicon|avatar|emoji|spinner|arrow|button|badge/i;
/** Image addresses from the big site builders' CDNs, as they appear in page data (Wix, Squarespace, Shopify, WordPress). */
const BUILDER_IMAGE = /https?:\/\/(?:static\.wixstatic\.com\/media|images\.squarespace-cdn\.com|cdn\.shopify\.com\/s\/files|[a-z0-9.-]+\/wp-content\/uploads)\/[^\s"'<>\\)]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>\\)]*)?/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

function photo(url: string | null): url is string {
  if (!url) return false;
  const path = url.split(/[?#]/)[0];
  return IMAGE_FILE.test(path) && !JUNK_IMAGE.test(path) && !NOT_A_PHOTO.test(path.split("/").pop() ?? "");
}

/** Background pictures in a stylesheet, resolved against the stylesheet's own address. */
/** 79. Hosts and paths that serve tracking pixels and ads, not pictures. */
const TRACKING = /[/.](doubleclick\.net|google-analytics\.com|googletagmanager\.com|googlesyndication\.com|googleadservices\.com|facebook\.com\/tr|bat\.bing\.com|analytics\.|pixel\.|adservice\.|scorecardresearch\.com|quantserve\.com|hotjar\.com|clarity\.ms)|\/(pixel|beacon|tracking)(\.gif|\.png|\/|\?)|[?&](utm_|fbclid=)|\b1x1\.(gif|png)/i;

/** The size a page builder or CDN put in a picture's address (0 for none, which is usually the original). */
function sizeIn(url: string): { key: string; size: number } {
  let size = 0;
  const key = url
    // WordPress and most builders: photo-800x600.jpg
    .replace(/-(\d{2,4})x(\d{2,4})(?=\.\w{3,4}(\?|$))/i, (_m, w: string) => ((size = Number(w)), ""))
    // Query sizes: ?w=800, ?width=800
    .replace(/([?&])(w|width|resize|size)=(\d{2,4})(&|$)/i, (_m, a: string, _k, w: string, b: string) => ((size = Math.max(size, Number(w))), b ? a : ""))
    .replace(/[?&]$/, "");
  return { key, size };
}

/**
 * 78–79. The site's pictures without tracking pixels, and with each picture once:
 * of the same photo at several sizes, the largest (or the original) is kept.
 */
export function tidyImages(urls: string[]): string[] {
  const best = new Map<string, { url: string; size: number; at: number }>();
  urls.forEach((url, at) => {
    if (TRACKING.test(url)) return;
    const { key, size } = sizeIn(url);
    const seen = best.get(key);
    const better = !seen || (seen.size !== 0 && (size === 0 || size > seen.size));
    if (better) best.set(key, { url, size, at: seen?.at ?? at });
  });
  return [...best.values()].sort((a, b) => a.at - b.at).map((b) => b.url);
}

export function cssImages(css: string, base: URL): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(CSS_URL)) {
    const url = absolute(m[1], base, true);
    if (photo(url) && !/logo/i.test(url)) out.push(url);
  }
  return out;
}

/**
 * Pictures that aren't plain <img> tags: <noscript> copies of lazy-loaded images,
 * <picture> sources, background images (inline styles, lazy-loader attributes and
 * <style> blocks), and image addresses in site builders' page data, which only
 * JavaScript turns into pictures.
 */
function hiddenImages(root: HTMLElement, base: URL): string[] {
  const out: string[] = [];
  for (const ns of root.querySelectorAll("noscript").slice(0, 60)) {
    for (const img of parse(ns.text || ns.innerHTML, { comment: false }).querySelectorAll("img")) {
      const url = imageUrl(img, base);
      if (photo(url) && !/logo/i.test(`${url} ${img.getAttribute("alt") ?? ""}`)) out.push(url);
    }
  }
  for (const source of root.querySelectorAll("picture source[srcset], picture source[data-srcset]").slice(0, 100)) {
    const url = absolute(fromSrcset(source.getAttribute("srcset") ?? source.getAttribute("data-srcset") ?? undefined), base, true);
    if (photo(url)) out.push(url);
  }
  for (const el of root.querySelectorAll("[style*=background], [data-bg], [data-background-image], [data-background], [data-image]").slice(0, 200)) {
    const url = backgroundUrl(el, base);
    if (photo(url)) out.push(url);
  }
  for (const style of root.querySelectorAll("style")) out.push(...cssImages(style.text, base));
  const raw = root.toString().slice(0, 1_500_000).replace(/\\\//g, "/");
  for (const m of raw.matchAll(BUILDER_IMAGE)) if (photo(m[0]) && !/logo/i.test(m[0])) out.push(m[0]);
  return [...new Set(out)];
}

function extractDetails(root: HTMLElement, base: URL): Details {
  const d: Details = { videos: pageVideos(root, base), logos: [], clientLogos: extractClientLogos(root, base), images: [], contact: { phones: [], emails: [], hours: [], social: [] }, items: [...structuredItems(root, base), ...priceListItems(root, base)] };
  const c = d.contact;

  for (const name of ["og:image", "og:image:secure_url", "twitter:image"]) {
    const url = absolute(meta(root, name), base, true);
    if (url) d.images.push(url);
  }
  const clients = new Set(d.clientLogos.map((l) => l.src));
  for (const img of root.querySelectorAll("img").slice(0, 200)) {
    const url = imageUrl(img, base);
    // Clients' logos are theirs, not the business's logo or its photos.
    if (!url || clients.has(url)) continue;
    const label = `${url} ${img.getAttribute("alt") ?? ""} ${img.getAttribute("class") ?? ""} ${img.getAttribute("id") ?? ""}`;
    if (/logo/i.test(label)) d.logos.push(url);
    else d.images.push(url);
  }

  // More of the site's own pictures, where page builders and lazy loaders hide them.
  for (const url of hiddenImages(root, base)) if (!clients.has(url) && !d.images.includes(url)) d.images.push(url);

  for (const a of root.querySelectorAll("a[href]").slice(0, 500)) {
    const href = (a.getAttribute("href") ?? "").trim();
    if (/^tel:/i.test(href)) {
      const phone = cleanPhone(decodeURIComponent(href));
      if (phone) c.phones.push(phone);
      continue;
    }
    if (/^mailto:/i.test(href)) {
      const email = cleanEmail(href);
      if (email) c.emails.push(email);
      continue;
    }
    const url = absolute(href, base);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (/(^|\.)(wa\.me|api\.whatsapp\.com|whatsapp\.com)$/i.test(host)) c.whatsapp ??= url;
    else if (MAPS_LINK.test(url)) c.maps ??= url;
    else if (SOCIAL_HOSTS.test(host)) c.social.push(url);
    else if (BOOKING_HOSTS.test(host) || (BOOKING_TEXT.test(clean(a.text)) && clean(a.text).length < 40)) c.booking ??= url;
  }

  readJsonLd(root, (o) => {
    const phone = cleanPhone(o.telephone);
    if (phone) c.phones.push(phone);
    const email = cleanEmail(o.email);
    if (email) c.emails.push(email);
    const logo = absolute(typeof o.logo === "string" ? o.logo : ((o.logo as { url?: string } | undefined)?.url ?? undefined), base);
    if (logo) d.logos.unshift(logo);
    const addr = o.address as Record<string, unknown> | string | undefined;
    if (!c.address && addr) {
      c.address =
        (typeof addr === "string"
          ? cleanText(addr, 200)
          : cleanText([addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter((x) => typeof x === "string").join(", "), 200)) ?? undefined;
    }
    const hours = o.openingHours;
    for (const h of Array.isArray(hours) ? hours : typeof hours === "string" ? [hours] : []) {
      const t = cleanText(h, 80);
      if (t) c.hours.push(t);
    }
    const specs = o.openingHoursSpecification;
    for (const spec of (Array.isArray(specs) ? specs : specs ? [specs] : []) as Record<string, unknown>[]) {
      const days = (Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek]).map((x) => String(x ?? "").replace(/^https?:\/\/schema\.org\//, "")).join(", ");
      const t = cleanText(`${days} ${spec.opens ?? ""}-${spec.closes ?? ""}`, 80);
      if (t && days) c.hours.push(t);
    }
    const map = absolute(typeof o.hasMap === "string" ? o.hasMap : undefined, base);
    if (map) c.maps ??= map;
  });
  return d;
}

/** Merges what was found on each page: the logo, photos, and each contact detail once. */
const MAX_ITEMS = 60;
// "$11", "£3.50", "12,50 €" (a sign before a number belongs to that number: "Under 12 $18" is $18).
const PRICE = /(?:[$£€]\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:[$£€](?!\s?\d)|(?:EUR|USD|GBP)\b))/;

const itemText = (v: unknown, max: number) => (typeof v === "string" ? cleanText(v, max) ?? "" : "");

/** "12.5" with "GBP" → "£12.50"; text prices stay as they are. */
function itemPrice(price: unknown, currency: unknown): string {
  const p = typeof price === "number" ? String(price) : typeof price === "string" ? price.trim() : "";
  if (!p) return "";
  const sign = ({ USD: "$", GBP: "£", EUR: "€" } as Record<string, string>)[String(currency ?? "").toUpperCase()] ?? "";
  return /^\d+(\.\d+)?$/.test(p) ? `${sign}${Number(p) % 1 ? Number(p).toFixed(2) : p}` : p.slice(0, 24);
}

/** Menu items, products and services from the page's schema.org data (Menu → sections → items, Product, Service). */
function structuredItems(root: HTMLElement, base: URL): SiteItem[] {
  const out: SiteItem[] = [];
  const walk = (v: unknown, category: string, depth: number) => {
    if (depth > 8 || !v || typeof v !== "object" || out.length >= MAX_ITEMS) return;
    if (Array.isArray(v)) return v.slice(0, 100).forEach((x) => walk(x, category, depth + 1));
    const o = v as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (types.some((t) => /^(MenuItem|Product|Service|Offer)$/.test(t)) && typeof o.name === "string") {
      const offer = ([] as unknown[]).concat(o.offers ?? [])[0] as Record<string, unknown> | undefined;
      const img = ([] as unknown[]).concat(o.image ?? [])[0];
      const image = absolute(typeof img === "string" ? img : ((img as { url?: string } | undefined)?.url ?? undefined), base, true);
      const name = itemText(o.name, 60);
      if (name)
        out.push({
          name,
          description: itemText(o.description, 140),
          price: itemPrice(offer?.price ?? o.price, offer?.priceCurrency ?? o.priceCurrency),
          category: category.slice(0, 40),
          ...(image ? { image } : {}),
        });
    }
    const section = types.includes("MenuSection") && typeof o.name === "string" ? itemText(o.name, 40) : category;
    for (const k of ["@graph", "hasMenu", "hasMenuSection", "hasMenuItem", "itemListElement", "item", "makesOffer", "itemOffered", "hasOfferCatalog"]) walk(o[k], section, depth + 1);
  };
  for (const script of root.querySelectorAll('script[type="application/ld+json"]').slice(0, 10)) {
    try {
      walk(JSON.parse(script.text), "", 0);
    } catch {
      /* ignore broken structured data */
    }
  }
  return out;
}

/**
 * Price lists written in the page: the smallest blocks (list items, rows, cards) holding one
 * name and one price, like "Margherita — tomato, basil  $11". Their heading is the category.
 */
function priceListItems(root: HTMLElement, base: URL): SiteItem[] {
  const out: SiteItem[] = [];
  const blocks = root.querySelectorAll("li, tr, article, div, p, dd, h2, h3, h4, h5, h6").filter((el) => {
    if (el.closest("header, nav, footer, form, script, style")) return false;
    const t = clean(el.text);
    if (t.length < 4 || t.length > 220 || (t.match(new RegExp(PRICE.source, "g")) ?? []).length !== 1) return false;
    // The smallest block: none of its children is a whole item by itself.
    return !el.childNodes.some((c) => c instanceof HTMLElement && PRICE.test(clean(c.text)) && clean(c.text).length > clean(c.text).match(PRICE)![0].length + 2);
  });
  for (const el of blocks.slice(0, 200)) {
    const t = clean(el.text);
    const price = t.match(PRICE)![0].replace(/\s+/g, "");
    const named = el.querySelector("h3, h4, h5, h6, strong, b, dt, [class*=name], [class*=title]");
    let name = named ? clean(named.text).replace(PRICE, "").trim() : "";
    let rest = t.replace(PRICE, " ").replace(/\s+/g, " ").trim();
    if (!name) [name, rest] = [rest.split(/\s[-–—|·:]\s|\.\s/)[0], rest.split(/\s[-–—|·:]\s|\.\s/).slice(1).join(" — ")];
    else rest = rest.replace(name, "").replace(/^[\s\-–—|·:,.]+|[\s\-–—|·:,.]+$/g, "");
    name = name.replace(/[\s\-–—|·:,.]+$/, "").slice(0, 60);
    if (name.length < 2 || name.split(" ").length > 8 || /^(from|only|save|total|subtotal|delivery|free)\b/i.test(name)) continue;
    // The nearest heading before it names its category ("Pizzas", "Haircuts").
    let category = "";
    for (let prev: HTMLElement | null = el; prev && !category; prev = prev.parentNode as HTMLElement | null) {
      let sib = prev.previousElementSibling;
      for (let i = 0; sib && i < 30 && !category; i++, sib = sib.previousElementSibling) {
        const h = /^H[2-4]$/.test(sib.tagName) ? sib : sib.querySelector("h2, h3, h4");
        // An item written as a heading ("Tiramisu — $9") isn't a category.
        if (h && !PRICE.test(clean(h.text))) category = clean(h.text).slice(0, 40);
      }
    }
    const img = el.querySelector("img");
    const image = img ? imageUrl(img, base) : null;
    out.push({ name, description: rest.slice(0, 140), price, category, ...(image ? { image } : {}) });
    if (out.length >= MAX_ITEMS) break;
  }
  // A page with only one or two prices is probably not a price list.
  return out.length >= 3 ? out : [];
}

function mergeDetails(all: Details[]): {
  logo?: string;
  images: string[];
  contact?: SiteContact;
  clientLogos?: { src: string; alt: string }[];
  videos?: SiteVideo[];
  items?: SiteItem[];
} {
  const videos = all.flatMap((d) => d.videos).filter((v, i, arr) => arr.findIndex((w) => w.kind === v.kind && w.id === v.id) === i).slice(0, MAX_VIDEOS);
  const logo = all.flatMap((d) => d.logos)[0];
  const seenLogos = new Set<string>();
  const clientLogos = all
    .flatMap((d) => d.clientLogos)
    .filter((l) => l.src !== logo && !seenLogos.has(l.src) && seenLogos.add(l.src))
    .slice(0, MAX_CLIENT_LOGOS);
  const images = tidyImages([...new Set(all.flatMap((d) => d.images))].filter((u) => u !== logo)).slice(0, MAX_SITE_IMAGES);
  const c = all.map((d) => d.contact);
  const pick = <K extends "address" | "whatsapp" | "booking" | "maps">(k: K) => c.find((x) => x[k])?.[k];
  const contact = sanitizeContact({
    phones: c.flatMap((x) => x.phones),
    emails: c.flatMap((x) => x.emails),
    hours: c.flatMap((x) => x.hours),
    social: c.flatMap((x) => x.social),
    address: pick("address"),
    whatsapp: pick("whatsapp"),
    booking: pick("booking"),
    maps: pick("maps"),
  });
  const seenItems = new Set<string>();
  const items = all
    .flatMap((d) => d.items)
    .filter((i) => !seenItems.has(i.name.toLowerCase()) && seenItems.add(i.name.toLowerCase()))
    .slice(0, MAX_ITEMS);
  return {
    ...(logo ? { logo } : {}),
    images,
    ...(contact ? { contact } : {}),
    ...(clientLogos.length ? { clientLogos } : {}),
    ...(videos.length ? { videos } : {}),
    ...(items.length ? { items } : {}),
  };
}

const KEY_PAGES = /(about|menu|service|product|pricing|price|plan|feature|shop|store|collection|course|class|program|team|faq|work|portfolio|book|reserv|order)/i;

function pickExtraPages(root: HTMLElement, base: URL): URL[] {
  const seen = new Set<string>([base.toString()]);
  const scored: { url: URL; score: number }[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    let u: URL;
    try {
      u = new URL(a.getAttribute("href")!, base);
    } catch {
      continue;
    }
    u.hash = "";
    u.search = "";
    if (u.origin !== base.origin || seen.has(u.toString())) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3)$/i.test(u.pathname)) continue;
    if (/(login|signin|sign-in|cart|checkout|account|privacy|terms|cookie|legal)/i.test(u.pathname)) continue;
    seen.add(u.toString());
    const label = `${u.pathname} ${clean(a.text)}`;
    const score = (KEY_PAGES.test(label) ? 10 : 0) + (a.closest("nav, header") ? 3 : 0) - u.pathname.split("/").length;
    if (score > 0) scored.push({ url: u, score });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, MAX_EXTRA_PAGES)
    .map((s) => s.url);
}

function firstParagraph(root: HTMLElement): string {
  for (const p of root.querySelectorAll("main p, p").slice(0, 40)) {
    if (p.closest("header, nav, footer, form, [class*=cookie], [id*=cookie]")) continue;
    const t = clean(p.text);
    if (t.length >= 50 && !/cookie|javascript|©|copyright/i.test(t)) return t.length > 200 ? `${t.slice(0, 200).replace(/\s\S*$/, "")}…` : t;
  }
  return "";
}

export function summarizeHtml(html: string, url: URL): { summary: Omit<SiteSummary, "pages">; page: SitePage; extra: URL[]; details: Details } {
  const root = parse(html, { comment: false });
  // Before extractPage, which removes scripts (structured data lives in one).
  const details = extractDetails(root, url);
  const themeColor = meta(root, "theme-color");
  const title = clean(root.querySelector("title")?.text);
  const siteName = meta(root, "og:site_name", "application-name") || title.split(/\s[|\-–—·]\s/)[0] || url.hostname.replace(/^www\./, "");
  const summary = {
    url: url.toString(),
    siteName: siteName.slice(0, 60),
    title: title.slice(0, 160),
    // 80. Without a description, the first real paragraph says what the business does.
    description: (meta(root, "description", "og:description") || firstParagraph(root)).slice(0, 400),
    colors: extractColors(root, themeColor),
    language: clean(root.querySelector("html")?.getAttribute("lang")).slice(0, 10),
  };
  const extra = pickExtraPages(root, url);
  return { summary, page: extractPage(root, url), extra, details };
}

export async function importSite(input: string): Promise<SiteSummary> {
  const start = normalizeUrl(input);
  const first = await fetchHtml(start);
  const { summary, page, extra, details } = summarizeHtml(first.html, first.url);
  const pages: SitePage[] = [page];
  const found = [details];
  const results = await Promise.allSettled(extra.map((u) => fetchHtml(u)));
  for (const r of results) {
    if (r.status === "fulfilled") {
      const more = summarizeHtml(r.value.html, r.value.url);
      pages.push(more.page);
      found.push(more.details);
    }
  }
  if (!pages.some((p) => p.text.length > 40 || p.headings.length)) {
    throw new SiteError("That website has almost no readable text (it may need JavaScript to load). Try describing it instead.");
  }
  const merged = mergeDetails(found);
  // Brand colours from the stylesheets and the logo too.
  const root = parse(first.html, { comment: false });
  // A logo picture (or, without one, the site's own icon) is decoded for its colours.
  const isSvg = !!merged.logo && /\.svg(\?|$)/i.test(merged.logo);
  const picture = merged.logo && !isSvg ? merged.logo : iconUrl(root, first.url);
  const [css, logoSvg, logoColors] = await Promise.all([
    Promise.all(stylesheetUrls(root, first.url).map(async (u) => ({ url: u, text: await fetchSmallText(u) }))),
    isSvg ? fetchSmallText(new URL(merged.logo!)) : Promise.resolve(""),
    picture ? fetchSmallImage(new URL(picture)).then((b) => (b ? logoImageColors(b) : [])) : Promise.resolve([] as string[]),
  ]);
  const colors = extractColors(root, meta(root, "theme-color"), { css: css.map((c) => c.text).join("\n"), logoSvg, logoColors });
  // Background photos set in the stylesheets (often the hero), after the page's own pictures.
  const fromCss = css.flatMap((c) => cssImages(c.text, c.url)).filter((u) => u !== merged.logo && !(merged.clientLogos ?? []).some((l) => l.src === u));
  const images = tidyImages([...new Set([...merged.images, ...fromCss])]).slice(0, MAX_SITE_IMAGES);
  const videos = [...(merged.videos ?? []), ...(await channelVideos(merged.contact?.social ?? []))]
    .filter((v, i, arr) => arr.findIndex((w) => w.kind === v.kind && w.id === v.id) === i)
    .slice(0, MAX_VIDEOS);
  return { ...summary, colors: colors.length ? colors : summary.colors, pages, ...merged, images, ...(videos.length ? { videos } : {}) };
}

/** The latest uploads of the business's YouTube channel (from its public RSS feed), when the site links to it. */
async function channelVideos(social: string[]): Promise<SiteVideo[]> {
  const channel = social.find(isYoutubeChannel);
  if (!channel) return [];
  try {
    const url = new URL(channel);
    const id = channelIdFrom(channel, /\/channel\/UC/.test(url.pathname) ? "" : await fetchSmallText(url));
    if (!id) return [];
    return feedVideos(await fetchSmallText(new URL(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Making sure each picture can be shown

export interface LocalImage {
  /** Where it lives in the new site, e.g. images/site-1.jpg. */
  path: string;
  /** The address it came from. */
  from: string;
  width: number;
  height: number;
  dataUrl: string;
}

const IMAGE_TYPE = /^image\/(jpeg|png|webp|avif|gif)/i;

async function fetchImageBytes(url: URL): Promise<{ bytes: Buffer; type: string } | null> {
  try {
    let res = await request(url);
    for (let i = 0; i < 2 && res.location && res.status >= 300 && res.status < 400; i++) res = await request(new URL(res.location, url));
    if (res.status !== 200 || !res.bytes?.length || res.bytes.length >= MAX_BYTES || !IMAGE_TYPE.test(res.type)) return null;
    return { bytes: res.bytes, type: res.type };
  } catch {
    return null;
  }
}

/**
 * Checks that each picture of a website redesign can really be shown. Those that
 * load over https stay links (the browser loads them, no copies kept). Those that
 * only load over plain http are fetched and kept with the project as small JPEGs
 * (pages on https can't show http pictures). Those that don't load are dropped.
 */
export async function checkImages(urls: string[], max = 12, firstNumber = 1): Promise<{ ok: string[]; local: LocalImage[] }> {
  const ok: string[] = [];
  const local: LocalImage[] = [];
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        continue;
      }
      if (await fetchImageBytes(u)) {
        ok.push(url);
        continue;
      }
      if (local.length >= max) continue;
      const plain = new URL(u.toString());
      plain.protocol = "http:";
      const got = await fetchImageBytes(plain);
      if (!got) continue;
      try {
        const sharp = (await import("sharp")).default;
        const { data, info } = await sharp(got.bytes, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
        if (info.width < 120 || info.height < 80) continue;
        local.push({ path: "", from: url.replace(/^https:/, "http:"), width: info.width, height: info.height, dataUrl: `data:image/jpeg;base64,${data.toString("base64")}` });
      } catch {
        // Not a picture sharp can read.
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // Keep the site's order, and number the kept copies in it.
  const order = (x: string) => urls.indexOf(x.replace(/^http:/, "https:"));
  ok.sort((a, b) => order(a) - order(b));
  local.sort((a, b) => order(a.from) - order(b.from)).forEach((l, i) => (l.path = `images/site-${firstNumber + i}.jpg`));
  return { ok, local };
}
