import type { Project, StoreListing } from "./types";

/**
 * Projects are persisted in the browser's localStorage. Swap this module for
 * a database-backed API when adding accounts and cloud sync.
 */
const KEY = "appmaker.projects.v1";

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

function writeAll(projects: Record<string, Project>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    // Storage full or unavailable; the session keeps working in memory.
  }
}

export function listProjects(): Project[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Project | null {
  return readAll()[id] ?? null;
}

export function saveProject(project: Project) {
  const all = readAll();
  all[project.id] = { ...project, updatedAt: Date.now() };
  writeAll(all);
}

export function deleteProject(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export function createProject(prompt: string): Project {
  const now = Date.now();
  const project: Project = {
    id: uid(),
    name: "Untitled app",
    prompt,
    files: {},
    messages: [],
    listing: emptyListing(),
    createdAt: now,
    updatedAt: now,
  };
  saveProject(project);
  return project;
}
