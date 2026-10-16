import { describe, expect, it } from "vitest";
import { crossSiteWrite } from "@/lib/server/site-access";

describe("crossSiteWrite", () => {
  it("refuses API changes sent from other sites", () => {
    expect(crossSiteWrite("POST", "/api/generate", "https://evil.example", "appmaker.app")).toBe(true);
    expect(crossSiteWrite("DELETE", "/api/auth/passkeys/x", "null", "appmaker.app")).toBe(true);
  });
  it("allows same-site, reads, no Origin, and endpoints published apps call", () => {
    expect(crossSiteWrite("POST", "/api/generate", "https://appmaker.app", "appmaker.app")).toBe(false);
    expect(crossSiteWrite("GET", "/api/projects", "https://evil.example", "appmaker.app")).toBe(false);
    expect(crossSiteWrite("POST", "/api/generate", null, "appmaker.app")).toBe(false);
    expect(crossSiteWrite("POST", "/api/appdata/abc/orders", "null", "appmaker.app")).toBe(false);
    expect(crossSiteWrite("POST", "/api/stripe/webhook", "https://stripe.com", "appmaker.app")).toBe(false);
  });
});

import { isPushToken, parseWebToken } from "@/lib/server/app-alerts";

describe("customer notification addresses", () => {
  const sub = { endpoint: "https://push.example.com/abc", keys: { p256dh: "p", auth: "a" } };
  it("accepts store-app tokens and web app subscriptions", () => {
    expect(isPushToken("ExponentPushToken[abcdefghijklmnop]")).toBe(true);
    const web = "web:" + JSON.stringify({ s: sub, u: "/a/AbC123x" });
    expect(isPushToken(web)).toBe(true);
    expect(parseWebToken(web)).toEqual({ sub, url: "/a/AbC123x" });
  });
  it("refuses anything else, and never links outside the web app", () => {
    expect(isPushToken("web:{}")).toBe(false);
    expect(isPushToken("web:" + JSON.stringify({ s: { ...sub, endpoint: "http://insecure" } }))).toBe(false);
    expect(parseWebToken("web:" + JSON.stringify({ s: sub, u: "https://evil.example" }))?.url).toBe("/");
    expect(isPushToken("hello")).toBe(false);
  });
});
