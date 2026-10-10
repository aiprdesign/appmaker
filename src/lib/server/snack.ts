/**
 * Saves an app to Expo Snack through Snack's own API (what Expo's snack-sdk
 * does), for apps too big for Snack's form post. Returns the Snack's id, which
 * opens in Snack's emulators by link.
 */

const api = () => process.env.APPMAKER_SNACK_API || "https://exp.host";

export class SnackError extends Error {}

export interface SnackApp {
  name: string;
  description: string;
  files: Record<string, string>;
  dependencies: string[];
}

/** Released Expo SDKs, newest first (from Expo's versions list), else a known recent one. */
async function sdkVersions(): Promise<string[]> {
  const pinned = process.env.APPMAKER_SNACK_SDK?.trim();
  if (pinned) return [pinned];
  try {
    const res = await fetch(`${api()}/--/api/v2/versions`, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as { data?: { sdkVersions?: Record<string, { beta?: boolean; isDeprecated?: boolean }> }; sdkVersions?: Record<string, { beta?: boolean }> };
    const all = data.data?.sdkVersions ?? data.sdkVersions ?? {};
    const released = Object.entries(all)
      .filter(([v, info]) => /^\d+\.0\.0$/.test(v) && !info?.beta)
      .map(([v]) => v)
      .sort((a, b) => parseInt(b) - parseInt(a));
    if (released.length) return released.slice(0, 3);
  } catch {
    // Fall through to a known version.
  }
  return ["54.0.0"];
}

async function save(app: SnackApp, sdkVersion: string): Promise<string> {
  const dependencies = Object.fromEntries(app.dependencies.map((name) => [name, { version: "*" }]));
  const res = await fetch(`${api()}/--/api/v2/snack/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      manifest: { sdkVersion, name: app.name, description: app.description, dependencies: Object.fromEntries(app.dependencies.map((d) => [d, "*"])) },
      code: Object.fromEntries(Object.entries(app.files).map(([path, contents]) => [path, { type: "CODE", contents }])),
      dependencies,
      isDraft: false,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; errors?: { message?: string }[] };
  if (!res.ok || !data.id) throw new SnackError(data.errors?.[0]?.message || `Snack refused the app (${res.status}).`);
  return data.id;
}

/** Saves the app, trying the newest SDKs Snack accepts first. */
export async function saveSnack(app: SnackApp): Promise<{ id: string; sdkVersion: string }> {
  let last: unknown;
  for (const sdkVersion of await sdkVersions()) {
    try {
      return { id: await save(app, sdkVersion), sdkVersion };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof SnackError ? last : new SnackError("Couldn't reach Expo Snack. Try again in a minute, or use Your phone (Expo Go).");
}
