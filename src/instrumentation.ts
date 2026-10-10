/**
 * Runs once when the server starts. With hosted Expo builds on, the Expo
 * packages that publishing needs are installed in the background now, so the
 * first "Your phone (Expo Go)" after a deploy doesn't wait minutes for them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.EXPO_TOKEN?.trim()) return;
  const { ensureExpoDeps } = await import("./lib/eas/server");
  // Not awaited: the site starts at once; a publish that comes early waits for this same install.
  ensureExpoDeps().catch((e) => console.warn(`Expo packages will install on first use: ${(e as Error).message}`));
}
