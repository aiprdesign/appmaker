import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/lib/prompt";

describe("animated onboarding", () => {
  it("asks for a first-launch, animated onboarding that respects reduced motion", () => {
    const p = systemPrompt();
    expect(p).toMatch(/Animated onboarding \(every new app, unless the user asks for none\)/);
    expect(p).toMatch(/AsyncStorage flag/);
    expect(p).toMatch(/parallax/);
    expect(p).toMatch(/isReduceMotionEnabled/);
    expect(p).toMatch(/Show intro again/);
  });
});
