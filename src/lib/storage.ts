import type { Project, SiteSummary, StoreListing } from "./types";

/**
 * Projects are kept in the browser's localStorage, the working copy the
 * builder reads and writes instantly. When the user is signed in, the cloud
 * sync (lib/cloud.ts) listens for changes and saves them to their account.
 */
const KEY = "appmaker.projects.v1";

type ChangeListener = (change: { type: "save"; project: Project } | { type: "delete"; id: string }) => void;
const changeListeners = new Set<ChangeListener>();

/** Lets cloud sync hear about local saves and deletions. */
export function onProjectChange(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyListing(name = "My App"): StoreListing {
  return {
    name,
    subtitle: "",
    description: "",
    keywords: "",
    category: "Productivity",
    bundleId: "com.appmaker.myapp",
    primaryColor: "#6D5DFB",
    iconEmoji: "✨",
    privacyNotes: "Data is stored on-device only.",
  };
}

function readAll(): Record<string, Project> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(projects: Record<string, Project>): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

/** Versions kept per project; older ones are dropped first when space runs out. */
export const MAX_VERSIONS = 25;

export function listProjects(): Project[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Project | null {
  return readAll()[id] ?? null;
}

/**
 * Saves a project. If the browser's storage is full, old versions (first of
 * this project, then of others) are dropped to make room. Returns false if
 * the project still couldn't be saved, so the UI can warn the user.
 */
export function saveProject(project: Project): boolean {
  const saved = { ...project, updatedAt: Math.max(Date.now(), project.updatedAt + 1) };
  const ok = storeLocal(saved);
  // Cloud sync gets the full project even if the browser had to trim it.
  changeListeners.forEach((l) => l({ type: "save", project: saved }));
  return ok;
}

/** Writes a project to the browser as-is (used by sync; doesn't notify). */
export function storeLocal(project: Project): boolean {
  const all = readAll();
  all[project.id] = project;
  if (writeAll(all)) return true;
  const trim = (p: Project, keep: number) => (p.versions && p.versions.length > keep ? { ...p, versions: p.versions.slice(-keep) } : p);
  for (const keep of [10, 3, 1, 0]) {
    all[project.id] = trim(all[project.id], keep);
    if (writeAll(all)) return true;
    for (const id of Object.keys(all)) if (id !== project.id) all[id] = trim(all[id], keep);
    if (writeAll(all)) return true;
  }
  return false;
}

/** Removes a project from the browser only (used by sync). */
export function removeLocal(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

/** Removes every project from this browser (on sign-out; they stay in the account). */
export function clearLocalProjects() {
  writeAll({});
}

/** Records the app's current state as a version. */
export function withVersion(project: Project, label: string): { project: Project; versionId: string } {
  const version = { id: uid(), createdAt: Date.now(), label: label.slice(0, 120), files: project.files, listing: project.listing };
  const versions = [...(project.versions ?? []), version].slice(-MAX_VERSIONS);
  return { project: { ...project, versions }, versionId: version.id };
}

export function deleteProject(id: string) {
  removeLocal(id);
  changeListeners.forEach((l) => l({ type: "delete", id }));
}

export function createProject(prompt: string, source?: SiteSummary): Project {
  const now = Date.now();
  const project: Project = {
    id: uid(),
    name: "Untitled app",
    prompt,
    files: {},
    messages: [],
    listing: emptyListing(),
    ...(source ? { source } : {}),
    createdAt: now,
    updatedAt: now,
  };
  saveProject(project);
  return project;
}
