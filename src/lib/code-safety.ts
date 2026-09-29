import type { FileMap } from "./types";

/**
 * Safety check for app code, whoever wrote it (an upload, the AI or a hand
 * edit). It blocks code that can't be reviewed or that hides what it does:
 * running code from text, obfuscated or minified code, crypto miners, data
 * sent to chat bots, and imports that reach outside the app. Anything found
 * here stops uploads and cloud builds; in the builder the AI removes it.
 *
 * Pattern checks can't prove code is harmless, so they're one layer: apps
 * also run in a sandboxed preview, and server-side bundling is confined to
 * the app's folder (see CONTAINED_METRO_CONFIG).
 */

export interface SafetyFinding {
  file: string;
  message: string;
}

const RULES: [RegExp, string][] = [
  [/\beval\s*\(/, "runs code from text with eval(), a common way to hide or download code"],
  [/\bnew\s+Function\s*\(|(^|[^.\w$])Function\s*\(\s*["'`]/, "builds code from text with new Function(), a common way to hide or download code"],
  [/\b(setTimeout|setInterval)\s*\(\s*["'`]/, "runs code from text with setTimeout/setInterval"],
  [/\bWebAssembly\s*\./, "runs WebAssembly, which is often used for hidden crypto mining"],
  [/\b(importScripts\s*\(|new\s+(Shared)?Worker\s*\()/, "starts background scripts"],
  [/coinhive|coin-hive|cryptonight|stratum\+tcp|webminer|coinimp|jsecoin|minero\.cc/i, "contains crypto-mining code"],
  [/api\.telegram\.org\/bot|discord(app)?\.com\/api\/webhooks/i, "sends data to a Telegram bot or Discord webhook"],
  [/\brequire\s*\.\s*[A-Za-z]/, "uses require.context or similar to load files by pattern"],
];

const SPEC = /(?:\bfrom\s*|\bimport\s*|\bexport\s*\*\s*from\s*)(["'])([^"'\n]*)\1/g;
const CALL = /\b(require\s*|import)\(\s*([^)]*)\)/g;

function escapesRoot(from: string, spec: string): boolean {
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") {
      if (!parts.length) return true;
      parts.pop();
    } else if (seg && seg !== ".") parts.push(seg);
  }
  return false;
}

function checkSpecifier(file: string, spec: string): string | null {
  if (spec.startsWith(".")) return escapesRoot(file, spec) ? `imports "${spec}", which is outside the app` : null;
  if (/^(\/|\\|[A-Za-z]:|~|file:|https?:|data:|blob:|node:)/.test(spec) || spec.includes("..")) return `imports "${spec}", which is outside the app`;
  return null;
}

/** Images embedded as data URIs are allowed (Appmaker apps can't include image files). */
const IMAGE_DATA = /(["'`])data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+\1/gi;

function obfuscation(code: string): string | null {
  if (/(["'`])[A-Za-z0-9+/=_-]{5000,}\1/.test(code)) return "contains a large block of encoded data, so it can't be checked";
  const readable = code.replace(IMAGE_DATA, '""');
  const longest = readable.split("\n").reduce((n, l) => Math.max(n, l.length), 0);
  if (longest > 3000)
    return `has a line of ${longest.toLocaleString("en-US")} characters: minified or bundled code can't be checked, so upload the original source`;
  if ((readable.match(/\b_0x[0-9a-f]{4,}\b/gi) ?? []).length > 5) return "looks obfuscated (hidden on purpose), so it can't be checked";
  if ((readable.match(/\\x[0-9a-f]{2}/gi) ?? []).length > 40) return "hides text in escape codes, so it can't be checked";
  if (/String\.fromCharCode\s*\(\s*(\d+\s*,\s*){9,}/.test(readable)) return "hides text in character codes, so it can't be checked";
  return null;
}

export function checkCodeSafety(files: FileMap): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  for (const [file, code] of Object.entries(files)) {
    if (file.endsWith(".json")) continue;
    const add = (message: string) => {
      if (!findings.some((f) => f.file === file && f.message === message)) findings.push({ file, message });
    };
    for (const [re, message] of RULES) if (re.test(code)) add(message);
    for (const m of code.matchAll(SPEC)) {
      const problem = checkSpecifier(file, m[2]);
      if (problem) add(problem);
    }
    for (const m of code.matchAll(CALL)) {
      const arg = m[2].trim();
      const literal = /^(["'])([^"'`]*)\1$/.exec(arg);
      if (!literal) add(`${m[1].trim()}() loads a path worked out while running; use a plain quoted path`);
      else {
        const problem = checkSpecifier(file, literal[2]);
        if (problem) add(problem);
      }
    }
    const hidden = obfuscation(code);
    if (hidden) add(hidden);
  }
  return findings;
}

export function describeSafety(findings: SafetyFinding[]): string {
  return findings.map((f) => `- ${f.file}: ${f.message}`).join("\n");
}
