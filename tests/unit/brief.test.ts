import { describe, expect, it } from "vitest";
import { briefPrompt, needsBrief, parseAiBrief, suggestFeatures } from "@/lib/brief";

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
    expect(briefPrompt("a salon app", { audience: "customers", business: "Cuts", features: ["Book an appointment"], style: "calm" })).toBe(
      'a salon app\n\nWho it\'s for: for the customers of my business. The business is called "Cuts".\nMust-have features: Book an appointment.\nLook and feel: Calm pastel style (airy, soft and quiet, with gentle tints).',
    );
    expect(briefPrompt("a salon app", { features: [] })).toBe("a salon app");
  });
});

describe("the AI's own questions", () => {
  it("keeps only well-formed, short questions", () => {
    const reply = `Sure! {"understood":"A booking app for your salon","questions":[
      {"q":"Who books?","options":["New clients","Regulars"],"multi":false},
      {"q":"Only one option","options":["Yes"]},
      {"question":"Which features?","options":["Pick a stylist","Deposits","Reminders"],"multi":true},
      {"q":"Fourth?","options":["a","b"]},{"q":"Fifth?","options":["a","b"]}]}`;
    const brief = parseAiBrief(reply)!;
    expect(brief.understood).toBe("A booking app for your salon");
    expect(brief.questions.map((q) => q.q)).toEqual(["Who books?", "Which features?", "Fourth?"]);
    expect(brief.questions[1].multi).toBe(true);
    expect(parseAiBrief('{"understood":"Clear","questions":[]}')?.questions).toEqual([]);
    expect(parseAiBrief("no json here")).toBeNull();
  });

  it("adds the answers to the prompt", () => {
    const prompt = briefPrompt("a salon app", { features: [], picks: [{ q: "Which features?", choices: ["Pick a stylist", "Reminders"] }, { q: "Skipped?", choices: [] }] });
    expect(prompt).toBe("a salon app\n\nWhich features: Pick a stylist, Reminders.");
  });
});
