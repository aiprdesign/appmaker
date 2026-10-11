import { slugify } from "../expo-project";
import type { Project } from "../types";
import { validateApp } from "../validate";
import type { ExpoCheck } from "./check";

/**
 * The app half of the build check, run in the browser: the things in the app
 * itself that make Expo refuse a project or a build crash.
 */
export function appBuildChecks(project: Project, hasPreviewError: boolean): ExpoCheck[] {
  const l = project.listing;
  const issues = validateApp(project.files);
  const bundleOk = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(l.bundleId);
  return [
    issues.length
      ? {
          id: "code",
          label: "The app's code passes the build checks",
          ok: false,
          detail: `${issues
            .slice(0, 3)
            .map((i) => `${i.file}: ${i.message}`)
            .join("; ")}${issues.length > 3 ? ` and ${issues.length - 3} more` : ""}. Ask the AI in the chat to fix these.`,
        }
      : { id: "code", label: "The app's code passes the build checks", ok: true },
    hasPreviewError
      ? { id: "preview", label: "The preview runs without errors", ok: false, detail: "Fix the error shown on the preview first (Fix with AI), so the built app doesn't crash." }
      : { id: "preview", label: "The preview runs without errors", ok: true },
    l.name.trim().length > 1 && l.name.length <= 30 && slugify(l.name)
      ? { id: "name", label: "The app name works on Expo", ok: true }
      : { id: "name", label: "The app name works on Expo", ok: false, detail: "Give the app a name of 2–30 characters with some letters or numbers (step 1)." },
    !bundleOk
      ? { id: "bundle", label: "The bundle ID is valid", ok: false, detail: "Use lowercase letters and dots, like com.yourname.app (step 1)." }
      : /^com\.appmaker\./.test(l.bundleId)
        ? { id: "bundle", label: "The bundle ID is valid", ok: null, detail: "Fine for testing, but change it to your own name (com.yourname.app) before a store build: it can't be changed after publishing." }
        : { id: "bundle", label: "The bundle ID is valid", ok: true },
  ];
}
