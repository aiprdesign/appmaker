import { describe, expect, it } from "vitest";
import { buildProgress, friendlyFile } from "@/lib/progress";

describe("build progress", () => {
  it("names files the way people would", () => {
    expect(friendlyFile("src/screens/HomeScreen.js")).toBe("Home screen");
    expect(friendlyFile("App.js")).toBe("App");
    expect(friendlyFile("src/components/habit-row.jsx")).toBe("Habit row");
  });
  it("moves through the steps as the AI streams", () => {
    expect(buildProgress(null).stage).toBe(0);
    const base = { plan: "", summary: "", files: {}, deleted: [], listing: null, writing: null };
    expect(buildProgress({ ...base, plan: "A habit app" }).stage).toBe(1);
    const writing = buildProgress({ ...base, plan: "x", files: { "App.js": "" }, writing: "App.js" });
    expect(writing.stage).toBe(2);
    expect(writing.steps[2]).toBe("Writing code (1 file)");
    expect(buildProgress({ ...base, plan: "x", files: { "App.js": "" }, listing: { name: "Streakly" } }).stage).toBe(3);
  });
});
