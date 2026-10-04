import { describe, expect, it } from "vitest";
import { fixable, parseReview, reviewFixRequest, reviewMessage } from "@/lib/review";

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
