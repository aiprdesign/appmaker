import { createHmac, timingSafeEqual } from "node:crypto";
import { COSTS, PAID_FEATURES, parsePacks, type CreditKind, type CreditPack, type PaidFeature, type Plan } from "../credits";
import { databaseConfigured, query, transaction } from "./db";

/**
 * Credits and Stripe payments. Plug and play: set STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET (and add the webhook in Stripe) and credits switch
 * on. Stripe's hosted Checkout takes the card; credits are added when Stripe
 * confirms the payment (webhook), or when the buyer returns and Stripe says
 * it's paid, whichever comes first. Each payment is credited once.
 */

export const stripeApi = () => (process.env.STRIPE_API_URL || "https://api.stripe.com").replace(/\/$/, "");
const secretKey = () => process.env.STRIPE_SECRET_KEY?.trim() || "";
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";

export interface PaymentsConfig {
  /** Credits are in use: Stripe key set and a database to keep balances. */
  enabled: boolean;
  stripeKey: boolean;
  webhook: boolean;
  database: boolean;
  mode: "test" | "live" | null;
  currency: string;
  freeCredits: number;
  guestBuilds: number;
  packs: CreditPack[];
  costs: typeof COSTS;
}

export function paymentsConfig(): PaymentsConfig {
  const key = secretKey();
  const database = databaseConfigured();
  return {
    enabled: !!key && database,
    stripeKey: !!key,
    webhook: !!webhookSecret(),
    database,
    mode: key ? (key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test") : null,
    currency: (process.env.APPMAKER_CURRENCY?.trim() || "usd").toLowerCase().slice(0, 3),
    freeCredits: Math.max(0, Number(process.env.APPMAKER_FREE_CREDITS ?? 10) || 0),
    guestBuilds: Math.max(0, Number(process.env.APPMAKER_GUEST_BUILDS ?? 3) || 0),
    packs: parsePacks(process.env.APPMAKER_CREDIT_PACKS),
    costs: COSTS,
  };
}

export class CreditsError extends Error {
  constructor(
    message: string,
    public status = 402,
    public code: "credits" | "sign-in" | "plan" = "credits",
  ) {
    super(message);
  }
}

export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);

/**
 * Current balance. New accounts get their free credits on first use, and at
 * the start of each month a balance below the free amount is topped back up
 * to it (free credits don't pile up).
 */
export async function balance(userId: string, now = new Date()): Promise<number> {
  const free = paymentsConfig().freeCredits;
  const month = monthKey(now);
  return transaction(async (c) => {
    const rows = await c.query<{ credits: number | null; credits_month: string | null }>("select credits, credits_month from app_users where id = $1 for update", [
      userId,
    ]);
    const row = rows.rows[0];
    if (!row) return 0;
    if (row.credits === null) {
      await c.query("update app_users set credits = $2, credits_month = $3 where id = $1", [userId, free, month]);
      if (free) await c.query("insert into app_credit_events (user_id, delta, reason) values ($1, $2, 'Welcome credits')", [userId, free]);
      return free;
    }
    if (row.credits_month && row.credits_month >= month) return row.credits;
    const topUp = Math.max(0, free - row.credits);
    await c.query("update app_users set credits = credits + $2, credits_month = $3 where id = $1", [userId, topUp, month]);
    if (topUp) await c.query("insert into app_credit_events (user_id, delta, reason) values ($1, $2, 'Monthly free credits')", [userId, topUp]);
    return row.credits + topUp;
  });
}

/** Whether the account has the paid plan (bought any pack, or given it by the site owner). */
export async function isPaid(userId: string): Promise<boolean> {
  const rows = await query<{ paid: boolean }>("select paid from app_users where id = $1", [userId]);
  return rows[0]?.paid === true;
}

export async function setPaid(userId: string, paid: boolean): Promise<void> {
  await query("update app_users set paid = $2 where id = $1", [userId, paid]);
}

export async function planOf(userId: string | null): Promise<Plan> {
  if (!userId) return "guest";
  return (await isPaid(userId)) ? "paid" : "free";
}

/** Stops a paid feature for accounts without the paid plan (only while payments are on). */
export async function requirePaidPlan(req: Request, feature: PaidFeature): Promise<void> {
  if (!paymentsConfig().enabled) return;
  const { currentUser } = await import("./auth");
  const user = await currentUser(req);
  const label = PAID_FEATURES[feature];
  if (!user) throw new CreditsError(`Sign in to use ${label.toLowerCase()}.`, 401, "sign-in");
  if (!(await isPaid(user.id)))
    throw new CreditsError(`${label} are part of the paid plan. Buy any credit pack to unlock them for good (/credits).`, 402, "plan");
}

/** Takes credits for an action, or throws a CreditsError that explains what to do. */
export async function spend(userId: string, kind: CreditKind, reason: string): Promise<number> {
  const cost = COSTS[kind];
  await balance(userId);
  const rows = await query<{ credits: number }>("update app_users set credits = credits - $2 where id = $1 and credits >= $2 returning credits", [
    userId,
    cost,
  ]);
  if (!rows[0]) {
    throw new CreditsError(`You're out of credits: this needs ${cost} credit${cost === 1 ? "" : "s"}. Buy more on the Credits page (/credits).`);
  }
  await query("insert into app_credit_events (user_id, delta, reason) values ($1, $2, $3)", [userId, -cost, reason.slice(0, 120)]);
  return rows[0].credits;
}

/** Gives credits back, e.g. when the AI request failed before doing anything. */
export async function refund(userId: string, kind: CreditKind, reason: string): Promise<void> {
  const cost = COSTS[kind];
  await query("update app_users set credits = credits + $2 where id = $1", [userId, cost]);
  await query("insert into app_credit_events (user_id, delta, reason) values ($1, $2, $3)", [userId, cost, reason.slice(0, 120)]);
}

/** Adds credits once per reference (a Stripe Checkout session, or an admin grant). Returns false if already added. */
export async function addCredits(userId: string, amount: number, reason: string, ref: string | null): Promise<boolean> {
  await balance(userId);
  return transaction(async (c) => {
    const inserted = await c.query(
      "insert into app_credit_events (user_id, delta, reason, ref) values ($1, $2, $3, $4) on conflict (ref) do nothing returning id",
      [userId, amount, reason.slice(0, 120), ref],
    );
    if (!inserted.rows.length) return false;
    await c.query("update app_users set credits = greatest(coalesce(credits, 0) + $2, 0) where id = $1", [userId, amount]);
    return true;
  });
}

export async function history(userId: string, limit = 20): Promise<{ delta: number; reason: string; at: string }[]> {
  const rows = await query<{ delta: number; reason: string; created_at: Date }>(
    "select delta, reason, created_at from app_credit_events where user_id = $1 order by created_at desc, id desc limit $2",
    [userId, limit],
  );
  return rows.map((r) => ({ delta: r.delta, reason: r.reason, at: new Date(r.created_at).toISOString() }));
}

// ---------------------------------------------------------------------------
// Stripe

async function stripe<T>(path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${stripeApi()}${path}`, {
      method: init.method ?? (init.form ? "POST" : "GET"),
      headers: { authorization: `Bearer ${secretKey()}`, ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new CreditsError("Couldn't reach the payment provider. Try again in a moment.", 502);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new CreditsError(`Payment provider error: ${data.error?.message ?? `HTTP ${res.status}`}`, 502);
  return data;
}

/** Starts Stripe Checkout for a credit pack; returns the page to send the buyer to. */
export async function createCheckout(user: { id: string; email: string }, packId: string, origin: string): Promise<string> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new CreditsError("Payments aren't set up on this site yet.", 404);
  const pack = cfg.packs.find((p) => p.id === packId);
  if (!pack) throw new CreditsError("Choose a credit pack.", 400);
  const session = await stripe<{ id: string; url: string }>("/v1/checkout/sessions", {
    form: {
      mode: "payment",
      success_url: `${origin}/credits?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credits?canceled=1`,
      client_reference_id: user.id,
      customer_email: user.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": cfg.currency,
      "line_items[0][price_data][unit_amount]": String(pack.price),
      "line_items[0][price_data][product_data][name]": `${pack.credits} Appmaker credits (${pack.name})`,
      "metadata[user_id]": user.id,
      "metadata[credits]": String(pack.credits),
      "metadata[pack]": pack.id,
    },
  });
  if (!session.url) throw new CreditsError("The payment provider didn't return a checkout page.", 502);
  return session.url;
}

interface CheckoutSession {
  id: string;
  payment_status?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
}

/** Credits a paid Checkout session (once). */
export async function creditSession(session: CheckoutSession): Promise<boolean> {
  if (session.payment_status !== "paid") return false;
  const userId = session.metadata?.user_id || session.client_reference_id;
  const credits = Number(session.metadata?.credits);
  if (!userId || !Number.isInteger(credits) || credits <= 0) return false;
  const added = await addCredits(userId, credits, `Bought ${credits} credits`, `stripe:${session.id}`);
  // Any purchase unlocks the paid plan for good.
  await setPaid(userId, true);
  return added;
}

/** The buyer is back from Checkout: ask Stripe directly, so credits show up without waiting for the webhook. */
export async function confirmCheckout(userId: string, sessionId: string): Promise<boolean> {
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) throw new CreditsError("Invalid session.", 400);
  const session = await stripe<CheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const owner = session.metadata?.user_id || session.client_reference_id;
  if (owner !== userId) throw new CreditsError("That payment belongs to another account.", 403);
  return creditSession(session);
}

/** Checks the Stripe-Signature header (HMAC-SHA256 over "timestamp.body", 5-minute tolerance). */
export function verifyWebhook(body: string, header: string | null, now = Date.now()): boolean {
  const secret = webhookSecret();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const given = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  return given.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Charges for an action when payments are on. Signed-out visitors get a few
 * free AI builds a day, then are asked to sign in (new accounts get free
 * credits). Automatic quality fixes are free, within a limit. Returns who was
 * charged, so the charge can be refunded if the action fails straight away.
 */
export async function charge(req: Request, kind: CreditKind, opts: { auto?: boolean; reason: string }): Promise<{ userId: string | null; charged: boolean }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { userId: null, charged: false };
  const { currentUser } = await import("./auth");
  const { clientIp, rateLimit } = await import("../rate-limit");
  const user = await currentUser(req);
  if (!user) {
    // The limiter always lets a first request through, so "no free builds" is checked on its own.
    if (kind !== "generate" || cfg.guestBuilds === 0 || !rateLimit(`guest-generate:${clientIp(req)}`, cfg.guestBuilds, DAY).ok) {
      throw new CreditsError(`Sign in to keep building: free accounts get ${cfg.freeCredits} credits every month.`, 401, "sign-in");
    }
    return { userId: null, charged: false };
  }
  if (opts.auto && rateLimit(`auto-fix:${user.id}`, 20, 60 * 60 * 1000).ok) return { userId: user.id, charged: false };
  await spend(user.id, kind, opts.reason);
  return { userId: user.id, charged: true };
}

export function creditsResponse(e: CreditsError): Response {
  return Response.json({ error: e.message, code: e.code }, { status: e.status });
}

/** Payment totals for the admin dashboard. */
export async function paymentStats(): Promise<{ purchases: number; creditsSold: number; creditsSpent: number; paidMembers: number }> {
  const [rows, paid] = await Promise.all([
    query<{ purchases: string; sold: string | null; spent: string | null }>(
      `select count(*) filter (where ref like 'stripe:%') purchases,
              sum(delta) filter (where ref like 'stripe:%') sold,
              -sum(delta) filter (where delta < 0) spent
         from app_credit_events`,
    ),
    query<{ n: string }>("select count(*) n from app_users where paid"),
  ]);
  const r = rows[0];
  return { purchases: Number(r?.purchases ?? 0), creditsSold: Number(r?.sold ?? 0), creditsSpent: Number(r?.spent ?? 0), paidMembers: Number(paid[0]?.n ?? 0) };
}
