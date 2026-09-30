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

/**
 * What things cost and the free allowances. The site owner can change these
 * in Admin → Settings → Payments; the environment variables set the defaults.
 */
export interface Prices {
  /** A new app from a prompt or website (the AI writes the whole app). */
  newApp: number;
  /** A change to an existing app. */
  edit: number;
  /** An App Store or Google Play build on the site's Expo account. */
  build: number;
  /** A phone preview (Expo Go QR code) on the site's Expo account. */
  phonePreview: number;
  /** Free accounts are topped up to this many credits each month. */
  freeCredits: number;
  /** AI builds a day without an account. */
  guestBuilds: number;
}

export type CreditKind = "newApp" | "edit" | "build" | "phonePreview";

export const DEFAULT_PRICES: Prices = { newApp: 3, edit: 1, build: 5, phonePreview: 1, freeCredits: 10, guestBuilds: 1 };

const LIMITS: Record<keyof Prices, [number, number]> = {
  newApp: [0, 100],
  edit: [0, 100],
  build: [0, 1000],
  phonePreview: [0, 100],
  freeCredits: [0, 1000],
  guestBuilds: [0, 20],
};

/** Checks prices from the admin (or the environment); anything invalid keeps the fallback value. */
export function parsePrices(v: unknown, fallback: Prices = DEFAULT_PRICES): Prices {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...fallback };
  for (const key of Object.keys(LIMITS) as (keyof Prices)[]) {
    const n = Number(o[key]);
    const [min, max] = LIMITS[key];
    if (o[key] !== undefined && o[key] !== "" && Number.isInteger(n) && n >= min && n <= max) out[key] = n;
  }
  return out;
}

/** "≈ 16 new apps or 50 changes": credits in terms people understand. */
export function creditsInApps(credits: number, prices: Pick<Prices, "newApp" | "edit">): string {
  const parts = [
    prices.newApp > 0 && `${Math.floor(credits / prices.newApp).toLocaleString()} new apps`,
    prices.edit > 0 && `${Math.floor(credits / prices.edit).toLocaleString()} changes`,
  ].filter(Boolean);
  return parts.length ? `≈ ${parts.join(" or ")}` : "";
}

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
