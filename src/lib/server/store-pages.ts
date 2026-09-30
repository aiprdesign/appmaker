import { randomBytes } from "node:crypto";
import type { StorePageContent } from "../store-pages";
import { query } from "./db";

/** Hosted support and privacy pages; one pair per app, owned by its account. */

export async function savePages(userId: string, projectId: string, content: StorePageContent): Promise<string> {
  const id = randomBytes(9).toString("base64url");
  const rows = await query<{ id: string }>(
    `insert into app_store_pages (id, user_id, project_id, content) values ($1, $2, $3, $4)
     on conflict (user_id, project_id) do update set content = excluded.content, updated_at = now()
     returning id`,
    [id, userId, projectId, JSON.stringify(content)],
  );
  return rows[0].id;
}

export async function getPages(id: string): Promise<StorePageContent | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const rows = await query<{ content: StorePageContent }>("select content from app_store_pages where id = $1", [id]);
  return rows[0]?.content ?? null;
}
