import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { createServer, type Server } from "node:http";
import forge from "node-forge";

/**
 * A small stand-in for the App Store Connect API: bundle IDs, capabilities,
 * certificates and provisioning profiles, with real JWT checks.
 */

export function makeTeamKey(keyId = "2X9R4HXF34", issuerId = "57246542-96fe-1a63-e053-0824d011072a") {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { keyId, issuerId, p8: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

interface Profile {
  id: string;
  name: string;
  bundleId: string;
  certificateIds: string[];
  state: string;
  content: string;
}

export interface FakeAscState {
  bundleIds: { id: string; identifier: string; capabilities: string[] }[];
  certificates: Map<string, { expirationDate: string }>;
  profiles: Profile[];
  calls: string[];
  /** Answer certificate creation with Apple's "too many certificates" error. */
  certLimit: boolean;
  /** Answer everything with 403, like a key without enough access. */
  forbidden: boolean;
}

export async function startFakeAsc(key: { keyId: string; issuerId: string; p8: string }) {
  const publicKey = createPublicKey(key.p8);
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const state: FakeAscState = { bundleIds: [], certificates: new Map(), profiles: [], calls: [], certLimit: false, forbidden: false };
  let seq = 0;

  const authorized = (auth?: string) => {
    const token = auth?.replace(/^Bearer /, "") ?? "";
    const [h, p, s] = token.split(".");
    if (!s) return false;
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    return ok && header.kid === key.keyId && header.alg === "ES256" && payload.iss === key.issuerId && payload.aud === "appstoreconnect-v1";
  };

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const url = new URL(req.url!, "http://x");
      state.calls.push(`${req.method} ${url.pathname}`);
      const send = (status: number, body?: unknown) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      const error = (status: number, detail: string) => send(status, { errors: [{ status: String(status), detail }] });
      if (!authorized(req.headers.authorization)) return error(401, "Authentication credentials are missing or invalid.");
      if (state.forbidden) return error(403, "The API key in use does not allow this request");
      const body = raw ? JSON.parse(raw) : null;
      const path = url.pathname;
      let m: RegExpExecArray | null;

      if (req.method === "GET" && path === "/v1/bundleIds") {
        const id = url.searchParams.get("filter[identifier]");
        // Apple's filter also matches longer identifiers; callers must check exactly.
        const list = state.bundleIds.filter((b) => b.identifier.startsWith(id ?? ""));
        return send(200, { data: list.map((b) => ({ id: b.id, type: "bundleIds", attributes: { identifier: b.identifier } })) });
      }
      if (req.method === "POST" && path === "/v1/bundleIds") {
        const b = { id: `BID${++seq}`, identifier: body.data.attributes.identifier, capabilities: [] };
        state.bundleIds.push(b);
        return send(201, { data: { id: b.id, type: "bundleIds", attributes: { identifier: b.identifier } } });
      }
      if ((m = /^\/v1\/bundleIds\/(\w+)\/bundleIdCapabilities$/.exec(path))) {
        const b = state.bundleIds.find((x) => x.id === m![1])!;
        return send(200, { data: b.capabilities.map((c, i) => ({ id: `${b.id}_${i}`, type: "bundleIdCapabilities", attributes: { capabilityType: c } })) });
      }
      if (req.method === "POST" && path === "/v1/bundleIdCapabilities") {
        const b = state.bundleIds.find((x) => x.id === body.data.relationships.bundleId.data.id)!;
        b.capabilities.push(body.data.attributes.capabilityType);
        // Adding a capability invalidates the bundle's profiles.
        for (const p of state.profiles) if (p.bundleId === b.id) p.state = "INVALID";
        return send(201, { data: { id: "cap", type: "bundleIdCapabilities", attributes: {} } });
      }
      if ((m = /^\/v1\/certificates\/(\w+)$/.exec(path))) {
        const c = state.certificates.get(m[1]);
        return c ? send(200, { data: { id: m[1], type: "certificates", attributes: c } }) : error(404, "not found");
      }
      if (req.method === "POST" && path === "/v1/certificates") {
        if (state.certLimit) return error(409, "You already have a current Distribution certificate or a pending certificate request.");
        const csr = forge.pki.certificationRequestFromPem(body.data.attributes.csrContent);
        if (!csr.verify()) return error(400, "invalid CSR");
        const cert = forge.pki.createCertificate();
        cert.publicKey = csr.publicKey as forge.pki.PublicKey;
        cert.serialNumber = String(++seq).padStart(4, "0");
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
        cert.setSubject(csr.subject.attributes);
        cert.setIssuer([{ name: "commonName", value: "Fake Apple WWDR" }]);
        cert.sign(ca.privateKey, forge.md.sha256.create());
        const id = `CERT${seq}`;
        const expirationDate = cert.validity.notAfter.toISOString();
        state.certificates.set(id, { expirationDate });
        const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
        return send(201, { data: { id, type: "certificates", attributes: { certificateContent: forge.util.encode64(der), serialNumber: cert.serialNumber, expirationDate } } });
      }
      if ((m = /^\/v1\/bundleIds\/(\w+)\/profiles$/.exec(path))) {
        const list = state.profiles.filter((p) => p.bundleId === m![1]);
        return send(200, {
          data: list.map((p) => ({ id: p.id, type: "profiles", attributes: { name: p.name, profileState: p.state, profileType: "IOS_APP_STORE", profileContent: p.content } })),
        });
      }
      if ((m = /^\/v1\/profiles\/(\w+)\/certificates$/.exec(path))) {
        const p = state.profiles.find((x) => x.id === m![1])!;
        return send(200, { data: p.certificateIds.map((id) => ({ id, type: "certificates", attributes: {} })) });
      }
      if (req.method === "DELETE" && (m = /^\/v1\/profiles\/(\w+)$/.exec(path))) {
        state.profiles = state.profiles.filter((p) => p.id !== m![1]);
        return send(204);
      }
      if (req.method === "POST" && path === "/v1/profiles") {
        const name = body.data.attributes.name;
        if (state.profiles.some((p) => p.name === name)) return error(409, "Multiple profiles found with the name");
        const p: Profile = {
          id: `PROF${++seq}`,
          name,
          bundleId: body.data.relationships.bundleId.data.id,
          certificateIds: body.data.relationships.certificates.data.map((c: { id: string }) => c.id),
          state: "ACTIVE",
          content: Buffer.from(`PROFILE-${seq}`).toString("base64"),
        };
        state.profiles.push(p);
        return send(201, { data: { id: p.id, type: "profiles", attributes: { name, profileState: "ACTIVE", profileType: "IOS_APP_STORE", profileContent: p.content } } });
      }
      error(404, `no fake for ${req.method} ${path}`);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url, state, close: () => server.close() };
}
