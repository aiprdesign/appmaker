import { describe, expect, it } from "vitest";
import { appTitle, titleFromPrompt } from "@/lib/title";

describe("automatic app names", () => {
  it.each([
    ["A habit tracker with streaks and weekly stats", "Habit Tracker"],
    ["I want an app for my salon Studio Luxe with bookings", "Studio Luxe"],
    ["An app for my restaurant Luigi's in Brooklyn", "Luigi's"],
    ["a meditation timer called Calm Minute", "Calm Minute"],
    ["Make a simple budget planner for students", "Budget Planner"],
    ["build me a Spanish flashcards app", "Spanish Flashcards"],
    ["An app for my restaurant [name] in [city]", "Restaurant"],
    ["!!!", "My App"],
  ])("%s → %s", (prompt, title) => {
    expect(titleFromPrompt(prompt)).toBe(title);
  });

  it("uses the website's name for URL to App", () => {
    expect(appTitle("Turn it into an app", { siteName: "Luigi's Trattoria" } as never)).toBe("Luigi's Trattoria");
    expect(appTitle("A plant watering reminder")).toBe("Plant Watering Reminder");
  });
});
