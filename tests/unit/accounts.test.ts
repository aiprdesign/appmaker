import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as list } from "@/app/api/projects/route";
import { DELETE as del, GET as getOne, PUT as put } from "@/app/api/projects/[id]/route";
import { GET as status } from "@/app/api/status/route";
import { closeDatabase, query } from "@/lib/server/db";

// Needs a real PostgreSQL: set TEST_DATABASE_URL (CI starts one). Skipped otherwise.
const DB = process.env.TEST_DATABASE_URL;

const ORIGIN = "http://localhost:3000";
function req(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string; contentType?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", origin: init.origin ?? ORIGIN, "x-forwarded-for": init.ip ?? "10.0.0.1" };
  if (init.body !== undefined) headers["content-type"] = init.contentType ?? "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

function project(id: string, updatedAt: number, name = "Habit Hero") {
  return { id, name, prompt: "habits", files: { "App.js": "export default () => null;" }, messages: [], listing: {}, createdAt: 1, updatedAt };
}

describe.skipIf(!DB)("accounts and cloud projects (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });
  beforeEach(async () => {
    // Only this file's accounts (sessions and projects go with them): other
    // test files use the same database at the same time.
    await query("delete from app_users where email like '%@example.com'");
  });

  let n = 0;
  // Each account from its own address: sign-ups are limited per address.
  async function account(email = "ada@example.com", ip = `10.9.${Math.floor(++n / 250)}.${n % 250}`) {
    const res = await signup(req("/api/auth/signup", { method: "POST", body: { email, password: "correct horse" }, ip }));
    expect(res.status).toBe(200);
    return cookieOf(res);
  }

  it("creates accounts with hashed passwords and hashed session tokens", async () => {
    const res = await signup(req("/api/auth/signup", { method: "POST", body: { email: " Ada@Example.com ", password: "correct horse" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { email: "ada@example.com" } });
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/appmaker_session=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const token = cookieOf(res).split("=")[1];

    const [user] = await query<{ password_hash: string }>("select password_hash from app_users where email = 'ada@example.com'");
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain("correct horse");
    const sessions = await query<{ token_hash: string }>("select token_hash from app_sessions");
    expect(sessions[0].token_hash).not.toBe(token);

    const who = await me(req("/api/auth/me", { cookie: cookieOf(res) }));
    expect(await who.json()).toMatchObject({ enabled: true, user: { email: "ada@example.com" } });
  });

  it("rejects duplicates, bad emails and short passwords", async () => {
    await account();
    const dup = await signup(req("/api/auth/signup", { method: "POST", body: { email: "ada@example.com", password: "another pass" } }));
    expect(dup.status).toBe(409);
    expect((await signup(req("/api/auth/signup", { method: "POST", body: { email: "nope", password: "correct horse" } }))).status).toBe(400);
    expect((await signup(req("/api/auth/signup", { method: "POST", body: { email: "b@example.com", password: "short" } }))).status).toBe(400);
  });

  it("signs in, and gives the same answer for a wrong password and an unknown email", async () => {
    await account();
    const ok = await login(req("/api/auth/login", { method: "POST", body: { email: "ADA@example.com", password: "correct horse" }, ip: "10.1.0.1" }));
    expect(ok.status).toBe(200);
    const wrong = await login(req("/api/auth/login", { method: "POST", body: { email: "ada@example.com", password: "wrong pass!" }, ip: "10.1.0.2" }));
    const unknown = await login(req("/api/auth/login", { method: "POST", body: { email: "who@example.com", password: "wrong pass!" }, ip: "10.1.0.3" }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).error).toBe((await unknown.json()).error);
  });

  it("refuses cross-site and non-JSON requests", async () => {
    const evil = await signup(req("/api/auth/signup", { method: "POST", body: { email: "x@example.com", password: "correct horse" }, origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    const form = await login(req("/api/auth/login", { method: "POST", body: { email: "x@example.com" }, contentType: "application/x-www-form-urlencoded" }));
    expect(form.status).toBe(415);
  });

  it("saves, lists and loads projects for the signed-in user only", async () => {
    const ada = await account();
    const bob = await account("bob@example.com");
    expect((await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 1000) } }), ctx("abc123def"))).status).toBe(401);

    const saved = await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 1000) }, cookie: ada }), ctx("abc123def"));
    expect(saved.status).toBe(200);
    const listed = await (await list(req("/api/projects", { cookie: ada }))).json();
    expect(listed.projects).toEqual([{ id: "abc123def", name: "Habit Hero", updatedAt: 1000 }]);
    const full = await (await getOne(req("/api/projects/abc123def", { cookie: ada }), ctx("abc123def"))).json();
    expect(full.project.files["App.js"]).toContain("export default");

    // Another account can't see it.
    expect((await getOne(req("/api/projects/abc123def", { cookie: bob }), ctx("abc123def"))).status).toBe(404);
    expect((await (await list(req("/api/projects", { cookie: bob }))).json()).projects).toEqual([]);
  });

  it("keeps the newest copy when two devices save", async () => {
    const ada = await account();
    await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 2000, "New name") }, cookie: ada }), ctx("abc123def"));
    const stale = await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 1500, "Old name") }, cookie: ada }), ctx("abc123def"));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ saved: false, updatedAt: 2000 });
    const full = await (await getOne(req("/api/projects/abc123def", { cookie: ada }), ctx("abc123def"))).json();
    expect(full.project.name).toBe("New name");
  });

  it("remembers deletions so other devices delete their copy too", async () => {
    const ada = await account();
    await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 1000) }, cookie: ada }), ctx("abc123def"));
    expect((await del(req("/api/projects/abc123def", { method: "DELETE", cookie: ada }), ctx("abc123def"))).status).toBe(200);
    const [meta] = (await (await list(req("/api/projects", { cookie: ada }))).json()).projects;
    expect(meta).toMatchObject({ id: "abc123def", deletedAt: expect.any(Number) });
    expect((await getOne(req("/api/projects/abc123def", { cookie: ada }), ctx("abc123def"))).status).toBe(404);

    // An old copy from another device doesn't bring it back…
    expect((await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", 1500) }, cookie: ada }), ctx("abc123def"))).status).toBe(409);
    // …but an edit made after the deletion does.
    const later = Date.now() + 60_000;
    expect((await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("abc123def", later) }, cookie: ada }), ctx("abc123def"))).status).toBe(200);
    expect((await getOne(req("/api/projects/abc123def", { cookie: ada }), ctx("abc123def"))).status).toBe(200);
  });

  it("validates project saves", async () => {
    const ada = await account();
    expect((await put(req("/api/projects/abc123def", { method: "PUT", body: { project: project("other1234", 1000) }, cookie: ada }), ctx("abc123def"))).status).toBe(400);
    expect((await put(req("/api/projects/../x", { method: "PUT", body: { project: project("../x", 1000) }, cookie: ada }), ctx("../x"))).status).toBe(400);
    const huge = { ...project("abc123def", 1000), files: { "App.js": "x".repeat(4_100_000) } };
    expect((await put(req("/api/projects/abc123def", { method: "PUT", body: { project: huge }, cookie: ada }), ctx("abc123def"))).status).toBe(413);
  });

  it("signing out ends the session", async () => {
    const ada = await account();
    const out = await logout(req("/api/auth/logout", { method: "POST", body: {}, cookie: ada }));
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(await (await me(req("/api/auth/me", { cookie: ada }))).json()).toMatchObject({ enabled: true, user: null });
    expect((await list(req("/api/projects", { cookie: ada }))).status).toBe(401);
  });

  it("shows the database on the status page", async () => {
    expect((await (await status(req("/api/status"))).json()).database).toEqual({ configured: true, ok: true });
  });
});

describe("without a database", () => {
  it("turns accounts off", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(await (await me(req("/api/auth/me"))).json()).toEqual({ enabled: false, user: null });
    expect((await signup(req("/api/auth/signup", { method: "POST", body: { email: "a@example.com", password: "correct horse" } }))).status).toBe(404);
    expect((await (await status(req("/api/status"))).json()).database).toEqual({ configured: false });
    if (saved) process.env.DATABASE_URL = saved;
  });
});
