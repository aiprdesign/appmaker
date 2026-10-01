import { describe, expect, it } from "vitest";
import { briefPrompt, needsBrief, suggestFeatures } from "@/lib/brief";

describe("app brief", () => {
  it("asks only about short, vague ideas", () => {
    expect(needsBrief("a gym app")).toBe(true);
    expect(needsBrief("A dream diary")).toBe(true);
    expect(needsBrief("A habit tracker with streaks, reminders and weekly stats")).toBe(false);
    expect(needsBrief("A booking app for [your salon]")).toBe(false);
    expect(needsBrief("An app for my bakery that shows the menu, takes orders over WhatsApp and has a loyalty card for regulars")).toBe(false);
  });
  it("suggests features for the kind of app, and writes the answers into the prompt", () => {
    expect(suggestFeatures("my hair salon")).toContain("Book an appointment");
    expect(suggestFeatures("something new")).toContain("Search");
    expect(briefPrompt("a salon app", { audience: "customers", business: "Cuts", features: ["Book an appointment"], style: "soft" })).toBe(
      'a salon app\n\nWho it\'s for: for the customers of my business. The business is called "Cuts".\nMust-have features: Book an appointment.\nLook and feel: calm and soft, rounded shapes, gentle pastel colors.',
    );
    expect(briefPrompt("a salon app", { features: [] })).toBe("a salon app");
  });
});
