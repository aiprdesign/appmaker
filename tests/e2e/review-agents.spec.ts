import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const LISTING = JSON.stringify({
  name: "Garden Pal",
  subtitle: "Testing",
  description: "d".repeat(120),
  keywords: "a",
  category: "Utilities",
  bundleId: "com.example.garden",
  primaryColor: "#2f6b3a",
  iconEmoji: "🌱",
  privacyNotes: "None",
});
const app = (title: string) => `import React from 'react';
import { View, Text } from 'react-native';
export default function App() {
  return (
    <View style={{ flex: 1, padding: 60, backgroundColor: '#FFFFFF' }}>
      <Text accessibilityRole="header" style={{ fontSize: 24, color: '#111827' }}>${title}</Text>
    </View>
  );
}`;
/** What the server sends back for the quality critic: the 10 checks scored, and the ones under 8 as issues. */
const CHECKS = ["Core flow", "First run", "Feedback", "Data", "Navigation", "Hierarchy", "Consistency", "Words", "Accessibility", "Polish"];
const critique = (scores: number[], fix = "Show a short confirmation after saving.") => ({
  agent: "critic",
  summary: "Getting there.",
  checks: CHECKS.map((name, i) => ({ name, score: scores[i], note: scores[i] < 8 ? `${name} needs work.` : "" })),
  score: scores.reduce((a, b) => a + b, 0),
  // Worst first, as the server sends them.
  issues: CHECKS.map((name, i) => ({ name, score: scores[i] }))
    .filter((c) => c.score < 8)
    .sort((a, b) => a.score - b.score)
    .map(({ name, score }) => ({ severity: score < 6 ? "high" : "medium", where: name, problem: `${name} (${score}/10): ${name} needs work.`, fix })),
});
const reply = (title: string) => `<plan>x</plan>\n<file path="App.js">\n${app(title)}\n</file>\n<listing>${LISTING}</listing>\n<summary>ok</summary>`;

test("after a build the UX and UI agents review the app and their important findings are fixed once", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      headers: { "X-Appmaker-Mode": "ai" },
      body: reply(prompts.length === 1 ? "Garden" : "Garden, improved"),
    });
  });
  const reviews: { agent: string; image?: string }[] = [];
  await page.route("**/api/review", async (route) => {
    const body = route.request().postDataJSON();
    reviews.push(body);
    const review =
      body.agent === "critic"
        ? critique([9, 9, 9, 9, 9, 9, 9, 9, 9, 9])
        : body.agent === "ux"
        ? {
            agent: "ux",
            summary: "Clear, but saving is silent.",
            issues: [
              { severity: "high", where: "Add plant", problem: "Saving a plant gives no feedback.", fix: "Show the new plant and a short confirmation." },
            ],
          }
        : { agent: "ui", summary: "Tidy screens.", issues: [{ severity: "low", where: "Home", problem: "The title could be larger.", fix: "Use 30pt." }] };
    await route.fulfill({ json: { review } });
  });

  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");

  const ux = page.getByRole("region", { name: "UX agent review" });
  const ui = page.getByRole("region", { name: "UI agent review" });
  await expect(ux).toContainText("Saving a plant gives no feedback.", { timeout: 30_000 });
  await expect(ui).toContainText("The title could be larger.");
  await expect(ux).toContainText("being fixed automatically");
  // Both agents ran; the UI agent was shown a picture of the screen.
  expect(reviews.map((r) => r.agent).sort()).toEqual(["critic", "ui", "ux"]);
  expect(reviews.find((r) => r.agent === "ui")?.image).toMatch(/^data:image\/(jpeg|png);base64,/);

  // The important finding went back to the AI; the low one didn't.
  await expect.poll(() => prompts.length, { timeout: 30_000 }).toBe(2);
  expect(prompts[1]).toMatch(/^Automatic UX and UI review/);
  expect(prompts[1]).toContain("Saving a plant gives no feedback.");
  expect(prompts[1]).not.toContain("title could be larger");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden, improved")).toBeVisible({ timeout: 30_000 });

  // The fixed version isn't reviewed again (once per request; the critic passed everything).
  await page.waitForTimeout(5000);
  expect(reviews).toHaveLength(3);
  const axe = await new AxeBuilder({ page }).include("aside").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test("findings that weren't fixed automatically can be fixed with one tap", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply("Garden") });
  });
  await page.route("**/api/review", async (route) => {
    const { agent } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        review:
          agent === "ui"
            ? { agent, summary: "Tidy.", issues: [{ severity: "low", where: "Home", problem: "The title could be larger.", fix: "Use 30pt." }] }
            : { agent, summary: "Works well.", issues: [] },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "UX agent review" })).toContainText("Looks good", { timeout: 30_000 });
  const ui = page.getByRole("region", { name: "UI agent review" });
  // Only a small point: nothing is sent automatically, but it can be fixed with a tap.
  await page.waitForTimeout(1500);
  expect(prompts).toHaveLength(1);
  await ui.getByRole("button", { name: "Fix it" }).click();
  await expect.poll(() => prompts.length).toBe(2);
  expect(prompts[1]).toContain("- Home: The title could be larger. Fix: Use 30pt.");
});

test("the quality critic scores 10 checks, the AI fixes what's under par, and the critic scores again until it passes", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body: reply(prompts.length === 1 ? "Garden" : `Garden v${prompts.length}`) });
  });
  const critiques: number[] = [];
  await page.route("**/api/review", async (route) => {
    const { agent } = route.request().postDataJSON();
    if (agent !== "critic") return route.fulfill({ json: { review: { agent, summary: "Fine.", issues: [] } } });
    critiques.push(critiques.length + 1);
    // Round 1: three checks under par (score 72). Round 2: all pass (90).
    const review = critiques.length === 1 ? critique([9, 6, 7, 9, 8, 8, 9, 5, 8, 3].map((x) => x)) : critique([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    await route.fulfill({ json: { review } });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");

  const first = page.getByRole("region", { name: "Quality critic review" }).first();
  await expect(first).toContainText("72/100", { timeout: 30_000 });
  await expect(first.getByRole("list", { name: "The 10 quality checks" }).getByRole("listitem")).toHaveCount(10);
  await expect(first).toContainText("Fixing the checks under 8");
  // What's under par went to the AI, worst first; then the critic scored the fixed app.
  await expect.poll(() => prompts.length, { timeout: 30_000 }).toBe(2);
  expect(prompts[1]).toMatch(/^Automatic self-critique/);
  expect(prompts[1]).toContain("Polish (3/10)");
  expect(prompts[1].indexOf("Polish (3/10)")).toBeLessThan(prompts[1].indexOf("First run (6/10)"));
  const second = page.getByRole("region", { name: "Quality critic review" }).nth(1);
  await expect(second).toContainText("72 → 90/100", { timeout: 30_000 });
  await expect(second).toContainText("round 2");
  // Everything passes: the loop stops.
  await page.waitForTimeout(4000);
  expect(critiques).toHaveLength(2);
  expect(prompts).toHaveLength(2);
});

test("a conversation about the app (no change to it) gets no reviews or self-critique", async ({ page }) => {
  const prompts: string[] = [];
  await page.route("**/api/generate", async (route) => {
    prompts.push(route.request().postDataJSON().prompt);
    const body = prompts.length === 1 ? reply("Garden") : "<plan>Answering.</plan>\n<summary>Plants are saved on the phone, so they're there next time you open the app.</summary>";
    await route.fulfill({ status: 200, contentType: "text/plain", headers: { "X-Appmaker-Mode": "ai" }, body });
  });
  const reviews: string[] = [];
  await page.route("**/api/review", async (route) => {
    const { agent } = route.request().postDataJSON();
    reviews.push(agent);
    await route.fulfill({ json: { review: agent === "critic" ? critique([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]) : { agent, summary: "Fine.", issues: [] } } });
  });
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("a garden planner");
  await page.keyboard.press("Enter");
  // The new app is checked: three reviewers, once.
  await expect.poll(() => reviews.length, { timeout: 30_000 }).toBe(3);

  // A question about it: answered, nothing reviewed.
  await page.getByPlaceholder(/Ask for a change/).fill("Where are my plants saved?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Plants are saved on the phone")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4000);
  expect(reviews).toHaveLength(3);
  expect(prompts).toHaveLength(2);
});
