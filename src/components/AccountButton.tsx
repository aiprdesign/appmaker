"use client";

import Link from "next/link";
import { useState } from "react";
import { Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { signOut, useCloud, type SyncStatus } from "@/lib/cloud";

export function syncLabel(status: SyncStatus): string {
  switch (status) {
    case "syncing":
      return "Syncing with your account…";
    case "saving":
      return "Saving to your account…";
    case "offline":
      return "Offline — changes will be saved when you're back online";
    case "error":
      return "Couldn't save to your account";
    default:
      return "Saved to your account";
  }
}

/** Small cloud icon showing whether changes are saved to the account. */
export function SyncBadge() {
  const cloud = useCloud();
  if (!cloud.user) return null;
  const busy = cloud.status === "saving" || cloud.status === "syncing";
  const bad = cloud.status === "offline" || cloud.status === "error";
  const label = cloud.status === "error" && cloud.error ? cloud.error : syncLabel(cloud.status);
  return (
    <span role="status" title={label} aria-label={label} className={`grid h-8 w-8 place-items-center ${bad ? "text-amber-400" : "text-muted"}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : bad ? <CloudOff className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
    </span>
  );
}

/** "Sign in", or the signed-in account with a sign-out menu. Hidden when the site has no accounts. */
export function AccountButton() {
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cloud.enabled) return null;
  if (!cloud.user) {
    return (
      <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground">
        Sign in
      </Link>
    );
  }
  const leave = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      await signOut({ force });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign out.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Account: ${cloud.user.email}`}
        className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-semibold uppercase text-white"
      >
        {cloud.user.email[0]}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl">
          <div className="truncate font-medium">{cloud.user.email}</div>
          <div className="mt-1 text-xs text-muted">{cloud.status === "error" && cloud.error ? cloud.error : syncLabel(cloud.status)}</div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-amber-200">
              {error}{" "}
              <button onClick={() => leave(true)} className="underline underline-offset-2">
                Sign out anyway
              </button>
            </p>
          )}
          <button
            onClick={() => leave()}
            disabled={busy}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm hover:border-white/20 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
          </button>
          <p className="mt-2 text-[11px] text-muted">Signing out removes your apps from this browser. They stay safe in your account.</p>
        </div>
      )}
    </div>
  );
}
