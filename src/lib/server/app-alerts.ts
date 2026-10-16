import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { query } from "./db";

/**
 * Alerts for app data: the business hears about new orders and requests (web
 * push on the owner page, and Expo push on staff phones), and customers hear
 * when their order's status changes (Expo push). Push is best effort: a failed
 * alert never fails the order.
 */

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/;
export const isExpoToken = (t: unknown): t is string => typeof t === "string" && EXPO_TOKEN.test(t);

/**
 * A customer using the web app (installed from the browser) gets updates by web push: their "token" is
 * "web:" + JSON { s: the push subscription, u: the web app's path to open, e.g. "/a/AbC123" }.
 */
export function parseWebToken(t: unknown): { sub: WebSubscription; url: string } | null {
  if (typeof t !== "string" || !t.startsWith("web:") || t.length > 2500) return null;
  try {
    const v = JSON.parse(t.slice(4)) as { s?: unknown; u?: unknown };
    const sub = parseWebSubscription(v.s);
    const url = typeof v.u === "string" && /^\/a\/[A-Za-z0-9_-]{6,20}$/.test(v.u) ? v.u : "/";
    return sub ? { sub, url } : null;
  } catch {
    return null;
  }
}

/** Where a customer hears about their order: the store app (Expo push) or the web app (web push). */
export const isPushToken = (t: unknown): t is string => isExpoToken(t) || !!parseWebToken(t);

/** Tells one customer that their order or request moved on. */
export async function notifyCustomer(token: string, title: string, body: string, data: Record<string, unknown>): Promise<void> {
  const web = parseWebToken(token);
  if (web) await sendWeb(web.sub, { title, body, url: web.url });
  else await sendExpo([token], title, body, data);
}

// ---------- web push keys (made once, kept in app_settings) ----------

let vapid: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (vapid) return vapid;
  const rows = await query<{ value: { publicKey: string; privateKey: string } }>("select value from app_settings where key = 'vapid'");
  if (rows[0]?.value?.publicKey) return (vapid = rows[0].value);
  const keys = webpush.generateVAPIDKeys();
  await query("insert into app_settings (key, value, updated_at) values ('vapid', $1::jsonb, now()) on conflict (key) do nothing", [JSON.stringify(keys)]);
  const saved = await query<{ value: { publicKey: string; privateKey: string } }>("select value from app_settings where key = 'vapid'");
  return (vapid = saved[0].value);
}

// ---------- subscriptions ----------

export interface WebSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function parseWebSubscription(v: unknown): WebSubscription | null {
  const s = v as WebSubscription | null;
  if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  if (typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
}

/** Where the business wants alerts: an owner page (web push) or a staff phone (Expo push). */
export async function addOwnerAlert(storeId: string, alert: { web: WebSubscription } | { expo: string }): Promise<void> {
  const [kind, token, sub] = "web" in alert ? ["web", alert.web.endpoint, JSON.stringify(alert.web)] : ["expo", alert.expo, null];
  await query(
    `insert into app_data_alerts (store_id, kind, token, subscription) values ($1, $2, $3, $4)
     on conflict (store_id, token) do update set subscription = excluded.subscription`,
    [storeId, kind, token, sub],
  );
  // At most 20 devices per app get alerts: the newest ones.
  await query(
    "delete from app_data_alerts where store_id = $1 and token not in (select token from app_data_alerts where store_id = $1 order by created_at desc limit 20)",
    [storeId],
  );
}

export async function removeOwnerAlert(storeId: string, token: string): Promise<void> {
  await query("delete from app_data_alerts where store_id = $1 and token = $2", [storeId, token]);
}

// ---------- sending ----------

/** Sends Expo push messages (free, no key needed); returns the tokens Expo says are gone. */
export async function sendExpo(tokens: string[], title: string, body: string, data: Record<string, unknown> = {}): Promise<string[]> {
  const to = tokens.filter(isExpoToken);
  if (!to.length) return [];
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(to.map((t) => ({ to: t, title, body, data, sound: "default", priority: "high" }))),
      signal: AbortSignal.timeout(10_000),
    });
    const out = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
    return (out.data ?? []).flatMap((r, i) => (r?.details?.error === "DeviceNotRegistered" ? [to[i]] : []));
  } catch {
    return [];
  }
}

async function sendWeb(sub: WebSubscription, payload: object): Promise<"ok" | "gone" | "failed"> {
  try {
    const keys = await vapidKeys();
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject: "mailto:alerts@appmaker.invalid", publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 60 * 60,
      timeout: 10_000,
    });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "failed";
  }
}

/** Tells the business about something new (an order, a request…). */
export async function alertOwner(storeId: string, title: string, body: string, url: string): Promise<void> {
  const rows = await query<{ kind: string; token: string; subscription: WebSubscription | null }>("select kind, token, subscription from app_data_alerts where store_id = $1", [storeId]);
  const gone: string[] = [];
  await Promise.all(
    rows.filter((r) => r.kind === "web" && r.subscription).map(async (r) => ((await sendWeb(r.subscription!, { title, body, url })) === "gone" ? gone.push(r.token) : 0)),
  );
  gone.push(...(await sendExpo(rows.filter((r) => r.kind === "expo").map((r) => r.token), title, body, { appmaker: "owner" })));
  for (const t of gone) await removeOwnerAlert(storeId, t);
}

// ---------- staff PIN ----------

export const STAFF_PIN = /^\d{6,8}$/;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("base64url")}.${scryptSync(pin, salt, 32).toString("base64url")}`;
}

export function pinMatches(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(".");
  if (!salt || !hash) return false;
  const a = scryptSync(pin, Buffer.from(salt, "base64url"), 32);
  const b = Buffer.from(hash, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A short, stable reference for a record ("#4F2A"), so the business and the customer talk about the same order. */
export const shortRef = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 4).toUpperCase();
