"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { checkClaims, DEFAULT_WORDING, type ClaimHit } from "@/lib/claims";
import { checkRegulatedClaims } from "@/lib/regulated";
import type { Project } from "@/lib/types";

/** Everything in the app and its listing that makes a claim, right now (health and money claims first). */
export function exportClaims(project: Project): { regulated: ClaimHit[]; marketing: ClaimHit[] } {
  const regulated = checkRegulatedClaims(project.files, project.listing);
  const marketing = (project.wording ?? DEFAULT_WORDING) === "claim-safe" ? checkClaims(project.files, project.listing) : [];
  return { regulated, marketing };
}

/**
 * The third claim check, as the app leaves Appmaker (download, store build, web app): after the AI's own
 * check and the owner's hand edits, the finished app is checked once more. With claims in it, the owner
 * sees them and chooses: go back and fix, or continue anyway.
 */
export function useExportClaimCheck(project: Project | null | undefined, onFix?: () => void) {
  const [pending, setPending] = useState<null | { what: string; run: () => void | Promise<void>; regulated: ClaimHit[]; marketing: ClaimHit[] }>(null);

  const gate = (what: string, run: () => void | Promise<void>) => {
    if (!project) return void run();
    const { regulated, marketing } = exportClaims(project);
    if (!regulated.length && !marketing.length) return void run();
    setPending({ what, run, regulated, marketing });
  };

  const list = (hits: ClaimHit[]) => [...new Set(hits.map((h) => `“${h.phrase}”`))].slice(0, 6).join(", ") + (hits.length > 6 ? "…" : "");

  const dialog = pending && (
    <ConfirmDialog
      title={pending.regulated.length ? "Health or money claims found" : "Claims found in your app"}
      danger={pending.regulated.length > 0}
      confirmLabel={`${pending.what} anyway`}
      body={
        <div className="space-y-2 text-sm">
          {pending.regulated.length > 0 && (
            <p>
              <strong className="text-red-300">{list(pending.regulated)}</strong>: the App Store and Google Play reject apps with these, and they can mislead customers.
            </p>
          )}
          {pending.marketing.length > 0 && (
            <p>
              <strong className="text-amber-200">{list(pending.marketing)}</strong>: claims customers can&apos;t check.
            </p>
          )}
          {onFix && (
            <button
              onClick={() => {
                setPending(null);
                onFix();
              }}
              className="min-h-10 rounded-lg bg-violet-600 px-3 font-medium text-white"
            >
              Fix the wording with AI
            </button>
          )}
        </div>
      }
      onConfirm={async () => {
        const run = pending.run;
        setPending(null);
        await run();
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { gate, dialog };
}
