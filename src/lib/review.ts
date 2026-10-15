/**
 * The UX and UI review agents. After a build passes the automatic checks,
 * two AI reviewers look at the app: the UX agent at how it works for a
 * person (from the code), the UI agent at how it looks (from a screenshot
 * and the code). Important findings go back to the builder AI to fix.
 */

export type ReviewAgent = "ux" | "ui" | "critic";

export interface ReviewIssue {
  severity: "high" | "medium" | "low";
  /** Where: a screen or part of the app ("Add habit form"). */
  where: string;
  problem: string;
  fix: string;
}

export interface Review {
  agent: ReviewAgent;
  /** One line on how the app does overall. */
  summary: string;
  issues: ReviewIssue[];
  /** The quality critic: each of the 10 checks scored 1–10, and the total out of 100. */
  checks?: { name: string; score: number; note: string }[];
  score?: number;
  /** The critic's score in the round before (to show the improvement). */
  previous?: number;
  /** Which self-critique round this was (1, 2, 3). */
  round?: number;
}

export const AGENT_NAMES: Record<ReviewAgent, string> = { ux: "UX agent", ui: "UI agent", critic: "Quality critic" };

/**
 * The critic's 10 checks: what a top app in the stores gets right. Each is scored 1–10; anything under
 * PASS_SCORE goes back to the builder AI with the critic's fix, and the app is scored again.
 */
export const QUALITY_CHECKS = [
  ["Core flow", "the app's main job works from start to finish, with no dead ends or missing steps"],
  ["First run", "a new person understands it at once: a clear first screen, helpful empty states, no blank pages"],
  ["Feedback", "every action shows it worked; errors say what happened and how to fix it; destructive actions ask first"],
  ["Data", "what people enter is saved, survives a restart, and nothing is lost by mistake"],
  ["Navigation", "obvious tabs or screens, a way back everywhere, the most-used action easy to reach"],
  ["Hierarchy", "one clear title and one main action per screen; secondary things calmer"],
  ["Consistency", "the theme's colors, corners, spacing, icon sizes and button styles used the same way everywhere"],
  ["Words", "specific, plain labels and buttons that say what happens; no filler or generic AI copy"],
  ["Accessibility", "labels on buttons and inputs, readable sizes, enough contrast, 44pt tap targets"],
  ["Polish", "real content, small animations and touches that make it feel finished, like a top-chart app"],
] as const;
export const PASS_SCORE = 8;
/** At most this many critiques per new app (a fix between each): it keeps improving without keeping people waiting. */
export const MAX_CRITIQUE_ROUNDS = 3;
/** A change to an existing app: one critique, one fix, one final score, so edits stay quick. */
export const EDIT_CRITIQUE_ROUNDS = 2;

/** Reads the critic's JSON reply: every check scored, and the ones under PASS_SCORE as issues with their fix. */
export function parseCritique(text: string): Review | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: { summary?: unknown; checks?: unknown };
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw.checks)) return null;
  const byName = new Map((raw.checks as Record<string, unknown>[]).map((c) => [String(c?.name ?? "").trim().toLowerCase(), c]));
  const checks = QUALITY_CHECKS.map(([name], i) => {
    const c = (byName.get(name.toLowerCase()) ?? (raw.checks as Record<string, unknown>[])[i] ?? {}) as Record<string, unknown>;
    const score = Math.max(1, Math.min(10, Math.round(Number(c.score) || 0) || 1));
    return { name, score, note: String(c.problem ?? c.note ?? "").trim().slice(0, 200), fix: String(c.fix ?? "").trim().slice(0, 240), where: String(c.where ?? "").trim().slice(0, 60) };
  });
  const issues: ReviewIssue[] = checks
    .filter((c) => c.score < PASS_SCORE && c.fix)
    .sort((a, b) => a.score - b.score)
    .map((c) => ({ severity: c.score < 6 ? "high" : "medium", where: c.where || c.name, problem: `${c.name} (${c.score}/10): ${c.note || "below a top app's standard."}`, fix: c.fix }));
  return {
    agent: "critic",
    summary: String(raw.summary ?? "").trim().slice(0, 200),
    issues,
    checks: checks.map(({ name, score, note }) => ({ name, score, note })),
    score: checks.reduce((n, c) => n + c.score, 0),
  };
}

/** Whether to run another critique-and-fix round: something is under par, rounds are left, and the last round helped. */
export function critiqueAgain(review: Review | null | undefined, round: number, previous: number | null, rounds = MAX_CRITIQUE_ROUNDS): boolean {
  // "rounds" critiques at most: a fix follows each one but the last (which shows the final score).
  if (!review?.checks || !review.issues.length || round >= Math.min(rounds, MAX_CRITIQUE_ROUNDS)) return false;
  return previous === null || (review.score ?? 0) > previous;
}

/** Issues worth an automatic fix; low ones are only shown. */
export const fixable = (r: Review | null | undefined): ReviewIssue[] => (r?.issues ?? []).filter((i) => i.severity !== "low");

/** Reads an agent's JSON reply, keeping well-formed findings only (most severe first, at most 6). */
export function parseReview(agent: ReviewAgent, text: string): Review | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: { summary?: unknown; issues?: unknown };
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw.issues)) return null;
  const order = { high: 0, medium: 1, low: 2 } as const;
  const issues = raw.issues
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      severity: (["high", "medium", "low"].includes(String(x.severity)) ? String(x.severity) : "medium") as ReviewIssue["severity"],
      where: String(x.where ?? "")
        .trim()
        .slice(0, 60),
      problem: String(x.problem ?? "")
        .trim()
        .slice(0, 240),
      fix: String(x.fix ?? "")
        .trim()
        .slice(0, 240),
    }))
    .filter((x) => x.problem && x.fix)
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 6);
  return {
    agent,
    summary: String(raw.summary ?? "")
      .trim()
      .slice(0, 200),
    issues,
  };
}

/** The message that asks the builder AI to fix what the agents found. */
export function reviewFixRequest(reviews: Review[], { all = false } = {}): string {
  const pick = (r: Review) => (all ? r.issues : fixable(r));
  const parts = reviews
    .filter((r) => pick(r).length)
    .map(
      (r) =>
        `${AGENT_NAMES[r.agent]} (${r.agent === "ux" ? "how the app works for people" : r.agent === "ui" ? "how it looks" : `10 quality checks, ${r.score}/100`}):\n${pick(r)
          .map((i) => `- ${i.where ? `${i.where}: ` : ""}${i.problem} Fix: ${i.fix}`)
          .join("\n")}`,
    );
  return `Automatic ${reviews.some((r) => r.agent === "critic") && reviews.length === 1 ? "self-critique" : "UX and UI review"} found things to improve:\n\n${parts.join("\n\n")}\n\nFix all of them. Keep every feature, screen and piece of content; change only what these points need.`;
}

/** The chat message that shows an agent's findings. */
export function reviewMessage(r: Review): string {
  if (r.agent === "critic") return `${AGENT_NAMES.critic}${r.round ? ` (round ${r.round})` : ""}: ${r.score}/100${r.previous != null ? ` (was ${r.previous})` : ""}. ${r.summary}`;
  if (!r.issues.length) return `${AGENT_NAMES[r.agent]}: ${r.summary || "no problems found."}`;
  return `${AGENT_NAMES[r.agent]}: ${r.summary}\n${r.issues.map((i) => `- [${i.severity}] ${i.where ? `${i.where}: ` : ""}${i.problem}`).join("\n")}`;
}
