import { PROVIDERS } from "./ai/providers";

/**
 * Which of Appmaker's settings the server can see, by name only (never
 * values), plus variables that look like a misspelling of one. Shown on the
 * status page so a site owner can tell why a key "isn't working".
 */

const OPTIONAL = ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL", "APPMAKER_PROVIDER", "APPMAKER_MODEL", "EXPO_TOKEN", "APPMAKER_EXPO_ACCOUNT", "APPMAKER_DEMO", "CUSTOM_AI_BASE_URL", "ADMIN_PASSWORD", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "APPMAKER_CREDIT_PACKS", "APPMAKER_CURRENCY", "APPMAKER_FREE_CREDITS", "APPMAKER_GUEST_BUILDS", "APPMAKER_COMPANY", "APPMAKER_CONTACT_EMAIL"];

export function knownSettings(): string[] {
  return [...new Set([...PROVIDERS.map((p) => p.envKey).filter((k): k is string => !!k), "ANTHROPIC_AUTH_TOKEN", ...OPTIONAL])];
}

export interface EnvReport {
  /** Known settings that are set to something (names only). */
  set: string[];
  /** Known settings that exist but are empty. */
  empty: string[];
  /** Variables that look like a known setting but don't match it exactly. */
  nearMisses: { found: string; expected: string }[];
  demoForced: boolean;
  /** Where this server runs, so an owner can match it with their host's dashboard. */
  host?: { platform: "Railway"; service?: string; environment?: string; commit?: string };
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function envReport(env: Record<string, string | undefined> = process.env): EnvReport {
  const known = knownSettings();
  const set = known.filter((k) => env[k]?.trim());
  const empty = known.filter((k) => k in env && !env[k]?.trim());
  const nearMisses: EnvReport["nearMisses"] = [];
  for (const name of Object.keys(env)) {
    if (known.includes(name)) continue;
    const s = squash(name);
    // Same letters in another case or with other separators ("replicate-api-token"),
    // or the same service with another key word ("REPLICATE_API_KEY", "EXPO_ACCESS_TOKEN").
    const match =
      known.find((k) => squash(k) === s) ??
      known.find((k) => {
        const base = squash(k).replace(/(API)?(KEY|TOKEN)$/, "");
        return base.length >= 2 && base !== squash(k) && (s === base || (s.startsWith(base) && /(KEY|TOKEN)$/.test(s)));
      });
    if (match) nearMisses.push({ found: name, expected: match });
  }
  const railway = env.RAILWAY_SERVICE_NAME || env.RAILWAY_ENVIRONMENT_NAME;
  const host = railway
    ? {
        platform: "Railway" as const,
        ...(env.RAILWAY_SERVICE_NAME ? { service: env.RAILWAY_SERVICE_NAME } : {}),
        ...(env.RAILWAY_ENVIRONMENT_NAME ? { environment: env.RAILWAY_ENVIRONMENT_NAME } : {}),
        ...(env.RAILWAY_GIT_COMMIT_SHA ? { commit: env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) } : {}),
      }
    : undefined;
  return { set, empty, nearMisses, demoForced: env.APPMAKER_DEMO === "1", ...(host ? { host } : {}) };
}
