import type { BuildTarget, ExpoLink, Project, StoreListing } from "../types";
import { isAllowedPath } from "../validate";

/**
 * Validation for what the browser sends to the cloud-build routes. The
 * server rebuilds the Expo project from these parts itself, so nothing the
 * client sends can place files outside the project or change its config.
 */

export class InputError extends Error {}

export const BUILD_TARGETS: BuildTarget[] = ["ios", "android", "android-apk"];

export interface AscApiKey {
  keyId: string;
  /** Empty for an individual (issuer-less) key. */
  issuerId: string;
  p8: string;
}

const MAX_FILES = 200;
const MAX_CODE = 2_000_000;
const MAX_ICON = 3_000_000;

function str(v: unknown, name: string, max: number): string {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max) throw new InputError(`${name} is invalid`);
  return v;
}

export function parseToken(v: unknown): string {
  const token = typeof v === "string" ? v.trim() : "";
  if (!token) throw new InputError("Connect your Expo account first.");
  if (!/^[A-Za-z0-9_\-.]{10,300}$/.test(token)) throw new InputError("That doesn't look like an Expo access token.");
  return token;
}

export function parseLink(v: unknown): ExpoLink | undefined {
  if (v == null) return undefined;
  const o = v as Record<string, unknown>;
  const projectId = str(o.projectId, "projectId", 64);
  const owner = str(o.owner, "owner", 100);
  const slug = str(o.slug, "slug", 100);
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[A-Za-z0-9_\-.]+$/.test(owner) || !/^[a-z0-9_\-.]+$/i.test(slug)) {
    throw new InputError("The Expo project link is invalid.");
  }
  return { projectId, owner, slug };
}

export function parseProject(v: unknown): Project {
  if (!v || typeof v !== "object") throw new InputError("project is required");
  const o = v as Record<string, unknown>;
  const rawFiles = o.files;
  if (!rawFiles || typeof rawFiles !== "object") throw new InputError("The app has no code yet.");
  const files: Record<string, string> = {};
  let size = 0;
  for (const [path, code] of Object.entries(rawFiles as Record<string, unknown>)) {
    if (typeof code !== "string" || !isAllowedPath(path)) throw new InputError(`File ${path.slice(0, 80)} is invalid`);
    files[path] = code;
    size += code.length;
  }
  if (!files["App.js"] && !files["App.jsx"]) throw new InputError("The app has no code yet.");
  if (Object.keys(files).length > MAX_FILES || size > MAX_CODE) throw new InputError("The app is too large to build.");

  const l = (o.listing ?? {}) as Record<string, unknown>;
  const listing: StoreListing = {
    name: str(l.name, "App name", 60).trim(),
    subtitle: str(l.subtitle, "Subtitle", 200),
    description: str(l.description, "Description", 8000),
    keywords: str(l.keywords, "Keywords", 400),
    category: str(l.category, "Category", 60),
    bundleId: str(l.bundleId, "Bundle ID", 155),
    primaryColor: str(l.primaryColor, "Brand color", 20),
    iconEmoji: str(l.iconEmoji, "Icon", 16),
    privacyNotes: str(l.privacyNotes, "Privacy", 2000),
    supportUrl: str(l.supportUrl, "Support URL", 500) || undefined,
    privacyPolicyUrl: str(l.privacyPolicyUrl, "Privacy policy URL", 500) || undefined,
  };
  if (listing.name.length < 2) throw new InputError("Give the app a name in the store listing first.");
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(listing.bundleId)) {
    throw new InputError("Set a valid bundle ID (like com.yourname.app) in the store listing first.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(listing.primaryColor)) listing.primaryColor = "#6D5DFB";

  const now = Date.now();
  return { id: "build", name: listing.name, prompt: "", files, messages: [], listing, createdAt: now, updatedAt: now };
}

/** The app icon, drawn in the browser, as a base64 PNG. */
export function parseIcon(v: unknown): Buffer {
  if (typeof v !== "string" || v.length > MAX_ICON * 1.4) throw new InputError("The app icon is missing.");
  const png = Buffer.from(v.replace(/^data:image\/png;base64,/, ""), "base64");
  if (png.length < 8 || png.length > MAX_ICON || png.readUInt32BE(0) !== 0x89504e47) throw new InputError("The app icon must be a PNG.");
  return png;
}

export function parseTarget(v: unknown): BuildTarget {
  if (!BUILD_TARGETS.includes(v as BuildTarget)) throw new InputError("Choose what to build.");
  return v as BuildTarget;
}

export function parseAscAppId(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const id = String(v).trim();
  if (!/^\d{6,12}$/.test(id)) throw new InputError("The App Store Connect Apple ID is a number, like 6741234567.");
  return id;
}

export function parseAscKey(v: unknown): AscApiKey | undefined {
  if (v == null) return undefined;
  const o = v as Record<string, unknown>;
  const keyId = str(o.keyId, "Key ID", 20).trim();
  const issuerId = str(o.issuerId, "Issuer ID", 40).trim();
  const p8 = str(o.p8, "API key file", 5000).trim();
  if (!keyId && !p8) return undefined;
  if (!/^[A-Z0-9]{8,12}$/.test(keyId)) throw new InputError("The API Key ID is 10 letters and numbers, like 2X9R4HXF34.");
  if (issuerId && !/^[0-9a-f-]{36}$/i.test(issuerId)) throw new InputError("The Issuer ID looks like 57246542-96fe-1a63-e053-0824d011072a.");
  if (!/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/.test(p8)) {
    throw new InputError("Choose the .p8 key file you downloaded from App Store Connect.");
  }
  return { keyId, issuerId, p8: `${p8}\n` };
}

export function parseBuildIds(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) throw new InputError("ids is invalid");
  return v.map((id) => {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("ids is invalid");
    return id;
  });
}
