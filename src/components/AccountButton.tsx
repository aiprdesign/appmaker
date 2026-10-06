"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, Coins, LayoutGrid, Loader2, LogOut } from "lucide-react";
import { deleteAccount, signOut, useCloud, type SyncStatus } from "@/lib/cloud";
import { ConfirmDialog } from "./ConfirmDialog";
import { PasskeyManager } from "./Passkeys";

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
  const [credits, setCredits] = useState<number | null>(null);
  // The balance, when the site takes payments; refreshed each time the menu opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setCredits(d.enabled && d.signedIn ? d.balance : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!cloud.enabled) return null;
  if (!cloud.user) {
    return (
      <Link href="/login" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground">
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
          {credits !== null && (
            <Link
              href="/credits"
              onClick={() => setOpen(false)}
              className="mt-3 flex min-h-9 items-center justify-between rounded-lg bg-amber-500/10 px-3 text-sm text-amber-100 hover:bg-amber-500/15"
            >
              <span className="inline-flex items-center gap-1.5">
                <Coins className="h-4 w-4" /> {credits} credits
              </span>
              <span className="text-xs font-medium">Buy more</span>
            </Link>
          )}
          <Link
            href="/projects"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-black"
          >
            <LayoutGrid className="h-4 w-4" /> My apps
          </Link>
          <PasskeyManager />
          <button
            onClick={() => leave()}
            disabled={busy}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm hover:border-white/20 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
          </button>
          <p className="mt-2 text-[11px] text-muted">Signing out removes your apps from this browser. They stay safe in your account.</p>
          <button
            onClick={() => setDeleting(true)}
            className="mt-2 inline-flex min-h-8 items-center text-[11px] text-muted underline underline-offset-2 hover:text-rose-300"
          >
            Delete my account
          </button>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          danger
          title="Delete your account?"
          typeToConfirm={cloud.user.email}
          confirmLabel="Delete my account"
          body={
            <div className="space-y-2">
              <p>This permanently deletes, for everyone and on every device:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>your apps and their history (in your account and in this browser);</li>
                <li>your credits, including ones you bought, and your paid plan;</li>
                <li>support and privacy pages Appmaker hosts for your apps, so their links stop working;</li>
                <li>live website updates and bookings, including your customers&apos; bookings.</li>
              </ul>
              <p>
                Published apps keep working, but without those. Download any app you want to keep first (Publish tab → Download Expo project). This can&apos;t be
                undone.
              </p>
            </div>
          }
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await deleteAccount(cloud.user!.email);
              // A full page load on purpose (not router.push): nothing from the deleted account stays in memory.
              window.location.assign(new URL("/?account=deleted", window.location.origin).href);
            } catch (e) {
              setDeleting(false);
              setError(e instanceof Error ? e.message : "Couldn't delete the account.");
            }
          }}
        />
      )}
    </div>
  );
}
