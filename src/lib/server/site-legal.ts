import { EMPTY_LEGAL, parseLegal, type LegalDetails } from "../site-legal";
import { databaseConfigured, query } from "./db";

/** The site owner's legal details: Admin → Settings, over APPMAKER_COMPANY / APPMAKER_CONTACT_EMAIL. */
export async function getLegal(): Promise<LegalDetails> {
  const env = parseLegal({ company: process.env.APPMAKER_COMPANY, email: process.env.APPMAKER_CONTACT_EMAIL });
  if (!databaseConfigured()) return env;
  const rows = await query<{ value: unknown }>("select value from app_settings where key = 'legal'").catch(() => []);
  const saved = parseLegal(rows[0]?.value);
  return Object.fromEntries(
    Object.keys(EMPTY_LEGAL).map((k) => [k, saved[k as keyof LegalDetails] || env[k as keyof LegalDetails]]),
  ) as unknown as LegalDetails;
}

export async function setLegal(input: unknown): Promise<LegalDetails> {
  const value = parseLegal(input);
  await query(
    "insert into app_settings (key, value, updated_at) values ('legal', $1::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [JSON.stringify(value)],
  );
  return getLegal();
}
