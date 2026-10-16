import { clientIp, rateLimit } from "@/lib/rate-limit";
import { databaseConfigured } from "./db";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Limits for the free helper agents (reviews, briefs) when they use the site's own AI key:
 * signed-in people get the full hourly allowance; visitors who aren't signed in get a smaller
 * one, plus a daily cap, so a script can't run up the site's AI bill.
 */
export async function helperAllowed(req: Request, name: string, hourly: number, usingServerKey: boolean): Promise<boolean> {
  const ip = clientIp(req);
  if (!usingServerKey) return rateLimit(`${name}:${ip}`, hourly, HOUR).ok;
  let userId: string | null = null;
  if (databaseConfigured()) {
    const { currentUser } = await import("./auth");
    userId = (await currentUser(req).catch(() => null))?.id ?? null;
  }
  if (userId) return rateLimit(`${name}:user:${userId}`, hourly, HOUR).ok;
  const guestHourly = Math.max(1, Math.floor(hourly / 3));
  return rateLimit(`${name}:${ip}`, guestHourly, HOUR).ok && rateLimit(`${name}-day:${ip}`, guestHourly * 4, DAY).ok;
}
