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
      body.agent === "ux"
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
  expect(reviews.map((r) => r.agent).sort()).toEqual(["ui", "ux"]);
  expect(reviews.find((r) => r.agent === "ui")?.image).toMatch(/^data:image\/(jpeg|png);base64,/);

  // The important finding went back to the AI; the low one didn't.
  await expect.poll(() => prompts.length, { timeout: 30_000 }).toBe(2);
  expect(prompts[1]).toMatch(/^Automatic UX and UI review/);
  expect(prompts[1]).toContain("Saving a plant gives no feedback.");
  expect(prompts[1]).not.toContain("title could be larger");
  await expect(page.frameLocator('iframe[title="App preview"]').getByText("Garden, improved")).toBeVisible({ timeout: 30_000 });

  // The fixed version isn't reviewed again (once per request).
  await page.waitForTimeout(5000);
  expect(reviews).toHaveLength(2);
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
