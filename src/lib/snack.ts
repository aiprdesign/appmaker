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

export function snackPayload(project: Project, platform: SnackPlatform): Record<string, string> {
  const files: Record<string, { type: "CODE"; contents: string }> = {};
  for (const [path, contents] of Object.entries(project.files)) {
    if (isAllowedPath(path)) files[path] = { type: "CODE", contents };
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

/** Submits the app to Snack in a new tab. */
export function openInSnack(project: Project, platform: SnackPlatform): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = SNACK_URL;
  form.target = "_blank";
  form.rel = "noopener";
  for (const [name, value] of Object.entries(snackPayload(project, platform))) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
