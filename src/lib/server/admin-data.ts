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
    total: string;
  }>(
    `select u.id, u.email, u.created_at, u.password_hash <> '' has_password, u.google_sub is not null has_google,
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
