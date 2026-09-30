import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as creditsInfo } from "@/app/api/credits/route";
import { POST as checkoutRoute } from "@/app/api/credits/checkout/route";
import { POST as confirmRoute } from "@/app/api/credits/confirm/route";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { POST as generateRoute } from "@/app/api/generate/route";
import { formatPrice, parsePacks, DEFAULT_PACKS } from "@/lib/credits";
import { addCredits, balance, charge, CreditsError, paymentsConfig, spend, verifyWebhook } from "@/lib/server/credits";
import { closeDatabase, query } from "@/lib/server/db";

describe("credit packs and prices", () => {
  it("formats prices and checks custom packs", () => {
    expect(formatPrice(900, "usd")).toBe("$9");
    expect(formatPrice(2950, "eur")).toBe("€29.50");
    expect(parsePacks(undefined)).toBe(DEFAULT_PACKS);
    expect(parsePacks("not json")).toBe(DEFAULT_PACKS);
    expect(
      parsePacks(
        JSON.stringify([
          { id: "big", name: "Big", credits: 1000, price: 9900 },
          { id: "BAD ID", name: "x", credits: 1, price: 100 },
        ]),
      ),
    ).toEqual([{ id: "big", name: "Big", credits: 1000, price: 9900 }]);
  });

  it("is off, and nothing costs credits, until a Stripe key is set", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(paymentsConfig().enabled).toBe(false);
    expect(await charge(new Request("http://localhost/"), "generate", { reason: "x" })).toEqual({ userId: null, charged: false });
  });
});

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3000";
const req = (path: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": "application/json",
      "x-forwarded-for": "10.88.0.1",
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const WHSEC = "whsec_test_secret_for_appmaker";
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", WHSEC).update(`${t}.${body}`).digest("hex")}`;

describe.skipIf(!DB)("credits and Stripe (PostgreSQL, fake Stripe)", () => {
  let stripe: Server;
  const received: { method: string; url: string; auth?: string; form: URLSearchParams }[] = [];
  const sessions = new Map<string, Record<string, unknown>>();

  beforeAll(async () => {
    stripe = createServer((r, res) => {
      let data = "";
      r.on("data", (d) => (data += d));
      r.on("end", () => {
        received.push({ method: r.method!, url: r.url!, auth: r.headers.authorization, form: new URLSearchParams(data) });
        res.setHeader("content-type", "application/json");
        if (r.method === "POST" && r.url === "/v1/checkout/sessions") {
          const form = new URLSearchParams(data);
          const id = `cs_test_${received.length}abcdefgh`;
          sessions.set(id, {
            id,
            payment_status: "paid",
            client_reference_id: form.get("client_reference_id"),
            metadata: { user_id: form.get("metadata[user_id]"), credits: form.get("metadata[credits]") },
          });
          return res.end(JSON.stringify({ id, url: `https://checkout.stripe.test/${id}` }));
        }
        const m = /^\/v1\/checkout\/sessions\/(.+)$/.exec(r.url!);
        if (m && sessions.has(m[1])) return res.end(JSON.stringify(sessions.get(m[1])));
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { message: "No such session" } }));
      });
    });
    await new Promise<void>((r) => stripe.listen(0, "127.0.0.1", r));
    process.env.DATABASE_URL = DB;
    process.env.STRIPE_SECRET_KEY = "sk_test_appmaker";
    process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
    process.env.STRIPE_API_URL = `http://127.0.0.1:${(stripe.address() as { port: number }).port}`;
    process.env.APPMAKER_GUEST_BUILDS = "0";
  });
  afterAll(async () => {
    stripe.close();
    await closeDatabase();
    for (const k of ["DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_API_URL", "APPMAKER_GUEST_BUILDS", "ANTHROPIC_API_KEY"])
      delete process.env[k];
  });
  beforeEach(async () => {
    await query("delete from app_users where email like '%@credits.example.com'");
  });

  async function account(name: string) {
    const res = await signup(
      req("/api/auth/signup", { email: `${name}@credits.example.com`, password: "correct horse" }, undefined, { "x-forwarded-for": `10.88.1.${name.length}` }),
    );
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const [u] = await query<{ id: string }>("select id from app_users where email = $1", [`${name}@credits.example.com`]);
    return { cookie, id: u.id };
  }

  it("gives new accounts free credits, spends them and says when they run out", async () => {
    const { id } = await account("ada");
    expect(await balance(id)).toBe(10);
    expect(await spend(id, "build", "Cloud build")).toBe(5);
    await spend(id, "build", "Cloud build");
    await expect(spend(id, "generate", "AI build")).rejects.toThrow(CreditsError);
    const events = await query<{ delta: number; reason: string }>("select delta, reason from app_credit_events where user_id = $1 order by id", [id]);
    expect(events).toEqual([
      { delta: 10, reason: "Welcome credits" },
      { delta: -5, reason: "Cloud build" },
      { delta: -5, reason: "Cloud build" },
    ]);
    // Grants can't take a balance below zero.
    await addCredits(id, -50, "Removed", null);
    expect(await balance(id)).toBe(0);
  });

  it("buys credits with Stripe Checkout; the webhook and the return page add them once", async () => {
    const { cookie, id } = await account("grace");
    const res = await checkoutRoute(req("/api/credits/checkout", { pack: "maker" }, cookie));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_test_/);
    const sent = received.at(-1)!;
    expect(sent.auth).toBe("Bearer sk_test_appmaker");
    expect(sent.form.get("mode")).toBe("payment");
    expect(sent.form.get("line_items[0][price_data][unit_amount]")).toBe("2900");
    expect(sent.form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(sent.form.get("metadata[credits]")).toBe("200");
    expect(sent.form.get("client_reference_id")).toBe(id);
    expect(sent.form.get("success_url")).toBe("http://localhost:3000/credits?paid=1&session_id={CHECKOUT_SESSION_ID}");
    const sessionId = url.split("/").pop();

    // Webhook: signed, credited once even if Stripe sends it twice.
    const event = JSON.stringify({ type: "checkout.session.completed", data: { object: sessions.get(sessionId) } });
    expect((await webhookRoute(req("/api/stripe/webhook", event, undefined, { "stripe-signature": sign(event) }))).status).toBe(200);
    expect((await webhookRoute(req("/api/stripe/webhook", event, undefined, { "stripe-signature": sign(event) }))).status).toBe(200);
    expect(await balance(id)).toBe(210);
    // Forged or stale signatures are refused.
    expect((await webhookRoute(req("/api/stripe/webhook", event, undefined, { "stripe-signature": "t=1,v1=deadbeef" }))).status).toBe(400);
    expect(verifyWebhook(event, sign(event, Math.floor(Date.now() / 1000) - 3600))).toBe(false);

    // Coming back to the Credits page doesn't add them again.
    const back = await confirmRoute(req("/api/credits/confirm", { sessionId }, cookie));
    expect(await back.json()).toEqual({ added: false, balance: 210 });

    // Someone else's payment can't be claimed.
    const other = await account("mallory");
    expect((await confirmRoute(req("/api/credits/confirm", { sessionId }, other.cookie))).status).toBe(403);

    const info = await (await creditsInfo(req("/api/credits", undefined, cookie))).json();
    expect(info).toMatchObject({ enabled: true, signedIn: true, balance: 210, mode: "test", plan: "paid" });
    // Any purchase unlocks the paid plan; other accounts stay free.
    expect((await (await creditsInfo(req("/api/credits", undefined, other.cookie))).json()).plan).toBe("free");
    expect((await (await creditsInfo(req("/api/credits"))).json()).plan).toBe("guest");
    expect(info.history[0]).toMatchObject({ delta: 200, reason: "Bought 200 credits" });
  });

  it("tops free credits back up each month, without piling them up", async () => {
    const { id } = await account("hopper");
    const now = new Date();
    const month = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 2));
    expect(await balance(id)).toBe(10);
    await spend(id, "build", "Cloud build");
    expect(await balance(id)).toBe(5);
    expect(await balance(id, month(1))).toBe(10);
    expect(await balance(id, month(1))).toBe(10);
    // A bigger balance (bought credits) isn't topped up.
    await addCredits(id, 40, "Given", null);
    expect(await balance(id, month(2))).toBe(50);
    const reasons = await query<{ reason: string }>("select reason from app_credit_events where user_id = $1 and reason = 'Monthly free credits'", [id]);
    expect(reasons).toHaveLength(1);
  });

  it("paid features need the paid plan while payments are on", async () => {
    const { setFeature } = await import("@/lib/server/features");
    const { POST: bookingsRoute } = await import("@/app/api/bookings/route");
    const { setPaid } = await import("@/lib/server/credits");
    const { defaultSettings } = await import("@/lib/booking");
    await setFeature("bookings", true);
    try {
      const { cookie, id } = await account("turing");
      const body = { projectId: "plan123abc", settings: defaultSettings("UTC") };
      const free = await bookingsRoute(req("/api/bookings", body, cookie));
      expect(free.status).toBe(402);
      expect(await free.json()).toMatchObject({ code: "plan", error: expect.stringMatching(/Bookings are part of the paid plan. Buy any credit pack/) });
      await setPaid(id, true);
      expect((await bookingsRoute(req("/api/bookings", body, cookie))).status).toBe(200);
    } finally {
      await setFeature("bookings", false);
    }
  });

  it("the return page adds credits when the webhook hasn't arrived yet", async () => {
    const { cookie, id } = await account("linus");
    const { url } = await (await checkoutRoute(req("/api/credits/checkout", { pack: "starter" }, cookie))).json();
    const res = await confirmRoute(req("/api/credits/confirm", { sessionId: url.split("/").pop() }, cookie));
    expect(await res.json()).toEqual({ added: true, balance: 60 });
    expect(await balance(id)).toBe(60);
  });

  it("AI builds with the site's key need credits; visitors are asked to sign in", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-used";
    const body = { prompt: "A habit tracker" };
    const guest = await generateRoute(req("/api/generate", body));
    expect(guest.status).toBe(401);
    expect(await guest.json()).toMatchObject({ code: "sign-in", error: expect.stringMatching(/10 credits every month/) });

    const { cookie, id } = await account("barbara");
    await addCredits(id, -10, "Removed", null);
    const broke = await generateRoute(req("/api/generate", body, cookie));
    expect(broke.status).toBe(402);
    expect(await broke.json()).toMatchObject({ code: "credits", error: expect.stringMatching(/out of credits/) });
  });

  it("a reply that only asks a question gives the credit back", async () => {
    let reply = "";
    const ai = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (content: string | null, finish: string | null) =>
        `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: content == null ? {} : { content }, finish_reason: finish }] })}\n\n`;
      // Split mid-tag, as streams do.
      res.end(chunk(reply.slice(0, 20), null) + chunk(reply.slice(20), null) + chunk(null, "stop") + "data: [DONE]\n\n");
    });
    await new Promise<void>((r) => ai.listen(0, "127.0.0.1", r));
    Object.assign(process.env, { APPMAKER_PROVIDER: "custom", APPMAKER_MODEL: "test-model", CUSTOM_AI_BASE_URL: `http://127.0.0.1:${(ai.address() as { port: number }).port}/v1` });
    try {
      const { cookie, id } = await account("grace");
      const body = { prompt: "Add a booking screen", files: { "App.js": "export default function App() { return null; }" } };
      reply = "<plan>Ask for booking details.</plan><summary>Which booking link, WhatsApp number or email should bookings go to?</summary>";
      await (await generateRoute(req("/api/generate", body, cookie))).text();
      expect(await balance(id)).toBe(10);
      reply = '<plan>Add booking.</plan><file path="App.js">export default function App() { return null; }\n</file><summary>Done.</summary>';
      await (await generateRoute(req("/api/generate", body, cookie))).text();
      expect(await balance(id)).toBe(9);
    } finally {
      ai.close();
      for (const k of ["APPMAKER_PROVIDER", "APPMAKER_MODEL", "CUSTOM_AI_BASE_URL"]) delete process.env[k];
    }
  });
});
