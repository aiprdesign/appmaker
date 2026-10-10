import { usedDependencies } from "./expo-project";
import { isAllowedPath } from "./validate";
import type { Project } from "./types";

/**
 * Opens an app in Expo Snack (snack.expo.dev), which runs it in real iOS and
 * Android emulators in the browser and shows a QR code for the Expo Go app.
 * Uses the same form POST as Expo's own "Try this example" buttons; Snack
 * picks the Expo SDK version it supports, so it always matches its runtime.
 */

export const SNACK_URL = "https://snack.expo.dev";
export type SnackPlatform = "ios" | "android" | "mydevice" | "web";

/** Packages Snack always provides; everything else is listed as a dependency. */
const BUILT_IN = new Set(["expo", "react", "react-dom", "react-native", "react-native-web"]);

/** Snack's server refuses form posts over about 100 KB ("request entity too large"). */
export const SNACK_MAX_BYTES = 95_000;

/** Smaller code that runs the same: no indentation, no comment-only or blank lines. */
export function compactCode(code: string): string {
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\/\/(?!\s*@)/.test(l))
    .join("\n");
}

export function snackPayload(project: Project, platform: SnackPlatform, { compact = false } = {}): Record<string, string> {
  const files: Record<string, { type: "CODE"; contents: string }> = {};
  for (const [path, contents] of Object.entries(project.files)) {
    // JSON keeps its exact text; template strings in code only lose indentation.
    if (isAllowedPath(path)) files[path] = { type: "CODE", contents: compact && !path.endsWith(".json") ? compactCode(contents) : contents };
  }
  return {
    platform,
    supportedPlatforms: "ios,android,web",
    name: (project.listing.name || project.name || "My app").slice(0, 80),
    description: (project.listing.subtitle || "Made with Appmaker").slice(0, 200),
    dependencies: Object.keys(usedDependencies(project))
      .filter((d) => !BUILT_IN.has(d))
      .join(","),
    files: JSON.stringify(files),
  };
}

const payloadBytes = (payload: Record<string, string>) => new TextEncoder().encode(new URLSearchParams(payload).toString()).length;

/** A big app: Appmaker's server saves it to Snack, then the tab opens it by link. */
async function openSavedSnack(project: Project, platform: SnackPlatform): Promise<string | null> {
  // Opened now, while the click still counts, so the browser doesn't block it.
  const tab = window.open("about:blank", "_blank");
  const payload = snackPayload(project, platform);
  try {
    const res = await fetch("/api/snack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        dependencies: payload.dependencies ? payload.dependencies.split(",") : [],
        files: Object.fromEntries(Object.entries(project.files).filter(([p]) => isAllowedPath(p))),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw new Error(data.error || "Couldn't open Expo Snack.");
    const url = `${SNACK_URL}/${String(data.id).replace(/^\//, "")}?platform=${platform}&supportedPlatforms=ios,android,web`;
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
    return null;
  } catch (e) {
    tab?.close();
    return (e as Error).message;
  }
}

/**
 * Opens the app in Snack in a new tab. Small apps go by form post (Snack picks
 * its Expo version); bigger ones are saved through Appmaker's server first.
 * Resolves to an error message, or null when it opened.
 */
export async function openInSnack(project: Project, platform: SnackPlatform): Promise<string | null> {
  let payload = snackPayload(project, platform);
  if (payloadBytes(payload) > SNACK_MAX_BYTES) payload = snackPayload(project, platform, { compact: true });
  if (payloadBytes(payload) > SNACK_MAX_BYTES) return openSavedSnack(project, platform);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = SNACK_URL;
  form.target = "_blank";
  form.rel = "noopener";
  for (const [name, value] of Object.entries(payload)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
  return null;
}
