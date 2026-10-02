import { describe, expect, it } from "vitest";
import { buildProgress, friendlyFile, progressNote, takeSignals } from "@/lib/progress";

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

describe("signs of life while the AI works", () => {
  const base = { plan: "", summary: "", files: {}, deleted: [], listing: null, writing: null };
  it("removes the server's signals and notices thinking", () => {
    expect(takeSignals('<plan>Hi<alive/></plan><file path="App.js">a<thinking/>b</file>')).toEqual({
      text: '<plan>Hi</plan><file path="App.js">ab</file>',
      thinking: true,
    });
    expect(takeSignals("<alive/>").thinking).toBe(false);
  });
  it("says the AI is thinking, then warns when it's slow or the connection drops", () => {
    const start = 1_000_000;
    expect(buildProgress({ ...base, thinking: true }).steps[0]).toBe("Thinking through your idea");
    expect(progressNote({ ...base, thinking: true, lastActivity: start + 60_000 }, start, start + 61_000)?.text).toMatch(/thinking through your app/);
    expect(progressNote({ ...base, lastActivity: start + 200_000 }, start, start + 200_000)).toMatchObject({
      stalled: true,
      text: expect.stringMatching(/hasn't started writing after 3 minutes/),
    });
    expect(progressNote({ ...base, lastActivity: start }, start, start + 50_000)).toMatchObject({
      stalled: true,
      text: expect.stringMatching(/connection.*dropped/),
    });
    expect(progressNote({ ...base, plan: "x", files: { "App.js": "" }, lastActivity: start + 95_000 }, start, start + 95_000)?.stalled).toBe(false);
  });
});
