import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as getFeatures, PUT as putFeature } from "@/app/api/admin/features/route";
import { GET as overview } from "@/app/api/admin/overview/route";
import { GET as members } from "@/app/api/admin/members/route";
import { DELETE as deleteMember, POST as memberAction } from "@/app/api/admin/members/[id]/route";
import { GET as publicFeatures } from "@/app/api/features/route";
import { GET as adminApps } from "@/app/api/admin/apps/route";
import { DELETE as adminDeleteApp, GET as adminApp } from "@/app/api/admin/apps/[userId]/[id]/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as passkeyOptions } from "@/app/api/auth/passkey/login/options/route";
import { POST as site } from "@/app/api/site/route";
import { GET as easAccount } from "@/app/api/eas/account/route";
import { GET as status } from "@/app/api/status/route";
import { PUT as putProject } from "@/app/api/projects/[id]/route";
import { closeDatabase, query } from "@/lib/server/db";
import { clearFeatureCache } from "@/lib/server/features";
import { defaultFeatures } from "@/lib/features";

const DB = process.env.TEST_DATABASE_URL;
const PASSWORD = "admin-test-password";
let ip = 0;

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", origin: "http://localhost:3000", "x-forwarded-for": `10.6.${Math.floor(++ip / 250)}.${ip % 250}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
const cookie = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

describe("admin area without a password", () => {
  it("is off", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await adminLogin(req("/api/admin/login", { method: "POST", body: { password: "x" } }))).status).toBe(404);
    expect((await getFeatures(req("/api/admin/features"))).status).toBe(404);
  });
});

describe.skipIf(!DB)("admin dashboard (PostgreSQL)", () => {
  let admin = "";
  const setSwitch = (key: string, on: boolean) => putFeature(req("/api/admin/features", { method: "PUT", body: { key, on }, cookie: admin }));

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.ADMIN_PASSWORD = PASSWORD;
    await query("delete from app_users where email like '%@admin-test.example'");
    const res = await adminLogin(req("/api/admin/login", { method: "POST", body: { password: PASSWORD } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict; Max-Age=43200/);
    admin = cookie(res);
  });
  beforeEach(async () => {
    await query("delete from app_users where email like '%@admin-test.example'");
    await query("delete from app_settings where key like 'feature.%'");
    clearFeatureCache();
  });
  afterAll(async () => {
    await query("delete from app_settings where key like 'feature.%'");
    await query("delete from app_users where email like '%@admin-test.example'");
    await closeDatabase();
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_PASSWORD;
  });

  it("needs the right password, and changing it signs admins out", async () => {
    expect((await adminLogin(req("/api/admin/login", { method: "POST", body: { password: "nope" } }))).status).toBe(401);
    expect((await getFeatures(req("/api/admin/features"))).status).toBe(401);
    expect((await getFeatures(req("/api/admin/features", { cookie: "appmaker_admin=123.forged" }))).status).toBe(401);
    expect((await getFeatures(req("/api/admin/features", { cookie: admin }))).status).toBe(200);
    process.env.ADMIN_PASSWORD = "a-new-password";
    expect((await getFeatures(req("/api/admin/features", { cookie: admin }))).status).toBe(401);
    process.env.ADMIN_PASSWORD = PASSWORD;
  });

  it("starts with Google off and everything else on", async () => {
    const { features } = await (await getFeatures(req("/api/admin/features", { cookie: admin }))).json();
    expect(features).toEqual(defaultFeatures());
    expect(features.google).toBe(false);
    expect(await (await publicFeatures()).json()).toEqual(defaultFeatures());
  });

  it("switches are enforced on the server", async () => {
    expect((await setSwitch("signups", false)).status).toBe(200);
    const blocked = await signup(req("/api/auth/signup", { method: "POST", body: { email: "new@admin-test.example", password: "correct horse" } }));
    expect(blocked.status).toBe(403);
    expect((await (await me(req("/api/auth/me"))).json()).signups).toBe(false);

    await setSwitch("passkeys", false);
    expect((await passkeyOptions(req("/api/auth/passkey/login/options", { method: "POST", body: {} }))).status).toBe(403);

    await setSwitch("websiteImport", false);
    expect((await site(req("/api/site", { method: "POST", body: { url: "https://example.com" } }))).status).toBe(403);

    await setSwitch("cloudBuilds", false);
    expect(await (await easAccount(req("/api/eas/account"))).json()).toMatchObject({ available: false, off: true });

    await setSwitch("publicStatus", false);
    expect((await status(req("/api/status"))).status).toBe(403);
    expect((await status(req("/api/status", { cookie: admin }))).status).toBe(200);

    expect(await (await publicFeatures()).json()).toMatchObject({ signups: false, passkeys: false, websiteImport: false, cloudBuilds: false, publicStatus: false });
    expect((await putFeature(req("/api/admin/features", { method: "PUT", body: { key: "signups", on: true } }))).status).toBe(401);
    expect((await setSwitch("nonsense", true)).status).toBe(400);
  });

  it("lists, searches, opens and deletes apps", async () => {
    const make = async (email: string) => cookie(await signup(req("/api/auth/signup", { method: "POST", body: { email, password: "correct horse" } })));
    const cy = await make("cy@admin-test.example");
    const dee = await make("dee@admin-test.example");
    const save = (c: string, id: string, name: string, prompt: string) =>
      putProject(
        req(`/api/projects/${id}`, { method: "PUT", body: { project: { id, name, prompt, files: { "App.js": "export default () => null;", "src/a.js": "x" }, listing: { name, iconEmoji: "🧘", primaryColor: "#123456" }, createdAt: 1, updatedAt: Date.now() } }, cookie: c }),
        { params: Promise.resolve({ id }) },
      );
    await save(cy, "cyapp0001", "Calm Breaths", "a breathing app");
    await save(dee, "deeapp001", "Recipe Box", "a recipe book");

    const all = await (await adminApps(req("/api/admin/apps?q=admin-test", { cookie: admin }))).json();
    expect(all.total).toBe(2);
    const calm = all.apps.find((a: { name: string }) => a.name === "Calm Breaths");
    expect(calm).toMatchObject({ owner: "cy@admin-test.example", iconEmoji: "🧘", primaryColor: "#123456", prompt: "a breathing app", files: 2 });
    expect((await (await adminApps(req("/api/admin/apps?q=recipe", { cookie: admin }))).json()).apps.map((a: { name: string }) => a.name)).toContain("Recipe Box");
    const onlyCy = await (await adminApps(req(`/api/admin/apps?user=${calm.userId}`, { cookie: admin }))).json();
    expect(onlyCy.apps.map((a: { name: string }) => a.name)).toEqual(["Calm Breaths"]);
    expect((await adminApps(req("/api/admin/apps"))).status).toBe(401);

    const ctx = { params: Promise.resolve({ userId: calm.userId, id: "cyapp0001" }) };
    const detail = await (await adminApp(req(`/api/admin/apps/${calm.userId}/cyapp0001`, { cookie: admin }), ctx)).json();
    expect(detail).toMatchObject({ owner: "cy@admin-test.example", project: { files: { "App.js": "export default () => null;" } } });
    expect((await adminApp(req(`/api/admin/apps/${calm.userId}/cyapp0001`), { params: Promise.resolve({ userId: calm.userId, id: "cyapp0001" }) })).status).toBe(401);

    expect((await adminDeleteApp(req(`/api/admin/apps/${calm.userId}/cyapp0001`, { method: "DELETE", cookie: admin }), { params: Promise.resolve({ userId: calm.userId, id: "cyapp0001" }) })).status).toBe(200);
    expect((await (await adminApps(req("/api/admin/apps?q=admin-test", { cookie: admin }))).json()).total).toBe(1);
    // The owner's devices see the deletion on their next sync.
    const [row] = await query<{ deleted_at: string | null }>("select deleted_at from app_projects where id = 'cyapp0001'");
    expect(row.deleted_at).not.toBeNull();
  });

  it("shows members and the numbers", async () => {
    const make = async (email: string) => cookie(await signup(req("/api/auth/signup", { method: "POST", body: { email, password: "correct horse" } })));
    const ada = await make("ada@admin-test.example");
    await make("bob@admin-test.example");
    const now = Date.now();
    await putProject(req("/api/projects/adaapp001", { method: "PUT", body: { project: { id: "adaapp001", name: "A", files: {}, updatedAt: now } }, cookie: ada }), { params: Promise.resolve({ id: "adaapp001" }) });

    const o = await (await overview(req("/api/admin/overview", { cookie: admin }))).json();
    expect(o.members).toBeGreaterThanOrEqual(2);
    expect(o.newMembers7d).toBeGreaterThanOrEqual(2);
    expect(o.apps).toBeGreaterThanOrEqual(1);
    expect(o.signupsByDay).toHaveLength(14);
    expect(o.signupsByDay.at(-1).count).toBeGreaterThanOrEqual(2);
    expect((await overview(req("/api/admin/overview"))).status).toBe(401);

    const found = await (await members(req("/api/admin/members?q=admin-test", { cookie: admin }))).json();
    expect(found.total).toBe(2);
    const adaRow = found.members.find((m: { email: string }) => m.email === "ada@admin-test.example");
    expect(adaRow).toMatchObject({ password: true, google: false, passkeys: 0, apps: 1 });
    expect(JSON.stringify(found)).not.toMatch(/scrypt|password_hash|token/);
    expect((await (await members(req("/api/admin/members?q=bob%40admin", { cookie: admin }))).json()).total).toBe(1);

    // Sign a member out everywhere, then delete them.
    expect((await memberAction(req(`/api/admin/members/${adaRow.id}`, { method: "POST", body: { action: "sign-out" }, cookie: admin }), { params: Promise.resolve({ id: adaRow.id }) })).status).toBe(200);
    expect((await (await me(req("/api/auth/me", { cookie: ada }))).json()).user).toBeNull();
    expect((await deleteMember(req(`/api/admin/members/${adaRow.id}`, { method: "DELETE", cookie: admin }), { params: Promise.resolve({ id: adaRow.id }) })).status).toBe(200);
    expect(await query("select 1 from app_projects where user_id = $1", [adaRow.id])).toHaveLength(0);
    expect((await (await members(req("/api/admin/members?q=admin-test", { cookie: admin }))).json()).total).toBe(1);
  });
});
