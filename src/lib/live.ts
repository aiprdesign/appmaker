import { cleanText, safeHttpsUrl, sanitizeContact, sanitizeImages } from "./site-details";
import type { SiteSummary } from "./types";

/**
 * Live content for apps built from a website. Appmaker re-reads the site
 * (at most once a day, only when an app asks) and serves a small JSON file;
 * the app merges it over the content it was built with. No AI and no images
 * are involved on the server: photos stay on the website and load from there.
 */

export const LIVE_FILE = "src/live.js";

export interface LiveItem {
  name: string;
  price: string;
  section?: string;
}

export interface LiveContent {
  v: 1;
  updatedAt: string;
  name: string;
  logo?: string;
  images: string[];
  contact: {
    phone?: string;
    email?: string;
    whatsapp?: string;
    booking?: string;
    maps?: string;
    address?: string;
    social: string[];
  };
  hours: string[];
  items: LiveItem[];
  offers: { title: string }[];
}

const PRICE = String.raw`(?:[$€£₹¥]|Rs\.?|USD|EUR|GBP)\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:[$€£₹¥]|USD|EUR|GBP)`;
const ITEM_LINE = new RegExp(String.raw`^(.{2,60}?)\s*(?:[—–:·|]|\s-\s|\.{2,})\s*(${PRICE})\s*$`);
const OFFER = /\b(special|offer|deal|discount|\d+\s?%\s?off|happy hour|promo|limited time|new in|this week)\b/i;

/** Menu items, services or products with prices, found in headings and lines of text. */
function findItems(site: SiteSummary): LiveItem[] {
  const items = new Map<string, LiveItem>();
  for (const page of site.pages) {
    const section = cleanText(page.title.split(/\s[|\-–—·]\s/)[0], 40) ?? undefined;
    for (const line of [...page.headings, ...page.text.split("\n")]) {
      const m = ITEM_LINE.exec(line.trim());
      if (!m) continue;
      const name = cleanText(m[1].replace(/[\s.:—–-]+$/, ""), 60);
      const price = cleanText(m[2], 16);
      if (!name || !price || /^(total|subtotal|delivery|shipping|tax)\b/i.test(name)) continue;
      const key = name.toLowerCase();
      if (!items.has(key)) items.set(key, { name, price, ...(section ? { section } : {}) });
      if (items.size >= 80) return [...items.values()];
    }
  }
  return [...items.values()];
}

function findOffers(site: SiteSummary): { title: string }[] {
  const offers = new Set<string>();
  for (const page of site.pages) {
    for (const h of page.headings) {
      const t = cleanText(h, 100);
      if (t && OFFER.test(t) && !ITEM_LINE.test(t)) offers.add(t);
    }
  }
  return [...offers].slice(0, 5).map((title) => ({ title }));
}

export function liveContentFromSite(site: SiteSummary, now = new Date()): LiveContent {
  const c = sanitizeContact(site.contact);
  const logo = safeHttpsUrl(site.logo);
  return {
    v: 1,
    updatedAt: now.toISOString(),
    name: cleanText(site.siteName, 60) ?? "",
    ...(logo ? { logo } : {}),
    images: sanitizeImages(site.images).filter((u) => u !== logo),
    contact: {
      ...(c?.phones[0] ? { phone: c.phones[0] } : {}),
      ...(c?.emails[0] ? { email: c.emails[0] } : {}),
      ...(c?.whatsapp ? { whatsapp: c.whatsapp } : {}),
      ...(c?.booking ? { booking: c.booking } : {}),
      ...(c?.maps ? { maps: c.maps } : {}),
      ...(c?.address ? { address: c.address } : {}),
      social: c?.social ?? [],
    },
    hours: c?.hours ?? [],
    items: findItems(site),
    offers: findOffers(site),
  };
}

/**
 * How the app combines live content with what it was built with. Plain
 * JavaScript, shared by the app file below and the tests: the website wins
 * for photos, contact details, hours, prices and offers; the app keeps its
 * own wording, and new priced items are added under their section.
 */
export const LIVE_MERGE_SOURCE = String.raw`function mergeLive(base, live) {
  if (!base || !live || live.v !== 1) return base;
  const out = { ...base };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (Array.isArray(live.images) && live.images.length) out.images = live.images.slice(0, 8);
  if (live.logo) out.logo = live.logo;
  const contact = { ...(base.contact || {}) };
  for (const [k, v] of Object.entries(live.contact || {})) {
    if (Array.isArray(v) ? v.length : v) contact[k] = v;
  }
  out.contact = contact;
  if (Array.isArray(live.hours) && live.hours.length) out.hours = live.hours;
  if (Array.isArray(base.items) && Array.isArray(live.items) && live.items.length) {
    const fresh = new Map(live.items.map((i) => [norm(i.name), i]));
    const items = base.items.map((i) => {
      const f = fresh.get(norm(i.name));
      if (!f) return i;
      fresh.delete(norm(i.name));
      return { ...i, price: f.price };
    });
    for (const f of [...fresh.values()].slice(0, 30)) {
      items.push({ name: f.name, price: f.price, category: f.section || 'More', description: '' });
    }
    out.items = items;
  }
  if (Array.isArray(live.offers) && live.offers.length) {
    out.offers = live.offers.map((o) => ({ title: o.title, text: o.text || '' }));
  }
  out.updatedAt = live.updatedAt;
  return out;
}`;

/** The file every website app gets: loads the live content and keeps an offline copy. */
export function liveModule(feedUrl: string | null): string {
  return `// Live content from the business's website, kept up to date by Appmaker.
// This file is written by Appmaker: changes here are replaced.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FEED = ${feedUrl ? JSON.stringify(feedUrl) : "null"};
const KEY = 'appmaker.live.v1';

export ${LIVE_MERGE_SOURCE}

/** The app's content with the latest from the website merged in. */
export function useLive(base) {
  const [data, setData] = useState(base);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive && raw) setData(mergeLive(base, JSON.parse(raw)));
      })
      .catch(() => {});
    if (FEED) {
      fetch(FEED)
        .then((r) => (r.ok ? r.json() : null))
        .then((live) => {
          if (!alive || !live) return;
          setData(mergeLive(base, live));
          AsyncStorage.setItem(KEY, JSON.stringify(live)).catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [base]);
  return data;
}
`;
}
