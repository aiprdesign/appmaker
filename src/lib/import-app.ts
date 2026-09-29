import { emptyListing } from "./storage";
import type { FileMap, StoreListing } from "./types";
import { APP_MAX_BYTES, APP_MAX_FILES, isAllowedPath, validateApp, type ValidationIssue } from "./validate";

/**
 * Turns an uploaded app (an Expo / React Native project as a .zip, a folder,
 * or loose files) into an Appmaker project the builder can preview and edit.
 *
 * Appmaker apps are App.js plus JavaScript files under src/, so the upload
 * is reshaped: TypeScript becomes JavaScript, other source folders move under
 * src/ with their relative imports rewritten, and anything else (config,
 * native folders, images) is left out and listed so the person knows.
 */

export interface UploadEntry {
  path: string;
  /** File contents; null for binary files (images, fonts…). */
  text: string | null;
}

export interface ImportedApp {
  files: FileMap;
  listing: StoreListing;
  /** Files that were left out, with the reason. */
  skipped: { path: string; reason: string }[];
  /** TypeScript files that were converted to JavaScript. */
  converted: string[];
  /** Things to fix before the app runs in Appmaker (the AI can fix them). */
  issues: ValidationIssue[];
  /** Notes about the whole app, e.g. that it uses Expo Router. */
  notes: string[];
}

export class ImportError extends Error {}

/** Removes TypeScript types; the browser passes Babel, tests pass their own. */
export type StripTypes = (code: string, path: string) => string;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".expo-shared",
  "dist",
  "build",
  "web-build",
  "ios",
  "android",
  "coverage",
  "__MACOSX",
  ".github",
  ".vscode",
  ".idea",
]);
const CONFIG_FILE =
  /^(babel|metro|jest|webpack|eslint|prettier|tailwind|postcss|vite|expo-env|app\.config|react-native\.config)[^/]*\.(c|m)?(js|ts|json)$|^(tsconfig|jsconfig|eas|app|package|package-lock|appmaker)\.json$|^index\.(js|jsx|ts|tsx)$/;
const TEST_FILE = /(^|\/)(__tests__|__mocks__|e2e)\/|\.(test|spec)\.(jsx?|tsx?)$/;
const SOURCE_EXT = /\.(jsx?|tsx?|json)$/;
const RESOLVE_EXTS = ["", ".js", ".jsx", ".ts", ".tsx", ".json", "/index.js", "/index.jsx", "/index.ts", "/index.tsx"];
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g;

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
}

/** The folder the project lives in, e.g. "my-app/" inside a zip. */
function findRoot(paths: string[]): string {
  const markers = paths.filter((p) => /(^|\/)(package\.json|app\.json|App\.(jsx?|tsx?))$/.test(p));
  const dirs = (markers.length ? markers : paths).map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : ""));
  if (markers.length) return dirs.sort((a, b) => a.length - b.length)[0];
  // No markers: the folder all the files share.
  let prefix = dirs[0] ?? "";
  for (const d of dirs) while (!d.startsWith(prefix)) prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1);
  return prefix;
}

function dirname(p: string): string {
  return p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
}

function join(base: string, spec: string): string {
  const out: string[] = [];
  for (const seg of (base ? base.split("/") : []).concat(spec.split("/"))) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function relative(fromDir: string, to: string): string {
  const a = fromDir ? fromDir.split("/") : [];
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rest = b.slice(i).join("/");
  return up ? `${"../".repeat(up)}${rest}` : `./${rest}`;
}

/** An allowed Appmaker path for a source file, e.g. components/Card.styles.tsx → src/components/Card-styles.js. */
function targetPath(path: string): string {
  const ext = path.endsWith(".json") ? ".json" : path.endsWith(".jsx") ? ".jsx" : ".js";
  const bare = path.replace(/\.(jsx?|tsx?|json)$/, "");
  const safe = bare
    .split("/")
    .map((seg) => seg.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "file")
    .join("/");
  if (/^App$/.test(safe) && ext !== ".json") return `App${ext}`;
  return safe.startsWith("src/") ? `${safe}${ext}` : `src/${safe}${ext}`;
}

function readListing(entries: Map<string, string | null>, fallbackName: string): StoreListing {
  const listing: StoreListing = emptyListing(fallbackName);
  const json = (p: string) => {
    try {
      const t = entries.get(p);
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };
  const expo = json("app.json")?.expo;
  if (expo && typeof expo === "object") {
    if (typeof expo.name === "string" && expo.name.trim()) listing.name = expo.name.trim().slice(0, 30);
    const bundleId = expo.ios?.bundleIdentifier ?? expo.android?.package;
    if (typeof bundleId === "string" && /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(bundleId)) listing.bundleId = bundleId;
    const color = expo.splash?.backgroundColor ?? expo.android?.adaptiveIcon?.backgroundColor;
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) listing.primaryColor = color;
  }
  // Apps downloaded from Appmaker carry their full store listing.
  const saved = json("appmaker.json")?.listing;
  if (saved && typeof saved === "object") {
    for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
      if (k in listing && typeof v === "string") (listing as unknown as Record<string, string>)[k] = v.slice(0, 4000);
    }
  }
  return listing;
}

export function importApp(uploaded: UploadEntry[], stripTypes: StripTypes, fallbackName = "My App"): ImportedApp {
  const all = uploaded.map((e) => ({ ...e, path: normalize(e.path) })).filter((e) => e.path && !e.path.endsWith("/"));
  if (!all.length) throw new ImportError("That upload is empty.");
  const root = findRoot(all.map((e) => e.path));
  const skipped: ImportedApp["skipped"] = [];
  const entries = new Map<string, string | null>();
  for (const e of all) {
    if (!e.path.startsWith(root)) continue;
    const rel = e.path.slice(root.length);
    const segs = rel.split("/");
    if (segs.some((s) => IGNORED_DIRS.has(s))) continue;
    if (segs.some((s) => s.startsWith(".")) || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(rel)) continue;
    entries.set(rel, e.text);
  }

  const notes: string[] = [];
  let pkg: { main?: string; dependencies?: Record<string, string> } | null = null;
  try {
    pkg = entries.get("package.json") ? JSON.parse(entries.get("package.json")!) : null;
  } catch {
    pkg = null;
  }
  const usesRouter = pkg?.main === "expo-router/entry" || !!pkg?.dependencies?.["expo-router"];
  if (usesRouter)
    notes.push("It uses Expo Router (screens in the app/ folder). Appmaker apps start from App.js, so the AI will need to add simple navigation.");

  // Pick the source files and where each one goes.
  const sources: string[] = [];
  for (const [rel, text] of entries) {
    const base = rel.split("/").pop()!;
    if (text == null) {
      skipped.push({ path: rel, reason: "images, fonts and other media aren't supported yet" });
    } else if (!rel.includes("/") && CONFIG_FILE.test(base)) {
      // Project config Appmaker makes itself: nothing to report.
    } else if (TEST_FILE.test(rel)) {
      skipped.push({ path: rel, reason: "tests aren't used in Appmaker" });
    } else if (!SOURCE_EXT.test(rel) || /\.d\.ts$/.test(rel)) {
      if (!/^(README|LICENSE|CHANGELOG)|\.(md|txt|lock|yaml|yml|log)$/i.test(base)) skipped.push({ path: rel, reason: "not an app source file" });
    } else {
      sources.push(rel);
    }
  }
  const hasRootApp = sources.some((p) => /^App\.(jsx?|tsx?)$/.test(p));
  const mapping = new Map<string, string>();
  // Paths without their extension, so Card.js and Card.tsx can't both become src/Card.
  const taken = new Set<string>();
  const stem = (p: string) => p.replace(/\.(jsx?|json)$/, "");
  // Root App first so it gets App.js.
  for (const p of sources.sort((a, b) => Number(/^App\./.test(b)) - Number(/^App\./.test(a)) || a.localeCompare(b))) {
    const wanted = targetPath(p);
    let target = wanted;
    for (let n = 2; taken.has(stem(target)); n++) {
      target = stem(wanted) === "App" ? `src/App-${n}${wanted.slice(3)}` : wanted.replace(/(\.(jsx?|json))$/, `-${n}$1`);
    }
    taken.add(stem(target));
    mapping.set(p, target);
  }

  const resolveOld = (from: string, spec: string): string | undefined => {
    let base: string;
    if (spec.startsWith(".")) base = join(dirname(from), spec);
    else if (spec.startsWith("@/") || spec.startsWith("~/")) base = spec.slice(2);
    else return undefined;
    const candidates = spec.startsWith(".") ? [base] : [base, `src/${base}`];
    for (const c of candidates) for (const ext of RESOLVE_EXTS) if (mapping.has(c + ext)) return c + ext;
    return undefined;
  };

  const files: FileMap = {};
  const converted: string[] = [];
  let bytes = 0;
  for (const [oldPath, newPath] of mapping) {
    let code = entries.get(oldPath)!;
    if (/\.tsx?$/.test(oldPath)) {
      try {
        code = stripTypes(code, oldPath);
        converted.push(oldPath);
      } catch (e) {
        skipped.push({ path: oldPath, reason: `couldn't convert from TypeScript: ${(e as Error).message.split("\n")[0].slice(0, 160)}` });
        continue;
      }
    }
    if (!newPath.endsWith(".json")) {
      code = code.replace(SPEC_RE, (whole, lead: string, quote: string, spec: string) => {
        const target = resolveOld(oldPath, spec);
        if (!target) return whole;
        const mapped = mapping.get(target)!;
        const rel = relative(dirname(newPath), mapped.endsWith(".json") ? mapped : mapped.replace(/\.jsx?$/, ""));
        return `${lead}${quote}${rel}${quote}`;
      });
    }
    bytes += code.length;
    files[newPath] = code;
  }

  // An app whose root component lives in src/App gets a small App.js.
  if (!hasRootApp && files["App.js"] == null) {
    const inner = Object.keys(files).find((p) => /^src\/App\.jsx?$/.test(p));
    if (inner) files["App.js"] = `import App from './${inner.replace(/\.jsx?$/, "")}';\n\nexport default App;\n`;
  }

  const count = Object.keys(files).length;
  if (!count) throw new ImportError("No app source files found. Upload an Expo or React Native project: App.js and its .js, .jsx, .ts or .tsx files.");
  if (count > APP_MAX_FILES) throw new ImportError(`This app has ${count} source files; Appmaker can edit up to ${APP_MAX_FILES}.`);
  if (bytes > APP_MAX_BYTES) throw new ImportError(`This app's code is ${Math.round(bytes / 1000)} KB; Appmaker can edit up to ${APP_MAX_BYTES / 1000} KB.`);
  for (const p of Object.keys(files)) if (!isAllowedPath(p)) delete files[p];

  const listing = readListing(entries, fallbackName);
  return { files, listing, skipped, converted, issues: validateApp(files), notes };
}

/** A request for the AI that makes an uploaded app work in Appmaker. */
export function fixRequest(app: ImportedApp): string {
  const lines = app.issues.map((i) => `- ${i.file}: ${i.message}`);
  const skippedMedia = app.skipped.filter((s) => s.reason.startsWith("images"));
  return [
    "I uploaded this app. Make it work in Appmaker without changing what it does or how it looks.",
    lines.length ? `The automatic check found:\n${lines.join("\n")}` : "",
    skippedMedia.length
      ? `These files weren't uploaded, so replace them (for example with emoji, icons drawn with Views, or colors): ${skippedMedia.map((s) => s.path).join(", ")}`
      : "",
    ...app.notes,
  ]
    .filter(Boolean)
    .join("\n\n");
}

interface BabelLike {
  transform(code: string, options: Record<string, unknown>): { code?: string | null };
}

/** Removes TypeScript types with Babel, keeping the JSX and the code's layout. */
export function babelStripTypes(babel: BabelLike): StripTypes {
  return (code, path) =>
    babel.transform(code, {
      filename: path,
      babelrc: false,
      configFile: false,
      retainLines: true,
      presets: [["typescript", { isTSX: path.endsWith(".tsx"), allExtensions: true }]],
    }).code ?? "";
}

let babelLoad: Promise<BabelLike> | null = null;

/** Loads Babel in the browser (the same copy the preview uses). */
export function loadBabel(): Promise<BabelLike> {
  const w = window as unknown as { Babel?: BabelLike };
  if (w.Babel) return Promise.resolve(w.Babel);
  babelLoad ??= new Promise<BabelLike>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/preview/babel.min.js";
    s.onload = () => (w.Babel ? resolve(w.Babel) : reject(new ImportError("Couldn't load the TypeScript converter.")));
    s.onerror = () => {
      babelLoad = null;
      reject(new ImportError("Couldn't load the TypeScript converter. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return babelLoad;
}
