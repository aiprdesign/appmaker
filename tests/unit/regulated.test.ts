import { describe, expect, it } from "vitest";
import { checkRegulatedClaims, HEALTH_DISCLAIMER } from "@/lib/regulated";
import { systemPrompt } from "@/lib/prompt";
import { demoResponse } from "@/lib/demo";
import { parseGeneration } from "@/lib/parse";

const app = (...texts: string[]) => ({ "App.js": `export default function App() { return <View>${texts.map((t) => `<Text>${t}</Text>`).join("")}</View>; }` });
const found = (...texts: string[]) => checkRegulatedClaims(app(...texts)).filter((h) => h.kind !== "health disclaimer").map((h) => h.phrase.toLowerCase());

describe("health, medical and financial claims", () => {
  it("catches disease, cure and diagnosis claims", () => {
    expect(found("Cures insomnia naturally")).toEqual(["cures insomnia"]);
    expect(found("Helps treat your anxiety")).toEqual(["treat your anxiety"]);
    expect(found("Prevents type 2 diabetes")).toEqual(["prevents type 2 diabetes"]);
    expect(found("Relieves back pain")).toEqual(["relieves back pain"]);
    expect(found("Diagnose skin problems")).toEqual(["diagnose"]);
    expect(found("Detects heart disease early")).toEqual(["detects heart disease"]);
  });

  it("catches medical endorsements, weight-loss and financial promises", () => {
    expect(found("Clinically proven results")).toEqual(["clinically proven"]);
    expect(found("Doctor recommended")).toEqual(["doctor recommended"]);
    expect(found("FDA approved tracker")).toEqual(["fda approved"]);
    expect(found("Burn fat fast")).toEqual(["burn fat"]);
    expect(found("Lose 10 lbs in a month")).toEqual(["lose 10 lbs"]);
    expect(found("7-day detox plan")).toEqual(["detox"]);
    expect(found("Boosts your immune system")).toEqual(["boosts your immune system"]);
    expect(found("Replaces your medication")).toEqual(["replaces your medication"]);
    expect(found("Guaranteed returns every month")).toEqual(["guaranteed returns"]);
    expect(found("Risk-free trading")).toEqual(["risk-free trading"]);
  });

  it("leaves everyday wording alone", () => {
    expect(found("Treat yourself to a rest day", "Track how you slept", "Log your workouts", "Pulse Workouts", "Save more each month", "Healthy recipes")).toEqual([]);
  });

  it("asks health apps for a 'not medical advice' line, in the app and the listing", () => {
    const bp = app("Log your blood pressure readings");
    const hits = checkRegulatedClaims(bp, { description: "Log blood pressure readings and see trends." });
    expect(hits.map((h) => h.where)).toEqual(["App", "Store listing: description"]);
    expect(hits[0].context).toContain(HEALTH_DISCLAIMER);
    const ok = checkRegulatedClaims(app("Log your blood pressure readings", HEALTH_DISCLAIMER), { description: `Log readings. ${HEALTH_DISCLAIMER}` });
    expect(ok).toEqual([]);
    // Ordinary fitness, habit and journal apps don't need one.
    expect(checkRegulatedClaims(app("Today's workout", "Mood: happy", "Pulse"))).toEqual([]);
  });

  it("is always part of the AI instructions, whatever the wording setting", () => {
    expect(systemPrompt("claim-safe")).toMatch(/Health, medical and financial claims \(always on\)/);
    expect(systemPrompt("standard")).toMatch(/Health, medical and financial claims \(always on\)/);
    expect(systemPrompt("standard")).toContain(HEALTH_DISCLAIMER);
  });

  it("the built-in demo apps pass", () => {
    for (const prompt of ["a habit tracker", "a budget app", "a workout app", "a journal"]) {
      const g = parseGeneration(demoResponse(prompt, false));
      expect(checkRegulatedClaims(g.files, g.listing ?? undefined), prompt).toEqual([]);
    }
  });
});
