import { query } from "./db";
import { AuthError } from "./auth";

/**
 * Projects saved to a user's account. The browser stays the working copy
 * and syncs here; the newest change (by updatedAt) wins. Deleted projects
 * leave a tombstone so other devices delete their copy too.
 */

export const MAX_PROJECT_BYTES = 4_000_000;
export const MAX_PROJECTS = 500;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  deletedAt?: number;
}

export function checkProjectId(id: string): string {
  if (!/^[a-z0-9]{6,32}$/.test(id)) throw new AuthError("Invalid project id.", 400);
  return id;
}

export async function listProjects(userId: string): Promise<ProjectMeta[]> {
  const rows = await query<{ id: string; name: string; updated_at: string; deleted_at: string | null }>(
    "select id, name, updated_at, deleted_at from app_projects where user_id = $1 order by updated_at desc",
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: Number(r.updated_at), ...(r.deleted_at ? { deletedAt: Number(r.deleted_at) } : {}) }));
}

export async function getProject(userId: string, id: string): Promise<unknown | null> {
  const rows = await query<{ data: unknown }>("select data from app_projects where user_id = $1 and id = $2 and deleted_at is null", [userId, id]);
  return rows[0]?.data ?? null;
}

/**
 * Saves a project unless the account already has a newer copy (another
 * device saved later). Returns the stored updatedAt.
 */
export async function saveProject(userId: string, id: string, project: Record<string, unknown>): Promise<{ saved: boolean; updatedAt: number }> {
  const json = JSON.stringify(project);
  if (json.length > MAX_PROJECT_BYTES) throw new AuthError("This app is too large to save to your account (over 4 MB).", 413);
  const updatedAt = Number(project.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) throw new AuthError("project.updatedAt is invalid", 400);
  const name = typeof project.name === "string" ? project.name.slice(0, 120) : "";

  const existing = await query<{ updated_at: string; deleted_at: string | null }>("select updated_at, deleted_at from app_projects where user_id = $1 and id = $2", [userId, id]);
  if (!existing.length) {
    const [{ count }] = await query<{ count: string }>("select count(*) from app_projects where user_id = $1 and deleted_at is null", [userId]);
    if (Number(count) >= MAX_PROJECTS) throw new AuthError(`Your account has the maximum of ${MAX_PROJECTS} apps. Delete some to save more.`, 409);
  }
  // Only a strictly newer change replaces what's stored, and a change older
  // than a deletion doesn't bring the project back.
  const rows = await query<{ updated_at: string }>(
    `insert into app_projects (user_id, id, name, data, size, updated_at, deleted_at)
     values ($1, $2, $3, $4::jsonb, $5, $6, null)
     on conflict (user_id, id) do update set name = excluded.name, data = excluded.data, size = excluded.size, updated_at = excluded.updated_at, deleted_at = null
     where app_projects.updated_at < excluded.updated_at and (app_projects.deleted_at is null or app_projects.deleted_at < excluded.updated_at)
     returning updated_at`,
    [userId, id, name, json, json.length, updatedAt],
  );
  if (rows.length) return { saved: true, updatedAt };
  return { saved: false, updatedAt: Number(existing[0]?.updated_at ?? updatedAt) };
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const now = Date.now();
  await query(
    `insert into app_projects (user_id, id, name, data, size, updated_at, deleted_at) values ($1, $2, '', null, 0, $3, $3)
     on conflict (user_id, id) do update set data = null, size = 0, deleted_at = $3, updated_at = greatest(app_projects.updated_at, $3)`,
    [userId, id, now],
  );
}
