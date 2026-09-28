import type { FileMap, StoreListing } from "./types";

/**
 * Parses the tagged generation protocol (see prompt.ts). Works on partial
 * text so the builder can show files as they stream in.
 */
export interface ParsedGeneration {
  plan: string;
  summary: string;
  files: FileMap;
  deleted: string[];
  listing: Partial<StoreListing> | null;
  /** Path of the file currently being written, if the stream is mid-file. */
  writing: string | null;
}

const FILE_OPEN = /<file\s+path="([^"]+)"\s*>/g;

function tagBody(text: string, tag: string): string {
  const open = text.indexOf(`<${tag}>`);
  if (open === -1) return "";
  const start = open + tag.length + 2;
  const close = text.indexOf(`</${tag}>`, start);
  return (close === -1 ? text.slice(start) : text.slice(start, close)).trim();
}

/**
 * Some models leak their own control markup into the output: DeepSeek's
 * "<｜DSML｜…>" / "<｜end▁of▁sentence｜>", ChatML "<|im_end|>", tool-call
 * wrappers and "<think>" blocks. None of it is ever valid in a JS file.
 */
export function stripModelArtifacts(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^[ \t]*<\/?\s*[｜|][^>\n]*[｜|][^>\n]*>[ \t]*\n?/gm, "")
    .replace(/<\/?\s*[｜|][^>\n]*[｜|][^>\n]*>/g, "")
    .replace(/^[ \t]*<\/?(?:function_calls|invoke|parameter|tool_call|antml:[a-z_]+)(?:\s[^>\n]*)?>[ \t]*\n?/gm, "");
}

/** The same files with model markup removed; the same object when nothing changed. */
export function cleanFiles<T extends Record<string, string>>(files: T): T {
  let changed = false;
  const out: Record<string, string> = {};
  for (const [path, code] of Object.entries(files)) {
    const cleaned = stripModelArtifacts(code);
    if (cleaned !== code) changed = true;
    out[path] = cleaned;
  }
  return changed ? (out as T) : files;
}

function stripFence(code: string): string {
  // Models occasionally wrap file bodies in markdown fences; drop them.
  return stripModelArtifacts(code)
    .replace(/^\s*```[a-zA-Z]*\n/, "")
    .replace(/\n```\s*$/, "")
    .replace(/^\n/, "");
}

export function parseGeneration(text: string): ParsedGeneration {
  const files: FileMap = {};
  let writing: string | null = null;

  FILE_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_OPEN.exec(text))) {
    const path = normalizePath(match[1]);
    const start = match.index + match[0].length;
    const end = text.indexOf("</file>", start);
    if (end === -1) {
      files[path] = stripFence(text.slice(start));
      writing = path;
      break;
    }
    files[path] = stripFence(text.slice(start, end)).replace(/\s+$/, "") + "\n";
    FILE_OPEN.lastIndex = end;
  }

  const deleted = [...text.matchAll(/<delete\s+path="([^"]+)"\s*\/>/g)].map((m) => normalizePath(m[1]));

  let listing: Partial<StoreListing> | null = null;
  const listingRaw = text.includes("</listing>") ? tagBody(text, "listing") : "";
  if (listingRaw) {
    try {
      listing = JSON.parse(listingRaw.replace(/^```json\s*|```$/g, ""));
    } catch {
      listing = null;
    }
  }

  return {
    plan: tagBody(text, "plan"),
    summary: tagBody(text, "summary"),
    files,
    deleted,
    listing,
    writing,
  };
}

export function normalizePath(p: string): string {
  return p.replace(/^\.?\//, "").trim();
}
