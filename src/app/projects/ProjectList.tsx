"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { AppIcon } from "@/components/builder/PublishPanel";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { PasskeyNudge } from "@/components/Passkeys";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { deleteProject, listProjects } from "@/lib/storage";
import type { Project } from "@/lib/types";
import { Orb } from "@/components/fx/Orb";

/** Quick starts for an empty list: they fill in the prompt on the home page. */
const IDEAS = ["A habit tracker with streaks", "A menu and booking app for my café", "A budget planner with charts", "A workout timer", "A travel packing list"];

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [removing, setRemoving] = useState<Project | null>(null);
  const cloud = useCloud();
  const cloudNote = cloud.user ? " from your account and every device" : " from this browser";
  useEffect(() => {
    // Projects live in localStorage, which is only readable after mount;
    // account sync may bring in more.
    const load = () => setProjects(listProjects());
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    return () => window.removeEventListener(PROJECTS_CHANGED, load);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My apps</h1>
        <Link
          href="/#start"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90"
        >
          <Plus className="h-4 w-4" /> New app
        </Link>
      </div>
      {cloud.enabled && !cloud.user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 text-sm">
          <span>These apps are saved in this browser only. Sign in to keep them in your account and open them on any device.</span>
          <Link href="/login" className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-medium text-black">
            Sign in
          </Link>
        </div>
      )}
      {cloud.user && (
        <p className="mt-3 text-xs text-muted" role="status">
          {cloud.status === "syncing" ? "Loading apps from your account…" : `Saved to your account (${cloud.user.email}).`}
        </p>
      )}
      <PasskeyNudge />
      {projects && projects.length === 0 && (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-line bg-surface/60 px-6 py-14 text-center">
          <Orb size={96} />
          <h2 className="mt-8 text-xl font-semibold">Your first app is one sentence away</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Describe it in your own words, or start from one of these ideas.</p>
          <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
            {IDEAS.map((idea) => (
              <Link
                key={idea}
                href={`/?idea=${encodeURIComponent(idea)}#start`}
                className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm text-foreground/90 hover:border-violet-400/50 hover:bg-violet-500/10"
              >
                {idea}
              </Link>
            ))}
          </div>
          <Link
            href="/#start"
            className="mt-8 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Describe your own
          </Link>
        </div>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects?.map((p) => (
          <div key={p.id} className="group relative rounded-2xl border border-line bg-surface p-5 transition hover:border-white/20">
            <Link href={`/build/${p.id}`} className="absolute inset-0" aria-label={`Open ${p.name}`} />
            <div className="flex items-center gap-3">
              <AppIcon listing={p.listing} icon={p.icon} size={48} />
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-muted">
                  {Object.keys(p.files).length} files · edited {ago(p.updatedAt)}
                </div>
              </div>
            </div>
            <p className="mt-4 line-clamp-2 text-sm text-muted">{p.prompt}</p>
            {p.booking && (
              // The business's bookings page; the account that made the app opens it without a link.
              <Link
                href={`/owner/${p.booking.id}`}
                className="relative z-10 mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
              >
                <CalendarCheck className="h-4 w-4 text-violet-300" /> Bookings
              </Link>
            )}
            <button
              onClick={() => setRemoving(p)}
              // Always visible on touch screens; on hover or keyboard focus with a mouse.
              className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-rose-400 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          danger
          title="Delete this app?"
          body={
            <>
              <span className="text-foreground">“{removing.name}”</span> and its history will be deleted{cloudNote}. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete app"
          onConfirm={() => {
            deleteProject(removing.id);
            setProjects(listProjects());
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
