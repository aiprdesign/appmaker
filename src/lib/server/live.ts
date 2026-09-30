import { randomBytes } from "node:crypto";
import { liveContentFromSite, type LiveContent } from "../live";
import { importSite, SiteError } from "../site";
import { query } from "./db";

/**
 * Live website content for apps. A site is re-read only when an app asks for
 * its content and the copy is more than a day old, one read at a time per
 * app, in the background; the app always gets the saved copy immediately.
 */

export const LIVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const refreshing = new Set<string>();

interface Row {
  id: string;
  user_id: string;
  url: string;
  content: LiveContent | null;
  fetched_at: Date | null;
  error: string | null;
}

export interface LiveFeed {
  id: string;
  url: string;
  content: LiveContent | null;
  fetchedAt: string | null;
  error: string | null;
}

const toFeed = (r: Row): LiveFeed => ({
  id: r.id,
  url: r.url,
  content: r.content,
  fetchedAt: r.fetched_at ? new Date(r.fetched_at).toISOString() : null,
  error: r.error,
});

export async function getFeed(id: string): Promise<(LiveFeed & { userId: string }) | null> {
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const rows = await query<Row>("select id, user_id, url, content, fetched_at, error from app_live_sites where id = $1", [id]);
  return rows[0] ? { ...toFeed(rows[0]), userId: rows[0].user_id } : null;
}

/** Reads the website now and saves the result; keeps the last good copy if it fails. */
export async function refreshFeed(id: string, url: string): Promise<LiveFeed | null> {
  if (refreshing.has(id)) return null;
  refreshing.add(id);
  try {
    const content = liveContentFromSite(await importSite(url));
    const rows = await query<Row>(
      "update app_live_sites set content = $2, fetched_at = now(), error = null where id = $1 returning id, user_id, url, content, fetched_at, error",
      [id, JSON.stringify(content)],
    );
    return rows[0] ? toFeed(rows[0]) : null;
  } catch (e) {
    const message = e instanceof SiteError ? e.message : "Couldn't read the website.";
    // Wait a day before trying again, so a site that's down isn't hammered.
    const rows = await query<Row>(
      "update app_live_sites set error = $2, fetched_at = now() where id = $1 returning id, user_id, url, content, fetched_at, error",
      [id, message],
    );
    return rows[0] ? toFeed(rows[0]) : null;
  } finally {
    refreshing.delete(id);
  }
}

export function isStale(feed: LiveFeed, now = Date.now()): boolean {
  return !feed.fetchedAt || now - Date.parse(feed.fetchedAt) > LIVE_MAX_AGE_MS;
}

/** Turns on live content for an app (or changes its website) and reads the site once. */
export async function createFeed(userId: string, projectId: string, url: string): Promise<LiveFeed> {
  const id = randomBytes(9).toString("base64url");
  const rows = await query<Row>(
    `insert into app_live_sites (id, user_id, project_id, url) values ($1, $2, $3, $4)
     on conflict (user_id, project_id) do update set url = excluded.url
     returning id, user_id, url, content, fetched_at, error`,
    [id, userId, projectId, url],
  );
  const feed = toFeed(rows[0]);
  return (await refreshFeed(feed.id, url)) ?? feed;
}

export async function deleteFeed(userId: string, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("delete from app_live_sites where id = $1 and user_id = $2 returning id", [id, userId]);
  return rows.length > 0;
}
