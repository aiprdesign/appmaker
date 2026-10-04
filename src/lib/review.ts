/**
 * The UX and UI review agents. After a build passes the automatic checks,
 * two AI reviewers look at the app: the UX agent at how it works for a
 * person (from the code), the UI agent at how it looks (from a screenshot
 * and the code). Important findings go back to the builder AI to fix.
 */

export type ReviewAgent = "ux" | "ui";

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
}

export const AGENT_NAMES: Record<ReviewAgent, string> = { ux: "UX agent", ui: "UI agent" };

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
        `${AGENT_NAMES[r.agent]} (${r.agent === "ux" ? "how the app works for people" : "how it looks"}):\n${pick(r)
          .map((i) => `- ${i.where ? `${i.where}: ` : ""}${i.problem} Fix: ${i.fix}`)
          .join("\n")}`,
    );
  return `Automatic UX and UI review found things to improve:\n\n${parts.join("\n\n")}\n\nFix all of them. Keep every feature, screen and piece of content; change only what these points need.`;
}

/** The chat message that shows an agent's findings. */
export function reviewMessage(r: Review): string {
  if (!r.issues.length) return `${AGENT_NAMES[r.agent]}: ${r.summary || "no problems found."}`;
  return `${AGENT_NAMES[r.agent]}: ${r.summary}\n${r.issues.map((i) => `- [${i.severity}] ${i.where ? `${i.where}: ` : ""}${i.problem}`).join("\n")}`;
}
