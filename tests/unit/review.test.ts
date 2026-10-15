import { describe, expect, it } from "vitest";
import { fixable, parseReview, reviewFixRequest, reviewMessage, MAX_CRITIQUE_ROUNDS, QUALITY_CHECKS, critiqueAgain, parseCritique } from "@/lib/review";

describe("UX and UI review agents", () => {
  it("reads findings, most severe first, and drops unusable ones", () => {
    const r = parseReview(
      "ux",
      `Here you go: {"summary":"Mostly clear","issues":[
        {"severity":"low","where":"Stats","problem":"Chart has no title","fix":"Add a title"},
        {"severity":"high","where":"Add habit","problem":"Saving gives no feedback","fix":"Show the new habit and a short confirmation"},
        {"severity":"weird","problem":"No way back from Settings","fix":"Add a back button"},
        {"severity":"high","problem":"","fix":"x"}]}`,
    )!;
    expect(r.summary).toBe("Mostly clear");
    expect(r.issues.map((i) => i.severity)).toEqual(["high", "medium", "low"]);
    expect(fixable(r)).toHaveLength(2);
    expect(parseReview("ui", "not json")).toBeNull();
  });

  it("asks the builder to fix only the important findings, and shows all of them", () => {
    const ux = parseReview(
      "ux",
      '{"summary":"ok","issues":[{"severity":"high","where":"Add habit","problem":"No feedback.","fix":"Show a confirmation."},{"severity":"low","problem":"Tiny thing.","fix":"Tweak."}]}',
    )!;
    const ui = parseReview("ui", '{"summary":"Looks good","issues":[]}')!;
    const request = reviewFixRequest([ux, ui]);
    expect(request).toMatch(/^Automatic UX and UI review/);
    expect(request).toContain("- Add habit: No feedback. Fix: Show a confirmation.");
    expect(request).not.toContain("Tiny thing");
    expect(request).not.toContain("UI agent");
    expect(reviewMessage(ux)).toContain("[low] Tiny thing.");
    expect(reviewMessage(ui)).toBe("UI agent: Looks good");
  });
});

describe("the quality critic", () => {
  const reply = (scores: number[]) =>
    JSON.stringify({
      summary: "Solid start.",
      checks: QUALITY_CHECKS.map(([name], i) => ({ name, score: scores[i], where: "Home", problem: `${name} gap`, fix: `Improve ${name}` })),
    });
  it("scores all 10 checks and turns those under par into fixes, worst first", () => {
    const r = parseCritique(reply([9, 6, 7, 9, 8, 8, 9, 5, 8, 3]))!;
    expect(r.checks).toHaveLength(10);
    expect(r.score).toBe(72);
    expect(r.issues.map((i) => i.problem.split(" (")[0])).toEqual(["Polish", "Words", "First run", "Feedback"]);
    expect(r.issues[0]).toMatchObject({ severity: "high", fix: "Improve Polish" });
    expect(r.issues[3].severity).toBe("medium");
  });
  it("keeps scores in range and copes with missing or odd checks", () => {
    const r = parseCritique('{"checks":[{"name":"core flow","score":42},{"score":"x"}]}')!;
    expect(r.checks![0].score).toBe(10);
    expect(r.checks![1].score).toBe(1);
    expect(r.checks).toHaveLength(10);
    expect(parseCritique("not json")).toBeNull();
  });
  it("goes round again only while something's under par, rounds are left and the last round helped", () => {
    const low = parseCritique(reply([9, 6, 9, 9, 9, 9, 9, 9, 9, 9]))!;
    const pass = parseCritique(reply([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]))!;
    expect(critiqueAgain(low, 1, null)).toBe(true);
    expect(critiqueAgain(low, 2, 80)).toBe(true); // 87 > 80
    expect(critiqueAgain(low, 2, 90)).toBe(false); // no better than last time
    expect(critiqueAgain(low, MAX_CRITIQUE_ROUNDS, null)).toBe(false);
    expect(critiqueAgain(pass, 1, null)).toBe(false);
    // A change to an existing app: one fix, then the final score.
    expect(critiqueAgain(low, 1, null, 2)).toBe(true);
    expect(critiqueAgain(low, 2, 80, 2)).toBe(false);
  });
});
