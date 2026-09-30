import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * PostgreSQL for accounts and cloud-saved projects. Optional: without
 * DATABASE_URL, Appmaker keeps projects in the browser only and accounts are
 * turned off. On Railway, adding a PostgreSQL database to the project and
 * referencing its DATABASE_URL on the app's service is all it takes.
 */

export function databaseConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!.trim();
    // Railway's internal address is plain TCP; its public proxy and most
    // hosted databases ask for TLS via sslmode in the URL.
    const ssl = /sslmode=(require|verify)/.test(url) || process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined;
    pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl });
    pool.on("error", () => {
      // An idle client died (database restart); the pool replaces it.
    });
  }
  return pool;
}

const SCHEMA = `
create table if not exists app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table app_users add column if not exists google_sub text unique;
create table if not exists app_sessions (
  token_hash text primary key,
  user_id text not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_sessions_user on app_sessions(user_id);
create table if not exists app_passkeys (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text not null default '',
  name text not null default 'Passkey',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists app_passkeys_user on app_passkeys(user_id);
create table if not exists app_challenges (
  id text primary key,
  challenge text not null,
  user_id text references app_users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists app_projects (
  user_id text not null references app_users(id) on delete cascade,
  id text not null,
  name text not null default '',
  data jsonb,
  size integer not null default 0,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);
create table if not exists app_store_pages (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  project_id text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);
`;

/** Creates the tables on first use. */
function migrate(): Promise<void> {
  ready ??= getPool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  await migrate();
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await migrate();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** For the status page: can we reach the database? */
export async function databaseHealth(): Promise<{ configured: boolean; ok?: boolean; error?: string }> {
  if (!databaseConfigured()) return { configured: false };
  try {
    await query("select 1");
    return { configured: true, ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    // Never echo the connection string (it holds the password).
    return { configured: true, ok: false, error: message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://•••") };
  }
}

/** Tests only: close connections so the process can exit. */
export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = null;
  ready = null;
}
