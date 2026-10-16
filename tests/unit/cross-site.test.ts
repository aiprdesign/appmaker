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
