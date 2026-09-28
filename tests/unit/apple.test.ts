import { createPublicKey, verify } from "node:crypto";
import forge from "node-forge";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ascToken, ensureSigning } from "@/lib/eas/apple";
import { makeTeamKey, startFakeAsc } from "./fake-asc";

const key = makeTeamKey();
let asc: Awaited<ReturnType<typeof startFakeAsc>>;

beforeAll(async () => {
  asc = await startFakeAsc(key);
  process.env.APPMAKER_ASC_API_URL = asc.url;
});

afterAll(() => {
  asc.close();
  delete process.env.APPMAKER_ASC_API_URL;
});

beforeEach(() => {
  asc.state.bundleIds = [];
  asc.state.certificates.clear();
  asc.state.profiles = [];
  asc.state.calls = [];
  asc.state.certLimit = false;
  asc.state.forbidden = false;
});

const opts = { key, bundleId: "com.acme.habithero", appName: "Habit Hero!", push: true };

describe("App Store Connect API token", () => {
  it("is an ES256 JWT Apple can verify", () => {
    const [h, p, s] = ascToken(key, Date.UTC(2026, 8, 28)).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: key.keyId, typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toMatchObject({ iss: key.issuerId, aud: "appstoreconnect-v1" });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(1200);
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: createPublicKey(key.p8), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("iOS signing with an API key", () => {
  it("registers the app, enables push and creates a certificate and profile", async () => {
    const result = await ensureSigning(opts);
    expect(result.created).toBe(true);
    expect(asc.state.bundleIds).toEqual([{ id: expect.any(String), identifier: "com.acme.habithero", capabilities: ["PUSH_NOTIFICATIONS"] }]);
    expect(result.profile.toString()).toMatch(/^PROFILE-/);
    expect(result.signing.issuerId).toBe(key.issuerId);

    // The .p12 opens with its password and holds the key that matches the certificate.
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(result.signing.p12)), result.signing.password);
    const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0].cert!;
    const privateKey = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0].key as forge.pki.rsa.PrivateKey;
    expect((cert.publicKey as forge.pki.rsa.PublicKey).n.equals(privateKey.n)).toBe(true);
  });

  it("reuses the saved certificate and a still-valid profile on the next build", async () => {
    const first = await ensureSigning(opts);
    asc.state.calls = [];
    const second = await ensureSigning({ ...opts, signing: first.signing });
    expect(second.created).toBe(false);
    expect(second.signing).toEqual(first.signing);
    expect(second.profile.equals(first.profile)).toBe(true);
    expect(asc.state.calls).not.toContain("POST /v1/certificates");
    expect(asc.state.calls).not.toContain("POST /v1/profiles");
    expect(asc.state.calls).not.toContain("POST /v1/bundleIds");
  });

  it("makes a new certificate and profile when the saved one was revoked", async () => {
    const first = await ensureSigning(opts);
    asc.state.certificates.clear();
    const second = await ensureSigning({ ...opts, signing: first.signing });
    expect(second.created).toBe(true);
    expect(second.signing.certificateId).not.toBe(first.signing.certificateId);
    expect(asc.state.profiles).toHaveLength(1);
    expect(asc.state.profiles[0].certificateIds).toEqual([second.signing.certificateId]);
  });

  it("ignores a certificate saved for a different Apple team", async () => {
    const first = await ensureSigning(opts);
    const second = await ensureSigning({ ...opts, signing: { ...first.signing, issuerId: "11111111-2222-3333-4444-555555555555" } });
    expect(second.created).toBe(true);
  });

  it("explains keys that can't create certificates", async () => {
    await expect(ensureSigning({ ...opts, key: { ...key, issuerId: "" } })).rejects.toMatchObject({ code: "apple", message: expect.stringMatching(/Team key/) });
    asc.state.forbidden = true;
    await expect(ensureSigning(opts)).rejects.toMatchObject({ code: "apple", message: expect.stringMatching(/Admin access/) });
    asc.state.forbidden = false;
    asc.state.certLimit = true;
    await expect(ensureSigning(opts)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/maximum number of distribution certificates/) });
    await expect(ensureSigning({ ...opts, key: makeTeamKey() })).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/didn't accept/) });
  });
});
