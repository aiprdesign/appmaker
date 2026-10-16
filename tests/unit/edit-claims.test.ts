import { describe, expect, it } from "vitest";
import { claimsInText } from "@/lib/edit-claims";

describe("claims in text the owner types", () => {
  it("flags marketing claims when claim-safe wording is on", () => {
    expect(claimsInText("The best pizza in town").map((h) => h.phrase.toLowerCase())).toContain("best");
    expect(claimsInText("The best pizza in town", "standard")).toEqual([]);
  });
  it("always flags health claims", () => {
    const hits = claimsInText("Massage that cures back pain", "standard");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].regulated).toBe(true);
  });
  it("leaves plain descriptions alone", () => {
    expect(claimsInText("Stone-baked pizza with fresh basil")).toEqual([]);
    expect(claimsInText("")).toEqual([]);
  });
});
