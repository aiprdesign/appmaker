/**
 * Credits: what things cost and the packs people can buy. Shared by the
 * server and the Credits page. Payments are off until STRIPE_SECRET_KEY is
 * set; until then nothing costs credits.
 */

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  /** Price in the currency's smallest unit (cents). */
  price: number;
  /** Shown as a badge, e.g. "Popular". */
  badge?: string;
}

export const COSTS = {
  /** One AI build or edit with the site's AI key. */
  generate: 1,
  /** A cloud build on the site's Expo account. */
  build: 5,
  /** A phone preview (Expo Go QR code) on the site's Expo account. */
  phonePreview: 1,
} as const;

export type CreditKind = keyof typeof COSTS;

/**
 * Plans, all credit based (no subscriptions):
 * - guest: not signed in, a few free AI builds a day;
 * - free: an account, with free credits topped up every month;
 * - paid: has bought any credit pack (unlocks the paid features for good).
 * Paid features are only locked while payments are on.
 */
export type Plan = "guest" | "free" | "paid";

export const PAID_FEATURES = {
  storeBuilds: "Store builds",
  bookings: "Bookings",
  liveUpdates: "Live website updates",
  noBranding: "No “Made with Appmaker” line",
} as const;

export type PaidFeature = keyof typeof PAID_FEATURES;

export const DEFAULT_PACKS: CreditPack[] = [
  { id: "starter", name: "Starter", credits: 50, price: 900 },
  { id: "maker", name: "Maker", credits: 200, price: 2900, badge: "Popular" },
  { id: "studio", name: "Studio", credits: 600, price: 6900, badge: "Best value" },
];

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );
}

/** Checks packs from APPMAKER_CREDIT_PACKS (JSON); falls back to the defaults. */
export function parsePacks(raw: string | undefined): CreditPack[] {
  if (!raw?.trim()) return DEFAULT_PACKS;
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return DEFAULT_PACKS;
    const packs = list
      .filter(
        (p): p is CreditPack =>
          !!p &&
          typeof p.id === "string" &&
          /^[a-z0-9-]{1,30}$/.test(p.id) &&
          typeof p.name === "string" &&
          p.name.length <= 40 &&
          Number.isInteger(p.credits) &&
          p.credits > 0 &&
          p.credits <= 100000 &&
          Number.isInteger(p.price) &&
          p.price >= 50,
      )
      .map((p) => ({ id: p.id, name: p.name, credits: p.credits, price: p.price, ...(typeof p.badge === "string" ? { badge: p.badge.slice(0, 20) } : {}) }));
    return packs.length ? packs.slice(0, 6) : DEFAULT_PACKS;
  } catch {
    return DEFAULT_PACKS;
  }
}
