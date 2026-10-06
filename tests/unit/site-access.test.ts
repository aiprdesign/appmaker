import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { POST as unlock } from "@/app/api/access/route";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as accessStatus } from "@/app/api/admin/access/route";
import { adminCookie } from "@/lib/server/admin";
import { ipAllowed, ipMatches, openWhileLocked, safeNext, trustedIp } from "@/lib/server/site-access";

let n = 0;
const nextIp = () => `10.9.${Math.floor(++n / 250)}.${n % 250}`;

function page(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { host: "localhost:3000", ...headers },
  });
}
function post(path: string, body: unknown, ip: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-real-ip": ip,
    },
    body: JSON.stringify(body),
  });
}
const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

afterEach(() => {
  delete process.env.SITE_PIN;
  delete process.env.SITE_ALLOWED_IPS;
  delete process.env.ADMIN_PASSWORD;
});

describe("site lock", () => {
  it("does nothing without SITE_PIN", () => {
    const res = proxy(page("/projects"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends visitors to the PIN page, and API calls get 401", async () => {
    process.env.SITE_PIN = "4321";
    const res = proxy(page("/projects?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/access?next=%2Fprojects%3Fx%3D1");
    const api = proxy(page("/api/generate"));
    expect(api.status).toBe(401);
    expect((await api.json()).error).toMatch(/locked/);
  });

  it("keeps the admin area, legal pages and published-app endpoints open", () => {
    for (const p of [
      "/access",
      "/api/access",
      "/admin",
      "/api/admin/login",
      "/privacy",
      "/terms",
      "/legal/abc",
      "/owner/abc",
      "/api/book/abc",
      "/api/stripe/webhook",
      "/api/live/abc",
      "/api/status",
    ]) {
      expect(openWhileLocked(p), p).toBe(true);
    }
    for (const p of ["/", "/projects", "/api/generate", "/administrator", "/api/livestream"]) expect(openWhileLocked(p), p).toBe(false);
  });

  it("lets the right PIN in and the cookie works until the PIN changes", async () => {
    process.env.SITE_PIN = "4321";
    const ip = nextIp();
    const res = await unlock(post("/api/access", { pin: "4321", next: "/projects" }, ip));
    expect(res.status).toBe(200);
    expect((await res.json()).next).toBe("/projects");
    const cookie = cookieOf(res);
    expect(proxy(page("/projects", { cookie })).headers.get("location")).toBeNull();
    expect(proxy(page("/projects", { cookie: "appmaker_access=9999999999999.forged" })).status).toBe(307);
    process.env.SITE_PIN = "9999";
    expect(proxy(page("/projects", { cookie })).status).toBe(307);
  });

  it("locks a visitor out after 3 wrong PINs, even with the right one", async () => {
    process.env.SITE_PIN = "4321";
    const ip = nextIp();
    const first = await unlock(post("/api/access", { pin: "0000" }, ip));
    expect(first.status).toBe(401);
    expect((await first.json()).error).toBe("That's not the PIN. 2 tries left.");
    expect((await (await unlock(post("/api/access", { pin: "0001" }, ip))).json()).error).toBe("That's not the PIN. 1 try left.");
    const third = await unlock(post("/api/access", { pin: "0002" }, ip));
    expect(third.status).toBe(429);
    expect((await third.json()).error).toMatch(/Too many wrong tries. Wait 15 minutes/);
    expect((await unlock(post("/api/access", { pin: "4321" }, ip))).status).toBe(429);
    // Someone else is unaffected.
    expect((await unlock(post("/api/access", { pin: "4321" }, nextIp()))).status).toBe(200);
  });

  it("a right PIN clears earlier wrong tries", async () => {
    process.env.SITE_PIN = "4321";
    const ip = nextIp();
    await unlock(post("/api/access", { pin: "0000" }, ip));
    await unlock(post("/api/access", { pin: "0000" }, ip));
    expect((await unlock(post("/api/access", { pin: "4321" }, ip))).status).toBe(200);
    expect((await (await unlock(post("/api/access", { pin: "0000" }, ip))).json()).error).toMatch(/2 tries left/);
  });

  it("only goes back to a path on this site", () => {
    expect(safeNext("/projects?a=1")).toBe("/projects?a=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/access", 5, undefined]) expect(safeNext(bad)).toBe("/");
  });
});

describe("allowlist", () => {
  it("matches exact addresses and IPv4 ranges", () => {
    expect(ipMatches("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(ipMatches("::ffff:203.0.113.7", "203.0.113.7")).toBe(true);
    expect(ipMatches("203.0.113.200", "203.0.113.0/24")).toBe(true);
    expect(ipMatches("203.0.114.1", "203.0.113.0/24")).toBe(false);
    expect(ipMatches("2001:DB8::1", "2001:db8::1")).toBe(true);
    expect(ipMatches("203.0.113.7", "203.0.113.0/40")).toBe(false);
    process.env.SITE_ALLOWED_IPS = "198.51.100.1, 203.0.113.0/24";
    expect(ipAllowed("203.0.113.9")).toBe(true);
    expect(ipAllowed("198.51.100.2")).toBe(false);
    expect(ipAllowed("")).toBe(false);
  });

  it("trusts the proxy's address, not the first forwarded one the browser can fake", () => {
    const r = (h: Record<string, string>) => new Request("http://localhost/", { headers: h });
    expect(trustedIp(r({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.7" }))).toBe("198.51.100.1");
    expect(trustedIp(r({ "x-forwarded-for": "203.0.113.7, 198.51.100.1" }))).toBe("198.51.100.1");
  });

  it("lets allowlisted addresses and signed-in admins skip the PIN", () => {
    process.env.SITE_PIN = "4321";
    process.env.SITE_ALLOWED_IPS = "203.0.113.7";
    expect(proxy(page("/projects", { "x-real-ip": "203.0.113.7" })).headers.get("location")).toBeNull();
    expect(proxy(page("/projects", { "x-real-ip": "203.0.113.8" })).status).toBe(307);
    // A faked first forwarded address doesn't get in.
    expect(proxy(page("/projects", { "x-forwarded-for": "203.0.113.7, 198.51.100.1" })).status).toBe(307);
    process.env.ADMIN_PASSWORD = "admin-pass";
    const admin = adminCookie(new Request("http://localhost:3000/")).split(";")[0];
    expect(proxy(page("/projects", { cookie: admin })).headers.get("location")).toBeNull();
  });
});

describe("admin password", () => {
  it("locks after 3 wrong tries", async () => {
    process.env.ADMIN_PASSWORD = "admin-pass";
    const ip = nextIp();
    expect((await (await adminLogin(post("/api/admin/login", { password: "x" }, ip))).json()).error).toBe("That's not the admin password. 2 tries left.");
    await adminLogin(post("/api/admin/login", { password: "x" }, ip));
    const third = await adminLogin(post("/api/admin/login", { password: "x" }, ip));
    expect(third.status).toBe(429);
    expect((await adminLogin(post("/api/admin/login", { password: "admin-pass" }, ip))).status).toBe(429);
    expect((await adminLogin(post("/api/admin/login", { password: "admin-pass" }, nextIp()))).status).toBe(200);
  });

  it("admins can see the lock status and their address", async () => {
    process.env.ADMIN_PASSWORD = "admin-pass";
    process.env.SITE_PIN = "4321";
    process.env.SITE_ALLOWED_IPS = "203.0.113.7,198.51.100.0/24";
    const cookie = cookieOf(await adminLogin(post("/api/admin/login", { password: "admin-pass" }, nextIp())));
    const res = await accessStatus(
      new Request("http://localhost:3000/api/admin/access", {
        headers: { cookie, "x-real-ip": "203.0.113.7" },
      }),
    );
    expect(await res.json()).toEqual({
      locked: true,
      allowed: 2,
      ip: "203.0.113.7",
      ipAllowed: true,
    });
    expect((await accessStatus(new Request("http://localhost:3000/api/admin/access"))).status).toBe(401);
  });
});
