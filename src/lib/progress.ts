import type { ParsedGeneration } from "./parse";

/** The build's steps and which one is running, from what the AI has streamed so far. */
export function buildProgress(live: ParsedGeneration | null): { steps: string[]; stage: number; files: string[] } {
  const files = live ? Object.keys(live.files) : [];
  const stage = !live?.plan && files.length === 0 ? 0 : files.length === 0 ? 1 : live?.listing || live?.summary ? 3 : 2;
  const steps = [
    "Understanding your idea",
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
