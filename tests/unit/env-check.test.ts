import { describe, expect, it } from "vitest";
import { envReport } from "@/lib/env-check";

describe("server settings report", () => {
  it("lists known settings by name, never values", () => {
    const r = envReport({ REPLICATE_API_TOKEN: "r8_secret", APPMAKER_PROVIDER: "replicate", EXPO_TOKEN: " ", PATH: "/bin" });
    expect(r.set).toEqual(expect.arrayContaining(["REPLICATE_API_TOKEN", "APPMAKER_PROVIDER"]));
    expect(r.empty).toEqual(["EXPO_TOKEN"]);
    expect(JSON.stringify(r)).not.toContain("r8_secret");
    expect(r.nearMisses).toEqual([]);
  });

  it("spots misspelled names", () => {
    const r = envReport({ replicate_api_token: "x", REPLICATE_API_KEY: "x", EXPO_ACCESS_TOKEN: "x", "ANTHROPIC-API-KEY": "x", RAILWAY_ENVIRONMENT: "production" });
    expect(r.nearMisses).toEqual(
      expect.arrayContaining([
        { found: "replicate_api_token", expected: "REPLICATE_API_TOKEN" },
        { found: "REPLICATE_API_KEY", expected: "REPLICATE_API_TOKEN" },
        { found: "EXPO_ACCESS_TOKEN", expected: "EXPO_TOKEN" },
        { found: "ANTHROPIC-API-KEY", expected: "ANTHROPIC_API_KEY" },
      ]),
    );
    expect(r.nearMisses.map((m) => m.found)).not.toContain("RAILWAY_ENVIRONMENT");
    expect(r.set).toEqual([]);
  });

  it("notices forced demo mode", () => {
    expect(envReport({ APPMAKER_DEMO: "1" }).demoForced).toBe(true);
  });
});

describe("hosting details", () => {
  it("names the Railway service and environment serving the site", () => {
    const r = envReport({ RAILWAY_SERVICE_NAME: "appmaker", RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_GIT_COMMIT_SHA: "808ec82abcdef" });
    expect(r.host).toEqual({ platform: "Railway", service: "appmaker", environment: "production", commit: "808ec82" });
    expect(envReport({}).host).toBeUndefined();
  });
});
