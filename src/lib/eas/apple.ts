import { createPrivateKey, createSign, randomBytes } from "node:crypto";
import forge from "node-forge";
import { EasError } from "./errors";
import type { AscApiKey } from "./input";

/**
 * iOS signing without anyone signing in to Apple interactively. With the
 * user's App Store Connect API key, Appmaker registers the bundle ID, creates
 * an Apple Distribution certificate (once per team) and an App Store
 * provisioning profile, then hands them to EAS as local credentials.
 *
 * The certificate's private key never stays on the server: it goes back to
 * the user's browser inside a password-protected .p12 and is sent with later
 * builds, because Apple only allows a few distribution certificates per team.
 */

const ascApi = () => (process.env.APPMAKER_ASC_API_URL || "https://api.appstoreconnect.apple.com").replace(/\/$/, "");

/** A distribution certificate Appmaker created, kept in the user's browser. */
export interface AppleSigning {
  /** Issuer ID of the key that created it: certificates belong to one Apple team. */
  issuerId: string;
  certificateId: string;
  serialNumber?: string;
  expires?: string;
  /** Base64 .p12 with the certificate and its private key. */
  p12: string;
  password: string;
}

export interface SigningResult {
  signing: AppleSigning;
  /** True when a new certificate was made, so the browser should save it. */
  created: boolean;
  /** The App Store provisioning profile (.mobileprovision). */
  profile: Buffer;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Signed JWT for the App Store Connect API (ES256, 20 minutes). */
export function ascToken(key: AscApiKey, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = { alg: "ES256", kid: key.keyId, typ: "JWT" };
  const payload = key.issuerId
    ? { iss: key.issuerId, iat, exp: iat + 1200, aud: "appstoreconnect-v1" }
    : { sub: "user", iat, exp: iat + 1200, aud: "appstoreconnect-v1" };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  let privateKey;
  try {
    privateKey = createPrivateKey(key.p8);
  } catch {
    throw new EasError("The App Store Connect key file couldn't be read. Download a new .p8 key and add it again.", 400);
  }
  const signature = createSign("SHA256").update(input).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(signature)}`;
}

interface AscResource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
}

async function asc<T>(key: AscApiKey, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ascApi()}${path}`, {
      method,
      headers: { authorization: `Bearer ${ascToken(key)}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof EasError) throw e;
    throw new EasError("Couldn't reach App Store Connect. Try again in a moment.", 502);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { data?: unknown; errors?: { status?: string; code?: string; title?: string; detail?: string }[] } | null;
  if (res.ok) return data as T;
  const err = data?.errors?.[0];
  const detail = err?.detail || err?.title || `HTTP ${res.status}`;
  if (res.status === 401) {
    throw new EasError("Apple didn't accept the App Store Connect API key. Check the Key ID, Issuer ID and .p8 file.", 401, "apple");
  }
  if (res.status === 403) {
    throw new EasError(
      "This App Store Connect API key isn't allowed to manage certificates. Create a Team key with Admin access and add it again.",
      403,
      "apple",
    );
  }
  throw new AscHttpError(res.status, detail);
}

export class AscHttpError extends EasError {
  constructor(
    public httpStatus: number,
    detail: string,
  ) {
    super(`App Store Connect: ${detail}`, 502, "apple");
  }
}

async function ensureBundleId(key: AscApiKey, bundleId: string, name: string): Promise<string> {
  const found = await asc<{ data: AscResource<{ identifier: string }>[] }>(
    key,
    "GET",
    `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}&limit=200`,
  );
  const match = found.data.find((b) => b.attributes.identifier === bundleId);
  if (match) return match.id;
  const created = await asc<{ data: AscResource }>(key, "POST", "/v1/bundleIds", {
    data: { type: "bundleIds", attributes: { identifier: bundleId, name: name.replace(/[^A-Za-z0-9 ]/g, "").trim() || "App", platform: "IOS" } },
  });
  return created.data.id;
}

async function ensurePushCapability(key: AscApiKey, bundleIdId: string): Promise<boolean> {
  const caps = await asc<{ data: AscResource<{ capabilityType: string }>[] }>(key, "GET", `/v1/bundleIds/${bundleIdId}/bundleIdCapabilities`);
  if (caps.data.some((c) => c.attributes.capabilityType === "PUSH_NOTIFICATIONS")) return false;
  await asc(key, "POST", "/v1/bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
      relationships: { bundleId: { data: { type: "bundleIds", id: bundleIdId } } },
    },
  });
  return true;
}

/** Checks that a saved certificate still exists on the team and hasn't expired. */
async function certificateUsable(key: AscApiKey, signing: AppleSigning): Promise<boolean> {
  if (signing.issuerId !== key.issuerId) return false;
  try {
    const cert = await asc<{ data: AscResource<{ expirationDate?: string }> }>(key, "GET", `/v1/certificates/${encodeURIComponent(signing.certificateId)}`);
    const expires = cert.data.attributes.expirationDate ? Date.parse(cert.data.attributes.expirationDate) : Infinity;
    return expires > Date.now() + 24 * 3600_000;
  } catch (e) {
    if (e instanceof AscHttpError && e.httpStatus === 404) return false;
    throw e;
  }
}

async function createCertificate(key: AscApiKey): Promise<AppleSigning> {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: "commonName", value: "Appmaker Distribution" },
    { name: "countryName", value: "US" },
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  let created: { data: AscResource<{ certificateContent: string; serialNumber?: string; expirationDate?: string }> };
  try {
    created = await asc(key, "POST", "/v1/certificates", {
      data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: forge.pki.certificationRequestToPem(csr) } },
    });
  } catch (e) {
    if (e instanceof AscHttpError && e.httpStatus === 409) {
      throw new EasError(
        "Your Apple team already has the maximum number of distribution certificates. Revoke one you don't use at developer.apple.com → Certificates, then build again.",
        409,
        "apple",
      );
    }
    throw e;
  }
  const der = forge.util.decode64(created.data.attributes.certificateContent);
  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
  const password = randomBytes(18).toString("base64url");
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des", friendlyName: "Appmaker Distribution" });
  return {
    issuerId: key.issuerId,
    certificateId: created.data.id,
    ...(created.data.attributes.serialNumber ? { serialNumber: created.data.attributes.serialNumber } : {}),
    ...(created.data.attributes.expirationDate ? { expires: created.data.attributes.expirationDate } : {}),
    p12: forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    password,
  };
}

interface ProfileAttributes {
  name: string;
  profileState: string;
  profileType: string;
  profileContent?: string;
  expirationDate?: string;
}

async function ensureProfile(key: AscApiKey, bundleIdId: string, bundleId: string, certificateId: string, fresh: boolean): Promise<Buffer> {
  const name = `Appmaker App Store ${bundleId}`;
  const existing = await asc<{ data: AscResource<ProfileAttributes>[] }>(key, "GET", `/v1/bundleIds/${bundleIdId}/profiles?limit=200`);
  for (const p of existing.data.filter((p) => p.attributes.name === name)) {
    const active = p.attributes.profileState === "ACTIVE" && (!p.attributes.expirationDate || Date.parse(p.attributes.expirationDate) > Date.now() + 24 * 3600_000);
    if (!fresh && active && p.attributes.profileContent) {
      const certs = await asc<{ data: AscResource[] }>(key, "GET", `/v1/profiles/${p.id}/certificates`);
      if (certs.data.some((c) => c.id === certificateId)) return Buffer.from(p.attributes.profileContent, "base64");
    }
    // Stale (new certificate or capability): replace it so names stay unique.
    await asc(key, "DELETE", `/v1/profiles/${p.id}`);
  }
  const created = await asc<{ data: AscResource<ProfileAttributes> }>(key, "POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name, profileType: "IOS_APP_STORE" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundleIdId } },
        certificates: { data: [{ type: "certificates", id: certificateId }] },
      },
    },
  });
  if (!created.data.attributes.profileContent) throw new EasError("App Store Connect didn't return the provisioning profile. Try again.", 502, "apple");
  return Buffer.from(created.data.attributes.profileContent, "base64");
}

/** Everything EAS needs to sign an App Store build, created or reused on the user's Apple team. */
export async function ensureSigning(opts: {
  key: AscApiKey;
  bundleId: string;
  appName: string;
  push: boolean;
  signing?: AppleSigning;
}): Promise<SigningResult> {
  if (!opts.key.issuerId) {
    throw new EasError(
      "Apple only lets Team API keys create certificates. Add a Team key (it has an Issuer ID) under Users and Access → Integrations.",
      400,
      "apple",
    );
  }
  const bundleIdId = await ensureBundleId(opts.key, opts.bundleId, opts.appName);
  const capabilityAdded = opts.push ? await ensurePushCapability(opts.key, bundleIdId) : false;
  let signing = opts.signing && (await certificateUsable(opts.key, opts.signing)) ? opts.signing : undefined;
  const created = !signing;
  signing ??= await createCertificate(opts.key);
  const profile = await ensureProfile(opts.key, bundleIdId, opts.bundleId, signing.certificateId, created || capabilityAdded);
  return { signing, created, profile };
}
