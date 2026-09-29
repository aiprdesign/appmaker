import type { FileMap } from "./types";

/**
 * Static checks run on every generated app before it is shown or exported.
 * Anything flagged here would either fail in the preview sandbox or break a
 * real Expo build, so the builder feeds the issues back to the model for an
 * automatic repair pass.
 */
export const ALLOWED_PACKAGES = [
  "react",
  "react-native",
  "@react-native-async-storage/async-storage",
  "expo-status-bar",
  "react-native-safe-area-context",
  "expo-haptics",
  "expo-notifications",
  "expo-image-picker",
] as const;

/** Size limits for an app, so the AI can read all of it when editing. */
export const APP_MAX_FILES = 60;
export const APP_MAX_BYTES = 600_000;

const SOURCE_FILE = /^(App\.jsx?|src\/[A-Za-z0-9_\-/]+\.(jsx?|json))$/;

/** Paths the model may write: App.js(x) and source files under src/. */
export function isAllowedPath(path: string): boolean {
  return SOURCE_FILE.test(path) && !path.split("/").some((seg) => seg === ".." || seg === ".");
}

export interface ValidationIssue {
  file: string;
  message: string;
}

const ASSET_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|ttf|otf|woff2?|mp3|wav|m4a|aac|mp4|mov|lottie)$/i;

const IMPORT_RE = /(?:\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

const WEB_ONLY: [RegExp, string][] = [
  [/\bdocument\.[a-zA-Z]/, "uses `document`, which doesn't exist on iOS/Android"],
  [/\bwindow\.(localStorage|location|addEventListener|innerWidth|innerHeight)/, "uses browser-only `window` APIs"],
  [/\blocalStorage\./, "uses `localStorage`; use AsyncStorage instead"],
  [/\bclassName=/, "uses `className`; React Native uses the `style` prop"],
  [/<(div|span|p|button|img|input|h[1-6]|ul|li|a)[\s>]/, "renders HTML elements; use React Native components"],
  [/fetch\(\s*[`'"]http:\/\//, "fetches over insecure http://; use https:// (iOS blocks plain http)"],
  [
    /\b(api[_-]?key|apikey|secret|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*[`'"][A-Za-z0-9_\-.]{16,}[`'"]/i,
    "contains what looks like a secret API key; apps are public, so use a keyless API instead",
  ],
];

function resolveRelative(from: string, spec: string, files: FileMap): boolean {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const parts = (base ? base.split("/") : []).concat(spec.split("/"));
  const out: string[] = [];
  for (const seg of parts) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  const p = out.join("/");
  return [p, `${p}.js`, `${p}.jsx`, `${p}.json`, `${p}/index.js`, `${p}/index.jsx`].some((c) => files[c] != null);
}

export function validateApp(files: FileMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entry = files["App.js"] ?? files["App.jsx"];
  if (entry == null) {
    issues.push({ file: "App.js", message: "App.js is missing" });
  } else if (!/export\s+default\b/.test(entry)) {
    issues.push({ file: "App.js", message: "App.js must `export default` the root component" });
  }

  for (const [path, code] of Object.entries(files)) {
    if (!isAllowedPath(path)) {
      issues.push({ file: path, message: "files must be App.js or live under src/ with a .js, .jsx or .json extension" });
      continue;
    }
    if (path.endsWith(".json")) {
      try {
        JSON.parse(code);
      } catch {
        issues.push({ file: path, message: "is not valid JSON" });
      }
      continue;
    }
    if (!code.trim()) {
      issues.push({ file: path, message: "is empty" });
      continue;
    }
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith(".")) {
        if (ASSET_FILE.test(spec)) {
          issues.push({
            file: path,
            message: `loads the asset file '${spec}', but apps can't include image, font or sound files — replace it with an emoji, styled Views, or <Image source={{ uri: 'https://…' }} />`,
          });
        } else if (!resolveRelative(path, spec, files)) issues.push({ file: path, message: `imports '${spec}', which doesn't exist` });
      } else if (!(ALLOWED_PACKAGES as readonly string[]).includes(spec)) {
        issues.push({ file: path, message: `imports '${spec}', which isn't available (allowed: ${ALLOWED_PACKAGES.join(", ")})` });
      }
    }
    for (const [re, message] of WEB_ONLY) {
      if (re.test(code)) issues.push({ file: path, message });
    }
  }
  return issues;
}

export function describeIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `- ${i.file}: ${i.message}`).join("\n");
}
