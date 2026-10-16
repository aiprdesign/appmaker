import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Customers' details (names, phones, addresses, order notes) are encrypted before they're saved, with
 * AES-256-GCM and a key kept outside the database (the DATA_ENCRYPTION_KEY variable): a copy of the
 * database or a backup on its own can't be read. Without the key set, records are stored as before;
 * records saved either way are always readable while the key is there.
 */

const PREFIX = "v1";
let cached: { raw: string; key: Buffer | null } | null = null;

function key(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (cached?.raw === raw) return cached.key;
  let k: Buffer | null = null;
  if (raw) {
    const b64 = Buffer.from(raw, "base64");
    // A 32-byte key (openssl rand -base64 32); any other value is stretched to one.
    k = b64.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(raw) ? b64 : createHash("sha256").update(raw).digest();
  }
  cached = { raw, key: k };
  return k;
}

export const encryptionOn = () => !!key();

/** What goes in the database: { $e: "v1.iv.tag.data" } when encryption is on, the record itself otherwise. */
export function seal(data: Record<string, unknown>): Record<string, unknown> {
  const k = key();
  if (!k) return data;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return { $e: [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".") };
}

/** The record as saved: decrypted when it was encrypted. */
export function unseal(data: unknown): Record<string, unknown> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof d.$e !== "string") return d;
  const k = key();
  const [v, iv, tag, body] = d.$e.split(".");
  if (!k || v !== PREFIX || !iv || !tag || !body) return {};
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8"));
  } catch {
    // Wrong key (it was changed) or damaged: never show garbage.
    return {};
  }
}

/** The same for a single text column (bookings' name, phone and note): "enc:v1.…" when encryption is on. */
export function sealText(text: string): string {
  return encryptionOn() && text ? `enc:${String(seal({ t: text }).$e)}` : text;
}

export function unsealText(text: string): string {
  if (!text.startsWith("enc:")) return text;
  const v = unseal({ $e: text.slice(4) }).t;
  return typeof v === "string" ? v : "";
}
