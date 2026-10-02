import type { ParsedGeneration } from "./parse";

/** Sent by the server while the AI reasons before writing; removed before parsing. */
export const THINKING_MARK = "<thinking/>";
/** Sent by the server every few seconds while it waits, so the page (and any proxy) knows the connection is alive. */
export const ALIVE_MARK = "<alive/>";
export const ALIVE_EVERY_MS = 10_000;

/** Removes the server's signals from the stream; reports whether the AI was thinking. */
export function takeSignals(raw: string): { text: string; thinking: boolean } {
  const thinking = raw.includes(THINKING_MARK);
  return { text: raw.split(THINKING_MARK).join("").split(ALIVE_MARK).join(""), thinking };
}

/** What the page knows about a running generation: the parsed output, plus signs of life. */
export type LiveGeneration = ParsedGeneration & {
  /** The AI has been reasoning (and hasn't started writing the app yet). */
  thinking?: boolean;
  /** When anything last arrived from the server (ms since epoch). */
  lastActivity?: number;
};

/** Nothing at all from the server for this long (not even its keep-alive signal) means the connection was lost. */
export const STALL_MS = 45_000;
/** Still no app text after this long, without the AI thinking, means the AI is very slow or stuck. */
export const SLOW_START_MS = 180_000;

/** The build's steps and which one is running, from what the AI has streamed so far. */
export function buildProgress(live: LiveGeneration | null): { steps: string[]; stage: number; files: string[] } {
  const files = live ? Object.keys(live.files) : [];
  const stage = !live?.plan && files.length === 0 ? 0 : files.length === 0 ? 1 : live?.listing || live?.summary ? 3 : 2;
  const steps = [
    live?.thinking && stage === 0 ? "Thinking through your idea" : "Understanding your idea",
    "Designing the screens",
    files.length ? `Writing code (${files.length} file${files.length === 1 ? "" : "s"})` : "Writing code",
    "Finishing touches",
  ];
  return { steps, stage, files };
}

/** A file path as people would say it: "src/screens/HomeScreen.js" → "Home screen", "App.js" → "App". */
export function friendlyFile(path: string): string {
  const base = path
    .split("/")
    .pop()!
    .replace(/\.(jsx?|json)$/, "");
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  const text = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  return text || path;
}

/**
 * A line about how the build is going: still thinking, taking a while, or
 * stuck (nothing at all from the AI for STALL_MS).
 */
export function progressNote(live: LiveGeneration | null, startedAt: number | null, now: number): { text: string; stalled: boolean } | null {
  if (!startedAt) return null;
  const { stage } = buildProgress(live);
  const quietFor = now - (live?.lastActivity ?? startedAt);
  if (quietFor > STALL_MS) {
    return { stalled: true, text: "The connection to Appmaker seems to have dropped. Press Stop, check your internet connection, and try again." };
  }
  const ms = now - startedAt;
  if (stage === 0 && !live?.thinking && ms > SLOW_START_MS) {
    return {
      stalled: true,
      text: `The AI hasn't started writing after ${Math.floor(ms / 60_000)} minutes. It may be overloaded: press Stop and try again, or pick a faster model in AI settings.`,
    };
  }
  if (stage === 0 && live?.thinking)
    return { stalled: false, text: "The AI is thinking through your app before it writes it. Bigger apps can think for 1–3 minutes." };
  if (stage === 0 && ms > 20_000) return { stalled: false, text: "The AI plans the whole app before writing — this can take a minute. Keep this tab open." };
  if (stage > 0 && ms > 90_000) return { stalled: false, text: "Bigger apps take 2–4 minutes. Keep this tab open — it's still working." };
  return null;
}
