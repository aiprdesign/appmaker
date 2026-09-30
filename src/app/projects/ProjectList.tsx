"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppIcon } from "@/components/builder/PublishPanel";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { PasskeyNudge } from "@/components/Passkeys";
import { deleteProject, listProjects } from "@/lib/storage";
import type { Project } from "@/lib/types";

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const cloud = useCloud();
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
        <div className="mt-10 rounded-2xl border border-dashed border-line p-12 text-center text-muted">
          No apps yet. Describe one on the home page to get started.
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
            <button
              onClick={() => {
                if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
                deleteProject(p.id);
                setProjects(listProjects());
              }}
              className="absolute right-3 top-3 z-10 hidden rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-rose-400 group-hover:block"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
