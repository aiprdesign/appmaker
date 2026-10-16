import { randomBytes } from "node:crypto";
import type { FileMap } from "../types";
import { query } from "./db";

/** Apps published to the web: customers open the link and add it to their Home Screen, no store needed. */
export interface WebApp {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  files: FileMap;
}

export async function saveWebApp(userId: string, projectId: string, app: Omit<WebApp, "id">): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into app_web_apps (id, user_id, project_id, name, color, icon, files) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, project_id) do update set name = excluded.name, color = excluded.color, icon = excluded.icon, files = excluded.files, updated_at = now()
     returning id`,
    [randomBytes(6).toString("base64url"), userId, projectId, app.name, app.color, app.icon, JSON.stringify(app.files)],
  );
  return rows[0].id;
}

export async function getWebApp(id: string): Promise<WebApp | null> {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  const rows = await query<WebApp>("select id, name, color, icon, files from app_web_apps where id = $1", [id]);
  return rows[0] ?? null;
}

export async function webAppFor(userId: string, projectId: string): Promise<string | null> {
  const rows = await query<{ id: string }>("select id from app_web_apps where user_id = $1 and project_id = $2", [userId, projectId]);
  return rows[0]?.id ?? null;
}

export async function webAppCount(userId: string): Promise<number> {
  const rows = await query<{ n: number }>("select count(*)::int as n from app_web_apps where user_id = $1", [userId]);
  return rows[0]?.n ?? 0;
}

export async function deleteWebApp(userId: string, projectId: string): Promise<void> {
  await query("delete from app_web_apps where user_id = $1 and project_id = $2", [userId, projectId]);
}
