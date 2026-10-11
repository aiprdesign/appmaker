"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RotateCw, XCircle } from "lucide-react";
import { appBuildChecks } from "@/lib/eas/app-check";
import type { ExpoCheck } from "@/lib/eas/check";
import { checkExpoBuild } from "@/lib/eas/client";
import type { Project } from "@/lib/types";

/**
 * "Check before building": runs the app and Expo checks together and says,
 * for each problem, how to fix it. It never blocks a build; it explains.
 */
export function ExpoCheckPanel({ project, token, hasPreviewError }: { project: Project; token?: string; hasPreviewError: boolean }) {
  const [server, setServer] = useState<{ checks: ExpoCheck[]; account?: string; hosted: boolean } | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const link = project.expo?.link;

  const run = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      setServer(await checkExpoBuild(token, link));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [token, link]);

  // Checked once when the build step opens, and again when the account or the link changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the check runs on open by design
    void run();
  }, [run]);

  const checks = [...appBuildChecks(project, hasPreviewError), ...(server?.checks ?? [])];
  const problems = checks.filter((c) => c.ok === false).length;
  const warnings = checks.filter((c) => c.ok === null).length;

  return (
    <div className="mt-4 rounded-xl border border-line bg-background/40 p-4" aria-labelledby="expo-check-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="expo-check-title" className="text-sm font-semibold">
          Check before building
        </h3>
        <button
          onClick={() => void run()}
          disabled={running}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs hover:border-white/20 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Check again
        </button>
      </div>
      <p role="status" className={`mt-1 text-xs ${problems ? "text-rose-300" : warnings ? "text-amber-200" : "text-emerald-300"}`}>
        {running && !server
          ? "Checking the app and Expo…"
          : problems
            ? `${problems} thing${problems === 1 ? "" : "s"} to fix before building.`
            : warnings
              ? "Ready to build, with a note below."
              : `All clear: ready to build${server?.account ? ` on the “${server.account}” Expo account` : ""}.`}
      </p>
      {error && <p className="mt-1 text-xs text-rose-300">Couldn&apos;t run the Expo part of the check: {error}</p>}
      <ul className="mt-3 space-y-2 text-xs">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            {c.ok === true ? (
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="OK" />
            ) : c.ok === false ? (
              <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="Problem" />
            ) : (
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-300" aria-label="Note" />
            )}
            <span>
              <span className={c.ok === true ? "text-foreground/90" : "font-medium text-foreground"}>{c.label}</span>
              {c.detail && c.ok !== true && <span className="mt-0.5 block text-muted">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
