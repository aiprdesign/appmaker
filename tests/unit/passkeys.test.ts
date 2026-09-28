import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as loginOptions } from "@/app/api/auth/passkey/login/options/route";
import { POST as loginVerify } from "@/app/api/auth/passkey/login/verify/route";
import { POST as registerOptions } from "@/app/api/auth/passkey/register/options/route";
import { closeDatabase } from "@/lib/server/db";
import { deviceName } from "@/lib/server/passkeys";

const DB = process.env.TEST_DATABASE_URL;

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "10.8.8.8", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe("passkey device names", () => {
  it("names passkeys after the device", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("Mac");
    expect(deviceName("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("Android phone");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows PC");
    expect(deviceName("curl/8")).toBe("Passkey");
  });
});

describe.skipIf(!DB)("passkey sign-in checks", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });

  it("issues a one-time challenge for this site", async () => {
    const res = await loginOptions(post("/api/auth/passkey/login/options", {}));
    expect(res.status).toBe(200);
    const { options } = await res.json();
    expect(options.rpId).toBe("localhost");
    expect(options.challenge.length).toBeGreaterThan(20);
    expect(res.headers.get("set-cookie")).toMatch(/^appmaker_webauthn=[\w-]+; Path=\/api\/auth\/passkey; HttpOnly; SameSite=Strict; Max-Age=300/);
  });

  it("refuses unknown passkeys, missing and reused challenges", async () => {
    const fake = { id: "bm90LWEtcmVhbC1wYXNza2V5", rawId: "bm90LWEtcmVhbC1wYXNza2V5", type: "public-key", response: {}, clientExtensionResults: {} };
    expect((await loginVerify(post("/api/auth/passkey/login/verify", { response: fake }))).status).toBe(400);

    const cookie = (await loginOptions(post("/api/auth/passkey/login/options", {}))).headers.get("set-cookie")!.split(";")[0];
    const unknown = await loginVerify(post("/api/auth/passkey/login/verify", { response: fake }, cookie));
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toMatch(/isn't linked to an account/);
    // The challenge was used up by that attempt.
    expect((await loginVerify(post("/api/auth/passkey/login/verify", { response: fake }, cookie))).status).toBe(400);
  });

  it("only signed-in people can add a passkey", async () => {
    expect((await registerOptions(post("/api/auth/passkey/register/options", {}))).status).toBe(401);
  });

  it("refuses requests from other sites", async () => {
    const req = new Request("http://localhost:3000/api/auth/passkey/login/options", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect((await loginOptions(req)).status).toBe(403);
  });
});
