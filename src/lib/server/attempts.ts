/**
 * Wrong-guess limit for the admin password and the site PIN: after 3 wrong
 * tries a visitor is locked out for 15 minutes. Only failures count, and a
 * right answer clears them. In memory, per server instance.
 */
export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 15 * 60 * 1000;

const failures = new Map<string, { count: number; until: number }>();

export interface AttemptState {
  locked: boolean;
  /** Wrong tries left before the lockout. */
  left: number;
  /** Minutes until the lockout ends (0 when not locked). */
  minutes: number;
}

function state(key: string, now = Date.now()): AttemptState {
  const f = failures.get(key);
  if (!f || f.until <= now) {
    if (f) failures.delete(key);
    return { locked: false, left: MAX_ATTEMPTS, minutes: 0 };
  }
  const locked = f.count >= MAX_ATTEMPTS;
  return {
    locked,
    left: Math.max(0, MAX_ATTEMPTS - f.count),
    minutes: locked ? Math.ceil((f.until - now) / 60_000) : 0,
  };
}

export const attemptState = (key: string): AttemptState => state(key);

/** Records a wrong try and returns what's left. */
export function recordFailure(key: string): AttemptState {
  const now = Date.now();
  const current = state(key, now);
  if (current.locked) return current;
  const count = MAX_ATTEMPTS - current.left + 1;
  // The window starts at the first wrong try; reaching the limit restarts it as a full lockout.
  const until = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : (failures.get(key)?.until ?? now + LOCKOUT_MS);
  failures.set(key, { count, until });
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.until <= now) failures.delete(k);
  return state(key, now);
}

export const clearFailures = (key: string) => void failures.delete(key);

export const lockedMessage = (s: AttemptState) => `Too many wrong tries. Wait ${s.minutes} minute${s.minutes === 1 ? "" : "s"} and try again.`;

export const triesLeftMessage = (wrong: string, s: AttemptState) =>
  s.locked ? `${wrong} ${lockedMessage(s)}` : `${wrong} ${s.left} ${s.left === 1 ? "try" : "tries"} left.`;
