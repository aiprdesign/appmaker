import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { parse, type HTMLElement } from "node-html-parser";
import { isPrivateHost, isPublicAddress, makeSafeLookup } from "./net-guard";
import { cleanEmail, cleanPhone, cleanText, MAX_SITE_IMAGES, safeHttpsUrl, sanitizeContact } from "./site-details";
import type { SiteContact, SitePage, SiteSummary } from "./types";

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
const MAX_EXTRA_PAGES = 3;
const PAGE_TEXT_CHARS = 5_000;

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

function request(url: URL): Promise<{ status: number; location?: string; type: string; body: string }> {
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
          resolve({ status, type, body });
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

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
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

function extractColors(root: HTMLElement, themeColor: string): string[] {
  const counts = new Map<string, number>();
  const css = root
    .querySelectorAll("style")
    .map((s) => s.text)
    .join("\n");
  const inline = root
    .querySelectorAll("[style]")
    .map((el) => el.getAttribute("style") ?? "")
    .join("\n");
  for (const m of `${css}\n${inline}`.matchAll(HEX)) {
    const hex = expandHex(m[0]);
    if (isBrandish(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const themeHex = themeColor.match(HEX)?.[0];
  const theme = themeHex ? expandHex(themeHex) : "";
  return [...new Set([theme, ...ranked].filter(Boolean))].slice(0, 5);
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
  body.querySelectorAll("script, style, noscript, svg, iframe, template, form, [aria-hidden=true]").forEach((el) => el.remove());
  const text = clean(body.structuredText).slice(0, PAGE_TEXT_CHARS);
  return {
    url: url.toString(),
    title: clean(root.querySelector("title")?.text).slice(0, 120),
    headings: [...new Set(headings)].slice(0, 25),
    navigation: [...new Set(nav)].slice(0, 20),
    text,
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
  logos: string[];
  images: string[];
  contact: Partial<SiteContact> & { phones: string[]; emails: string[]; hours: string[]; social: string[] };
}

function absolute(href: string | undefined, base: URL): string | null {
  if (!href || href.startsWith("data:")) return null;
  try {
    return safeHttpsUrl(new URL(href.trim(), base).toString());
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

function extractDetails(root: HTMLElement, base: URL): Details {
  const d: Details = { logos: [], images: [], contact: { phones: [], emails: [], hours: [], social: [] } };
  const c = d.contact;

  for (const name of ["og:image", "og:image:secure_url", "twitter:image"]) {
    const url = absolute(meta(root, name), base);
    if (url) d.images.push(url);
  }
  for (const img of root.querySelectorAll("img").slice(0, 200)) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || fromSrcset(img.getAttribute("srcset") ?? img.getAttribute("data-srcset"));
    const url = absolute(src, base);
    if (!url || /\.(svg|gif|ico)(\?|$)/i.test(url) || JUNK_IMAGE.test(url)) continue;
    const w = Number(img.getAttribute("width")) || 0;
    const h = Number(img.getAttribute("height")) || 0;
    if ((w && w < 64) || (h && h < 64)) continue;
    const label = `${url} ${img.getAttribute("alt") ?? ""} ${img.getAttribute("class") ?? ""} ${img.getAttribute("id") ?? ""}`;
    if (/logo/i.test(label)) d.logos.push(url);
    else d.images.push(url);
  }

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
function mergeDetails(all: Details[]): { logo?: string; images: string[]; contact?: SiteContact } {
  const logo = all.flatMap((d) => d.logos)[0];
  const images = [...new Set(all.flatMap((d) => d.images))].filter((u) => u !== logo).slice(0, MAX_SITE_IMAGES);
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
  return { ...(logo ? { logo } : {}), images, ...(contact ? { contact } : {}) };
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
    description: meta(root, "description", "og:description").slice(0, 400),
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
  return { ...summary, pages, ...mergeDetails(found) };
}
