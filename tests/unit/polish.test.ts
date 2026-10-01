import { describe, expect, it } from "vitest";
import { polishPrompt } from "@/lib/polish";

describe("polishPrompt", () => {
  it("names the device, mode and screen, and asks to keep the app as it is", () => {
    const p = polishPrompt({ scheme: "dark", device: "ipad", screenText: "Today  Add habit" });
    expect(p).toMatch(/^Polish design:/);
    expect(p).toContain("an iPad in dark mode");
    expect(p).toContain('"Today  Add habit"');
    expect(p).toMatch(/alignment/);
    expect(p).toMatch(/spacing/);
    expect(p).toMatch(/Keep every feature/);
    expect(polishPrompt({ scheme: "light", device: "android" })).not.toContain("It shows");
  });
});
