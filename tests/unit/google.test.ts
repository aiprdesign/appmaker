import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as start } from "@/app/api/auth/google/start/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { closeDatabase, query } from "@/lib/server/db";
import { setFeature } from "@/lib/server/features";

// "Sign in with Google" against a stand-in Google token endpoint. Needs TEST_DATABASE_URL.
const DB = process.env.TEST_DATABASE_URL;
const SITE = "https://appmaker.example";
const CLIENT_ID = "test-client.apps.googleusercontent.com";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
let claims: Record<string, unknown> = {};
let tokenRequests: URLSearchParams[] = [];
let google: Server;

function get(path: string, cookie?: string) {
  return new Request(`http://localhost:8080${path}`, {
    headers: { host: "localhost:8080", "x-forwarded-host": "appmaker.example", "x-forwarded-proto": "https", ...(cookie ? { cookie } : {}), "x-forwarded-for": "10.7.7.7" },
  });
}
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]);

async function beginSignIn() {
  const res = await start(get("/api/auth/google/start"));
  const location = new URL(res.headers.get("location")!);
  const oauth = cookies(res).find((c) => c.startsWith("appmaker_oauth="))!;
  return { location, oauth, state: location.searchParams.get("state")! };
}

async function signInAs(extra: Record<string, unknown> = {}) {
  const { oauth, state } = await beginSignIn();
  claims = { iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, sub: "google-123", email: "Ada@Gmail.com", email_verified: true, ...extra };
  return callback(get(`/api/auth/google/callback?code=abc&state=${state}`, oauth));
}

describe.skipIf(!DB)("Sign in with Google", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    google = createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        const params = new URLSearchParams(raw);
        tokenRequests.push(params);
        res.setHeader("content-type", "application/json");
        if (params.get("code") !== "abc") {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "invalid_grant" }));
        }
        res.end(JSON.stringify({ id_token: `${b64({ alg: "RS256" })}.${b64(claims)}.sig`, access_token: "x" }));
      });
    });
    await new Promise<void>((r) => google.listen(0, "127.0.0.1", r));
    process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${(google.address() as { port: number }).port}/token`;
    // Google sign-in is off until the site owner switches it on in /admin.
    await setFeature("google", true);
  });
  afterAll(async () => {
    google.close();
    await setFeature("google", false);
    await closeDatabase();
    for (const k of ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_URL"]) delete process.env[k];
  });
  beforeEach(async () => {
    tokenRequests = [];
    await query("delete from app_users where email like '%@gmail.com'");
  });

  it("sends people to Google with PKCE and the site's public callback address", async () => {
    const { location, oauth, state } = await beginSignIn();
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(`${SITE}/api/auth/google/callback`);
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const verifier = oauth.split("=")[1].split(".")[1];
    expect(location.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(oauth.split("=")[1].split(".")[0]).toBe(state);
  });

  it("creates an account and signs in", async () => {
    const res = await signInAs();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${SITE}/projects`);
    const session = cookies(res).find((c) => c.startsWith("appmaker_session="))!;
    expect(session.length).toBeGreaterThan(40);
    expect(res.headers.getSetCookie().find((c) => c.startsWith("appmaker_session="))).toMatch(/; Secure/);
    expect(await (await me(get("/api/auth/me", session))).json()).toMatchObject({ enabled: true, google: true, user: { email: "ada@gmail.com" } });

    // The code was exchanged with the matching verifier and redirect address.
    expect(tokenRequests[0].get("redirect_uri")).toBe(`${SITE}/api/auth/google/callback`);
    expect(tokenRequests[0].get("code_verifier")).toBeTruthy();
    expect(tokenRequests[0].get("client_secret")).toBe("test-secret");

    // Signing in again uses the same account; Google accounts have no password.
    await signInAs();
    expect(await query("select id from app_users where email like '%@gmail.com'")).toHaveLength(1);
    const pw = await login(new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", "x-forwarded-for": "10.7.7.8" }, body: JSON.stringify({ email: "ada@gmail.com", password: "anything-at-all" }) }));
    expect(pw.status).toBe(401);
  });

  it("links to an existing email account with the same address", async () => {
    await signup(new Request("http://localhost:3000/api/auth/signup", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", "x-forwarded-for": "10.7.7.9" }, body: JSON.stringify({ email: "ada@gmail.com", password: "correct horse" }) }));
    const res = await signInAs();
    expect(res.headers.get("location")).toBe(`${SITE}/projects`);
    const users = await query<{ google_sub: string }>("select google_sub from app_users where email like '%@gmail.com'");
    expect(users).toEqual([{ google_sub: "google-123" }]);
  });

  it("refuses forged, cancelled or unverified sign-ins", async () => {
    const { oauth } = await beginSignIn();
    const forged = await callback(get("/api/auth/google/callback?code=abc&state=not-the-state", oauth));
    expect(forged.headers.get("location")).toMatch(/\/login\?error=.*expired/);
    const noCookie = await callback(get("/api/auth/google/callback?code=abc&state=x"));
    expect(noCookie.headers.get("location")).toMatch(/\/login\?error=/);
    const cancelled = await callback(get("/api/auth/google/callback?error=access_denied", oauth));
    expect(decodeURIComponent(cancelled.headers.get("location")!)).toMatch(/cancelled/);
    expect(decodeURIComponent((await signInAs({ email_verified: false })).headers.get("location")!)).toMatch(/isn't verified/);
    expect(decodeURIComponent((await signInAs({ aud: "someone-else" })).headers.get("location")!)).toMatch(/another app/);
    expect(decodeURIComponent((await signInAs({ iss: "https://evil.example" })).headers.get("location")!)).toMatch(/didn't come from Google/);
    expect(await query("select id from app_users where email like '%@gmail.com'")).toHaveLength(0);
  });

  it("is off when switched off in admin, even with keys", async () => {
    await setFeature("google", false);
    expect((await start(get("/api/auth/google/start"))).headers.get("location")).toMatch(/\/login\?error=google-off/);
    expect(await (await me(get("/api/auth/me"))).json()).toMatchObject({ google: false });
    await setFeature("google", true);
  });

  it("is off without the Google settings", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect((await start(get("/api/auth/google/start"))).headers.get("location")).toMatch(/\/login\?error=google-off/);
    expect(await (await me(get("/api/auth/me"))).json()).toMatchObject({ google: false });
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  });
});
