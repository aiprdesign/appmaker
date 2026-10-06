"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { AppIcon } from "./PublishPanel";
import { PROJECTS_CHANGED } from "@/lib/cloud";
import { listProjects, onProjectChange } from "@/lib/storage";
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

export function AppSidebar({ currentId }: { currentId: string }) {
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
          return (
            <li key={p.id}>
              <Link
                href={`/build/${p.id}`}
                aria-current={current ? "page" : undefined}
                aria-label={collapsed ? name : undefined}
                title={collapsed ? name : undefined}
                className={`${item} ${collapsed ? "justify-center px-0" : "px-2"} ${
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
            </li>
          );
        })}
        {!collapsed && q && shown.length === 0 && <li className="px-2 py-3 text-xs text-muted">No apps match “{query.trim()}”.</li>}
      </ul>

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
