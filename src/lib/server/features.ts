import { AuthError } from "./auth";
import { databaseConfigured, query } from "./db";
import { defaultFeatures, FEATURE_KEYS, type FeatureKey, type Features } from "../features";

/**
 * Feature switches, stored in the database so /admin changes apply without a
 * redeploy. Read through a short cache; without a database the defaults apply.
 */

let cache: { at: number; value: Features } | null = null;
const TTL = 5_000;

export async function getFeatures(): Promise<Features> {
  if (!databaseConfigured()) return defaultFeatures();
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const value = defaultFeatures();
  try {
    const rows = await query<{ key: string; value: unknown }>("select key, value from app_settings where key like 'feature.%'");
    for (const row of rows) {
      const key = row.key.slice("feature.".length) as FeatureKey;
      if (FEATURE_KEYS.includes(key) && typeof row.value === "boolean") value[key] = row.value;
    }
  } catch {
    // Database hiccup: keep the last known switches rather than failing requests.
    if (cache) return cache.value;
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function feature(key: FeatureKey): Promise<boolean> {
  return (await getFeatures())[key];
}

export async function setFeature(key: FeatureKey, on: boolean): Promise<Features> {
  await query(
    "insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [`feature.${key}`, JSON.stringify(on)],
  );
  cache = null;
  return getFeatures();
}

/** Tests only. */
export function clearFeatureCache() {
  cache = null;
}

const OFF_MESSAGES: Record<FeatureKey, string> = {
  google: "Sign in with Google is turned off on this site.",
  passkeys: "Passkeys are turned off on this site.",
  signups: "New sign-ups are paused on this site. Existing accounts can still sign in.",
  websiteImport: "Building from a website is turned off on this site.",
  cloudBuilds: "Cloud builds are turned off on this site. Download the project to build it yourself.",
  publicStatus: "The status page is private.",
};

/** Throws a 403 with a clear message when the site owner turned this feature off. */
export async function requireFeature(key: FeatureKey): Promise<void> {
  if (!(await feature(key))) throw new AuthError(OFF_MESSAGES[key], 403);
}
