import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkClaims, findClaims, userFacingText } from "@/lib/claims";
import { systemPrompt } from "@/lib/prompt";
import { demoResponse } from "@/lib/demo";
import { parseGeneration } from "@/lib/parse";

const phrases = (text: string) => findClaims(text).map((h) => h.phrase.toLowerCase());

describe("claim-safe wording", () => {
  it("catches every kind of claim the rules name", () => {
    expect(phrases("The best habit tracker")).toEqual(["best"]);
    expect(phrases("#1 budgeting app")).toEqual(["#1"]);
    expect(phrases("The leading journal")).toEqual(["leading"]);
    expect(phrases("The world's fastest timer")).toEqual(["world's fastest"]);
    expect(phrases("100% private")).toEqual(["100%"]);
    expect(phrases("Results guaranteed")).toEqual(["guaranteed"]);
    expect(phrases("Never miss a workout")).toEqual(["never"]);
    expect(phrases("Always in sync")).toEqual(["always"]);
    expect(phrases("Log meals in seconds")).toEqual(["in seconds"]);
    expect(phrases("Plan 10x faster")).toEqual(["10x faster"]);
    expect(phrases("A faster way to budget")).toEqual(["faster"]);
    expect(phrases("Better sleep starts here")).toEqual(["better"]);
  });

  it("leaves descriptive text alone", () => {
    for (const ok of ["Track your daily habits", "Longest streak: 12 days", "Highest score", "Plan meals for the week", "Daily reminder at 8 PM", "Step 1 of 3", "Page #12"]) {
      expect(phrases(ok), ok).toEqual([]);
    }
  });

  it("only reads text people see, not code", () => {
    const code = `import Best from './src/Best';
// the best approach: never block the UI
const best = Math.max(...streaks); // always positive
const styles = StyleSheet.create({ row: { alignItems: 'center' } });
export default function App() {
  return <View><Text>Longest streak</Text><Text>{best}</Text><TextInput placeholder="The best notes app" /></View>;
}`;
    const text = userFacingText(code);
    expect(text).toContain("Longest streak");
    expect(text).toContain("The best notes app");
    expect(text.join(" ")).not.toMatch(/approach|positive|center/);
    const hits = checkClaims({ "App.js": code });
    expect(hits).toEqual([expect.objectContaining({ where: "App.js", phrase: "best", context: "The best notes app" })]);
  });

  it("checks the store listing", () => {
    const hits = checkClaims({}, { name: "Streakly", subtitle: "The #1 habit app", description: "Build habits in seconds. Always free." });
    expect(hits.map((h) => `${h.where}:${h.phrase}`)).toEqual([
      "Store listing: subtitle:#1",
      "Store listing: description:in seconds",
      "Store listing: description:Always",
    ]);
  });

  it("tells the AI the rules only when claim-safe is on", () => {
    expect(systemPrompt()).toMatch(/Wording: claim-safe/);
    expect(systemPrompt("claim-safe")).toMatch(/"#1"/);
    expect(systemPrompt("standard")).not.toMatch(/Wording: claim-safe/);
  });

  it("the built-in demo apps are claim-free", () => {
    const read = (root: string, rel = ""): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const e of readdirSync(path.join(root, rel))) {
        const p = rel ? `${rel}/${e}` : e;
        if (statSync(path.join(root, p)).isDirectory()) Object.assign(out, read(root, p));
        else out[p] = readFileSync(path.join(root, p), "utf8");
      }
      return out;
    };
    for (const prompt of ["a habit tracker", "a budget app", "a workout app", "a journal"]) {
      const parsed = parseGeneration(demoResponse(prompt, false));
      expect(checkClaims(parsed.files, parsed.listing ?? undefined), prompt).toEqual([]);
    }
    for (const dir of readdirSync("demo-apps")) expect(checkClaims(read(`demo-apps/${dir}`)), dir).toEqual([]);
  });
});
