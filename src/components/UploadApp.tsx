"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, FolderUp, Loader2, Upload, Wand2 } from "lucide-react";
import JSZip from "jszip";
import { babelStripTypes, fixRequest, ImportError, importApp, loadBabel, type ImportedApp, type UploadEntry } from "@/lib/import-app";
import { createProject, saveProject, uid, withVersion } from "@/lib/storage";
import type { Wording } from "@/lib/claims";

const MAX_UPLOAD_BYTES = 25_000_000;
const TEXT_FILE = /\.(jsx?|tsx?|mjs|cjs|json|md|txt|ya?ml|lock|gitignore|env|html|css)$|(^|\/)[^./]+$/i;

/** Reads a .zip, a folder or loose files into paths and text (null for binary files). */
async function readUpload(list: File[]): Promise<UploadEntry[]> {
  const total = list.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) throw new ImportError("That upload is too large. Leave out node_modules, ios and android, then try again.");
  const entries: UploadEntry[] = [];
  for (const file of list) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (/\.zip$/i.test(file.name)) {
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
      } catch {
        throw new ImportError(`${file.name} isn't a zip file that can be opened.`);
      }
      for (const item of Object.values(zip.files)) {
        if (item.dir || /(^|\/)node_modules\//.test(item.name)) continue;
        entries.push({ path: item.name, text: TEXT_FILE.test(item.name) ? await item.async("string") : null });
      }
    } else if (!/(^|\/)node_modules\//.test(path)) {
      entries.push({ path, text: TEXT_FILE.test(path) ? await file.text() : null });
    }
  }
  return entries;
}

/**
 * The "Upload an app" tab: brings an existing Expo / React Native app into
 * Appmaker so it can be previewed and edited with the AI or by hand.
 */
export function UploadApp({ wording }: { wording: Wording }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [app, setApp] = useState<ImportedApp | null>(null);
  const [fileName, setFileName] = useState("");
  const [autoFix, setAutoFix] = useState(true);
  const [dragging, setDragging] = useState(false);

  const read = async (list: File[]) => {
    if (!list.length) return;
    setReading(true);
    setError("");
    setApp(null);
    try {
      const entries = await readUpload(list);
      const needsBabel = entries.some((e) => /\.tsx?$/.test(e.path) && !/\.d\.ts$/.test(e.path));
      const strip = needsBabel
        ? babelStripTypes(await loadBabel())
        : () => {
            throw new ImportError("TypeScript isn't available.");
          };
      const name =
        list.length === 1
          ? list[0].name.replace(/\.zip$/i, "")
          : (list[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "My App";
      setFileName(list.length === 1 ? list[0].name : `${list.length} files`);
      setApp(importApp(entries, strip, name.replace(/[-_]+/g, " ").slice(0, 30) || "My App"));
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Couldn't read that upload. Try a .zip of the project folder.");
    } finally {
      setReading(false);
    }
  };

  const open = () => {
    if (!app) return;
    const count = Object.keys(app.files).length;
    const lines = [
      `Uploaded **${app.listing.name}**: ${count} file${count === 1 ? "" : "s"}.`,
      app.converted.length ? `Converted ${app.converted.length} TypeScript file${app.converted.length === 1 ? "" : "s"} to JavaScript.` : "",
      app.skipped.length ? `Left out: ${app.skipped.map((s) => `${s.path} (${s.reason})`).join("; ")}.` : "",
      app.issues.length && !autoFix
        ? `The automatic check found ${app.issues.length} thing${app.issues.length === 1 ? "" : "s"} to fix before it runs here. Ask me to “make it work in Appmaker”.`
        : "",
      "Ask me for any change, or edit the code in the Code tab.",
    ].filter(Boolean);
    const fix = app.issues.length > 0 && autoFix;
    const draft = createProject(fix ? fixRequest(app) : "", undefined, wording, {
      name: app.listing.name,
      files: app.files,
      listing: app.listing,
      messages: [{ id: uid(), role: "assistant", content: lines.join("\n\n"), files: Object.keys(app.files), createdAt: Date.now() }],
    });
    // Recorded in History, so the upload can always be restored.
    const { project } = withVersion(draft, "Uploaded app");
    saveProject(project);
    router.push(`/build/${project.id}${fix ? "?auto=1" : ""}`);
  };

  const pick = (input: HTMLInputElement | null) => input?.click();

  return (
    <div className="gradient-border rounded-2xl p-3 shadow-2xl shadow-violet-900/30">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          read(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border border-dashed px-4 py-6 text-center transition ${dragging ? "border-violet-400 bg-violet-500/10" : "border-line"}`}
      >
        <Upload className="mx-auto h-6 w-6 text-violet-300" />
        <p className="mt-2 text-sm font-medium">Upload your Expo or React Native app to keep building it</p>
        <p className="mt-1 text-xs text-muted">A .zip of the project, the project folder, or its .js / .tsx files. Drop them here or choose:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => pick(fileInput.current)}
            disabled={reading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
          >
            <FileCode2 className="h-4 w-4" /> Choose .zip or files
          </button>
          <button
            type="button"
            onClick={() => pick(folderInput.current)}
            disabled={reading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20 disabled:opacity-50"
          >
            <FolderUp className="h-4 w-4" /> Choose a folder
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".zip,.js,.jsx,.ts,.tsx,.json"
          className="sr-only"
          aria-label="Upload a .zip or app files"
          onChange={(e) => {
            read(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          className="sr-only"
          aria-label="Upload a project folder"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            read(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {reading && (
        <p role="status" className="mt-3 flex items-center gap-2 px-1 text-sm text-violet-200">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your app…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 px-1 text-sm text-rose-300">
          {error}
        </p>
      )}

      {app && (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-4 text-left" aria-label="Upload summary" role="region">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                {app.listing.name} <span className="font-normal text-muted">· {fileName}</span>
              </div>
              <div className="text-xs text-muted">
                {Object.keys(app.files).length} source files ready
                {app.converted.length ? ` · ${app.converted.length} converted from TypeScript` : ""}
              </div>
            </div>
          </div>

          {app.skipped.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer py-1">
                {app.skipped.length} file{app.skipped.length === 1 ? "" : "s"} left out
              </summary>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto pl-4">
                {app.skipped.map((s) => (
                  <li key={s.path}>
                    <code className="font-mono text-foreground/80">{s.path}</code> — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {app.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}

          {app.issues.length > 0 ? (
            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {app.issues.length} thing{app.issues.length === 1 ? "" : "s"} to fix before it runs in
                Appmaker
              </p>
              <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-5 text-amber-100/80">
                {app.issues.slice(0, 12).map((i, n) => (
                  <li key={n}>
                    <code className="font-mono">{i.file}</code>: {i.message}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex min-h-6 items-center gap-2">
                <input type="checkbox" checked={autoFix} onChange={(e) => setAutoFix(e.target.checked)} className="h-4 w-4 accent-violet-500" />
                Let the AI fix these as soon as it opens
              </label>
            </div>
          ) : (
            <p className="text-xs text-emerald-300">Passed the automatic check: it should run as-is.</p>
          )}

          <button
            type="button"
            onClick={open}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 px-4 text-sm font-medium text-white"
          >
            <Wand2 className="h-4 w-4" /> {app.issues.length && autoFix ? "Open and fix with AI" : "Open in the builder"}
          </button>
        </div>
      )}
    </div>
  );
}
