"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy, LayoutGrid, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AppIcon } from "./PublishPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PROJECTS_CHANGED, useCloud } from "@/lib/cloud";
import { deleteProject, getProject, listProjects, onProjectChange, saveProject, uid } from "@/lib/storage";
import type { Project } from "@/lib/types";

/**
 * The left sidebar in the builder: every app the person is making, with a
 * "+" for a new one. It collapses to icons only (⌘/Ctrl+B), and remembers
 * that choice on this device.
 */

const KEY = "appmaker.sidebar";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved === "collapsed";
  } catch {
    // Storage blocked: fall back to the screen size.
  }
  // Open by default where there's room for it next to the chat and the phone.
  return window.innerWidth < 1440;
}

function setCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(KEY, collapsed ? "collapsed" : "open");
  } catch {
    // Not remembered, but still toggles for now.
  }
  override = collapsed;
  listeners.forEach((l) => l());
}

let override: boolean | null = null;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => override ?? readCollapsed();

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 3600) return s < 60 ? "just now" : `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * A copy of an app to keep working on separately. Its store pages and cloud
 * build setup belong to the original, so the copy starts without them.
 */
export function duplicateProject(original: Project): Project {
  const now = Date.now();
  const name = `${original.name || "Untitled app"} copy`;
  const bundleId = original.listing.bundleId ? `${original.listing.bundleId}.copy`.slice(0, 155) : original.listing.bundleId;
  const copy: Project = {
    ...original,
    id: uid(),
    name,
    listing: { ...original.listing, name, bundleId },
    expo: undefined,
    storePages: undefined,
    pending: undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveProject(copy);
  return copy;
}

/** The "⋯" menu on an app in the sidebar: rename, duplicate, delete. */
function AppMenu({ project, onRename, onDuplicate, onDelete }: { project: Project; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const entry = "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-white/5 focus:bg-white/5 focus:outline-none";
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`More actions for ${project.name || "Untitled app"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 ${open ? "bg-white/10 opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" aria-label={project.name || "Untitled app"} className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-line bg-surface p-1 shadow-2xl">
          <button role="menuitem" className={entry} onClick={run(onRename)}>
            <Pencil className="h-4 w-4 text-muted" /> Rename
          </button>
          <button role="menuitem" className={entry} onClick={run(onDuplicate)}>
            <Copy className="h-4 w-4 text-muted" /> Duplicate
          </button>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className={`${entry} text-rose-300`} onClick={run(onDelete)}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function AppSidebar({
  currentId,
  onRenameCurrent,
  busy = false,
}: {
  currentId: string;
  /** Renames the app that's open (the builder holds its latest state). */
  onRenameCurrent?: (name: string) => void;
  /** The open app is being built or checked: it can't be deleted right now. */
  busy?: boolean;
}) {
  const router = useRouter();
  const cloud = useCloud();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<Project | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Collapsed on the server and the first paint, then the saved choice.
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = () => setProjects(listProjects());
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    const off = onProjectChange(() => setTimeout(load, 0));
    return () => {
      window.removeEventListener(PROJECTS_CHANGED, load);
      off();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(!snapshot());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reload = () => setProjects(listProjects());
  const rename = (p: Project) => {
    const name = draft.trim().slice(0, 60);
    setRenaming(null);
    if (!name || name === p.name) return;
    if (p.id === currentId && onRenameCurrent) onRenameCurrent(name);
    else {
      const latest = getProject(p.id) ?? p;
      saveProject({ ...latest, name, listing: { ...latest.listing, name } });
    }
    reload();
  };
  const duplicate = (p: Project) => {
    const copy = duplicateProject(getProject(p.id) ?? p);
    reload();
    router.push(`/build/${copy.id}`);
  };

  const q = query.trim().toLowerCase();
  const shown = q ? projects.filter((p) => (p.name || "").toLowerCase().includes(q)) : projects;
  const item = "flex min-h-10 items-center gap-2.5 rounded-lg text-sm transition-colors";

  return (
    <nav
      aria-label="Your apps"
      data-collapsed={collapsed}
      className={`hidden shrink-0 flex-col border-r border-line bg-surface/40 transition-[width] duration-200 md:flex ${collapsed ? "w-[60px]" : "w-64"}`}
    >
      <div className={`flex h-14 shrink-0 items-center gap-1 border-b border-line px-2.5 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && <span className="pl-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Your apps</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-keyshortcuts="Control+B Meta+B"
          title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-2 p-2.5">
        <Link
          href="/#start"
          aria-label="New app"
          title={collapsed ? "New app" : undefined}
          className={`${item} justify-center bg-gradient-to-r from-violet-500 to-pink-500 font-medium text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,0.8)] hover:opacity-95 ${collapsed ? "w-10 px-0" : "px-3"}`}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && <span>New app</span>}
        </Link>
        {!collapsed && projects.length > 6 && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps"
              aria-label="Search your apps"
              className="min-h-9 w-full rounded-lg border border-line bg-background pl-8 pr-2 text-sm outline-none placeholder:text-muted/70 focus:border-violet-500/60"
            />
          </label>
        )}
      </div>

      <ul className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-2">
        {shown.map((p) => {
          const current = p.id === currentId;
          const name = p.name || "Untitled app";
          if (renaming === p.id && !collapsed) {
            return (
              <li key={p.id} className="px-1 py-1">
                <input
                  autoFocus
                  value={draft}
                  maxLength={60}
                  aria-label={`New name for ${name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => rename(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(p);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="min-h-9 w-full rounded-lg border border-violet-500/60 bg-background px-2.5 text-sm outline-none"
                />
              </li>
            );
          }
          return (
            <li key={p.id} className="group relative flex items-center">
              <Link
                href={`/build/${p.id}`}
                aria-current={current ? "page" : undefined}
                aria-label={collapsed ? name : undefined}
                title={collapsed ? name : undefined}
                className={`${item} min-w-0 flex-1 ${collapsed ? "justify-center px-0" : "px-2 pr-9"} ${
                  current ? "bg-white/10 text-foreground" : "text-foreground/80 hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span className={`shrink-0 rounded-[9px] ${current ? "ring-2 ring-violet-400/70 ring-offset-2 ring-offset-background" : ""}`}>
                  <AppIcon listing={p.listing} icon={p.icon} size={28} />
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-[11px] text-muted">{ago(p.updatedAt)}</span>
                  </span>
                )}
              </Link>
              {!collapsed && (
                <div className="absolute right-1">
                  <AppMenu
                    project={p}
                    onRename={() => {
                      setDraft(name);
                      setRenaming(p.id);
                    }}
                    onDuplicate={() => duplicate(p)}
                    onDelete={() => (current && busy ? setNote("Wait until this app finishes building, then delete it.") : setRemoving(p))}
                  />
                </div>
              )}
            </li>
          );
        })}
        {!collapsed && q && shown.length === 0 && <li className="px-2 py-3 text-xs text-muted">No apps match “{query.trim()}”.</li>}
      </ul>

      {note && !collapsed && (
        <p role="status" className="mx-2.5 mb-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
          {note}
        </p>
      )}
      {removing && (
        <ConfirmDialog
          danger
          title="Delete this app?"
          body={
            <>
              <span className="text-foreground">“{removing.name || "Untitled app"}”</span> and its history will be deleted
              {cloud.user ? " from your account and every device" : " from this browser"}. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete app"
          onConfirm={() => {
            const wasOpen = removing.id === currentId;
            deleteProject(removing.id);
            setRemoving(null);
            reload();
            if (wasOpen) router.push("/projects");
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
      <div className="border-t border-line p-2.5">
        <Link
          href="/projects"
          aria-label={collapsed ? "All apps" : undefined}
          title={collapsed ? "All apps" : undefined}
          className={`${item} text-muted hover:bg-white/5 hover:text-foreground ${collapsed ? "justify-center px-0" : "px-2"}`}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          {!collapsed && <span>All apps</span>}
        </Link>
      </div>
    </nav>
  );
}
