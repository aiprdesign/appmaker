import { query } from "./db";

/** Numbers and member records for the admin dashboard. Never includes passwords or tokens. */

export interface Overview {
  members: number;
  newMembers7d: number;
  activeMembers7d: number;
  apps: number;
  appsUpdated7d: number;
  withPasskeys: number;
  withGoogle: number;
  /** Sign-ups per day for the last 14 days, oldest first (UTC dates). */
  signupsByDay: { day: string; count: number }[];
}

export async function overview(): Promise<Overview> {
  const weekAgo = Date.now() - 7 * 86400_000;
  const [m] = await query<{ members: string; new7: string; google: string }>(
    "select count(*) members, count(*) filter (where created_at > now() - interval '7 days') new7, count(*) filter (where google_sub is not null) google from app_users",
  );
  const [active] = await query<{ n: string }>(
    `select count(distinct user_id) n from (
       select user_id from app_sessions where created_at > now() - interval '7 days'
       union all select user_id from app_projects where updated_at > $1
     ) a`,
    [weekAgo],
  );
  const [apps] = await query<{ total: string; updated: string }>(
    "select count(*) filter (where deleted_at is null) total, count(*) filter (where deleted_at is null and updated_at > $1) updated from app_projects",
    [weekAgo],
  );
  const [pk] = await query<{ n: string }>("select count(distinct user_id) n from app_passkeys");
  const days = await query<{ day: string; count: string }>(
    `select to_char(d, 'YYYY-MM-DD') as day, count(u.id) as count
       from generate_series((now() at time zone 'utc')::date - 13, (now() at time zone 'utc')::date, interval '1 day') d
       left join app_users u on (u.created_at at time zone 'utc')::date = d::date
      group by d order by d`,
  );
  return {
    members: Number(m.members),
    newMembers7d: Number(m.new7),
    activeMembers7d: Number(active.n),
    apps: Number(apps.total),
    appsUpdated7d: Number(apps.updated),
    withPasskeys: Number(pk.n),
    withGoogle: Number(m.google),
    signupsByDay: days.map((d) => ({ day: d.day, count: Number(d.count) })),
  };
}

export interface Member {
  id: string;
  email: string;
  joinedAt: number;
  lastActiveAt: number | null;
  password: boolean;
  google: boolean;
  passkeys: number;
  apps: number;
  /** Credit balance; null until the member first uses credits (they then get the free ones). */
  credits: number | null;
  /** Has the paid plan (bought a pack, or given by the site owner). */
  paid: boolean;
}

export async function members(search: string, offset: number, limit = 50): Promise<{ members: Member[]; total: number }> {
  const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await query<{
    id: string;
    email: string;
    created_at: Date;
    has_password: boolean;
    has_google: boolean;
    passkeys: string;
    apps: string;
    last_session: Date | null;
    last_edit: string | null;
    credits: number | null;
    paid: boolean;
    total: string;
  }>(
    `select u.id, u.email, u.created_at, u.credits, u.paid, u.password_hash <> '' has_password, u.google_sub is not null has_google,
            (select count(*) from app_passkeys p where p.user_id = u.id) passkeys,
            (select count(*) from app_projects a where a.user_id = u.id and a.deleted_at is null) apps,
            (select max(created_at) from app_sessions s where s.user_id = u.id) last_session,
            (select max(updated_at) from app_projects a where a.user_id = u.id) last_edit,
            count(*) over () total
       from app_users u
      where u.email ilike $1
      order by u.created_at desc
      limit $2 offset $3`,
    [like, limit, offset],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    members: rows.map((r) => {
      const last = Math.max(r.last_session?.getTime() ?? 0, Number(r.last_edit ?? 0));
      return {
        id: r.id,
        email: r.email,
        joinedAt: r.created_at.getTime(),
        lastActiveAt: last || null,
        password: r.has_password,
        google: r.has_google,
        passkeys: Number(r.passkeys),
        apps: Number(r.apps),
        credits: r.credits,
        paid: r.paid,
      };
    }),
  };
}

/** Signs a member out on every device. */
export async function signOutMember(id: string): Promise<void> {
  await query("delete from app_sessions where user_id = $1", [id]);
}

/** Deletes a member with their sessions, passkeys and saved apps. */
export async function deleteMember(id: string): Promise<boolean> {
  const rows = await query("delete from app_users where id = $1 returning id", [id]);
  return rows.length > 0;
}

export interface AppSummary {
  id: string;
  userId: string;
  owner: string;
  name: string;
  iconEmoji: string;
  primaryColor: string;
  prompt: string;
  files: number;
  createdAt: number | null;
  updatedAt: number;
  /** How it started: a ready-made template, a business website, or an idea for the AI. */
  origin: "template" | "website" | "prompt";
  /** The template's slug (ready-made apps). */
  template: string | null;
  /** A website (redesign) rather than an app. */
  isWebsite: boolean;
  /** The app database is on, and how many orders or requests it holds. */
  database: boolean;
  orders: number;
  /** The quality critic's latest score out of 100, if it ran. */
  score: number | null;
}

/** Filters for the Apps tab. */
export const APP_FILTERS = ["template", "website", "prompt", "database", "sites"] as const;
export type AppFilter = (typeof APP_FILTERS)[number];

/** Apps saved in accounts (not deleted), newest edit first. */
export async function apps(search: string, userId: string | null, offset: number, limit = 50, filter: AppFilter | null = null): Promise<{ apps: AppSummary[]; total: number }> {
  const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await query<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    icon: string | null;
    color: string | null;
    prompt: string | null;
    files: string;
    created: string | null;
    updated_at: string;
    total: string;
    kind: string | null;
    template: string | null;
    source: string | null;
    store: string | null;
    orders: string;
    score: string | null;
  }>(
    `select a.id, a.user_id, u.email, a.name,
            a.data->'listing'->>'iconEmoji' icon, a.data->'listing'->>'primaryColor' color,
            left(a.data->>'prompt', 300) prompt,
            (select count(*) from jsonb_object_keys(coalesce(a.data->'files', '{}'::jsonb))) files,
            a.data->>'createdAt' created, a.updated_at,
            a.data->>'kind' kind, a.data->'ready'->>'slug' template, a.data->'source'->>'url' source,
            s.id store,
            (select count(*) from app_data_records r where r.store_id = s.id and r.status <> '') orders,
            (select (m.v->'review'->>'score') from jsonb_array_elements(coalesce(a.data->'messages', '[]'::jsonb)) with ordinality m(v, n)
              where m.v->'review'->>'agent' = 'critic' order by m.n desc limit 1) score,
            count(*) over () total
       from app_projects a join app_users u on u.id = a.user_id
       left join app_data_stores s on s.user_id = a.user_id and s.project_id = a.id
      where a.deleted_at is null
        and ($3::text is null or a.user_id = $3)
        and (a.name ilike $1 or u.email ilike $1 or a.data->>'prompt' ilike $1)
        and ($5::text is null
          or ($5 = 'template' and a.data->'ready' is not null and a.data->'source' is null)
          or ($5 = 'website' and a.data->'source' is not null and coalesce(a.data->>'kind', 'app') <> 'website')
          or ($5 = 'prompt' and a.data->'ready' is null and a.data->'source' is null)
          or ($5 = 'database' and s.id is not null)
          or ($5 = 'sites' and a.data->>'kind' = 'website'))
      order by a.updated_at desc
      limit $2 offset $4`,
    [like, limit, userId, offset, filter],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    apps: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      owner: r.email,
      name: r.name || "Untitled app",
      iconEmoji: r.icon || "✨",
      primaryColor: /^#[0-9a-f]{6}$/i.test(r.color ?? "") ? r.color! : "#6D5DFB",
      prompt: r.prompt ?? "",
      files: Number(r.files),
      createdAt: r.created ? Number(r.created) : null,
      updatedAt: Number(r.updated_at),
      origin: r.template && !r.source ? "template" : r.source ? "website" : "prompt",
      template: r.template,
      isWebsite: r.kind === "website",
      database: !!r.store,
      orders: Number(r.orders),
      score: r.score != null && Number.isFinite(Number(r.score)) ? Number(r.score) : null,
    })),
  };
}

/** One app's saved data (code, listing, conversation), for viewing. */
export async function appDetail(userId: string, id: string): Promise<unknown | null> {
  const rows = await query<{ data: unknown; email: string }>(
    "select a.data, u.email from app_projects a join app_users u on u.id = a.user_id where a.user_id = $1 and a.id = $2 and a.deleted_at is null",
    [userId, id],
  );
  return rows[0] ? { project: rows[0].data, owner: rows[0].email } : null;
}

/** Removes an app from its owner's account (their devices delete it on next sync). */
export async function deleteApp(userId: string, id: string): Promise<boolean> {
  const now = Date.now();
  const rows = await query(
    "update app_projects set data = null, size = 0, deleted_at = $3, updated_at = greatest(updated_at, $3) where user_id = $1 and id = $2 and deleted_at is null returning id",
    [userId, id, now],
  );
  return rows.length > 0;
}
